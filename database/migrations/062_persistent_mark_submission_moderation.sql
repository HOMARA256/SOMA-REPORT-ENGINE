-- Persist mark-submission and moderation workflow in the school database.
create unique index if not exists terms_id_school_id_uq on public.terms(id,school_id);
create table if not exists public.academic_mark_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  class_subject_offering_id uuid not null references public.class_subject_offerings(id) on delete restrict,
  status text not null default 'HOD_REVIEW' check(status in ('HOD_REVIEW','READY','MODERATED','RETURNED')),
  submitted_by uuid not null references public.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_mark_submissions_term_offering_uq unique(term_id,class_subject_offering_id),
  constraint academic_mark_submissions_school_term_fk foreign key(term_id,school_id) references public.terms(id,school_id) on delete restrict
);

create table if not exists public.academic_mark_submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.academic_mark_submissions(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  actor_role text not null,
  action text not null check(action in ('SUBMITTED','HOD_REVIEWED','MODERATED','RETURNED')),
  from_status text,
  to_status text not null,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists academic_mark_submissions_queue_idx
  on public.academic_mark_submissions(school_id,term_id,status,submitted_at desc);
create index if not exists academic_mark_submission_events_idx
  on public.academic_mark_submission_events(submission_id,created_at desc);

alter table public.academic_mark_submissions enable row level security;
alter table public.academic_mark_submission_events enable row level security;
drop policy if exists academic_mark_submissions_member_read on public.academic_mark_submissions;
create policy academic_mark_submissions_member_read on public.academic_mark_submissions
  for select to authenticated using(public.is_active_school_member(school_id));
drop policy if exists academic_mark_submission_events_member_read on public.academic_mark_submission_events;
create policy academic_mark_submission_events_member_read on public.academic_mark_submission_events
  for select to authenticated using(public.is_active_school_member(school_id));
revoke all on public.academic_mark_submissions,public.academic_mark_submission_events from anon;
revoke insert,update,delete,truncate,references,trigger on public.academic_mark_submissions,public.academic_mark_submission_events from authenticated;

create or replace function public.get_academic_mark_submission_statuses(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid;
begin
  select school_id into v_school_id from public.terms where id=p_term_id;
  if v_school_id is null or not public.is_active_school_member(v_school_id) then
    raise exception 'Active school membership and a valid term are required';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'offeringId',s.class_subject_offering_id,'status',s.status,
    'submittedAt',s.submitted_at,'reviewedAt',s.reviewed_at,'reviewNote',s.review_note
  ) order by s.submitted_at desc) from public.academic_mark_submissions s
    where s.school_id=v_school_id and s.term_id=p_term_id),'[]'::jsonb);
end $$;

create or replace function public.get_academic_mark_moderation_queue(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid; v_workspace jsonb;
begin
  select school_id into v_school_id from public.terms where id=p_term_id;
  if v_school_id is null or not public.is_active_school_member(v_school_id) then
    raise exception 'Active school membership and a valid term are required';
  end if;
  v_workspace:=public.get_marks_entry_workspace(p_term_id);
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'offeringId',s.class_subject_offering_id,'status',s.status,'submittedAt',s.submitted_at,
    'reviewedAt',s.reviewed_at,'reviewNote',s.review_note,'submittedBy',u.full_name,
    'className',c.class_name,'programme',c.programme,'subjectCode',coalesce(so.school_subject_code,ss.subject_code),
    'subjectName',coalesce(so.display_name_override,ss.subject_name),'teacherName',workspace_offering.value->>'teacherName',
    'learnerCount',jsonb_array_length(coalesce(workspace_offering.value->'learners','[]'::jsonb)),
    'unresolvedCount',(select count(*) from jsonb_array_elements(coalesce(workspace_offering.value->'learners','[]'::jsonb)) learner
      where coalesce(learner->>'aoiStatus','MISSING')='MISSING' or coalesce(learner->>'examStatus','MISSING')='MISSING')
  ) order by s.submitted_at desc) from public.academic_mark_submissions s
    join public.academic_classes c on c.id=(select class_id from public.class_subject_offerings where id=s.class_subject_offering_id)
    join public.class_subject_offerings co on co.id=s.class_subject_offering_id
    join public.school_subject_offerings so on so.id=co.school_subject_offering_id
    left join public.system_subjects ss on ss.id=so.system_subject_id
    join public.users u on u.id=s.submitted_by
    cross join lateral jsonb_array_elements(coalesce(v_workspace->'offerings','[]'::jsonb)) workspace_offering(value)
    where s.school_id=v_school_id and s.term_id=p_term_id and workspace_offering.value->>'id'=s.class_subject_offering_id::text),'[]'::jsonb);
