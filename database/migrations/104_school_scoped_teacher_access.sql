-- Teacher access is granted by each school's membership. Legacy DISABLED
-- profile flags do not block Teacher memberships; explicit LOCKED/SUSPENDED
-- account states remain global security restrictions.

create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path = public, auth, pg_temp as $$
  select app_user.id
  from public.users app_user
  where app_user.auth_user_id = auth.uid()
    and (
      (app_user.is_active and app_user.account_status = 'ACTIVE')
      or (app_user.account_status = 'DISABLED' and exists (
        select 1 from public.school_memberships membership
        join public.roles role_record on role_record.id = membership.role_id and role_record.code = 'TEACHER'
        where membership.user_id = app_user.id and membership.status = 'ACTIVE'
      ))
    )
  limit 1
$$;
revoke all on function public.current_app_user_id() from public, anon;
grant execute on function public.current_app_user_id() to authenticated;

create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp as $$
  select exists (
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    join public.roles role_record on role_record.id = membership.role_id
    where membership.school_id = target_school_id
      and membership.status = 'ACTIVE'
      and app_user.auth_user_id = auth.uid()
      and (
        (app_user.is_active and app_user.account_status = 'ACTIVE')
        or (app_user.account_status = 'DISABLED' and role_record.code = 'TEACHER')
      )
  )
$$;
revoke all on function public.is_active_school_member(uuid) from public, anon;
grant execute on function public.is_active_school_member(uuid) to authenticated;

do $migration$
declare
  v_function regprocedure;
  v_definition text;
  v_repaired text;
  v_restricted_condition text := 'v_teacher.account_status in (''LOCKED'',''SUSPENDED'') or (v_teacher.account_status <> ''DISABLED'' and (not v_teacher.is_active or v_teacher.account_status <> ''ACTIVE''))';
