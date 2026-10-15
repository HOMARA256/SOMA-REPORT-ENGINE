-- Production security hardening: remove anonymous privileged execution and
-- add explicit least-privilege policies to previously policyless RLS tables.

do $$ declare r record;
begin
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  loop
    execute format('alter function %s set search_path = public, pg_temp',r.signature);
    execute format('revoke all on function %s from public, anon',r.signature);
  end loop;
end $$;

-- Provider callbacks and rate-limit state are server-only.
revoke all on function public.process_sandbox_mtn_callback(text,text,text,boolean) from authenticated;
grant execute on function public.process_sandbox_mtn_callback(text,text,text,boolean) to service_role;

drop policy if exists notifications_recipient_read on public.system_notifications;
create policy notifications_recipient_read on public.system_notifications for select to authenticated
using(recipient_user_id=auth.uid() or (school_id is not null and public.is_school_admin_for(school_id)) or public.is_active_platform_admin());
drop policy if exists notifications_recipient_update on public.system_notifications;
create policy notifications_recipient_update on public.system_notifications for update to authenticated
using(recipient_user_id=auth.uid()) with check(recipient_user_id=auth.uid());

drop policy if exists feature_flags_authenticated_read on public.feature_flags;
create policy feature_flags_authenticated_read on public.feature_flags for select to authenticated using(true);
drop policy if exists feature_flags_platform_manage on public.feature_flags;
create policy feature_flags_platform_manage on public.feature_flags for all to authenticated
using(public.is_active_platform_admin()) with check(public.is_active_platform_admin());

drop policy if exists school_overrides_member_read on public.school_feature_overrides;
create policy school_overrides_member_read on public.school_feature_overrides for select to authenticated using(public.is_active_school_member(school_id));
drop policy if exists school_overrides_admin_manage on public.school_feature_overrides;
create policy school_overrides_admin_manage on public.school_feature_overrides for all to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin()) with check(public.is_school_admin_for(school_id) or public.is_active_platform_admin());

drop policy if exists onboarding_member_read on public.school_onboarding_states;
create policy onboarding_member_read on public.school_onboarding_states for select to authenticated using(public.is_active_school_member(school_id) or public.is_active_platform_admin());
drop policy if exists onboarding_admin_manage on public.school_onboarding_states;
create policy onboarding_admin_manage on public.school_onboarding_states for all to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin()) with check(public.is_school_admin_for(school_id) or public.is_active_platform_admin());

drop policy if exists invitations_admin_read on public.school_admin_invitations;
create policy invitations_admin_read on public.school_admin_invitations for select to authenticated using(public.is_school_admin_for(school_id) or public.is_active_platform_admin() or invited_user_id=public.current_app_user_id());

do $$ declare t text;
begin
  foreach t in array array['digital_receipts','merchant_payment_claims','notification_deliveries','receipt_email_deliveries','subscription_invoices','subscription_periods','verified_payment_transactions']
  loop
    execute format('drop policy if exists %I on public.%I','tenant_read_'||t,t);
    execute format('create policy %I on public.%I for select to authenticated using(public.is_active_school_member(school_id) or public.is_active_platform_admin())','tenant_read_'||t,t);
  end loop;
end $$;

drop policy if exists provider_config_platform_read on public.platform_payment_provider_configs;
create policy provider_config_platform_read on public.platform_payment_provider_configs for select to authenticated using(public.is_active_platform_admin());
drop policy if exists rate_limits_platform_read on public.platform_action_rate_limits;
create policy rate_limits_platform_read on public.platform_action_rate_limits for select to authenticated using(public.is_active_platform_admin());
drop policy if exists location_imports_platform_read on public.uganda_location_imports;
create policy location_imports_platform_read on public.uganda_location_imports for select to authenticated using(public.is_active_platform_admin());

-- Delivery, payment verification, provider configuration, invitation mutation,
-- rate limiting and imports remain service-role-only writes through server APIs.
revoke insert,update,delete on public.notification_deliveries,public.receipt_email_deliveries,
 public.verified_payment_transactions,public.platform_payment_provider_configs,
 public.platform_action_rate_limits,public.uganda_location_imports from authenticated;

;