end $$;

create or replace function public.submit_academic_mark_offering(
  p_term_id uuid,p_class_subject_offering_id uuid,p_note text default 'Submitted for academic review'
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=public.current_app_user_id(); v_role text; v_term public.terms; v_offering public.class_subject_offerings;
  v_workspace jsonb; v_item jsonb; v_learners jsonb; v_unresolved integer; v_id uuid; v_old public.academic_mark_submissions;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_class_subject_offering_id and status='ACTIVE';
  if v_actor is null or v_term.id is null or v_offering.id is null or v_term.school_id<>v_offering.school_id
     or v_term.academic_year_id<>v_offering.academic_year_id or not public.is_active_school_member(v_term.school_id) then
    raise exception 'Invalid academic term or subject offering';
  end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=v_term.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if coalesce(v_role,'') not in ('TEACHER','SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER') then
    raise exception 'Your role cannot submit marks';
  end if;
  if v_role='TEACHER' and not exists(select 1 from public.teacher_allocations ta where ta.school_id=v_term.school_id
      and ta.term_id=p_term_id and ta.class_subject_offering_id=p_class_subject_offering_id and ta.teacher_id=v_actor
      and ta.status='ACTIVE' and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then
    raise exception 'You are not allocated to this subject offering';
  end if;
  v_workspace:=public.get_marks_entry_workspace(p_term_id);
  select value into v_item from jsonb_array_elements(coalesce(v_workspace->'offerings','[]'::jsonb)) where value->>'id'=p_class_subject_offering_id::text;
  if v_item is null then raise exception 'Subject offering is not available in the authorised marks workspace'; end if;
  v_learners:=coalesce(v_item->'learners','[]'::jsonb);
  if jsonb_array_length(v_learners)=0 then raise exception 'Cannot submit an offering with no eligible learners'; end if;
  select count(*) into v_unresolved from jsonb_array_elements(v_learners) learner
    where coalesce(learner->>'aoiStatus','MISSING')='MISSING' or coalesce(learner->>'examStatus','MISSING')='MISSING';
  if v_unresolved>0 then raise exception '% learner mark records are incomplete',v_unresolved; end if;
  select * into v_old from public.academic_mark_submissions where term_id=p_term_id
    and class_subject_offering_id=p_class_subject_offering_id for update;
  if v_old.id is not null and v_old.status<>'RETURNED' then
    if v_old.submitted_by=v_actor then return v_old.id; end if;
    raise exception 'This offering is already submitted or moderated';
  end if;
  if v_old.id is null then
    insert into public.academic_mark_submissions(school_id,academic_year_id,term_id,class_subject_offering_id,submitted_by,review_note)
      values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_subject_offering_id,v_actor,nullif(trim(p_note),''))
      on conflict(term_id,class_subject_offering_id) do nothing returning id into v_id;
    if v_id is null then
      select * into v_old from public.academic_mark_submissions where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id for update;
      if v_old.submitted_by=v_actor and v_old.status<>'RETURNED' then return v_old.id; end if;
      raise exception 'This offering was submitted by another user before your request completed';
    end if;
  else
    update public.academic_mark_submissions set status='HOD_REVIEW',submitted_by=v_actor,submitted_at=now(),reviewed_by=null,
      reviewed_at=null,review_note=nullif(trim(p_note),''),updated_at=now() where id=v_old.id returning id into v_id;
  end if;
  update public.academic_mark_records set workflow_status='SUBMITTED',updated_at=now()
    where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id and workflow_status in ('DRAFT','RETURNED');
  insert into public.academic_mark_submission_events(submission_id,school_id,actor_user_id,actor_role,action,from_status,to_status,note)
    values(v_id,v_term.school_id,v_actor,v_role,'SUBMITTED',case when v_old.id is null then null else 'RETURNED' end,'HOD_REVIEW',coalesce(nullif(trim(p_note),''),'Submitted for academic review'));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,v_role,'ACADEMIC_MARKS_SUBMITTED','academic_mark_submission',v_id::text,jsonb_build_object('term_id',p_term_id,'offering_id',p_class_subject_offering_id));
  return v_id;
end $$;

