begin;

create or replace function public.set_school_identity_card_staff_number(
  p_school_id uuid,
  p_staff_id uuid,
  p_staff_number text
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_staff_number text := nullif(btrim(p_staff_number), '');
  v_staff_name text;
begin
  if not public.is_school_admin_for(p_school_id) then
    raise exception 'SCHOOL_ADMIN_REQUIRED';
  end if;
  if v_staff_number is null or length(v_staff_number) > 80
    or v_staff_number ~ '[[:cntrl:]]' then
    raise exception 'STAFF_NUMBER_INVALID';
  end if;
  if not exists (
    select 1 from public.users staff
    join public.school_memberships membership on membership.user_id = staff.id
    join public.roles role on role.id = membership.role_id
    where staff.id = p_staff_id and staff.is_active
      and staff.account_status = 'ACTIVE'
      and membership.school_id = p_school_id and membership.status = 'ACTIVE'
      and role.code not in ('LEARNER', 'PARENT_GUARDIAN', 'PLATFORM_ADMIN')
  ) then
    raise exception 'STAFF_MEMBER_NOT_AVAILABLE';
  end if;
  if exists (
    select 1 from public.users other
    join public.school_memberships membership on membership.user_id = other.id
    where membership.school_id = p_school_id and membership.status = 'ACTIVE'
      and other.id <> p_staff_id
      and lower(btrim(other.staff_number)) = lower(v_staff_number)
  ) then
    raise exception 'STAFF_NUMBER_NOT_UNIQUE_IN_SCHOOL';
  end if;

  update public.users staff set staff_number = v_staff_number, updated_at = now()
  where staff.id = p_staff_id
  returning staff.full_name into v_staff_name;

  insert into public.audit_logs(user_id, user_name, user_role, action, entity_type, entity_id, new_value)
  select profile.id, actor.full_name, role.code, 'STAFF_ID_NUMBER_UPDATED', 'staff_profile',
    p_staff_id::text, jsonb_build_object('school_id', p_school_id, 'staff_number', v_staff_number)
  from public.user_profiles profile
  join public.users actor on actor.auth_user_id = profile.id
  join public.school_memberships membership on membership.user_id = actor.id
  join public.roles role on role.id = membership.role_id
  where profile.id = auth.uid() and membership.school_id = p_school_id
    and membership.status = 'ACTIVE' limit 1;

  return v_staff_number;
end;
$$;

revoke all on function public.set_school_identity_card_staff_number(uuid,uuid,text) from public, anon;
grant execute on function public.set_school_identity_card_staff_number(uuid,uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
