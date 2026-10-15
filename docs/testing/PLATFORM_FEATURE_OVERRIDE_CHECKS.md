# Platform feature override deployment checks

The migration changes stored platform feature configuration, not school-page authorization. Do not treat a green badge as proof that a school route is enforcing the entitlement.

After `20261006100000_persistent_platform_feature_overrides.sql` is applied, run this read-only query in the linked Supabase SQL Editor:

```sql
select
  to_regprocedure('public.get_platform_feature_directory()') is not null as read_rpc,
  to_regprocedure('public.set_platform_school_feature_override(uuid,text,text,text)') is not null as write_rpc,
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'school_feature_overrides'
      and policyname = 'school_overrides_member_read'
  ) as member_read_policy,
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'school_feature_overrides'
      and policyname = 'school_overrides_admin_manage'
  ) as direct_manage_policy_removed;
```

Then use a consenting test school, not a production subscription: sign in as Platform Administrator, change one override with a reason, refresh the page, and verify the same value remains. Check that one matching row exists in `school_feature_overrides` and one new `FEATURE_OVERRIDE_CHANGED` row exists in `platform_audit_logs`. Click the same state again and verify no new audit row. Sign in as that school's School Administrator and attempt the write RPC: it must fail with `PLATFORM_ADMIN_REQUIRED`. Repeat from a different school session to confirm cross-tenant denial. Restore the test school's original override through the same audited UI; do not delete its history.

If either RPC is absent or the refreshed value does not match, stop the rollout. Do not run a payment confirmation from the Platform Control Centre; that action remains deliberately unavailable until the verified billing path is connected.
