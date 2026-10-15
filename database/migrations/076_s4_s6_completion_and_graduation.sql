begin;

-- Preserve the learner record while representing the completed cycle explicitly.
alter table public.learners
  drop constraint if exists learners_status;
alter table public.learners
  add constraint learners_status check (status in ('ACTIVE','INACTIVE','WITHDRAWN','COMPLETED','GRADUATED'));
alter table public.learners
  add column if not exists completion_status text not null default 'NONE'
  check (completion_status in ('NONE','COMPLETED_O_LEVEL','COMPLETED_A_LEVEL','GRADUATED'));

create table if not exists public.learner_cycle_completions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null,
  enrolment_id uuid not null references public.learner_class_enrolments(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_id uuid not null references public.academic_classes(id) on delete restrict,
  completion_type text not null check (completion_type in ('COMPLETED_O_LEVEL','COMPLETED_A_LEVEL')),
  lifecycle_status text not null default 'COMPLETED' check (lifecycle_status in ('COMPLETED','GRADUATED')),
  completed_on date not null,
  completed_by uuid not null references public.users(id) on delete restrict,
  completion_reason text not null check (length(trim(completion_reason)) between 1 and 500),
  graduated_at timestamptz,
  graduated_by uuid references public.users(id) on delete restrict,
  graduation_reason text,
  created_at timestamptz not null default now(),
  constraint learner_cycle_completion_learner_fk foreign key (learner_id,school_id)
    references public.learners(id,school_id) on delete restrict,
  constraint learner_cycle_graduation_state check (
    (lifecycle_status='COMPLETED' and graduated_at is null and graduated_by is null and graduation_reason is null)
    or (lifecycle_status='GRADUATED' and completion_type='COMPLETED_A_LEVEL' and graduated_at is not null and graduated_by is not null and nullif(trim(graduation_reason),'') is not null)
  ),
  constraint learner_cycle_completion_enrolment_uq unique (school_id,enrolment_id)
);
create index if not exists learner_cycle_completions_school_year_idx
  on public.learner_cycle_completions(school_id,academic_year_id,completion_type,lifecycle_status);
alter table public.learner_cycle_completions enable row level security;

-- Decision history is application-only: national examination results, numbers,
-- certificates and related files are intentionally not modelled here.
create table if not exists public.learner_progression_decisions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null,
  enrolment_id uuid references public.learner_class_enrolments(id) on delete restrict,
  academic_year_id uuid references public.academic_years(id) on delete restrict,
  final_decision text not null check (final_decision in (
    'PROMOTE','PROMOTE_WITH_SUPPORT','REPEAT','ACADEMIC_REVIEW_REQUIRED',
    'TRANSFERRED_OUT','WITHDRAWN','LEFT_SCHOOL','COMPLETED_O_LEVEL',
    'COMPLETED_A_LEVEL','GRADUATED'
  )),
  internal_end_of_year_exam_required boolean not null default false,
  reason text not null check (length(trim(reason)) between 1 and 500),
  decided_by uuid not null references public.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  constraint learner_progression_decision_learner_fk foreign key (learner_id,school_id)
    references public.learners(id,school_id) on delete restrict,
  constraint learner_completion_never_requires_internal_exam check (
    final_decision not in ('COMPLETED_O_LEVEL','COMPLETED_A_LEVEL','GRADUATED')
    or internal_end_of_year_exam_required=false
  )
);
create index if not exists learner_progression_decisions_school_idx
  on public.learner_progression_decisions(school_id,academic_year_id,decided_at desc);
alter table public.learner_progression_decisions enable row level security;

