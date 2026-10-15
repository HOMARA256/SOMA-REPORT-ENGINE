-- OURSCHOOL connected school registration workflow.
-- Extends existing tenant, address, academic, billing and invitation records.

create type public.uganda_location_level as enum (
  'COUNTRY','REGION','SUB_REGION','DISTRICT','CITY','COUNTY','CITY_DIVISION',
  'SUB_COUNTY','MUNICIPALITY','TOWN_COUNCIL','DIVISION','PARISH','WARD','VILLAGE','ZONE'
);

create table public.uganda_locations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.uganda_locations(id) on delete restrict,
  level public.uganda_location_level not null,
  name varchar(180) not null,
  code varchar(60) not null unique,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct(parent_id, level, name)
);
create index uganda_locations_parent_idx on public.uganda_locations(parent_id, display_order, name) where is_active;

-- A verified starter branch used by the registration acceptance test. The catalogue
-- is deliberately data-driven so the national dataset can be imported without code changes.
insert into public.uganda_locations(parent_id,level,name,code,display_order) values
  (null,'COUNTRY','Uganda','UG',1);
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'REGION','Central Region','UG-CENTRAL',1 from public.uganda_locations where code='UG';
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'SUB_REGION','Kampala','UG-CENTRAL-KAMPALA',1 from public.uganda_locations where code='UG-CENTRAL';
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'CITY','Kampala Capital City','UG-KCCA',1 from public.uganda_locations where code='UG-CENTRAL-KAMPALA';
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'CITY_DIVISION','Makindye Division','UG-KCCA-MAK',1 from public.uganda_locations where code='UG-KCCA';
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'WARD','Kibuye Ward','UG-KCCA-MAK-KIBUYE-W',1 from public.uganda_locations where code='UG-KCCA-MAK';
insert into public.uganda_locations(parent_id,level,name,code,display_order)
select id,'ZONE','Kibuye Zone','UG-KCCA-MAK-KIBUYE-Z',1 from public.uganda_locations where code='UG-KCCA-MAK-KIBUYE-W';

alter table public.schools
  add column if not exists website_url text,
  add column if not exists display_name varchar(200),
  add column if not exists tenant_key uuid not null default gen_random_uuid();
create unique index if not exists schools_tenant_key_unique on public.schools(tenant_key);

alter table public.school_addresses
  add column if not exists country_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists region_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists sub_region_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists district_city_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists county_division_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists local_government_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists parish_ward_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists village_zone_location_id uuid references public.uganda_locations(id) on delete restrict,
  add column if not exists plot_building_road text,
  add column if not exists landmark text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists formatted_address text,
  add constraint school_addresses_latitude_check check(latitude is null or latitude between -90 and 90),
  add constraint school_addresses_longitude_check check(longitude is null or longitude between -180 and 180);

create table public.school_academic_profiles (
  school_id uuid primary key references public.schools(id) on delete restrict,
  academic_levels varchar(20) not null check(academic_levels in ('UCE_ONLY','UACE_ONLY','BOTH')),
  current_academic_year integer not null check(current_academic_year between 2000 and 2200),
  current_term varchar(20) not null check(current_term in ('TERM_I','TERM_II','TERM_III')),
  curriculum_start_year integer check(curriculum_start_year is null or curriculum_start_year between 1900 and 2200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_registration_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  draft_key uuid not null default gen_random_uuid() unique,
  current_step integer not null default 1 check(current_step between 1 and 6),
  payload jsonb not null default '{}'::jsonb check(jsonb_typeof(payload)='object'),
  status varchar(20) not null default 'DRAFT' check(status in ('DRAFT','REGISTERED','ABANDONED')),
  registered_school_id uuid references public.schools(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index school_registration_draft_registered_once on public.school_registration_drafts(registered_school_id) where registered_school_id is not null;

create table public.school_billing_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid not null references public.school_subscriptions(id) on delete restrict,
  billing_cadence varchar(20) not null check(billing_cadence in ('ANNUAL','TERMLY')),
  next_invoice_on date not null,
  grace_period_days integer not null default 14 check(grace_period_days between 0 and 90),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id, subscription_id)
);

alter table public.school_admin_invitations add column if not exists job_title varchar(120);

alter table public.uganda_locations enable row level security;
alter table public.school_academic_profiles enable row level security;
alter table public.school_registration_drafts enable row level security;
alter table public.school_billing_schedules enable row level security;

create policy "authenticated users can read active Uganda locations" on public.uganda_locations
  for select to authenticated using(is_active);
create policy "platform admins manage Uganda locations" on public.uganda_locations
  for all to authenticated using(public.is_platform_administrator()) with check(public.is_platform_administrator());
create policy "platform admins manage registration drafts" on public.school_registration_drafts
  for all to authenticated using(public.is_platform_administrator()) with check(public.is_platform_administrator());
create policy "authorized users read academic profiles" on public.school_academic_profiles
  for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "authorized users read billing schedules" on public.school_billing_schedules
  for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));

