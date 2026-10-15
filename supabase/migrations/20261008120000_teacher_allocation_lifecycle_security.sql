-- Tighten the allocation workspace to school administrators and add an
-- audited end-of-allocation action. All mutations remain server-authorized.
create or replace function public.get_teacher_allocation_setup(p_school_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_school_id is null or not (
    public.is_school_admin_for(p_school_id) or public.is_active_platform_admin()
  ) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;

  return jsonb_build_object(
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'academicYearId', t.academic_year_id,
        'name', t.name, 'status', t.lifecycle_status
      ) order by t.starts_on desc)
      from public.terms t where t.school_id = p_school_id
    ), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id, 'name', u.full_name, 'email', u.email
      ) order by u.full_name)
      from public.school_memberships m
      join public.users u on u.id = m.user_id
      join public.roles r on r.id = m.role_id
      where m.school_id = p_school_id and m.status = 'ACTIVE'
        and u.is_active and u.account_status = 'ACTIVE'
        and u.auth_user_id is not null and r.code = 'TEACHER'
    ), '[]'::jsonb),
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', co.id, 'academicYearId', co.academic_year_id,
        'classId', c.id, 'className', c.class_name,
        'streamId', co.stream_id, 'streamName', st.stream_name,
        'subjectCode', coalesce(so.school_subject_code, ss.subject_code),
        'subjectName', coalesce(so.display_name_override, ss.subject_name),
        'status', co.status, 'schoolSubjectStatus', so.status
      ) order by c.level, c.class_name, ss.subject_name)
      from public.class_subject_offerings co
      join public.academic_classes c on c.id = co.class_id
      left join public.class_streams st on st.id = co.stream_id
      join public.school_subject_offerings so on so.id = co.school_subject_offering_id
      left join public.system_subjects ss on ss.id = so.system_subject_id
      where co.school_id = p_school_id
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'termId', a.term_id, 'offeringId', a.class_subject_offering_id,
        'teacherId', a.teacher_id, 'teacherName', u.full_name,
        'role', a.allocation_role, 'status', a.status,
        'effectiveFrom', a.effective_from, 'effectiveTo', a.effective_to
      ) order by a.created_at desc)
      from public.teacher_allocations a
      join public.users u on u.id = a.teacher_id
      where a.school_id = p_school_id
    ), '[]'::jsonb)
  );
end;
$$;

-- Allow one active record per teacher/offering while keeping ended records as
-- distinct history rows. The legacy table-wide unique constraint prevented a
-- teacher from being restored without overwriting their prior allocation.
alter table public.teacher_allocations
  drop constraint if exists teacher_allocation_scope_key;
create unique index if not exists teacher_allocation_active_scope_uq
  on public.teacher_allocations(term_id, teacher_id, class_subject_offering_id, stream_id)
  nulls not distinct
  where status = 'ACTIVE';

