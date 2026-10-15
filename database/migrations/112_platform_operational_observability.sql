-- Platform-only aggregate delivery evidence and an honest worker-process heartbeat.
-- A heartbeat proves the placeholder process is alive, not that any queued job ran.
create table if not exists public.platform_worker_heartbeats (
  worker_name text primary key,
  started_at timestamptz not null,
  heartbeat_at timestamptz not null,
  last_sweep_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  capability text not null check (capability in ('HEARTBEAT_ONLY','PROCESSING'))
);
alter table public.platform_worker_heartbeats enable row level security;
revoke all on public.platform_worker_heartbeats from public, anon, authenticated;
grant select, insert, update on public.platform_worker_heartbeats to service_role;

create or replace function public.get_platform_operational_status()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_notification jsonb;
  v_recovery jsonb;
  v_worker jsonb;
begin
  if not public.is_active_platform_admin() then
    raise exception 'NOT_AUTHORISED';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'sent', count(*) filter (where status in ('SENT','DELIVERED')),
    'failed', count(*) filter (where status = 'FAILED'),
    'pending', count(*) filter (where status = 'QUEUED'),
    'lastEventAt', max(created_at)
  ) into v_notification
  from public.notification_deliveries
  where created_at >= now() - interval '24 hours';

  select jsonb_build_object(
    'total', count(*),
    'sent', count(*) filter (where delivery_status = 'SENT'),
    'failed', count(*) filter (where delivery_status = 'DELIVERY_FAILED'),
    'pending', count(*) filter (where delivery_status = 'PENDING'),
    'lastEventAt', max(requested_at)
  ) into v_recovery
  from public.teacher_password_recovery_requests
  where requested_at >= now() - interval '24 hours'
    and delivery_status <> 'RATE_LIMITED';

  select jsonb_build_object(
    'workerName', worker_name,
    'startedAt', started_at,
    'heartbeatAt', heartbeat_at,
    'lastSweepAt', last_sweep_at,
    'failureCount', failure_count,
    'capability', capability
  ) into v_worker
  from public.platform_worker_heartbeats
  where worker_name = 'api-worker';

  return jsonb_build_object(
    'observedAt', now(),
    'deliveryWindowHours', 24,
    'notificationDeliveries', v_notification,
    'teacherPasswordRecoveries', v_recovery,
    'worker', v_worker
  );
end;
$$;
revoke all on function public.get_platform_operational_status() from public, anon;
grant execute on function public.get_platform_operational_status() to authenticated;
comment on function public.get_platform_operational_status() is
  'Platform-only aggregate delivery ledger and worker heartbeat. SENT is provider submission, not recipient inbox confirmation. No backup or untracked Auth-email status is inferred.';