create or replace function public.get_school_cycle_completion_register(
  p_school_id uuid,
  p_academic_year_id uuid
) returns jsonb
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.academic_years y where y.id=p_academic_year_id and y.school_id=p_school_id) then
    raise exception 'ACADEMIC_YEAR_NOT_FOUND_IN_SCHOOL';
  end if;
  return jsonb_build_object(
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object(
        'learnerId',l.id,'admissionNumber',l.admission_number,
        'learnerName',concat_ws(' ',l.first_name,l.other_name,l.last_name),
        'enrolmentId',e.id,'academicYearId',e.academic_year_id,
        'academicYearName',y.name,'academicYearEndsOn',y.ends_on,
        'programme',c.programme,'classLevel',c.level,'className',c.class_name,
        'streamName',s.stream_name,
        'completionType',case when c.programme='O_LEVEL' then 'COMPLETED_O_LEVEL' else 'COMPLETED_A_LEVEL' end
      ) order by c.programme,c.level,l.last_name,l.first_name)
      from public.learner_class_enrolments e
      join public.learners l on l.id=e.learner_id and l.school_id=e.school_id
      join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id and c.academic_year_id=e.academic_year_id
      join public.academic_years y on y.id=e.academic_year_id and y.school_id=e.school_id
      left join public.class_streams s on s.id=e.stream_id and s.school_id=e.school_id
      where e.school_id=p_school_id and e.academic_year_id=p_academic_year_id
        and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE'
        and ((c.programme='O_LEVEL' and c.level=4) or (c.programme='A_LEVEL' and c.level=6))
        and not exists(select 1 from public.learner_cycle_completions x where x.school_id=e.school_id and x.enrolment_id=e.id)
    ),'[]'::jsonb),
    'awaitingGraduation',coalesce((
      select jsonb_agg(jsonb_build_object(
        'completionId',x.id,'learnerId',l.id,'admissionNumber',l.admission_number,
        'learnerName',concat_ws(' ',l.first_name,l.other_name,l.last_name),
        'academicYearName',y.name,'className',c.class_name,'completedOn',x.completed_on,
        'completionType',x.completion_type
      ) order by x.completed_on,l.last_name,l.first_name)
      from public.learner_cycle_completions x
      join public.learners l on l.id=x.learner_id and l.school_id=x.school_id
      join public.academic_years y on y.id=x.academic_year_id and y.school_id=x.school_id
      join public.academic_classes c on c.id=x.class_id and c.school_id=x.school_id
      where x.school_id=p_school_id and x.academic_year_id=p_academic_year_id
        and x.completion_type='COMPLETED_A_LEVEL' and x.lifecycle_status='COMPLETED'
    ),'[]'::jsonb),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'completionId',x.id,'learnerId',l.id,'admissionNumber',l.admission_number,
        'learnerName',concat_ws(' ',l.first_name,l.other_name,l.last_name),
        'academicYearName',y.name,'className',c.class_name,
        'completionType',x.completion_type,'lifecycleStatus',x.lifecycle_status,
        'completedOn',x.completed_on,'graduatedAt',x.graduated_at
      ) order by x.completed_on desc,l.last_name,l.first_name)
      from public.learner_cycle_completions x
      join public.learners l on l.id=x.learner_id and l.school_id=x.school_id
      join public.academic_years y on y.id=x.academic_year_id and y.school_id=x.school_id
      join public.academic_classes c on c.id=x.class_id and c.school_id=x.school_id
      where x.school_id=p_school_id and x.academic_year_id=p_academic_year_id
    ),'[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_school_learner_cycle(
  p_school_id uuid,
  p_enrolment_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_enrolment public.learner_class_enrolments%rowtype;
  v_learner public.learners%rowtype;
  v_class public.academic_classes%rowtype;
  v_year public.academic_years%rowtype;
  v_actor uuid;
  v_actor_name text;
  v_completion_type text;
  v_completion_id uuid;
