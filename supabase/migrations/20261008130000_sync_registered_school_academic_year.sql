-- Keep all first-tenant academic records aligned to the academic year selected
-- in the platform registration form. The core provisioner initially derives
-- its year from subscription_start; those dates are not necessarily identical.
create or replace function public.provision_connected_school(
  p_actor_auth_user_id uuid,p_admin_auth_user_id uuid,p_school_name text,p_school_code text,p_school_level text,p_school_type text,
  p_district text,p_emis_number text,p_address text,p_school_email text,p_school_phone text,p_admin_name text,p_admin_email text,
  p_admin_phone text,p_admin_username text,p_plan_code text,p_billing_cadence text,p_subscription_start date,p_trial_days integer,
  p_internal_notes text,p_token_hash text,p_invitation_expires_at timestamptz,p_requires_mfa boolean,p_registration jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_result jsonb; v_school uuid; v_subscription uuid; v_plan uuid; v_period uuid; v_actor uuid; v_year integer;
  v_term varchar(20); v_learners integer; v_amount bigint; v_invoice_status public.invoice_lifecycle_status;
begin
  if p_registration is null or jsonb_typeof(p_registration) <> 'object' then
    raise exception 'INVALID_REGISTRATION_PROFILE';
  end if;
  v_year:=coalesce(nullif(p_registration->>'academicYear','')::integer,extract(year from p_subscription_start)::integer);
  if v_year not between 2000 and 2200 then raise exception 'INVALID_REGISTRATION_ACADEMIC_YEAR'; end if;

  v_result:=public.provision_registered_school(p_actor_auth_user_id,p_admin_auth_user_id,p_school_name,p_school_code,p_school_level,p_school_type,
    p_district,p_emis_number,p_address,p_school_email,p_school_phone,p_admin_name,p_admin_email,p_admin_phone,p_admin_username,p_plan_code,
    p_billing_cadence,p_subscription_start,p_trial_days,p_internal_notes,p_token_hash,p_invitation_expires_at,p_requires_mfa);
  v_school:=(v_result->>'school_id')::uuid;
  -- A legacy internal admin profile may exist by email without an Auth link.
  -- Attach the just-validated Auth identity inside this same provisioning
  -- transaction so invitation activation can resolve the profile reliably.
  update public.users
    set auth_user_id=p_admin_auth_user_id,updated_at=now()
    where lower(email)=lower(trim(p_admin_email)) and auth_user_id is null;
  if not exists (
    select 1 from public.users
    where auth_user_id=p_admin_auth_user_id and lower(email)=lower(trim(p_admin_email))
  ) then
    raise exception 'SCHOOL_ADMIN_IDENTITY_PROFILE_MISMATCH';
  end if;
  select id into v_actor from public.platform_admins where auth_user_id=p_actor_auth_user_id and is_active;
  v_term:=coalesce(nullif(p_registration->>'currentTerm',''),'TERM_I');
  v_learners:=greatest(0,coalesce((p_registration->>'activeLearners')::integer,0));

  update public.schools set short_name=nullif(trim(p_registration->>'shortName'),''),display_name=coalesce(nullif(trim(p_registration->>'shortName'),''),official_name),
    logo_url=nullif(trim(p_registration->>'logoUrl'),''),website_url=nullif(trim(p_registration->>'website'),''),country='Uganda'
  where id=v_school;
  insert into public.school_addresses(school_id,address_type,address_line,district,country,postal_address,country_location_id,region_location_id,
    sub_region_location_id,district_city_location_id,county_division_location_id,local_government_location_id,parish_ward_location_id,
    village_zone_location_id,plot_building_road,landmark,latitude,longitude,formatted_address)
  values(v_school,'PHYSICAL',p_address,p_district,'Uganda',nullif(p_registration#>>'{location,postalAddress}',''),
    nullif(p_registration#>>'{location,countryId}','')::uuid,nullif(p_registration#>>'{location,regionId}','')::uuid,
    nullif(p_registration#>>'{location,subRegionId}','')::uuid,nullif(p_registration#>>'{location,districtCityId}','')::uuid,
    nullif(p_registration#>>'{location,countyDivisionId}','')::uuid,nullif(p_registration#>>'{location,localGovernmentId}','')::uuid,
    nullif(p_registration#>>'{location,parishWardId}','')::uuid,nullif(p_registration#>>'{location,villageZoneId}','')::uuid,
    nullif(p_registration#>>'{location,plotRoad}',''),nullif(p_registration#>>'{location,landmark}',''),
    nullif(p_registration#>>'{location,latitude}','')::numeric,nullif(p_registration#>>'{location,longitude}','')::numeric,
    nullif(p_registration#>>'{location,formattedAddress}',''));

  -- The core provisioner created exactly one initial year for this newly
  -- created school. Preserve its id (and compulsory subject offering links)
  -- while correcting the label/date range to the registration's chosen year.
  update public.academic_years
    set name=v_year::text,starts_on=make_date(v_year,1,1),ends_on=make_date(v_year,12,31)
    where school_id=v_school;
  if not found then raise exception 'SCHOOL_ACADEMIC_YEAR_NOT_FOUND'; end if;

  insert into public.school_academic_profiles(school_id,academic_levels,current_academic_year,current_term,curriculum_start_year)
  values(v_school,p_school_level,v_year,v_term,nullif(p_registration->>'curriculumStartYear','')::integer);
  update public.school_admin_invitations set job_title=nullif(trim(p_registration->>'adminJobTitle'),'') where id=(v_result->>'invitation_id')::uuid;

  select subscription.id,subscription.plan_id into v_subscription,v_plan from public.school_subscriptions subscription where subscription.school_id=v_school;
  select greatest(plan.minimum_charge_minor,v_learners*plan.unit_price_minor) into v_amount from public.subscription_plans plan where plan.id=v_plan;
  insert into public.subscription_periods(school_id,subscription_id,plan_id,academic_year,academic_term,amount_snapshot,currency,billing_period,starts_on,due_on,ends_on,status)
  values(v_school,v_subscription,v_plan,v_year,v_term,v_amount,'UGX','ACADEMIC_TERM',p_subscription_start,p_subscription_start+14,
    case when p_billing_cadence='ANNUAL' then (p_subscription_start+interval '1 year')::date else (p_subscription_start+interval '4 months')::date end,'DUE') returning id into v_period;
  v_invoice_status:=case when p_registration->>'paymentStatus'='WAIVED' then 'WAIVED'::public.invoice_lifecycle_status else 'ISSUED'::public.invoice_lifecycle_status end;
  insert into public.subscription_invoices(school_id,subscription_period_id,invoice_number,payment_reference,plan_code,academic_year,academic_term,
    amount_due,currency,status,due_at,billing_cadence,active_learner_count,unit_price_minor,minimum_charge_minor,gross_amount_minor,balance_minor)
  select v_school,v_period,'INV-'||upper(p_school_code)||'-'||v_year||'-'||replace(v_term,'TERM_','T'),
    'PAY-'||upper(p_school_code)||'-'||substr(replace(v_period::text,'-',''),1,8),p_plan_code,v_year,v_term,v_amount,'UGX',v_invoice_status,
    (p_subscription_start+14)::timestamptz,p_billing_cadence,v_learners,plan.unit_price_minor,plan.minimum_charge_minor,v_amount,
    case when v_invoice_status='WAIVED' then 0 else v_amount end from public.subscription_plans plan where plan.id=v_plan;
  insert into public.school_billing_schedules(school_id,subscription_id,billing_cadence,next_invoice_on,grace_period_days)
  values(v_school,v_subscription,p_billing_cadence,case when p_billing_cadence='ANNUAL' then (p_subscription_start+interval '1 year')::date else (p_subscription_start+interval '4 months')::date end,14);
  if nullif(p_registration->>'draftId','') is not null then
    update public.school_registration_drafts set status='REGISTERED',registered_school_id=v_school,updated_at=now()
    where id=(p_registration->>'draftId')::uuid and created_by=v_actor and status='DRAFT';
  end if;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values((select email from public.platform_admins where id=v_actor),'PLATFORM_ADMIN','CONNECTED_SCHOOL_PROVISIONED','school',v_school::text,
    jsonb_build_object('address',true,'academic_profile',true,'subscription',true,'invoice',true,'billing_schedule',true,'academic_year_synchronized',true));
  return v_result||jsonb_build_object('subscription_id',v_subscription,'subscription_period_id',v_period);
end $$;

revoke all on function public.provision_connected_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.provision_connected_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean,jsonb) to service_role;
