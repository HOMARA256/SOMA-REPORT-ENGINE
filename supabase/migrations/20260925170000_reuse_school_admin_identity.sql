-- One person may administer more than one school. Reuse the existing internal
-- user tied to the Supabase Auth identity instead of attempting a duplicate.
create or replace function public.provision_registered_school(
  p_actor_auth_user_id uuid, p_admin_auth_user_id uuid, p_school_name text,
  p_school_code text, p_school_level text, p_school_type text, p_district text,
  p_emis_number text, p_address text, p_school_email text, p_school_phone text,
  p_admin_name text, p_admin_email text, p_admin_phone text, p_admin_username text,
  p_plan_code text, p_billing_cadence text, p_subscription_start date,
  p_trial_days integer, p_internal_notes text, p_token_hash text,
  p_invitation_expires_at timestamptz, p_requires_mfa boolean default false
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_actor public.platform_admins%rowtype;
  v_school_id uuid; v_user_id uuid; v_membership_id uuid; v_invitation_id uuid;
  v_plan_id uuid; v_role_id uuid; v_year_id uuid;
  v_year integer := extract(year from p_subscription_start)::integer;
  v_subscription_status text := case when coalesce(p_trial_days,0)>0 then 'TRIAL' else 'PAYMENT_DUE' end;
begin
  select * into v_actor from public.platform_admins where auth_user_id=p_actor_auth_user_id and is_active limit 1;
  if v_actor.id is null then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if p_school_level not in ('UCE_ONLY','UACE_ONLY','BOTH') then raise exception 'INVALID_SCHOOL_LEVEL'; end if;
  if p_billing_cadence not in ('ANNUAL','TERMLY') then raise exception 'INVALID_BILLING_CADENCE'; end if;
  if exists(select 1 from public.schools where lower(school_code)=lower(trim(p_school_code))) then raise exception 'SCHOOL_CODE_EXISTS'; end if;
  if exists(select 1 from public.school_admin_invitations where lower(username)=lower(trim(p_admin_username))) then raise exception 'ADMIN_USERNAME_EXISTS'; end if;

  select id into v_plan_id from public.subscription_plans where code=p_plan_code and status='ACTIVE' and billing_cadence=p_billing_cadence limit 1;
  if v_plan_id is null then raise exception 'ACTIVE_PLAN_NOT_FOUND'; end if;
  select id into v_role_id from public.roles where code='SCHOOL_ADMIN' limit 1;
  if v_role_id is null then raise exception 'SCHOOL_ADMIN_ROLE_NOT_FOUND'; end if;

  insert into public.schools(school_code,official_name,email,telephone,address,emis_number,school_level,school_type,district,internal_platform_notes,lifecycle_status,is_active)
  values(upper(trim(p_school_code)),trim(p_school_name),lower(trim(p_school_email)),trim(p_school_phone),trim(p_address),nullif(trim(p_emis_number),''),p_school_level,trim(p_school_type),trim(p_district),nullif(trim(p_internal_notes),''),'DRAFT',false)
  returning id into v_school_id;

  select id into v_user_id from public.users
  where auth_user_id=p_admin_auth_user_id or lower(email)=lower(trim(p_admin_email))
  order by (auth_user_id=p_admin_auth_user_id) desc limit 1;
  if v_user_id is null then
    insert into public.users(auth_user_id,email,full_name,is_active)
    values(p_admin_auth_user_id,lower(trim(p_admin_email)),trim(p_admin_name),false)
    returning id into v_user_id;
  else
    update public.users set full_name=trim(p_admin_name),updated_at=now() where id=v_user_id;
  end if;

  insert into public.school_memberships(school_id,user_id,role_id,status)
  values(v_school_id,v_user_id,v_role_id,'INACTIVE') returning id into v_membership_id;
  insert into public.school_admin_invitations(school_id,invited_user_id,full_name,email,telephone,username,token_hash,status,expires_at,temporary_credential_expires_at,requires_password_change,requires_mfa,created_by)
  values(v_school_id,p_admin_auth_user_id,trim(p_admin_name),lower(trim(p_admin_email)),trim(p_admin_phone),lower(trim(p_admin_username)),p_token_hash,'PENDING',p_invitation_expires_at,p_invitation_expires_at,true,p_requires_mfa,v_actor.id)
  returning id into v_invitation_id;
  insert into public.school_subscriptions(school_id,plan_id,status,starts_on,expires_on,grace_period_days)
  values(v_school_id,v_plan_id,v_subscription_status,p_subscription_start,
    case when p_billing_cadence='ANNUAL' then (p_subscription_start+interval '1 year')::date else (p_subscription_start+interval '4 months')::date end,0);
  insert into public.school_billing_profiles(school_id,plan_id,configured_by) values(v_school_id,v_plan_id,v_actor.id);
  insert into public.academic_years(school_id,name,starts_on,ends_on,status)
  values(v_school_id,v_year::text,make_date(v_year,1,1),make_date(v_year,12,31),'DRAFT') returning id into v_year_id;

  if p_school_level in ('UCE_ONLY','BOTH') then
    insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level)
    select v_school_id,v_year_id,s.id,'O_LEVEL'::public.subject_programme,s.subject_code,'SYSTEM_CATALOGUE','ACTIVE'::public.offering_status,'ORDINARY'::public.subject_level
    from public.system_subjects s where s.programme='O_LEVEL' and s.is_official and s.is_compulsory and s.is_active
    on conflict(school_id,academic_year_id,system_subject_id) do nothing;
  end if;

  insert into public.school_onboarding_states(school_id,status,milestones) values(v_school_id,'REGISTERED','{}'::jsonb);
  perform public.seed_school_setup_checklist(v_school_id);
  insert into public.school_invitation_events(invitation_id,school_id,event_type,actor_platform_admin_id,safe_metadata)
  values(v_invitation_id,v_school_id,'CREATED',v_actor.id,jsonb_build_object('username',lower(trim(p_admin_username)),'expires_at',p_invitation_expires_at));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor.email,'PLATFORM_ADMIN','SCHOOL_REGISTERED','school',v_school_id::text,
    jsonb_build_object('school_code',upper(trim(p_school_code)),'school_level',p_school_level,'invitation_status','PENDING','reused_identity',true));
  return jsonb_build_object('school_id',v_school_id,'membership_id',v_membership_id,'invitation_id',v_invitation_id,'username',lower(trim(p_admin_username)));
end $$;

revoke all on function public.provision_registered_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.provision_registered_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean) to service_role;