begin
  if p_school_id is null or p_enrolment_id is null or nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'CYCLE_COMPLETION_FIELDS_REQUIRED';
  end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_enrolment from public.learner_class_enrolments
    where id=p_enrolment_id and school_id=p_school_id for update;
  if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null then
    raise exception 'ACTIVE_LEARNER_ENROLMENT_REQUIRED';
  end if;
  select * into v_learner from public.learners where id=v_enrolment.learner_id and school_id=p_school_id for update;
  select * into v_class from public.academic_classes where id=v_enrolment.class_id and school_id=p_school_id;
  select * into v_year from public.academic_years where id=v_enrolment.academic_year_id and school_id=p_school_id;
  if v_learner.id is null or v_class.id is null or v_year.id is null then raise exception 'CYCLE_COMPLETION_RECORD_NOT_FOUND'; end if;
  if v_year.ends_on < v_enrolment.effective_from then raise exception 'ACADEMIC_YEAR_END_PRECEDES_ENROLMENT'; end if;
  if v_class.programme='O_LEVEL' and v_class.level=4 then
    v_completion_type:='COMPLETED_O_LEVEL';
  elsif v_class.programme='A_LEVEL' and v_class.level=6 then
    v_completion_type:='COMPLETED_A_LEVEL';
  else
    raise exception 'ONLY_S4_OR_S6_CAN_COMPLETE_A_CYCLE';
  end if;
  if exists(select 1 from public.learner_cycle_completions where school_id=p_school_id and enrolment_id=p_enrolment_id) then
    raise exception 'LEARNER_CYCLE_ALREADY_COMPLETED';
  end if;
  v_actor:=public.current_app_user_id();
  select full_name into v_actor_name from public.users where id=v_actor;

  update public.learner_subject_enrolments set status='COMPLETED',effective_to=v_year.ends_on,updated_at=now()
    where school_id=p_school_id and enrolment_id=v_enrolment.id and status='ACTIVE';
  update public.learner_combination_enrolments set status='COMPLETED',effective_to=v_year.ends_on
    where school_id=p_school_id and enrolment_id=v_enrolment.id and status='ACTIVE';
  if v_completion_type='COMPLETED_A_LEVEL' then
    update public.a_level_learner_assignments
      set status='ENDED',ends_on=v_year.ends_on
      where school_id=p_school_id and learner_id=v_learner.id and class_id=v_class.id and status='ACTIVE';
  end if;
  update public.learner_class_enrolments set status='COMPLETED',effective_to=v_year.ends_on,updated_at=now(),updated_by=v_actor
    where id=v_enrolment.id and school_id=p_school_id;
  update public.learners set status='COMPLETED',completion_status=v_completion_type,updated_at=now(),updated_by=v_actor
    where id=v_learner.id and school_id=p_school_id;
  insert into public.learner_cycle_completions(school_id,learner_id,enrolment_id,academic_year_id,class_id,completion_type,completed_on,completed_by,completion_reason)
    values(p_school_id,v_learner.id,v_enrolment.id,v_enrolment.academic_year_id,v_class.id,v_completion_type,v_year.ends_on,v_actor,trim(p_reason))
    returning id into v_completion_id;
  insert into public.learner_progression_decisions(school_id,learner_id,enrolment_id,academic_year_id,final_decision,internal_end_of_year_exam_required,reason,decided_by)
    values(p_school_id,v_learner.id,v_enrolment.id,v_enrolment.academic_year_id,v_completion_type,false,trim(p_reason),v_actor);
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','LEARNER_CYCLE_COMPLETED','learner',v_learner.id::text,
      jsonb_build_object('learner_status',v_learner.status,'enrolment_status',v_enrolment.status),
      jsonb_build_object('completion_type',v_completion_type,'learner_status','COMPLETED','enrolment_status','COMPLETED','effective_to',v_year.ends_on,'internal_end_of_year_exam_required',false));
  return v_completion_id;
end;
$$;

