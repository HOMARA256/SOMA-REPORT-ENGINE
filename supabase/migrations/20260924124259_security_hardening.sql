-- OURSCHOOL security hardening before external review.
-- Browser clients receive no anonymous table access. Authenticated access remains
-- subject to table privileges and row-level policies.

create or replace function public.is_platform_administrator()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.platform_admins administrator
    where administrator.auth_user_id = auth.uid()
      and administrator.is_active
  );
$$;

create or replace function public.has_active_school_membership()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select exists (
    select 1
    from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where app_user.auth_user_id = auth.uid()
      and app_user.is_active
      and membership.status = 'ACTIVE'
  );
$$;

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.subject_catalogue_audit_findings enable row level security;

drop policy if exists "authorized users can view roles" on public.roles;
create policy "authorized users can view roles"
on public.roles for select to authenticated
using (public.is_platform_administrator() or public.has_active_school_membership());

drop policy if exists "authorized users can view permissions" on public.permissions;
create policy "authorized users can view permissions"
on public.permissions for select to authenticated
using (public.is_platform_administrator() or public.has_active_school_membership());

drop policy if exists "authorized users can view role permissions" on public.role_permissions;
create policy "authorized users can view role permissions"
on public.role_permissions for select to authenticated
using (public.is_platform_administrator() or public.has_active_school_membership());

drop policy if exists "platform administrators can view catalogue findings" on public.subject_catalogue_audit_findings;
create policy "platform administrators can view catalogue findings"
on public.subject_catalogue_audit_findings for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "platform administrators can view subscription plans" on public.subscription_plans;
create policy "platform administrators can view subscription plans"
on public.subscription_plans for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "platform administrators can view subscriptions" on public.school_subscriptions;
create policy "platform administrators can view subscriptions"
on public.school_subscriptions for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "school members can view their subscription" on public.school_subscriptions;
create policy "school members can view their subscription"
on public.school_subscriptions for select to authenticated
using (public.is_active_school_member(school_id));

drop policy if exists "platform administrators can view payments" on public.subscription_payments;
create policy "platform administrators can view payments"
on public.subscription_payments for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "platform administrators can view audit logs" on public.platform_audit_logs;
create policy "platform administrators can view audit logs"
on public.platform_audit_logs for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "platform administrators can view security events" on public.security_events;
create policy "platform administrators can view security events"
on public.security_events for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "platform administrators can view system jobs" on public.system_jobs;
create policy "platform administrators can view system jobs"
on public.system_jobs for select to authenticated
using (public.is_platform_administrator());

drop policy if exists "school members can view a level combinations" on public.a_level_combinations;
create policy "school members can view a level combinations"
on public.a_level_combinations for select to authenticated
using (public.is_active_school_member(school_id) or public.is_platform_administrator());

drop policy if exists "school members can view a level combination subjects" on public.a_level_combination_subjects;
create policy "school members can view a level combination subjects"
on public.a_level_combination_subjects for select to authenticated
using (
  exists (
    select 1 from public.a_level_combinations combination
    where combination.id = a_level_combination_subjects.combination_id
      and (public.is_active_school_member(combination.school_id) or public.is_platform_administrator())
  )
);

drop policy if exists "school members can view a level assignments" on public.a_level_learner_assignments;
create policy "school members can view a level assignments"
on public.a_level_learner_assignments for select to authenticated
using (public.is_active_school_member(school_id) or public.is_platform_administrator());

drop policy if exists "school members can view a level marks" on public.a_level_paper_marks;
create policy "school members can view a level marks"
on public.a_level_paper_marks for select to authenticated
using (public.is_active_school_member(school_id) or public.is_platform_administrator());

do $$
declare item record;
begin
  for item in select schemaname, tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke all privileges on table %I.%I from anon', item.schemaname, item.tablename);
  end loop;
end;
$$;

alter function public.handle_new_user() set search_path = pg_catalog, public, auth;
alter function public.is_admin() set search_path = pg_catalog, public, auth;
alter function public.is_admin_from_auth() set search_path = pg_catalog, public, auth;
alter function public.is_admin_or_bursar() set search_path = pg_catalog, public, auth;
alter function public.log_audit_event(uuid, text, text, text, text, text, jsonb, jsonb) set search_path = pg_catalog, public, auth;
alter function public.validate_active_a_level_combination() set search_path = pg_catalog, public;
alter function public.normalized_subject_name(text) set search_path = pg_catalog;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.log_audit_event(uuid, text, text, text, text, text, jsonb, jsonb) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;

grant execute on function public.is_active_school_member(uuid) to authenticated;
grant execute on function public.is_platform_administrator() to authenticated;
grant execute on function public.has_active_school_membership() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin_from_auth() to authenticated;
grant execute on function public.is_admin_or_bursar() to authenticated;
grant execute on all functions in schema public to service_role;


;