create or replace function public.review_academic_mark_submission(
  p_submission_id uuid,p_decision text,p_note text
) returns public.academic_mark_submissions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.current_app_user_id(); v_role text; v_row public.academic_mark_submissions; v_next text; v_action text; v_unresolved integer; v_previous_status text;
begin
  select * into v_row from public.academic_mark_submissions where id=p_submission_id for update;
  if v_actor is null or v_row.id is null or not public.is_active_school_member(v_row.school_id) then raise exception 'Submission is unavailable'; end if;
  v_previous_status:=v_row.status;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=v_row.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if coalesce(v_role,'') not in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER') then raise exception 'Academic reviewer permission required'; end if;
  if v_actor=v_row.submitted_by then raise exception 'Separation of duties prevents self-review'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'A review note is required'; end if;
  p_decision:=upper(trim(p_decision));
  if p_decision='READY' and v_row.status='HOD_REVIEW' then v_next:='READY'; v_action:='HOD_REVIEWED';
  elsif p_decision='MODERATED' and v_row.status='READY' then v_next:='MODERATED'; v_action:='MODERATED';
  elsif p_decision='RETURNED' and v_row.status in ('HOD_REVIEW','READY') then v_next:='RETURNED'; v_action:='RETURNED';
  else raise exception 'Invalid moderation transition from % to %',v_row.status,p_decision; end if;
  if v_next in ('READY','MODERATED') then
    select count(*) into v_unresolved from public.academic_mark_records m
      where m.term_id=v_row.term_id and m.class_subject_offering_id=v_row.class_subject_offering_id
        and (m.aoi_status='MISSING' or m.exam_status='MISSING');
    if v_unresolved>0 then raise exception 'Marks became incomplete after submission; refresh and return the batch'; end if;
  end if;
  update public.academic_mark_submissions set status=v_next,reviewed_by=v_actor,reviewed_at=now(),review_note=trim(p_note),updated_at=now()
    where id=p_submission_id returning * into v_row;
  if v_next='RETURNED' then update public.academic_mark_records set workflow_status='RETURNED',updated_at=now()
    where term_id=v_row.term_id and class_subject_offering_id=v_row.class_subject_offering_id and workflow_status='SUBMITTED';
  elsif v_next='MODERATED' then update public.academic_mark_records set workflow_status='APPROVED',updated_at=now()
    where term_id=v_row.term_id and class_subject_offering_id=v_row.class_subject_offering_id and workflow_status='SUBMITTED';
  end if;
  insert into public.academic_mark_submission_events(submission_id,school_id,actor_user_id,actor_role,action,from_status,to_status,note)
    values(v_row.id,v_row.school_id,v_actor,v_role,v_action,v_previous_status,v_next,trim(p_note));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,v_role,'ACADEMIC_MARKS_'||v_action,'academic_mark_submission',v_row.id::text,jsonb_build_object('from_status',case when v_action='HOD_REVIEWED' then 'HOD_REVIEW' when v_action='MODERATED' then 'READY' else 'HOD_REVIEW_OR_READY' end,'to_status',v_next,'note',trim(p_note)));
  return v_row;
end $$;

-- Keep the original permission, O-Level selection and value validation in the previous RPC.
alter function public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text)
  rename to save_academic_mark_record_before_submission_workflow;
revoke all on function public.save_academic_mark_record_before_submission_workflow(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon,authenticated;
create or replace function public.save_academic_mark_record(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
  p_aoi_mark numeric,p_aoi_status text,p_exam_mark numeric,p_exam_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.academic_mark_submissions s where s.term_id=p_term_id
      and s.class_subject_offering_id=p_class_subject_offering_id and s.status in ('HOD_REVIEW','READY','MODERATED')) then
    raise exception 'Marks are locked while submitted or moderated; use the authorised return workflow before editing';
  end if;
  return public.save_academic_mark_record_before_submission_workflow(p_term_id,p_class_subject_offering_id,p_learner_id,p_aoi_mark,p_aoi_status,p_exam_mark,p_exam_status);
end $$;

revoke all on function public.get_academic_mark_submission_statuses(uuid),public.get_academic_mark_moderation_queue(uuid),public.submit_academic_mark_offering(uuid,uuid,text),public.review_academic_mark_submission(uuid,text,text),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon;
grant execute on function public.get_academic_mark_submission_statuses(uuid),public.get_academic_mark_moderation_queue(uuid),public.submit_academic_mark_offering(uuid,uuid,text),public.review_academic_mark_submission(uuid,text,text),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) to authenticated;
notify pgrst,'reload schema';