create or replace function public.approve_school_learner_graduation(
  p_school_id uuid,
  p_completion_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_completion public.learner_cycle_completions%rowtype;
  v_learner public.learners%rowtype;
  v_actor uuid;
  v_actor_name text;
begin
  if p_school_id is null or p_completion_id is null or nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'GRADUATION_APPROVAL_FIELDS_REQUIRED';
  end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_completion from public.learner_cycle_completions
    where id=p_completion_id and school_id=p_school_id for update;
  if v_completion.id is null or v_completion.completion_type<>'COMPLETED_A_LEVEL' then
    raise exception 'ONLY_COMPLETED_S6_LEARNERS_CAN_GRADUATE';
  end if;
  if v_completion.lifecycle_status<>'COMPLETED' then raise exception 'LEARNER_ALREADY_GRADUATED'; end if;
  select * into v_learner from public.learners where id=v_completion.learner_id and school_id=p_school_id for update;
  if v_learner.id is null or v_learner.completion_status<>'COMPLETED_A_LEVEL' then raise exception 'S6_COMPLETION_REQUIRED'; end if;
  v_actor:=public.current_app_user_id();
  select full_name into v_actor_name from public.users where id=v_actor;
  update public.learner_cycle_completions set lifecycle_status='GRADUATED',graduated_at=now(),graduated_by=v_actor,graduation_reason=trim(p_reason)
    where id=v_completion.id and school_id=p_school_id;
  update public.learners set status='GRADUATED',completion_status='GRADUATED',updated_at=now(),updated_by=v_actor
    where id=v_learner.id and school_id=p_school_id;
  insert into public.learner_progression_decisions(school_id,learner_id,enrolment_id,academic_year_id,final_decision,internal_end_of_year_exam_required,reason,decided_by)
    values(p_school_id,v_learner.id,v_completion.enrolment_id,v_completion.academic_year_id,'GRADUATED',false,trim(p_reason),v_actor);
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','LEARNER_GRADUATED','learner',v_learner.id::text,
      jsonb_build_object('learner_status',v_learner.status,'completion_status',v_learner.completion_status),
      jsonb_build_object('learner_status','GRADUATED','completion_status','GRADUATED','internal_end_of_year_exam_required',false));
  return v_completion.id;
end;
$$;

