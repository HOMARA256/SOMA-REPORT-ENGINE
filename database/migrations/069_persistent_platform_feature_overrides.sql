-- Use the existing platform feature catalogue and per-school overrides as the
-- authoritative entitlement source. Existing override rows are preserved.
insert into public.feature_flags (key, label, global_enabled, school_override_permitted)
values
  ('academic', 'Academic Management', true, true),
  ('reports', 'Report Cards', true, true),
  ('imports', 'Import / Export', true, true)
on conflict (key) do nothing;

-- A school may read its effective configuration, but only the Platform
-- Administrator can change a platform entitlement through the audited RPC.
drop policy if exists school_overrides_admin_manage on public.school_feature_overrides;

create or replace function public.get_platform_feature_directory()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare v_result jsonb;
begin
  if not public.is_active_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'schoolId', school_record.id,
    'features', coalesce((
      select jsonb_object_agg(flag.key, jsonb_build_object(
        'label', flag.label,
        'plan', case flag.key
          when 'academic' then plan.entitlements is not null
          when 'reports' then coalesce((plan.entitlements -> 'reportCards') = 'true'::jsonb, false)
          when 'imports' then coalesce((plan.entitlements -> 'excelImport') = 'true'::jsonb, false)
          else coalesce((plan.entitlements -> flag.key) = 'true'::jsonb, false)
        end,
        'globalEnabled', flag.global_enabled,
        'overridePermitted', flag.school_override_permitted,
        'override', coalesce(override_record.override_state, 'DEFAULT')
      ))
      from public.feature_flags flag
      left join public.school_feature_overrides override_record
        on override_record.school_id = school_record.id
       and override_record.feature_key = flag.key
    ), '{}'::jsonb)
  ) order by school_record.created_at desc), '[]'::jsonb)
  into v_result
  from public.schools school_record
  left join lateral (
    select subscription_plan.entitlements
    from public.school_subscriptions subscription_record
    join public.subscription_plans subscription_plan
      on subscription_plan.id = subscription_record.plan_id
    where subscription_record.school_id = school_record.id
      and subscription_record.status in ('TRIAL', 'ACTIVE', 'PAYMENT_DUE', 'SUSPENDED')
    order by subscription_record.created_at desc
    limit 1
  ) plan on true;

  return v_result;
end;
$$;

revoke all on function public.get_platform_feature_directory() from public, anon;
grant execute on function public.get_platform_feature_directory() to authenticated;

create or replace function public.set_platform_school_feature_override(
  p_school_id uuid, p_feature_key text, p_override_state text, p_reason text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_flag public.feature_flags%rowtype;
  v_previous public.school_feature_overrides%rowtype;
  v_state text := upper(trim(coalesce(p_override_state, '')));
  v_reason text := trim(coalesce(p_reason, ''));
begin
  select id into v_actor_id
  from public.platform_admins
  where auth_user_id = auth.uid() and is_active;
  if v_actor_id is null then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  -- Serialize concurrent clicks for the same school before checking its row.
  perform 1 from public.schools where id = p_school_id for update;
  if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;
  if v_state not in ('DEFAULT', 'ENABLED', 'DISABLED') then
    raise exception 'INVALID_FEATURE_OVERRIDE';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 500 then
    raise exception 'FEATURE_OVERRIDE_REASON_REQUIRED';
  end if;

  select * into v_flag from public.feature_flags
  where key = trim(coalesce(p_feature_key, ''));
  if v_flag.key is null then raise exception 'FEATURE_NOT_FOUND'; end if;
  if not v_flag.school_override_permitted and v_state <> 'DEFAULT' then
    raise exception 'FEATURE_OVERRIDE_NOT_PERMITTED';
  end if;

  select * into v_previous
  from public.school_feature_overrides
  where school_id = p_school_id and feature_key = v_flag.key
  for update;
  if v_previous.feature_key is not null and v_previous.override_state = v_state then
    return jsonb_build_object('schoolId', p_school_id, 'featureKey', v_flag.key,
      'override', v_state, 'changed', false);
  end if;
  if v_previous.feature_key is null and v_state = 'DEFAULT' then
    return jsonb_build_object('schoolId', p_school_id, 'featureKey', v_flag.key,
      'override', 'DEFAULT', 'changed', false);
  end if;

  insert into public.school_feature_overrides (
    school_id, feature_key, override_state, reason, changed_by, changed_at
  ) values (
    p_school_id, v_flag.key, v_state, v_reason, v_actor_id, now()
  ) on conflict (school_id, feature_key) do update
    set override_state = excluded.override_state,
        reason = excluded.reason,
        changed_by = excluded.changed_by,
        changed_at = excluded.changed_at;

  insert into public.platform_audit_logs (
    platform_admin_id, school_id, action, target_type, target_id,
    previous_state, new_state, reason, session_metadata
  ) values (
    v_actor_id, p_school_id, 'FEATURE_OVERRIDE_CHANGED', 'feature', v_flag.key,
    case when v_previous.feature_key is null then null
      else jsonb_build_object('override', v_previous.override_state) end,
    jsonb_build_object('override', v_state), v_reason,
    jsonb_build_object('source', 'platform_control_centre')
  );

  return jsonb_build_object('schoolId', p_school_id, 'featureKey', v_flag.key,
    'override', v_state, 'changed', true);
end;
$$;

revoke all on function public.set_platform_school_feature_override(uuid,text,text,text)
  from public, anon;
grant execute on function public.set_platform_school_feature_override(uuid,text,text,text)
  to authenticated;

notify pgrst, 'reload schema';
