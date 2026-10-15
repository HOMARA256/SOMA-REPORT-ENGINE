-- Persist O-Level class result locks and final approvals in the school database.
-- This is workflow state only; immutable report snapshots are managed separately.

create table if not exists public.academic_result_scopes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  class_id uuid not null,
  status text not null default 'LOCKED' check (status in ('LOCKED','APPROVED')),
  locked_by uuid not null references public.users(id) on delete restrict,
  locked_at timestamptz not null default now(),
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  approval_note text,
  created_at timestamptz not null default now(),
  constraint academic_result_scope_term_class_uq unique(term_id,class_id),
  constraint academic_result_scope_class_school_fk foreign key(class_id,school_id) references public.academic_classes(id,school_id) on delete restrict,
  constraint academic_result_scope_school_term_fk foreign key(term_id,school_id) references public.terms(id,school_id) on delete restrict,
  constraint academic_result_scope_approval_check check (
    (status='LOCKED' and approved_by is null and approved_at is null and approval_note is null)
    or (status='APPROVED' and approved_by is not null and approved_at is not null and length(trim(approval_note))>0)
  ),
  constraint academic_result_scope_separation_check check (approved_by is null or approved_by<>locked_by)
);

create table if not exists public.academic_result_scope_events (
  id uuid primary key default gen_random_uuid(),
  result_scope_id uuid not null references public.academic_result_scopes(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  actor_role text not null,
  action text not null check (action in ('LOCKED','APPROVED')),
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists academic_result_scopes_school_term_idx on public.academic_result_scopes(school_id,term_id,status);
create index if not exists academic_result_scope_events_scope_idx on public.academic_result_scope_events(result_scope_id,created_at);
alter table public.academic_result_scopes enable row level security;
alter table public.academic_result_scope_events enable row level security;
drop policy if exists academic_result_scopes_member_read on public.academic_result_scopes;
create policy academic_result_scopes_member_read on public.academic_result_scopes
  for select to authenticated using (public.is_active_school_member(school_id));
drop policy if exists academic_result_scope_events_member_read on public.academic_result_scope_events;
create policy academic_result_scope_events_member_read on public.academic_result_scope_events
  for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.academic_result_scopes,public.academic_result_scope_events from anon;
revoke insert,update,delete,truncate,references,trigger on public.academic_result_scopes,public.academic_result_scope_events from authenticated;
grant select on public.academic_result_scopes,public.academic_result_scope_events to authenticated;

create or replace function public.get_academic_result_scopes(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid;
begin
  select school_id into v_school_id from public.terms where id=p_term_id;
  if v_school_id is null or not public.is_active_school_member(v_school_id) then raise exception 'Active school membership and a valid term are required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'schoolId',s.school_id,'yearId',s.academic_year_id,'termId',s.term_id,'classId',s.class_id,
    'className',c.class_name,'status',s.status,'lockedBy',coalesce(lock_actor.full_name,s.locked_by::text),'lockedAt',s.locked_at,
    'approvedBy',coalesce(approval_actor.full_name,s.approved_by::text),'approvedAt',s.approved_at,'approvalNote',s.approval_note
  ) order by c.level,c.class_name) from public.academic_result_scopes s
    join public.academic_classes c on c.id=s.class_id
    join public.users lock_actor on lock_actor.id=s.locked_by
    left join public.users approval_actor on approval_actor.id=s.approved_by
    where s.school_id=v_school_id and s.term_id=p_term_id),'[]'::jsonb);
end $$;

