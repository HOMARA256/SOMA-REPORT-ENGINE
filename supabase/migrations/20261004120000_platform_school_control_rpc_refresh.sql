-- Publish the Platform School Controls RPC under its request argument order.
-- This is a forward migration because migration 056 may already be applied.
create or replace function public.apply_platform_school_control(
  p_action text,
  p_grace_days integer,
  p_reason text,
  p_school_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.platform_admins%rowtype;
  v_school public.schools%rowtype;
  v_action text := upper(trim(coalesce(p_action, '')));
  v_lifecycle text;
  v_active boolean;
  v_before jsonb;
  v_after jsonb;
begin
  select * into v_admin from public.platform_admins where auth_user_id = auth.uid() and is_active = true;
  if not found then raise exception 'NOT_AUTHORISED'; end if;
  select * into v_school from public.schools where id = p_school_id for update;
  if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;
  if v_action not in ('ACTIVATE','SUSPEND','ARCHIVE','RESTORE','SET_GRACE_PERIOD') then raise exception 'INVALID_PLATFORM_CONTROL_ACTION'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'CONTROL_REASON_REQUIRED'; end if;
  if v_action = 'SET_GRACE_PERIOD' and (p_grace_days is null or p_grace_days < 1 or p_grace_days > 90) then raise exception 'VALID_GRACE_PERIOD_REQUIRED'; end if;

  v_before := jsonb_build_object('lifecycle_status',v_school.lifecycle_status,'is_active',v_school.is_active);
  v_lifecycle := v_school.lifecycle_status;
  v_active := v_school.is_active;
  if v_action = 'ACTIVATE' then v_lifecycle := 'ACTIVE'; v_active := true;
  elsif v_action = 'SUSPEND' then v_lifecycle := 'SUSPENDED'; v_active := false;
  elsif v_action = 'ARCHIVE' then v_lifecycle := 'ARCHIVED'; v_active := false;
  elsif v_action = 'RESTORE' then v_lifecycle := 'SETUP_IN_PROGRESS'; v_active := true;
  elsif v_action = 'SET_GRACE_PERIOD' then v_lifecycle := 'ACTIVE'; v_active := true;
  end if;

  update public.schools set lifecycle_status=v_lifecycle,is_active=v_active,updated_at=now() where id=v_school.id;
  if v_action = 'SET_GRACE_PERIOD' then
    update public.school_subscriptions set grace_period_days=p_grace_days,status='PAYMENT_DUE',updated_at=now()
      where school_id=v_school.id and status in ('TRIAL','ACTIVE','PAYMENT_DUE','SUSPENDED');
  elsif v_action = 'SUSPEND' then
    update public.school_subscriptions set status='SUSPENDED',updated_at=now()
      where school_id=v_school.id and status in ('TRIAL','ACTIVE','PAYMENT_DUE');
  elsif v_action in ('ACTIVATE','RESTORE') then
    update public.school_subscriptions set status='ACTIVE',updated_at=now()
      where school_id=v_school.id and status='SUSPENDED';
  end if;

  v_after := jsonb_build_object('lifecycle_status',v_lifecycle,'is_active',v_active,'grace_days',case when v_action='SET_GRACE_PERIOD' then p_grace_days else null end);
  insert into public.platform_audit_logs(platform_admin_id,school_id,action,target_type,target_id,previous_state,new_state,reason,session_metadata)
    values(v_admin.id,v_school.id,'SCHOOL_CONTROL_'||v_action,'school',v_school.id::text,v_before,v_after,trim(p_reason),jsonb_build_object('source','platform_control_centre'));
  return jsonb_build_object('school_id',v_school.id,'action',v_action,'state',v_after);
end;
$$;

revoke all on function public.apply_platform_school_control(text,integer,text,uuid) from public,anon;
grant execute on function public.apply_platform_school_control(text,integer,text,uuid) to authenticated;
notify pgrst, 'reload schema';