create or replace function public.record_school_learner_cycle_exit(
  p_school_id uuid,p_enrolment_id uuid,p_exit_type text,p_effective_to date,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_enrolment public.learner_class_enrolments%rowtype;
  v_learner public.learners%rowtype;
  v_class public.academic_classes%rowtype;
  v_year public.academic_years%rowtype;
  v_actor uuid;
  v_actor_name text;
  v_enrolment_status text;
  v_learner_status text;
begin
  if p_school_id is null or p_enrolment_id is null or p_effective_to is null
    or p_exit_type is null or p_exit_type not in ('TRANSFERRED_OUT','WITHDRAWN','LEFT_SCHOOL')
    or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'CYCLE_EXIT_FIELDS_REQUIRED'; end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id and school_id=p_school_id for update;
  if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null then raise exception 'ACTIVE_LEARNER_ENROLMENT_REQUIRED'; end if;
  select * into v_learner from public.learners where id=v_enrolment.learner_id and school_id=p_school_id for update;
  select * into v_class from public.academic_classes where id=v_enrolment.class_id and school_id=p_school_id;
  select * into v_year from public.academic_years where id=v_enrolment.academic_year_id and school_id=p_school_id;
  if v_learner.id is null or v_class.id is null or v_year.id is null then raise exception 'CYCLE_EXIT_RECORD_NOT_FOUND'; end if;
  if not ((v_class.programme='O_LEVEL' and v_class.level=4) or (v_class.programme='A_LEVEL' and v_class.level=6)) then raise exception 'ONLY_S4_OR_S6_CYCLE_CANDIDATES_CAN_EXIT_HERE'; end if;
  if p_effective_to<v_enrolment.effective_from or p_effective_to>v_year.ends_on then raise exception 'CYCLE_EXIT_DATE_OUTSIDE_ACTIVE_ENROLMENT'; end if;
  if exists(select 1 from public.learner_subject_enrolments where enrolment_id=v_enrolment.id and status='ACTIVE' and effective_from>p_effective_to)
    or exists(select 1 from public.learner_combination_enrolments where enrolment_id=v_enrolment.id and status='ACTIVE' and effective_from>p_effective_to) then
    raise exception 'CYCLE_EXIT_DATE_PRECEDES_ACTIVE_SUBJECT_SELECTION';
  end if;
  if v_class.programme='A_LEVEL' and exists(select 1 from public.a_level_learner_assignments where school_id=p_school_id and learner_id=v_learner.id and class_id=v_class.id and status='ACTIVE' and starts_on>p_effective_to) then
    raise exception 'CYCLE_EXIT_DATE_PRECEDES_ACTIVE_COMBINATION';
  end if;
  v_enrolment_status:=case when p_exit_type='TRANSFERRED_OUT' then 'TRANSFERRED' when p_exit_type='WITHDRAWN' then 'WITHDRAWN' else 'WITHDRAWN' end;
  v_learner_status:=case when p_exit_type='WITHDRAWN' then 'WITHDRAWN' else 'INACTIVE' end;
  v_actor:=public.current_app_user_id();
  select full_name into v_actor_name from public.users where id=v_actor;
  update public.learner_subject_enrolments set status='COMPLETED',effective_to=p_effective_to,updated_at=now()
    where school_id=p_school_id and enrolment_id=v_enrolment.id and status='ACTIVE';
  update public.learner_combination_enrolments set status='COMPLETED',effective_to=p_effective_to
    where school_id=p_school_id and enrolment_id=v_enrolment.id and status='ACTIVE';
  if v_class.programme='A_LEVEL' then
    update public.a_level_learner_assignments set status='ENDED',ends_on=p_effective_to
      where school_id=p_school_id and learner_id=v_learner.id and class_id=v_class.id and status='ACTIVE';
  end if;
  update public.learner_class_enrolments set status=v_enrolment_status,effective_to=p_effective_to,updated_at=now(),updated_by=v_actor where id=v_enrolment.id and school_id=p_school_id;
  update public.learners set status=v_learner_status,updated_at=now(),updated_by=v_actor where id=v_learner.id and school_id=p_school_id;
  insert into public.learner_progression_decisions(school_id,learner_id,enrolment_id,academic_year_id,final_decision,internal_end_of_year_exam_required,reason,decided_by)
    values(p_school_id,v_learner.id,v_enrolment.id,v_enrolment.academic_year_id,p_exit_type,false,trim(p_reason),v_actor);
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','LEARNER_CYCLE_EXIT_RECORDED','learner',v_learner.id::text,
      jsonb_build_object('learner_status',v_learner.status,'enrolment_status',v_enrolment.status),
      jsonb_build_object('exit_type',p_exit_type,'learner_status',v_learner_status,'enrolment_status',v_enrolment_status,'effective_to',p_effective_to,'reason',trim(p_reason)));
  return v_enrolment.id;
end;
$$;

create or replace function public.get_school_learner_completion_status(p_school_id uuid,p_learner_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_status text; v_rows jsonb;
begin
  if not public.is_active_school_member(p_school_id) and not public.is_active_platform_admin() then raise exception 'SCHOOL_MEMBERSHIP_REQUIRED'; end if;
  select completion_status into v_status from public.learners where id=p_learner_id and school_id=p_school_id;
  if not found then raise exception 'LEARNER_NOT_FOUND_IN_SCHOOL'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('completionType',completion_type,'lifecycleStatus',lifecycle_status,'academicYearId',academic_year_id,'completedOn',completed_on,'graduatedAt',graduated_at) order by completed_on desc),'[]'::jsonb)
    into v_rows from public.learner_cycle_completions where school_id=p_school_id and learner_id=p_learner_id;
  return jsonb_build_object('completionStatus',v_status,'cycles',v_rows);
end;
$$;

