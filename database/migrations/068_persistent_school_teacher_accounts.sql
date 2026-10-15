-- A staff review profile is not an authenticated school member. Register the
-- invited Auth identity and its Teacher membership in one database transaction.
create or replace function public.register_school_teacher_account(
  p_school_id uuid,
  p_actor_auth_user_id uuid,
  p_teacher_auth_user_id uuid,
  p_full_name text,
  p_email text,
  p_department text default null
) returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid;
  v_actor_name text;
  v_auth_email text;
  v_role_id uuid;
  v_teacher_id uuid;
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := trim(coalesce(p_full_name, ''));
begin
  if p_school_id is null or p_actor_auth_user_id is null or p_teacher_auth_user_id is null
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(v_name) < 2 then
    raise exception 'VALID_TEACHER_IDENTITY_REQUIRED';
  end if;

  select actor.id, actor.full_name into v_actor_id, v_actor_name
  from public.users actor
  join public.school_memberships membership on membership.user_id = actor.id
  join public.roles role_record on role_record.id = membership.role_id
  join public.schools school_record on school_record.id = membership.school_id
  where actor.auth_user_id = p_actor_auth_user_id
    and actor.is_active and actor.account_status = 'ACTIVE'
    and membership.school_id = p_school_id and membership.status = 'ACTIVE'
    and role_record.code = 'SCHOOL_ADMIN' and school_record.is_active
  for update of actor;
  if v_actor_id is null then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;

  select lower(email) into v_auth_email from auth.users where id = p_teacher_auth_user_id;
  if v_auth_email is distinct from v_email then raise exception 'AUTH_EMAIL_MISMATCH'; end if;
  if exists (
    select 1 from public.users
    where normalized_email = v_email or auth_user_id = p_teacher_auth_user_id
  ) then raise exception 'TEACHER_ACCOUNT_ALREADY_REGISTERED'; end if;

  select id into v_role_id from public.roles where code = 'TEACHER';
  if v_role_id is null then raise exception 'TEACHER_ROLE_NOT_CONFIGURED'; end if;

  insert into public.users (
    email, full_name, first_name, last_name, department, auth_user_id,
    username, normalized_email, normalized_username,
    is_active, account_status, must_change_password
  ) values (
    v_email, v_name, left(split_part(v_name, ' ', 1), 100),
    left(substring(v_name from '[^ ]+$'), 100), left(nullif(trim(coalesce(p_department, '')), ''), 140),
    p_teacher_auth_user_id, v_email, v_email, v_email,
    true, 'ACTIVE', false
  ) returning id into v_teacher_id;

  insert into public.school_memberships (school_id, user_id, role_id, status)
  values (p_school_id, v_teacher_id, v_role_id, 'ACTIVE');

  insert into public.audit_logs (
    user_id, user_name, user_role, action, entity_type, entity_id, new_value
  ) values (
    p_actor_auth_user_id, v_actor_name, 'SCHOOL_ADMIN', 'TEACHER_ACCOUNT_INVITED',
    'user', v_teacher_id::text,
    jsonb_build_object('school_id', p_school_id, 'role', 'TEACHER')
  );
  return v_teacher_id;
end;
$$;

revoke all on function public.register_school_teacher_account(uuid,uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.register_school_teacher_account(uuid,uuid,uuid,text,text,text)
  to service_role;

create or replace function public.get_school_teacher_directory(p_school_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_school_id is null or not (
    public.is_school_admin_for(p_school_id) or public.is_active_platform_admin()
  ) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', app_user.id,
      'name', app_user.full_name,
      'email', app_user.email,
      'department', app_user.department,
      'accountStatus', app_user.account_status,
      'membershipStatus', membership.status,
      'authLinked', app_user.auth_user_id is not null,
      'eligible', membership.status = 'ACTIVE' and app_user.is_active
        and app_user.account_status = 'ACTIVE' and app_user.auth_user_id is not null,
      'allocationCount', (
        select count(*) from public.teacher_allocations allocation
        where allocation.school_id = p_school_id and allocation.teacher_id = app_user.id
          and allocation.status = 'ACTIVE'
      )
    ) order by app_user.full_name)
    from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    join public.roles role_record on role_record.id = membership.role_id
    where membership.school_id = p_school_id and role_record.code = 'TEACHER'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_school_teacher_directory(uuid) from public, anon;
grant execute on function public.get_school_teacher_directory(uuid) to authenticated;

-- Keep the selector aligned with the same persisted account prerequisites.
create or replace function public.get_teacher_allocation_setup(p_school_id uuid)
returns jsonb
language plpgsql stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_school_id is null or not (
    public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
  ) then raise exception 'ACTIVE_SCHOOL_MEMBERSHIP_REQUIRED'; end if;

  return jsonb_build_object(
    'terms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', term_record.id, 'academicYearId', term_record.academic_year_id,
        'name', term_record.name, 'status', term_record.lifecycle_status
      ) order by term_record.starts_on desc)
      from public.terms term_record where term_record.school_id = p_school_id
    ), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', app_user.id, 'name', app_user.full_name, 'email', app_user.email
      ) order by app_user.full_name)
      from public.school_memberships membership
      join public.users app_user on app_user.id = membership.user_id
      join public.roles role_record on role_record.id = membership.role_id
      where membership.school_id = p_school_id and membership.status = 'ACTIVE'
        and app_user.is_active and app_user.account_status = 'ACTIVE'
        and app_user.auth_user_id is not null and role_record.code = 'TEACHER'
    ), '[]'::jsonb),
    'offerings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', class_offering.id, 'academicYearId', class_offering.academic_year_id,
        'classId', class_record.id, 'className', class_record.class_name,
        'streamId', class_offering.stream_id, 'streamName', stream_record.stream_name,
        'subjectCode', coalesce(school_offering.school_subject_code, system_subject.subject_code),
        'subjectName', coalesce(school_offering.display_name_override, system_subject.subject_name),
        'status', class_offering.status
      ) order by class_record.level, class_record.class_name, system_subject.subject_name)
      from public.class_subject_offerings class_offering
      join public.academic_classes class_record on class_record.id = class_offering.class_id
      left join public.class_streams stream_record on stream_record.id = class_offering.stream_id
      join public.school_subject_offerings school_offering on school_offering.id = class_offering.school_subject_offering_id
      left join public.system_subjects system_subject on system_subject.id = school_offering.system_subject_id
      where class_offering.school_id = p_school_id and class_offering.status = 'ACTIVE'
        and school_offering.status = 'ACTIVE'
    ), '[]'::jsonb),
    'allocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', allocation.id, 'termId', allocation.term_id,
        'offeringId', allocation.class_subject_offering_id,
        'teacherId', allocation.teacher_id, 'teacherName', app_user.full_name,
        'role', allocation.allocation_role, 'status', allocation.status,
        'effectiveFrom', allocation.effective_from, 'effectiveTo', allocation.effective_to
      ) order by allocation.created_at desc)
      from public.teacher_allocations allocation
      join public.users app_user on app_user.id = allocation.teacher_id
      where allocation.school_id = p_school_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_teacher_allocation_setup(uuid) from public, anon;
grant execute on function public.get_teacher_allocation_setup(uuid) to authenticated;
notify pgrst, 'reload schema';