revoke insert,update,delete,truncate,references,trigger on public.school_academic_profiles,public.school_billing_schedules from authenticated,anon;
revoke all on public.school_registration_drafts from anon;

create or replace function public.list_uganda_location_children(p_parent_id uuid default null)
returns table(id uuid,name text,code text,level public.uganda_location_level)
language sql stable security definer set search_path=public,pg_temp as $$
  select location.id,location.name::text,location.code::text,location.level
  from public.uganda_locations location
  where location.is_active and location.parent_id is not distinct from p_parent_id
  order by location.display_order,location.name;
$$;
grant execute on function public.list_uganda_location_children(uuid) to authenticated;

create or replace function public.save_school_registration_draft(p_draft_id uuid,p_current_step integer,p_payload jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_id uuid;
begin
  select id into v_actor from public.platform_admins where auth_user_id=auth.uid() and is_active;
  if v_actor is null then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if jsonb_typeof(p_payload)<>'object' then raise exception 'INVALID_DRAFT_PAYLOAD'; end if;
  if p_draft_id is null then
    insert into public.school_registration_drafts(created_by,current_step,payload)
    values(v_actor,p_current_step,p_payload) returning id into v_id;
  else
    update public.school_registration_drafts set current_step=p_current_step,payload=p_payload,updated_at=now()
    where id=p_draft_id and created_by=v_actor and status='DRAFT' returning id into v_id;
    if v_id is null then raise exception 'DRAFT_NOT_FOUND'; end if;
  end if;
  return v_id;
end $$;
grant execute on function public.save_school_registration_draft(uuid,integer,jsonb) to authenticated;

create or replace function public.provision_connected_school(
  p_actor_auth_user_id uuid,p_admin_auth_user_id uuid,p_school_name text,p_school_code text,p_school_level text,p_school_type text,
  p_district text,p_emis_number text,p_address text,p_school_email text,p_school_phone text,p_admin_name text,p_admin_email text,
  p_admin_phone text,p_admin_username text,p_plan_code text,p_billing_cadence text,p_subscription_start date,p_trial_days integer,
  p_internal_notes text,p_token_hash text,p_invitation_expires_at timestamptz,p_requires_mfa boolean,p_registration jsonb
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_result jsonb; v_school uuid; v_subscription uuid; v_plan uuid; v_period uuid; v_actor uuid; v_year integer;
  v_term varchar(20); v_learners integer; v_amount bigint; v_invoice_status public.invoice_lifecycle_status;
begin
  v_result:=public.provision_registered_school(p_actor_auth_user_id,p_admin_auth_user_id,p_school_name,p_school_code,p_school_level,p_school_type,
    p_district,p_emis_number,p_address,p_school_email,p_school_phone,p_admin_name,p_admin_email,p_admin_phone,p_admin_username,p_plan_code,
    p_billing_cadence,p_subscription_start,p_trial_days,p_internal_notes,p_token_hash,p_invitation_expires_at,p_requires_mfa);
  v_school:=(v_result->>'school_id')::uuid;
  select id into v_actor from public.platform_admins where auth_user_id=p_actor_auth_user_id and is_active;
  v_year:=coalesce((p_registration->>'academicYear')::integer,extract(year from p_subscription_start)::integer);
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
    jsonb_build_object('address',true,'academic_profile',true,'subscription',true,'invoice',true,'billing_schedule',true));
  return v_result||jsonb_build_object('subscription_id',v_subscription,'subscription_period_id',v_period);
end $$;

revoke all on function public.provision_connected_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.provision_connected_school(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,date,integer,text,text,timestamptz,boolean,jsonb) to service_role;