create or replace function public.get_school_s5_admission_options(p_school_id uuid,p_learner_id uuid,p_academic_year_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_year public.academic_years%rowtype;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.learners l where l.id=p_learner_id and l.school_id=p_school_id and exists(
    select 1 from public.learner_cycle_completions x where x.school_id=p_school_id and x.learner_id=l.id and x.completion_type='COMPLETED_O_LEVEL')) then
    raise exception 'COMPLETED_O_LEVEL_LEARNER_REQUIRED';
  end if;
  select * into v_year from public.academic_years where id=p_academic_year_id and school_id=p_school_id;
  if v_year.id is null then raise exception 'ACADEMIC_YEAR_NOT_FOUND_IN_SCHOOL'; end if;
  return jsonb_build_object(
    'academicYear',jsonb_build_object('id',v_year.id,'name',v_year.name,'startsOn',v_year.starts_on,'endsOn',v_year.ends_on),
    'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.class_name,'streams',(
      select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name) order by s.stream_name),'[]'::jsonb)
      from public.class_streams s where s.class_id=c.id and s.school_id=p_school_id and s.status='ACTIVE')) order by c.class_name)
      from public.academic_classes c where c.school_id=p_school_id and c.academic_year_id=p_academic_year_id and c.programme='A_LEVEL' and c.level=5 and c.status='ACTIVE'),'[]'::jsonb),
    'combinations',coalesce((select jsonb_agg(jsonb_build_object('id',ac.id,'code',ac.code,'name',ac.name,'subjects',(
      select coalesce(jsonb_agg(jsonb_build_object('offeringId',acs.school_subject_offering_id,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code),'code',so.school_subject_code,'role',acs.subject_role) order by acs.display_order),'[]'::jsonb)
      from public.a_level_combination_subjects acs join public.school_subject_offerings so on so.id=acs.school_subject_offering_id and so.school_id=p_school_id
      left join public.system_subjects ss on ss.id=so.system_subject_id where acs.combination_id=ac.id and so.status='ACTIVE')) order by ac.code)
      from public.a_level_combinations ac where ac.school_id=p_school_id and ac.academic_year_id=p_academic_year_id and ac.status='ACTIVE' and ac.level in ('S5','BOTH')),'[]'::jsonb)
  );
end;
$$;

