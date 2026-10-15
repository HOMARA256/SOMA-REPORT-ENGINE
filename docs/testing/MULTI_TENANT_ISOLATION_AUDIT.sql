-- Read-only schema audit for tenant isolation. Run in the Supabase SQL Editor.
-- It reports every public table with a direct school_id and its RLS policies.
-- Tables with indirect tenant ownership (for example rows linked through a
-- parent id) need a separate review of their parent-table policy.

with tenant_tables as (
  select
    n.nspname as schema_name,
    c.relname as table_name,
    c.relrowsecurity as rls_enabled,
    c.relforcerowsecurity as force_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'school_id'
    and not a.attisdropped
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
), policy_summary as (
  select
    p.schemaname as schema_name,
    p.tablename as table_name,
    count(*) as policy_count,
    string_agg(
      format('%s [%s] USING (%s) WITH CHECK (%s)',
        p.policyname,
        p.cmd,
        coalesce(p.qual, '—'),
        coalesce(p.with_check, '—')),
      E'\n' order by p.policyname
    ) as policy_definitions
  from pg_policies p
  where p.schemaname = 'public'
  group by p.schemaname, p.tablename
)
select
  t.table_name,
  t.rls_enabled,
  t.force_rls,
  coalesce(p.policy_count, 0) as policy_count,
  case
    when not t.rls_enabled then 'REVIEW: RLS DISABLED'
    when coalesce(p.policy_count, 0) = 0 then 'REVIEW: NO POLICIES'
    else 'REVIEW POLICY SCOPE'
  end as audit_result,
  p.policy_definitions
from tenant_tables t
left join policy_summary p using (schema_name, table_name)
order by
  case when not t.rls_enabled or coalesce(p.policy_count, 0) = 0 then 0 else 1 end,
  t.table_name;

-- Check that each school-admin provisioning RPC is not executable directly by
-- browser roles. The registration Edge Function calls the RPC with service_role.
select
  p.oid::regprocedure as function_signature,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(no function config)') as function_config,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('provision_registered_school', 'provision_connected_school')
order by p.proname;