create or replace function public.assign_teacher_to_offering(
  p_class_subject_offering_id uuid,
  p_term_id uuid,
  p_teacher_id uuid,
  p_allocation_role text,
  p_reason text,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering public.class_subject_offerings%rowtype;
  v_term public.terms%rowtype;
  v_actor uuid;
  v_id uuid;
  v_existing public.teacher_allocations%rowtype;
  v_previous_teacher_id uuid;
  v_previous_effective_from date;
begin
  select * into v_offering from public.class_subject_offerings
  where id = p_class_subject_offering_id and status = 'ACTIVE';
  if v_offering.id is null or not public.is_school_admin_for(v_offering.school_id) then
    raise exception 'Active class subject offering unavailable';
  end if;
  select * into v_term from public.terms
  where id = p_term_id and school_id = v_offering.school_id
    and academic_year_id = v_offering.academic_year_id;
  if v_term.id is null then raise exception 'Term does not belong to the offering academic year'; end if;
  if p_allocation_role not in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER','SUBJECT_MODERATOR') then
    raise exception 'Unsupported allocation role';
  end if;
  if p_effective_from is null or p_effective_from > current_date then
    raise exception 'Allocation start date must be today or earlier';
  end if;
  if not exists (
    select 1 from public.school_memberships m
    join public.roles r on r.id = m.role_id
    join public.users u on u.id = m.user_id
    where m.school_id = v_offering.school_id and m.user_id = p_teacher_id
      and m.status = 'ACTIVE' and u.is_active and u.account_status = 'ACTIVE'
      and u.auth_user_id is not null and r.code = 'TEACHER'
  ) then raise exception 'Teacher must be an active school member with the Teacher system role'; end if;

  v_actor := public.current_app_user_id();
  select teacher_id, effective_from into v_previous_teacher_id, v_previous_effective_from from public.teacher_allocations
  where school_id = v_offering.school_id and term_id = p_term_id
    and class_subject_offering_id = v_offering.id
    and stream_id is not distinct from v_offering.stream_id
    and status = 'ACTIVE' and allocation_role = 'PRIMARY_SUBJECT_TEACHER'
  for update;
  if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER'
    and v_previous_teacher_id is not null and v_previous_teacher_id <> p_teacher_id
    and nullif(trim(p_reason), '') is null then
    raise exception 'Provide a reason when replacing the current primary teacher';
  end if;
  if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER'
    and v_previous_teacher_id is not null and v_previous_teacher_id <> p_teacher_id
    and p_effective_from <= v_previous_effective_from then
    raise exception 'Replacement start date must be after the current primary allocation start date';
  end if;

  select * into v_existing from public.teacher_allocations
  where term_id = p_term_id and teacher_id = p_teacher_id
    and class_subject_offering_id = v_offering.id
    and stream_id is not distinct from v_offering.stream_id
    and status = 'ACTIVE'
  for update;
  if found then
    if v_existing.allocation_role = p_allocation_role then return v_existing.id; end if;
    raise exception 'Teacher already has an active allocation for this offering under a different role';
  end if;

  if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER' then
    update public.teacher_allocations
    set status = 'INACTIVE', effective_to = p_effective_from - 1, updated_at = now()
    where school_id = v_offering.school_id and term_id = p_term_id
      and class_subject_offering_id = v_offering.id
      and stream_id is not distinct from v_offering.stream_id
      and status = 'ACTIVE' and allocation_role = 'PRIMARY_SUBJECT_TEACHER';
  end if;

  insert into public.teacher_allocations(
    school_id, academic_year_id, term_id, teacher_id, class_subject_offering_id,
    stream_id, status, allocation_role, effective_from, created_by
  ) values (
    v_offering.school_id, v_offering.academic_year_id, p_term_id, p_teacher_id,
    v_offering.id, v_offering.stream_id, 'ACTIVE', p_allocation_role,
    p_effective_from, v_actor
  ) on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.teacher_allocations
    where term_id = p_term_id and teacher_id = p_teacher_id
      and class_subject_offering_id = v_offering.id
      and stream_id is not distinct from v_offering.stream_id
      and status = 'ACTIVE' and allocation_role = p_allocation_role;
    if v_id is null then raise exception 'Allocation changed concurrently; reload and try again'; end if;
    return v_id;
  end if;

  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_ADMIN','TEACHER_ALLOCATED','teacher_allocation',v_id::text,
    jsonb_build_object('term_id',p_term_id,'offering_id',v_offering.id,
      'teacher_id',p_teacher_id,'allocation_role',p_allocation_role,'effective_from',p_effective_from,
      'replaced_teacher_id',v_previous_teacher_id,'reason',nullif(trim(p_reason),'')));
  return v_id;
end;
$$;

