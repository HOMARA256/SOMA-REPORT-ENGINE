-- Allocation-derived, tenant-safe marks entry for the persistent academic core.
create table if not exists public.academic_mark_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  class_subject_offering_id uuid not null,
  learner_id uuid not null,
  aoi_mark numeric(5,2),
  aoi_status text not null default 'MISSING',
  exam_mark numeric(5,2),
  exam_status text not null default 'MISSING',
  workflow_status text not null default 'DRAFT',
  entered_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_marks_offering_fk foreign key(class_subject_offering_id,school_id) references public.class_subject_offerings(id,school_id) on delete restrict,
  constraint academic_marks_learner_fk foreign key(learner_id,school_id) references public.learners(id,school_id) on delete restrict,
  constraint academic_marks_aoi_status check(aoi_status in ('MISSING','PRESENT','ABSENT','EXEMPT')),
  constraint academic_marks_exam_status check(exam_status in ('MISSING','PRESENT','ABSENT','EXEMPT')),
  constraint academic_marks_workflow_status check(workflow_status in ('DRAFT','SUBMITTED','RETURNED','APPROVED','PUBLISHED')),
  constraint academic_marks_aoi_range check(aoi_mark is null or (aoi_mark>=0 and aoi_mark<=20)),
  constraint academic_marks_exam_range check(exam_mark is null or (exam_mark>=0 and exam_mark<=80)),
  constraint academic_marks_aoi_value check((aoi_status='PRESENT' and aoi_mark is not null) or (aoi_status<>'PRESENT' and aoi_mark is null)),
  constraint academic_marks_exam_value check((exam_status='PRESENT' and exam_mark is not null) or (exam_status<>'PRESENT' and exam_mark is null)),
  constraint academic_marks_scope_uq unique(term_id,class_subject_offering_id,learner_id)
);

create index if not exists academic_mark_records_school_term_idx on public.academic_mark_records(school_id,term_id);
create index if not exists academic_mark_records_learner_idx on public.academic_mark_records(learner_id);
alter table public.academic_mark_records enable row level security;
drop policy if exists academic_mark_records_member_read on public.academic_mark_records;
create policy academic_mark_records_member_read on public.academic_mark_records for select to authenticated using(public.is_active_school_member(school_id));
revoke all on public.academic_mark_records from anon;
revoke insert,update,delete,truncate,references,trigger on public.academic_mark_records from authenticated;

create or replace function public.get_marks_entry_workspace(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_term public.terms; v_role text; v_privileged boolean;
begin
  v_actor:=public.current_app_user_id();
  select * into v_term from public.terms where id=p_term_id;
  if v_actor is null or v_term.id is null or not public.is_active_school_member(v_term.school_id) then raise exception 'Active school membership and a valid term are required'; end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=v_term.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  v_privileged:=v_role in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER');
  return jsonb_build_object(
    'schoolId',v_term.school_id,'termId',v_term.id,'academicYearId',v_term.academic_year_id,'role',v_role,'canEnter',v_privileged or v_role='TEACHER',
    'offerings',coalesce((select jsonb_agg(jsonb_build_object(
      'id',co.id,'classId',c.id,'className',c.class_name,'programme',c.programme,'streamId',co.stream_id,'streamName',st.stream_name,
      'subjectCode',coalesce(so.school_subject_code,ss.subject_code),'subjectName',coalesce(so.display_name_override,ss.subject_name),
      'teacherName',(select u.full_name from public.teacher_allocations ta join public.users u on u.id=ta.teacher_id where ta.term_id=v_term.id and ta.class_subject_offering_id=co.id and ta.status='ACTIVE' and ta.allocation_role='PRIMARY_SUBJECT_TEACHER' order by ta.created_at desc limit 1),
      'learners',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',l.id,'admissionNumber',l.admission_number,'name',concat_ws(' ',l.first_name,l.other_name,l.last_name),
        'aoiMark',mr.aoi_mark,'aoiStatus',coalesce(mr.aoi_status,'MISSING'),'examMark',mr.exam_mark,'examStatus',coalesce(mr.exam_status,'MISSING'),
        'workflowStatus',coalesce(mr.workflow_status,'DRAFT'),'updatedAt',mr.updated_at
      ) order by l.last_name,l.first_name),'[]'::jsonb)
      from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id
      left join public.academic_mark_records mr on mr.term_id=v_term.id and mr.class_subject_offering_id=co.id and mr.learner_id=l.id
      where e.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=co.class_id
        and (co.stream_id is null or e.stream_id=co.stream_id) and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE')
    ) order by c.level,c.class_name,ss.subject_name) from public.class_subject_offerings co
      join public.academic_classes c on c.id=co.class_id left join public.class_streams st on st.id=co.stream_id
      join public.school_subject_offerings so on so.id=co.school_subject_offering_id left join public.system_subjects ss on ss.id=so.system_subject_id
      where co.school_id=v_term.school_id and co.academic_year_id=v_term.academic_year_id and co.status='ACTIVE' and so.status='ACTIVE'
        and (co.term_id is null or co.term_id=v_term.id)
        and (v_privileged or exists(select 1 from public.teacher_allocations ta where ta.term_id=v_term.id and ta.class_subject_offering_id=co.id and ta.teacher_id=v_actor and ta.status='ACTIVE' and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')))
    ),'[]'::jsonb)
  );