create or replace function public.admit_completed_o_level_learner_to_s5(
  p_school_id uuid,p_learner_id uuid,p_academic_year_id uuid,p_class_id uuid,p_stream_id uuid,
  p_combination_id uuid,p_effective_from date,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_learner public.learners%rowtype; v_year public.academic_years%rowtype; v_class public.academic_classes%rowtype;
  v_combination public.a_level_combinations%rowtype; v_completion public.learner_cycle_completions%rowtype;
  v_actor uuid; v_actor_name text; v_enrolment_id uuid; v_combo_subjects integer; v_connected_subjects integer;
begin
  if p_school_id is null or p_learner_id is null or p_academic_year_id is null or p_class_id is null or p_combination_id is null
    or p_effective_from is null or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'S5_ADMISSION_FIELDS_REQUIRED'; end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_learner from public.learners where id=p_learner_id and school_id=p_school_id for update;
  if v_learner.id is null then raise exception 'LEARNER_NOT_FOUND_IN_SCHOOL'; end if;
  select * into v_completion from public.learner_cycle_completions x where x.school_id=p_school_id and x.learner_id=p_learner_id and x.completion_type='COMPLETED_O_LEVEL' order by x.completed_on desc limit 1;
  if v_completion.id is null then raise exception 'COMPLETED_O_LEVEL_LEARNER_REQUIRED'; end if;
  if exists(select 1 from public.learner_class_enrolments e where e.school_id=p_school_id and e.learner_id=p_learner_id and e.status='ACTIVE' and e.effective_to is null) then raise exception 'LEARNER_ALREADY_HAS_ACTIVE_ENROLMENT'; end if;
  select * into v_year from public.academic_years where id=p_academic_year_id and school_id=p_school_id;
  select * into v_class from public.academic_classes where id=p_class_id and school_id=p_school_id and academic_year_id=p_academic_year_id and programme='A_LEVEL' and level=5 and status='ACTIVE';
  select * into v_combination from public.a_level_combinations where id=p_combination_id and school_id=p_school_id and academic_year_id=p_academic_year_id and status='ACTIVE' and level in ('S5','BOTH');
  if v_year.id is null or v_class.id is null or v_combination.id is null then raise exception 'ACTIVE_S5_CLASS_YEAR_AND_COMBINATION_REQUIRED'; end if;
  if v_year.starts_on<=v_completion.completed_on or p_effective_from<v_year.starts_on or p_effective_from>v_year.ends_on then raise exception 'S5_MUST_BE_A_SEPARATE_SUBSEQUENT_ACADEMIC_ADMISSION'; end if;
  if p_stream_id is not null and not exists(select 1 from public.class_streams s where s.id=p_stream_id and s.class_id=v_class.id and s.school_id=p_school_id and s.status='ACTIVE') then raise exception 'S5_STREAM_NOT_FOUND_IN_CLASS'; end if;
  if exists(select 1 from public.class_streams s where s.class_id=v_class.id and s.school_id=p_school_id and s.status='ACTIVE') and p_stream_id is null then raise exception 'S5_STREAM_REQUIRED'; end if;
  select count(*) into v_combo_subjects from public.a_level_combination_subjects where combination_id=v_combination.id;
  select count(distinct co.id) into v_connected_subjects from public.a_level_combination_subjects acs
    join public.school_subject_offerings so on so.id=acs.school_subject_offering_id and so.school_id=p_school_id and so.status='ACTIVE'
    join public.class_subject_offerings co on co.school_subject_offering_id=so.id and co.school_id=p_school_id and co.class_id=v_class.id and co.status='ACTIVE'
    where acs.combination_id=v_combination.id;
  if v_combo_subjects<>5 or v_connected_subjects<>v_combo_subjects then raise exception 'S5_CLASS_MUST_OFFER_ALL_FIVE_SELECTED_COMBINATION_SUBJECTS'; end if;
  v_actor:=public.current_app_user_id(); select full_name into v_actor_name from public.users where id=v_actor;
  insert into public.learner_class_enrolments(school_id,learner_id,academic_year_id,class_id,stream_id,status,effective_from,created_by,updated_by)
    values(p_school_id,p_learner_id,p_academic_year_id,p_class_id,p_stream_id,'ACTIVE',p_effective_from,v_actor,v_actor) returning id into v_enrolment_id;
  insert into public.a_level_learner_assignments(school_id,learner_id,class_id,combination_id,status,starts_on,assigned_by)
    values(p_school_id,p_learner_id,p_class_id,p_combination_id,'ACTIVE',p_effective_from,auth.uid());
  update public.learners set status='ACTIVE',updated_at=now(),updated_by=v_actor where id=p_learner_id and school_id=p_school_id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','LEARNER_ADMITTED_TO_S5','learner',p_learner_id::text,
      jsonb_build_object('completion','COMPLETED_O_LEVEL','automatic_promotion',false),
      jsonb_build_object('academic_year_id',p_academic_year_id,'class_id',p_class_id,'stream_id',p_stream_id,'combination_id',p_combination_id,'enrolment_id',v_enrolment_id,'admission_reason',trim(p_reason),'automatic_promotion',false));
  return v_enrolment_id;
end;
$$;

revoke all on public.learner_cycle_completions,public.learner_progression_decisions from public,anon,authenticated;
revoke all on function public.get_school_cycle_completion_register(uuid,uuid),public.complete_school_learner_cycle(uuid,uuid,text),public.approve_school_learner_graduation(uuid,uuid,text),public.record_school_learner_cycle_exit(uuid,uuid,text,date,text),public.get_school_learner_completion_status(uuid,uuid),public.get_school_s5_admission_options(uuid,uuid,uuid),public.admit_completed_o_level_learner_to_s5(uuid,uuid,uuid,uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.get_school_cycle_completion_register(uuid,uuid),public.complete_school_learner_cycle(uuid,uuid,text),public.approve_school_learner_graduation(uuid,uuid,text),public.record_school_learner_cycle_exit(uuid,uuid,text,date,text),public.get_school_learner_completion_status(uuid,uuid),public.get_school_s5_admission_options(uuid,uuid,uuid),public.admit_completed_o_level_learner_to_s5(uuid,uuid,uuid,uuid,uuid,uuid,date,text) to authenticated;

commit;