create or replace function public.end_teacher_allocation(
  p_allocation_id uuid,
  p_effective_to date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
  v_actor uuid;
  v_actor_name text;
begin
  if p_allocation_id is null or p_effective_to is null
    or nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'ALLOCATION_ID_END_DATE_AND_REASON_REQUIRED';
  end if;

  select * into v_allocation
  from public.teacher_allocations
  where id = p_allocation_id
  for update;
  if v_allocation.id is null then raise exception 'ALLOCATION_NOT_FOUND'; end if;
  if not public.is_school_admin_for(v_allocation.school_id) then
    raise exception 'SCHOOL_ADMIN_REQUIRED';
  end if;
  if v_allocation.status <> 'ACTIVE' then raise exception 'ALLOCATION_NOT_ACTIVE'; end if;
  if p_effective_to < v_allocation.effective_from then
    raise exception 'END_DATE_BEFORE_START_DATE';
  end if;
  if p_effective_to > current_date then
    raise exception 'END_DATE_CANNOT_BE_IN_THE_FUTURE';
  end if;

  v_actor := public.current_app_user_id();
  select full_name into v_actor_name from public.users where id = v_actor;
  update public.teacher_allocations
  set status = 'INACTIVE', effective_to = p_effective_to, updated_at = now()
  where id = v_allocation.id;

  insert into public.audit_logs(
    user_name, user_role, action, entity_type, entity_id, old_value, new_value
  ) values (
    v_actor_name, 'SCHOOL_ADMIN', 'TEACHER_ALLOCATION_ENDED',
    'teacher_allocation', v_allocation.id::text,
    jsonb_build_object('status', v_allocation.status, 'effective_to', v_allocation.effective_to),
    jsonb_build_object('status', 'INACTIVE', 'effective_to', p_effective_to,
      'reason', trim(p_reason), 'teacher_id', v_allocation.teacher_id,
      'offering_id', v_allocation.class_subject_offering_id)
  );
  return v_allocation.id;
end;
$$;

-- Suspend/reactivate this school's Teacher membership, not the global Auth
-- identity (which may legitimately belong to other schools).
create or replace function public.set_school_teacher_access(
  p_school_id uuid,
  p_teacher_id uuid,
  p_active boolean,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_membership public.school_memberships%rowtype;
  v_teacher public.users%rowtype;
  v_actor uuid;
  v_actor_name text;
  v_teacher_role_id uuid;
  v_ended_allocations jsonb := '[]'::jsonb;
begin
  if p_school_id is null or p_teacher_id is null or p_active is null
    or nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'SCHOOL_TEACHER_ACCESS_CHANGE_FIELDS_REQUIRED';
  end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select id into v_teacher_role_id from public.roles where code = 'TEACHER';
  select * into v_teacher from public.users where id = p_teacher_id for update;
  if v_teacher.id is null then raise exception 'TEACHER_NOT_FOUND'; end if;
  select * into v_membership from public.school_memberships
  where school_id = p_school_id and user_id = p_teacher_id and role_id = v_teacher_role_id
  for update;
  if v_membership.user_id is null then raise exception 'SCHOOL_TEACHER_MEMBERSHIP_NOT_FOUND'; end if;
  if p_active and (v_teacher.auth_user_id is null or not v_teacher.is_active or v_teacher.account_status <> 'ACTIVE') then
    raise exception 'TEACHER_AUTH_ACCOUNT_NOT_ELIGIBLE';
  end if;
  if (p_active and v_membership.status = 'ACTIVE')
    or (not p_active and v_membership.status = 'INACTIVE') then
    return p_teacher_id;
  end if;

  if not p_active then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ended_allocations
    from public.teacher_allocations
    where school_id = p_school_id and teacher_id = p_teacher_id and status = 'ACTIVE';
  end if;

  v_actor := public.current_app_user_id();
  select full_name into v_actor_name from public.users where id = v_actor;
  update public.school_memberships set status = case when p_active then 'ACTIVE' else 'INACTIVE' end,
    updated_at = now()
  where school_id = p_school_id and user_id = p_teacher_id and role_id = v_teacher_role_id;

  if not p_active then
    update public.teacher_allocations set status = 'INACTIVE',
      effective_to = greatest(effective_from, current_date), updated_at = now()
    where school_id = p_school_id and teacher_id = p_teacher_id and status = 'ACTIVE';
  end if;
  insert into public.audit_logs(
    user_name, user_role, action, entity_type, entity_id, old_value, new_value
  ) values (
    v_actor_name, 'SCHOOL_ADMIN',
    case when p_active then 'SCHOOL_TEACHER_REACTIVATED' else 'SCHOOL_TEACHER_DEACTIVATED' end,
    'school_membership', p_teacher_id::text,
    jsonb_build_object('membership_status', v_membership.status),
    jsonb_build_object('membership_status', case when p_active then 'ACTIVE' else 'INACTIVE' end,
      'school_id', p_school_id, 'reason', trim(p_reason),
      'ended_allocation_ids', v_ended_allocations)
  );
  return p_teacher_id;
end;
$$;

create or replace function public.edit_teacher_allocation_dates(
  p_allocation_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_allocation_role text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_allocation public.teacher_allocations%rowtype;
  v_actor uuid;
  v_actor_name text;
  v_next_status public.offering_status;
begin
  if p_allocation_id is null or p_effective_from is null
    or nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'ALLOCATION_DATE_EDIT_FIELDS_REQUIRED';
  end if;
  select * into v_allocation from public.teacher_allocations where id = p_allocation_id for update;
  if v_allocation.id is null then raise exception 'ALLOCATION_NOT_FOUND'; end if;
  if not public.is_school_admin_for(v_allocation.school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if v_allocation.status <> 'ACTIVE' then raise exception 'ONLY_ACTIVE_ALLOCATIONS_CAN_BE_EDITED'; end if;
  if p_allocation_role not in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER','SUBJECT_MODERATOR') then
    raise exception 'UNSUPPORTED_ALLOCATION_ROLE';
  end if;
  if p_effective_from > current_date then raise exception 'START_DATE_CANNOT_BE_IN_THE_FUTURE'; end if;
  if p_effective_to is not null and (p_effective_to < p_effective_from or p_effective_to > current_date) then
    raise exception 'END_DATE_MUST_BE_BETWEEN_START_DATE_AND_TODAY';
  end if;
  if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER' and exists (
    select 1 from public.teacher_allocations other_allocation
    where other_allocation.id <> v_allocation.id
      and other_allocation.school_id = v_allocation.school_id
      and other_allocation.term_id = v_allocation.term_id
      and other_allocation.class_subject_offering_id = v_allocation.class_subject_offering_id
      and other_allocation.stream_id is not distinct from v_allocation.stream_id
      and other_allocation.status = 'ACTIVE'
      and other_allocation.allocation_role = 'PRIMARY_SUBJECT_TEACHER'
  ) then raise exception 'A primary teacher is already assigned; use the replacement action with a reason'; end if;

  v_next_status := case when p_effective_to is null then 'ACTIVE'::public.offering_status else 'INACTIVE'::public.offering_status end;
  v_actor := public.current_app_user_id();
  select full_name into v_actor_name from public.users where id = v_actor;
  update public.teacher_allocations set effective_from = p_effective_from,
    allocation_role = p_allocation_role,
    effective_to = p_effective_to, status = v_next_status, updated_at = now()
  where id = v_allocation.id;
  insert into public.audit_logs(
    user_name, user_role, action, entity_type, entity_id, old_value, new_value
  ) values (
    v_actor_name, 'SCHOOL_ADMIN', 'TEACHER_ALLOCATION_DATES_EDITED',
    'teacher_allocation', v_allocation.id::text,
    jsonb_build_object('effective_from', v_allocation.effective_from, 'effective_to', v_allocation.effective_to, 'role', v_allocation.allocation_role),
    jsonb_build_object('effective_from', p_effective_from, 'effective_to', p_effective_to,
      'status', v_next_status, 'role', p_allocation_role, 'reason', trim(p_reason))
  );
  return v_allocation.id;
end;
$$;

revoke all on function public.get_teacher_allocation_setup(uuid) from public, anon;
grant execute on function public.get_teacher_allocation_setup(uuid) to authenticated;
revoke all on function public.assign_teacher_to_offering(uuid,uuid,uuid,text,text,date) from public, anon;
grant execute on function public.assign_teacher_to_offering(uuid,uuid,uuid,text,text,date) to authenticated;
revoke all on function public.end_teacher_allocation(uuid,date,text) from public, anon;
grant execute on function public.end_teacher_allocation(uuid,date,text) to authenticated;
revoke all on function public.set_school_teacher_access(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.set_school_teacher_access(uuid,uuid,boolean,text) to authenticated;
revoke all on function public.edit_teacher_allocation_dates(uuid,date,date,text,text) from public, anon;
grant execute on function public.edit_teacher_allocation_dates(uuid,date,date,text,text) to authenticated;
notify pgrst, 'reload schema';