end $$;

create or replace function public.save_academic_mark_record(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
  p_aoi_mark numeric,p_aoi_status text,p_exam_mark numeric,p_exam_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_term public.terms; v_offering public.class_subject_offerings; v_role text; v_id uuid; v_old jsonb;
begin
  v_actor:=public.current_app_user_id();
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_class_subject_offering_id and status='ACTIVE';
  if v_actor is null or v_term.id is null or v_offering.id is null or v_term.school_id<>v_offering.school_id or v_term.academic_year_id<>v_offering.academic_year_id then raise exception 'Invalid term or subject offering'; end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=v_term.school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if v_role not in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER') and not exists(select 1 from public.teacher_allocations ta where ta.term_id=p_term_id and ta.class_subject_offering_id=p_class_subject_offering_id and ta.teacher_id=v_actor and ta.status='ACTIVE' and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then raise exception 'You are not allocated to enter marks for this subject'; end if;
  if not exists(select 1 from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id where e.learner_id=p_learner_id and e.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=v_offering.class_id and (v_offering.stream_id is null or e.stream_id=v_offering.stream_id) and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE') then raise exception 'Learner is not eligible for this offering'; end if;
  p_aoi_status:=upper(p_aoi_status); p_exam_status:=upper(p_exam_status);
  if p_aoi_status not in ('MISSING','PRESENT','ABSENT','EXEMPT') or p_exam_status not in ('MISSING','PRESENT','ABSENT','EXEMPT') then raise exception 'Unsupported mark status'; end if;
  if p_aoi_status='PRESENT' and (p_aoi_mark is null or p_aoi_mark<0 or p_aoi_mark>20) then raise exception 'AoI mark must be between 0 and 20'; end if;
  if p_exam_status='PRESENT' and (p_exam_mark is null or p_exam_mark<0 or p_exam_mark>80) then raise exception 'Exam mark must be between 0 and 80'; end if;
  if p_aoi_status<>'PRESENT' then p_aoi_mark:=null; end if; if p_exam_status<>'PRESENT' then p_exam_mark:=null; end if;
  select to_jsonb(m) into v_old from public.academic_mark_records m where m.term_id=p_term_id and m.class_subject_offering_id=p_class_subject_offering_id and m.learner_id=p_learner_id;
  insert into public.academic_mark_records(school_id,academic_year_id,term_id,class_subject_offering_id,learner_id,aoi_mark,aoi_status,exam_mark,exam_status,entered_by)
  values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_subject_offering_id,p_learner_id,p_aoi_mark,p_aoi_status,p_exam_mark,p_exam_status,v_actor)
  on conflict(term_id,class_subject_offering_id,learner_id) do update set aoi_mark=excluded.aoi_mark,aoi_status=excluded.aoi_status,exam_mark=excluded.exam_mark,exam_status=excluded.exam_status,entered_by=excluded.entered_by,updated_at=now()
  where public.academic_mark_records.workflow_status in ('DRAFT','RETURNED') returning id into v_id;
  if v_id is null then raise exception 'Approved or submitted marks are locked'; end if;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value) values(v_actor::text,coalesce(v_role,'UNKNOWN'),'ACADEMIC_MARK_SAVED','academic_mark_record',v_id::text,v_old,jsonb_build_object('term_id',p_term_id,'offering_id',p_class_subject_offering_id,'learner_id',p_learner_id,'aoi_status',p_aoi_status,'exam_status',p_exam_status));
  return v_id;
end $$;

revoke all on function public.get_marks_entry_workspace(uuid),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon;
grant execute on function public.get_marks_entry_workspace(uuid),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) to authenticated;
