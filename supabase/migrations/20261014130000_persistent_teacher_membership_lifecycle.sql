-- Teacher membership is school-scoped and independent of the term/year-scoped
-- allocation records. SUSPENDED means temporary access stop; INACTIVE means
-- removed from this school. Both preserve the membership row and its history.

create or replace function public.manage_school_teacher_membership(
  p_school_id uuid,
  p_teacher_id uuid,
  p_action text,
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
  v_next_status public.membership_status;
  v_ended_allocations jsonb := '[]'::jsonb;
  v_previous_action text := current_setting('app.teacher_membership_action', true);
begin
  p_action := upper(trim(coalesce(p_action, '')));
  if p_school_id is null or p_teacher_id is null
    or p_action not in ('SUSPEND','REACTIVATE','REMOVE','RESTORE')
    or length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'SCHOOL_TEACHER_MEMBERSHIP_CHANGE_FIELDS_REQUIRED';
  end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;

  select id into v_teacher_role_id from public.roles where code = 'TEACHER';
  select * into v_teacher from public.users where id = p_teacher_id for update;
  if v_teacher.id is null then raise exception 'TEACHER_NOT_FOUND'; end if;
  select * into v_membership from public.school_memberships
    where school_id = p_school_id and user_id = p_teacher_id and role_id = v_teacher_role_id for update;
  if v_membership.id is null then raise exception 'SCHOOL_TEACHER_MEMBERSHIP_NOT_FOUND'; end if;

  if p_action in ('REACTIVATE','RESTORE')
    and (v_teacher.auth_user_id is null or not v_teacher.is_active or v_teacher.account_status <> 'ACTIVE') then
    raise exception 'TEACHER_AUTH_ACCOUNT_NOT_ELIGIBLE';
  end if;

  if p_action = 'SUSPEND' then
    if v_membership.status = 'INACTIVE' then raise exception 'SCHOOL_TEACHER_MEMBERSHIP_REMOVED'; end if;
    if v_membership.status = 'SUSPENDED' then return p_teacher_id; end if;
    v_next_status := 'SUSPENDED';
  elsif p_action = 'REACTIVATE' then
    if v_membership.status = 'INACTIVE' then raise exception 'SCHOOL_TEACHER_MEMBERSHIP_REMOVED_USE_RESTORE'; end if;
    if v_membership.status = 'ACTIVE' then return p_teacher_id; end if;
    v_next_status := 'ACTIVE';
  elsif p_action = 'REMOVE' then
    if v_membership.status = 'INACTIVE' then return p_teacher_id; end if;
    v_next_status := 'INACTIVE';
  else
    if v_membership.status = 'SUSPENDED' then raise exception 'SCHOOL_TEACHER_MEMBERSHIP_SUSPENDED_USE_REACTIVATE'; end if;
    if v_membership.status = 'ACTIVE' then return p_teacher_id; end if;
    v_next_status := 'ACTIVE';
  end if;

  if v_next_status <> 'ACTIVE' then
    select coalesce(jsonb_agg(id), '[]'::jsonb) into v_ended_allocations
    from public.teacher_allocations
    where school_id = p_school_id and teacher_id = p_teacher_id and status = 'ACTIVE';
  end if;

  v_actor := public.current_app_user_id();
  select full_name into v_actor_name from public.users where id = v_actor;
  perform set_config('app.teacher_membership_action', p_action, true);
  update public.school_memberships set status = v_next_status, updated_at = now()
    where id = v_membership.id;
  if v_next_status <> 'ACTIVE' then
    update public.teacher_allocations set status = 'INACTIVE',
      effective_to = greatest(effective_from, current_date), updated_at = now()
    where school_id = p_school_id and teacher_id = p_teacher_id and status = 'ACTIVE';
  end if;
  perform set_config('app.teacher_membership_action', coalesce(v_previous_action, ''), true);

  insert into public.audit_logs(user_name, user_role, action, entity_type, entity_id, old_value, new_value)
  values (v_actor_name, 'SCHOOL_ADMIN',
    case p_action
      when 'SUSPEND' then 'SCHOOL_TEACHER_MEMBERSHIP_SUSPENDED'
      when 'REACTIVATE' then 'SCHOOL_TEACHER_MEMBERSHIP_REACTIVATED'
      when 'REMOVE' then 'SCHOOL_TEACHER_MEMBERSHIP_REMOVED'
      else 'SCHOOL_TEACHER_MEMBERSHIP_RESTORED'
    end,
    'school_membership', v_membership.id::text,
    jsonb_build_object('membership_status', v_membership.status),
    jsonb_build_object('membership_status', v_next_status, 'school_id', p_school_id,
      'teacher_user_id', p_teacher_id, 'reason', trim(p_reason),
      'ended_allocation_ids', v_ended_allocations));
  return p_teacher_id;
end;
$$;

-- Preserve the existing RPC contract for older clients, while routing it
-- through the explicit school-scoped lifecycle and distinguishing removal.
create or replace function public.set_school_teacher_access(
  p_school_id uuid, p_teacher_id uuid, p_active boolean, p_reason text
)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_active is null then raise exception 'SCHOOL_TEACHER_ACCESS_CHANGE_FIELDS_REQUIRED'; end if;
  return public.manage_school_teacher_membership(p_school_id, p_teacher_id,
    case when p_active then 'REACTIVATE' else 'SUSPEND' end, p_reason);
end;
$$;

-- Do not allow an accepted/re-sent invitation to silently reactivate a
-- suspended or removed membership. Only the explicit admin controls above may.
create or replace function public.guard_teacher_membership_reactivation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_teacher_role_id uuid;
begin
  if old.status in ('SUSPENDED','INACTIVE') and new.status = 'ACTIVE' then
    select id into v_teacher_role_id from public.roles where code = 'TEACHER';
    if old.role_id = v_teacher_role_id
      and coalesce(current_setting('app.teacher_membership_action', true), '') not in ('REACTIVATE','RESTORE') then
      raise exception 'SCHOOL_TEACHER_MEMBERSHIP_ADMIN_ACTION_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_teacher_membership_reactivation on public.school_memberships;
create trigger guard_teacher_membership_reactivation
before update of status on public.school_memberships
for each row execute function public.guard_teacher_membership_reactivation();

-- A returning teacher with a school membership is restored through that row,
-- never invited into a duplicate membership or duplicate Auth identity.
create or replace function public.guard_invitation_existing_teacher_membership()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_membership_status public.membership_status;
begin
  select membership.status into v_membership_status
  from public.users app_user
  join public.school_memberships membership on membership.user_id = app_user.id
  join public.roles role_record on role_record.id = membership.role_id and role_record.code = 'TEACHER'
  where membership.school_id = new.school_id
    and (app_user.normalized_email = lower(trim(new.invited_email))
      or lower(trim(app_user.email)) = lower(trim(new.invited_email)))
  limit 1;
  if v_membership_status = 'ACTIVE' then raise exception 'TEACHER_ALREADY_MEMBER'; end if;
  if v_membership_status = 'SUSPENDED' then raise exception 'SCHOOL_MEMBERSHIP_SUSPENDED_USE_REACTIVATE'; end if;
  if v_membership_status = 'INACTIVE' then raise exception 'SCHOOL_MEMBERSHIP_REMOVED_USE_RESTORE'; end if;
  return new;
end;
$$;
drop trigger if exists guard_invitation_existing_teacher_membership on public.school_teacher_invitations;
create trigger guard_invitation_existing_teacher_membership
before insert on public.school_teacher_invitations
for each row execute function public.guard_invitation_existing_teacher_membership();

revoke all on function public.manage_school_teacher_membership(uuid,uuid,text,text) from public, anon;
revoke all on function public.set_school_teacher_access(uuid,uuid,boolean,text) from public, anon;
revoke all on function public.guard_teacher_membership_reactivation() from public, anon, authenticated;
revoke all on function public.guard_invitation_existing_teacher_membership() from public, anon, authenticated;
grant execute on function public.manage_school_teacher_membership(uuid,uuid,text,text) to authenticated;
grant execute on function public.set_school_teacher_access(uuid,uuid,boolean,text) to authenticated;
notify pgrst, 'reload schema';