begin
  -- Invitation visibility, teacher consent, School Admin activation, and the
  -- membership lifecycle all permit a legacy DISABLED profile without changing
  -- its global flag. Explicit LOCKED/SUSPENDED profiles stay blocked.
  v_function := 'public.get_my_school_teacher_invitation(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'not v_user.is_active or v_user.account_status<>''ACTIVE''',
    'v_user.account_status in (''LOCKED'',''SUSPENDED'') or (v_user.account_status <> ''DISABLED'' and (not v_user.is_active or v_user.account_status <> ''ACTIVE''))');
  v_repaired := replace(v_repaired,
    '''accountActive'',coalesce(v_user.is_active,not v_collision),',
    '''accountActive'',coalesce(v_user.is_active,not v_collision),''globalSecurityRestricted'',v_collision or coalesce(v_user.account_status in (''LOCKED'',''SUSPENDED'') or (not v_user.is_active and v_user.account_status <> ''DISABLED''),false),');
  if v_repaired = v_definition and v_definition not like '%v_user.account_status in (''LOCKED'',''SUSPENDED'')%' then
    raise exception 'Could not safely update teacher invitation account-state rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  v_function := 'public.accept_school_teacher_invitation(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'not v_user.is_active or v_user.account_status<>''ACTIVE''',
    'v_user.account_status in (''LOCKED'',''SUSPENDED'') or (v_user.account_status <> ''DISABLED'' and (not v_user.is_active or v_user.account_status <> ''ACTIVE''))');
  if v_repaired = v_definition and v_definition not like '%v_user.account_status in (''LOCKED'',''SUSPENDED'')%' then
    raise exception 'Could not safely update teacher invitation acceptance rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  v_function := 'public.activate_school_teacher_invitation(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'not v_teacher.is_active or v_teacher.account_status<>''ACTIVE''', v_restricted_condition);
  v_repaired := replace(v_repaired,
    'not v_teacher.is_active or v_teacher.account_status <> ''ACTIVE''', v_restricted_condition);
  if v_repaired = v_definition and v_definition not like '%v_teacher.account_status in (''LOCKED'',''SUSPENDED'')%' then
    raise exception 'Could not safely update teacher invitation activation rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  v_function := 'public.manage_school_teacher_membership(uuid,uuid,text,text)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'not v_teacher.is_active or v_teacher.account_status <> ''ACTIVE''', v_restricted_condition);
  if v_repaired = v_definition and v_definition not like '%v_teacher.account_status in (''LOCKED'',''SUSPENDED'')%' then
    raise exception 'Could not safely update teacher membership lifecycle rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  v_function := 'public.list_school_teacher_invitations(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    '''accountStatus'',u.account_status,''accountActive'',u.is_active,',
    '''accountStatus'',u.account_status,''accountActive'',((u.is_active and u.account_status=''ACTIVE'') or u.account_status=''DISABLED''),''globalSecurityRestricted'',coalesce(u.account_status in (''LOCKED'',''SUSPENDED'') or (not u.is_active and u.account_status <> ''DISABLED''),false),');
  if v_repaired = v_definition and v_definition not like '%globalSecurityRestricted%' then
    raise exception 'Could not safely add school-scoped account eligibility to invitation status';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  -- School context selection is tenant scoped for DISABLED legacy Teachers.
  v_function := 'public.set_my_school_context(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'auth_user_id=auth.uid() and is_active and account_status=''ACTIVE''',
    'auth_user_id=auth.uid() and (is_active and account_status=''ACTIVE'' or account_status=''DISABLED'')');
  v_repaired := replace(v_repaired,
    'where m.user_id=v_user_id and m.school_id=p_school_id and m.status=''ACTIVE'' and s.is_active',
    'where m.user_id=v_user_id and m.school_id=p_school_id and m.status=''ACTIVE'' and (exists(select 1 from public.users context_user where context_user.id=m.user_id and context_user.account_status=''ACTIVE'') or exists(select 1 from public.roles r where r.id=m.role_id and r.code=''TEACHER'')) and s.is_active');
  if v_repaired = v_definition and v_definition not like '%account_status=''DISABLED''%' then
    raise exception 'Could not safely update school context selection rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  v_function := 'public.get_my_school_context_preference()'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'u.is_active and u.account_status=''ACTIVE''',
    '(u.is_active and u.account_status=''ACTIVE'' or u.account_status=''DISABLED'')');
  v_repaired := replace(v_repaired,
    'm.status=''ACTIVE''',
    'm.status=''ACTIVE'' and (u.account_status=''ACTIVE'' or (u.account_status=''DISABLED'' and exists(select 1 from public.roles teacher_role where teacher_role.id=m.role_id and teacher_role.code=''TEACHER'')))');
  if v_repaired = v_definition and v_definition not like '%u.account_status=''DISABLED''%' then
    raise exception 'Could not safely update saved school context rules';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  -- Keep disabled legacy teachers visible and eligible only through an active
  -- Teacher membership in the school whose admin is viewing the directory.
  v_function := 'public.get_school_teacher_directory(uuid)'::regprocedure;
  v_definition := pg_get_functiondef(v_function);
  v_repaired := replace(v_definition,
    'app_user.is_active and app_user.account_status = ''ACTIVE''',
    '((app_user.is_active and app_user.account_status = ''ACTIVE'') or app_user.account_status = ''DISABLED'')');
  if v_repaired = v_definition and v_definition not like '%app_user.account_status = ''DISABLED''%' then
    raise exception 'Could not safely update school teacher directory eligibility';
  end if;
  if v_repaired <> v_definition then execute v_repaired; end if;

  -- Allocation options and assignment validation use the same membership rule.
  foreach v_function in array array[
    'public.get_teacher_allocation_setup(uuid)'::regprocedure,
    'public.assign_teacher_to_offering(uuid,uuid,uuid,text,text,date)'::regprocedure
  ] loop
    v_definition := pg_get_functiondef(v_function);
    v_repaired := replace(v_definition,
      'u.is_active and u.account_status = ''ACTIVE''',
      '(u.is_active and u.account_status = ''ACTIVE'' or u.account_status = ''DISABLED'')');
    if v_repaired = v_definition and v_definition not like '%u.account_status = ''DISABLED''%' then
      raise exception 'Could not safely update Teacher allocation rules in %', v_function;
    end if;
    if v_repaired <> v_definition then execute v_repaired; end if;
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