create or replace function public.lock_academic_class_results(p_term_id uuid,p_class_id uuid,p_note text default 'Class results locked after moderation')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_actor uuid:=public.current_app_user_id(); v_role text; v_term public.terms; v_class public.academic_classes; v_scope uuid;
  v_expected integer; v_unmoderated integer; v_incomplete integer;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_class from public.academic_classes where id=p_class_id;
  if v_actor is null or v_term.id is null or v_class.id is null or v_class.school_id<>v_term.school_id
    or v_class.academic_year_id<>v_term.academic_year_id or v_class.programme<>'O_LEVEL'
    or not public.is_active_school_member(v_term.school_id) then raise exception 'Class and term are unavailable in the active school'; end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=v_term.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if coalesce(v_role,'') not in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER') then raise exception 'Academic result lock permission required'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'A lock reason is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_term_id::text||':'||p_class_id::text,0));
  select id into v_scope from public.academic_result_scopes where term_id=p_term_id and class_id=p_class_id for update;
  if v_scope is not null then return v_scope; end if;
  if v_class.status<>'ACTIVE' then raise exception 'Only an active class can be locked'; end if;
  select count(*) into v_expected from public.learner_subject_enrolments ls
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    join public.learners l on l.id=ls.learner_id and l.school_id=ls.school_id
    join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
    where ls.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id
      and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE' and ls.status='ACTIVE'
      and co.status='ACTIVE';
  if v_expected=0 then raise exception 'No active learner subject enrolments exist for this class'; end if;
  select count(distinct ls.class_subject_offering_id) into v_unmoderated from public.learner_subject_enrolments ls
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    join public.learners l on l.id=ls.learner_id and l.school_id=ls.school_id
    join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
    left join public.academic_mark_submissions s on s.term_id=p_term_id and s.class_subject_offering_id=co.id
    where ls.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id
      and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE' and ls.status='ACTIVE' and co.status='ACTIVE'
      and (s.id is null or s.status<>'MODERATED');
  if v_unmoderated>0 then raise exception 'All learner subject offerings must be moderated before locking'; end if;
  select count(*) into v_incomplete from public.learner_subject_enrolments ls
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    join public.learners l on l.id=ls.learner_id and l.school_id=ls.school_id
    join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
    left join public.academic_mark_records mr on mr.term_id=p_term_id and mr.class_subject_offering_id=co.id and mr.learner_id=l.id
    where ls.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id
      and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE' and ls.status='ACTIVE' and co.status='ACTIVE'
      and (mr.id is null or mr.aoi_status='MISSING' or mr.exam_status='MISSING');
  if v_incomplete>0 then raise exception '% learner subject marks are missing or incomplete',v_incomplete; end if;
  insert into public.academic_result_scopes(school_id,academic_year_id,term_id,class_id,locked_by)
    values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_id,v_actor) returning id into v_scope;
  insert into public.academic_result_scope_events(result_scope_id,school_id,actor_user_id,actor_role,action,note)
    values(v_scope,v_term.school_id,v_actor,v_role,'LOCKED',trim(p_note));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,v_role,'ACADEMIC_CLASS_RESULTS_LOCKED','academic_result_scope',v_scope::text,jsonb_build_object('term_id',p_term_id,'class_id',p_class_id,'class_name',v_class.class_name,'note',trim(p_note)));
  return v_scope;
end $$;

create or replace function public.approve_academic_class_results(p_result_scope_id uuid,p_note text)
returns public.academic_result_scopes language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.current_app_user_id(); v_role text; v_scope public.academic_result_scopes;
begin
  select * into v_scope from public.academic_result_scopes where id=p_result_scope_id for update;
  if v_actor is null or v_scope.id is null or not public.is_active_school_member(v_scope.school_id) then raise exception 'Locked result scope is unavailable'; end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=v_scope.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if coalesce(v_role,'') not in ('SCHOOL_ADMIN','HEAD_TEACHER') then raise exception 'Final result approval requires Head Teacher or School Admin authority'; end if;
  if v_actor=v_scope.locked_by then raise exception 'Separation of duties prevents the lock actor from approving the same result scope'; end if;
  if v_scope.status<>'LOCKED' then raise exception 'This result scope is already approved'; end if;
  if nullif(trim(p_note),'') is null then raise exception 'An approval reason is required'; end if;
  update public.academic_result_scopes set status='APPROVED',approved_by=v_actor,approved_at=now(),approval_note=trim(p_note)
    where id=p_result_scope_id returning * into v_scope;
  insert into public.academic_result_scope_events(result_scope_id,school_id,actor_user_id,actor_role,action,note)
    values(v_scope.id,v_scope.school_id,v_actor,v_role,'APPROVED',trim(p_note));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,v_role,'ACADEMIC_CLASS_RESULTS_APPROVED','academic_result_scope',v_scope.id::text,jsonb_build_object('term_id',v_scope.term_id,'class_id',v_scope.class_id,'locked_by',v_scope.locked_by,'note',trim(p_note)));
  return v_scope;
end $$;

-- Guard the authoritative mark save RPC against a class-level lock as well as per-offering submission locks.
alter function public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text)
  rename to save_academic_mark_record_before_result_lock;
revoke all on function public.save_academic_mark_record_before_result_lock(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon,authenticated;
create or replace function public.save_academic_mark_record(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
  p_aoi_mark numeric,p_aoi_status text,p_exam_mark numeric,p_exam_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class_id uuid;
begin
  select class_id into v_class_id from public.class_subject_offerings where id=p_class_subject_offering_id;
  if v_class_id is null then raise exception 'Subject offering is unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_term_id::text||':'||v_class_id::text,0));
  if exists(select 1 from public.academic_result_scopes s where s.term_id=p_term_id and s.class_id=v_class_id) then
    raise exception 'Class results are locked; an authorised result-reopen workflow is required before changing marks';
  end if;
  return public.save_academic_mark_record_before_result_lock(p_term_id,p_class_subject_offering_id,p_learner_id,p_aoi_mark,p_aoi_status,p_exam_mark,p_exam_status);
end $$;

revoke all on function public.get_academic_result_scopes(uuid),public.lock_academic_class_results(uuid,uuid,text),public.approve_academic_class_results(uuid,text) from public,anon;
grant execute on function public.get_academic_result_scopes(uuid),public.lock_academic_class_results(uuid,uuid,text),public.approve_academic_class_results(uuid,text) to authenticated;
revoke all on function public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon;
grant execute on function public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) to authenticated;
notify pgrst,'reload schema';
