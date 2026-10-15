-- Read-only reproducible SOMA REPORT ENGINE database inventory.
select
  n.nspname as schema_name,
  c.relname as object_name,
  case c.relkind when 'r' then 'TABLE' when 'v' then 'VIEW' when 'm' then 'MATERIALIZED_VIEW' when 'p' then 'PARTITIONED_TABLE' else c.relkind::text end as object_type,
  coalesce(stats.n_live_tup,0)::bigint as estimated_record_count,
  stats.last_analyze,
  stats.last_autoanalyze,
  (select count(*) from pg_constraint fk where fk.contype='f' and (fk.conrelid=c.oid or fk.confrelid=c.oid)) as foreign_key_dependencies,
  (select count(*) from pg_policies policy where policy.schemaname=n.nspname and policy.tablename=c.relname) as rls_policy_count,
  (select count(*) from pg_trigger trigger where trigger.tgrelid=c.oid and not trigger.tgisinternal) as application_trigger_count
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
left join pg_stat_user_tables stats on stats.relid=c.oid
where n.nspname in ('public','auth','storage') and c.relkind in ('r','v','m','p')
order by n.nspname,c.relname;
