-- Canonical, one-to-one school profile and idempotent platform repair workflow.
create table if not exists public.school_profiles (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete restrict,
  official_name varchar(200) not null,
  short_name varchar(120),
  logo_url text,
  location_summary text,
  profile_status varchar(20) not null default 'CONFIGURED' check (profile_status in ('CONFIGURED','REQUIRES_REPAIR')),
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_workspace_configurations (
  school_id uuid primary key references public.schools(id) on delete restrict,
  workspace_status varchar(30) not null default 'SETUP_IN_PROGRESS',
  is_demo_data boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.school_provisioning_alerts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  severity varchar(20) not null default 'URGENT',
  status varchar(20) not null default 'OPEN',
  title text not null,
  action_code varchar(80) not null default 'REPAIR_SCHOOL_CONFIGURATION',
  safe_details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists school_provisioning_open_alert_key
  on public.school_provisioning_alerts(school_id,action_code) where status='OPEN';

alter table public.school_profiles enable row level security;
alter table public.school_workspace_configurations enable row level security;
alter table public.school_provisioning_alerts enable row level security;
create policy "members read own school profile" on public.school_profiles for select to authenticated
  using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "members read own workspace configuration" on public.school_workspace_configurations for select to authenticated
  using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "platform admins read provisioning alerts" on public.school_provisioning_alerts for select to authenticated
  using(public.is_platform_administrator());
revoke insert,update,delete,truncate,references,trigger on public.school_profiles,public.school_workspace_configurations,public.school_provisioning_alerts from authenticated,anon;

create or replace function public.ensure_school_profile_on_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.school_profiles(school_id,official_name,short_name,logo_url,location_summary)
  values(new.id,new.official_name,new.short_name,new.logo_url,coalesce(new.district,new.address,'Uganda'))
  on conflict(school_id) do nothing;
  insert into public.school_workspace_configurations(school_id) values(new.id) on conflict(school_id) do nothing;
  return new;
end $$;
drop trigger if exists schools_create_required_profile on public.schools;
create trigger schools_create_required_profile after insert on public.schools
for each row execute function public.ensure_school_profile_on_insert();

create or replace function public.alert_missing_school_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.school_provisioning_alerts(school_id,title,safe_details)
  values(old.school_id,'School setup requires Platform Admin attention',jsonb_build_object('missing_record','school_profile'))
  on conflict(school_id,action_code) where status='OPEN' do nothing;
  return old;
end $$;
drop trigger if exists school_profile_missing_alert on public.school_profiles;
create trigger school_profile_missing_alert after delete on public.school_profiles
for each row execute function public.alert_missing_school_profile();

-- Backfill existing tenants without overwriting any configured profile.
insert into public.school_profiles(school_id,official_name,short_name,logo_url,location_summary)
select s.id,s.official_name,s.short_name,s.logo_url,coalesce(a.formatted_address,a.address_line,s.district,s.address,'Uganda')
from public.schools s left join lateral(select * from public.school_addresses x where x.school_id=s.id order by x.created_at desc limit 1)a on true
on conflict(school_id) do nothing;
insert into public.school_workspace_configurations(school_id)
select id from public.schools on conflict(school_id) do nothing;

create or replace function public.preview_school_configuration_repair(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_preview jsonb;
begin
  if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.schools where id=p_school_id) then raise exception 'SCHOOL_NOT_FOUND'; end if;
  select jsonb_build_object(
    'school_profile',not exists(select 1 from public.school_profiles where school_id=p_school_id),
    'school_address',not exists(select 1 from public.school_addresses where school_id=p_school_id),
    'academic_profile',not exists(select 1 from public.school_academic_profiles where school_id=p_school_id),
    'subscription',not exists(select 1 from public.school_subscriptions where school_id=p_school_id),
    'primary_admin',not exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id where m.school_id=p_school_id and r.code='SCHOOL_ADMIN'),
    'subject_configuration',not exists(select 1 from public.school_subject_offerings where school_id=p_school_id),
    'workspace_configuration',not exists(select 1 from public.school_workspace_configurations where school_id=p_school_id)
  ) into v_preview;
  return v_preview;
end $$;

create or replace function public.repair_school_configuration(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before jsonb; v_school public.schools%rowtype; v_year integer:=extract(year from current_date)::integer; v_year_id uuid; v_plan_id uuid; v_role_id uuid; v_user_id uuid; v_subjects uuid[];
begin
  if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  select * into v_school from public.schools where id=p_school_id for update;
  if v_school.id is null then raise exception 'SCHOOL_NOT_FOUND'; end if;
  v_before:=public.preview_school_configuration_repair(p_school_id);
  insert into public.school_profiles(school_id,official_name,short_name,logo_url,location_summary)
    values(v_school.id,v_school.official_name,v_school.short_name,v_school.logo_url,coalesce(v_school.district,v_school.address,'Uganda')) on conflict(school_id) do nothing;
  insert into public.school_addresses(school_id,address_type,address_line,district,country,formatted_address)
    select v_school.id,'PHYSICAL',coalesce(v_school.address,v_school.district,'Address pending'),v_school.district,'Uganda',coalesce(v_school.address,v_school.district,'Uganda')
    where not exists(select 1 from public.school_addresses where school_id=v_school.id);
  insert into public.school_academic_profiles(school_id,academic_levels,current_academic_year,current_term)
    select v_school.id,coalesce(v_school.school_level,'UCE_ONLY'),v_year,'TERM_I'
    where not exists(select 1 from public.school_academic_profiles where school_id=v_school.id);
  insert into public.school_workspace_configurations(school_id) values(v_school.id) on conflict(school_id) do nothing;
  select plan_id into v_plan_id from public.school_billing_profiles where school_id=v_school.id order by created_at desc limit 1;
  if v_plan_id is null then select id into v_plan_id from public.subscription_plans where status='ACTIVE' order by created_at limit 1; end if;
  if v_plan_id is not null and not exists(select 1 from public.school_subscriptions where school_id=v_school.id) then
    insert into public.school_subscriptions(school_id,plan_id,status,starts_on,expires_on,grace_period_days)
    values(v_school.id,v_plan_id,'PAYMENT_DUE',current_date,(current_date+interval '4 months')::date,0);
  end if;
  select u.id into v_user_id from public.school_admin_invitations i join public.users u on u.auth_user_id=i.invited_user_id where i.school_id=v_school.id order by i.created_at desc limit 1;
  select id into v_role_id from public.roles where code='SCHOOL_ADMIN';
  if v_user_id is not null and v_role_id is not null then
    insert into public.school_memberships(school_id,user_id,role_id,status) values(v_school.id,v_user_id,v_role_id,'INACTIVE') on conflict(school_id,user_id) do nothing;
  end if;
  select id into v_year_id from public.academic_years where school_id=v_school.id order by starts_on desc limit 1;
  select subject_ids into v_subjects from public.platform_subject_policies where code='O_LEVEL_COMPULSORY_8' and is_active;
  if v_year_id is not null and cardinality(v_subjects)=8 and v_school.school_level in ('UCE_ONLY','BOTH') then
    insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level)
    select v_school.id,v_year_id,s.id,'O_LEVEL',s.subject_code,'SYSTEM_CATALOGUE','ACTIVE','ORDINARY' from public.system_subjects s where s.id=any(v_subjects)
    on conflict(school_id,academic_year_id,system_subject_id) do nothing;
  end if;
  update public.school_provisioning_alerts set status='RESOLVED',resolved_at=now() where school_id=p_school_id and status='OPEN';
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(auth.uid()::text,'PLATFORM_ADMIN','SCHOOL_CONFIGURATION_REPAIRED','school',p_school_id::text,v_before);
  return jsonb_build_object('repaired',v_before,'school_id',p_school_id);
end $$;

grant execute on function public.preview_school_configuration_repair(uuid),public.repair_school_configuration(uuid) to authenticated;

create or replace function public.guard_school_profile_lifecycle()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.lifecycle_status in ('INVITATION_SENT','SETUP_IN_PROGRESS','PENDING_PLATFORM_APPROVAL','ACTIVE')
     and not exists(select 1 from public.school_profiles where school_id=new.id and profile_status='CONFIGURED') then
    raise exception 'SCHOOL_PROFILE_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists schools_require_profile_for_lifecycle on public.schools;
create constraint trigger schools_require_profile_for_lifecycle after insert or update of lifecycle_status on public.schools
deferrable initially deferred for each row execute function public.guard_school_profile_lifecycle();

create table if not exists public.platform_subject_policies (
  code varchar(80) primary key,
  subject_ids uuid[] not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint compulsory_eight_size check(code<>'O_LEVEL_COMPULSORY_8' or cardinality(subject_ids)=8)
);
alter table public.platform_subject_policies enable row level security;
create policy "platform admins read subject policies" on public.platform_subject_policies for select to authenticated using(public.is_platform_administrator());
revoke insert,update,delete,truncate,references,trigger on public.platform_subject_policies from authenticated,anon;

alter table public.schools add column if not exists is_demo_data boolean not null default false;
alter table public.users add column if not exists is_demo_data boolean not null default false;
alter table public.academic_classes add column if not exists is_demo_data boolean not null default false;
alter table public.class_streams add column if not exists is_demo_data boolean not null default false;
alter table public.school_subject_offerings add column if not exists is_demo_data boolean not null default false;
alter table public.class_subject_offerings add column if not exists is_demo_data boolean not null default false;
alter table public.teacher_allocations add column if not exists is_demo_data boolean not null default false;
alter table public.learners add column if not exists is_demo_data boolean not null default false;
alter table public.learner_class_enrolments add column if not exists is_demo_data boolean not null default false;

create or replace function public.create_demo_o_level_school_data()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_subjects uuid[]; v_school uuid; v_year uuid; v_term uuid; v_class uuid; v_stream uuid; v_subject uuid; v_offering uuid; v_class_subject uuid; v_teacher uuid; v_learner uuid; v_level integer; v_n integer;
begin
  if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  select subject_ids into v_subjects from public.platform_subject_policies where code='O_LEVEL_COMPULSORY_8' and is_active;
  if coalesce(cardinality(v_subjects),0)<>8 or exists(select 1 from unnest(v_subjects) x left join public.system_subjects s on s.id=x where s.id is null or not s.is_active or s.programme<>'O_LEVEL') then
    raise exception 'Configure the eight compulsory O-Level subjects before creating demo academic data.';
  end if;
  select id into v_school from public.schools where school_code='DEMO-OLEVEL';
  if v_school is null then
    insert into public.schools(school_code,official_name,short_name,school_level,school_type,district,address,lifecycle_status,is_active,is_demo_data)
    values('DEMO-OLEVEL','Demo O-Level School','Demo O-Level','UCE_ONLY','Demo / Test','Demo District','Fictional test location','ACTIVE',true,true) returning id into v_school;
  else update public.schools set is_demo_data=true where id=v_school; end if;
  update public.school_profiles set is_demo_data=true,profile_status='CONFIGURED' where school_id=v_school;
  update public.school_workspace_configurations set is_demo_data=true where school_id=v_school;
  select id into v_year from public.academic_years where school_id=v_school and name=extract(year from current_date)::text;
  if v_year is null then insert into public.academic_years(school_id,name,starts_on,ends_on,status) values(v_school,extract(year from current_date)::text,date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year'-interval '1 day')::date,'ACTIVE') returning id into v_year; end if;
  select id into v_term from public.terms where school_id=v_school and academic_year_id=v_year and term_number=1;
  if v_term is null then insert into public.terms(school_id,academic_year_id,term_number,name,starts_on,ends_on,lifecycle_status) values(v_school,v_year,1,'Term I',date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '4 months')::date,'MARKS_OPEN') returning id into v_term; end if;
  foreach v_subject in array v_subjects loop
    insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level,is_demo_data)
    select v_school,v_year,s.id,'O_LEVEL',s.subject_code,'SYSTEM_CATALOGUE','ACTIVE','ORDINARY',true from public.system_subjects s where s.id=v_subject
    on conflict(school_id,academic_year_id,system_subject_id) do update set status='ACTIVE' returning id into v_offering;
    insert into public.users(email,full_name,is_active,is_demo_data) select 'demo-'||replace(v_subject::text,'-','')||'@invalid.local','Demo '||s.short_name||' Teacher',true,true from public.system_subjects s where s.id=v_subject on conflict(email) do update set is_demo_data=true returning id into v_teacher;
    for v_level in 1..4 loop
      select id into v_class from public.academic_classes where school_id=v_school and academic_year_id=v_year and class_name='Senior '||v_level;
      if v_class is null then insert into public.academic_classes(school_id,academic_year_id,programme,class_name,level,status,is_demo_data) values(v_school,v_year,'O_LEVEL','Senior '||v_level,v_level,'ACTIVE',true) returning id into v_class; end if;
      select id into v_stream from public.class_streams where class_id=v_class and stream_name='A';
      if v_stream is null then insert into public.class_streams(school_id,class_id,stream_name,status,is_demo_data) values(v_school,v_class,'A','ACTIVE',true) returning id into v_stream; end if;
      insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,stream_id,is_compulsory,status,is_demo_data)
      values(v_school,v_offering,v_year,v_class,v_stream,true,'ACTIVE',true) on conflict(school_subject_offering_id,class_id,stream_id) do update set status='ACTIVE' returning id into v_class_subject;
      insert into public.teacher_allocations(school_id,academic_year_id,term_id,teacher_id,class_subject_offering_id,stream_id,status,is_demo_data)
      values(v_school,v_year,v_term,v_teacher,v_class_subject,v_stream,'ACTIVE',true) on conflict(term_id,teacher_id,class_subject_offering_id,stream_id) do nothing;
    end loop;
  end loop;
  for v_level in 1..4 loop
    select id into v_class from public.academic_classes where school_id=v_school and academic_year_id=v_year and class_name='Senior '||v_level;
    select id into v_stream from public.class_streams where class_id=v_class and stream_name='A';
    for v_n in 1..10 loop
      insert into public.learners(school_id,admission_number,first_name,last_name,status,is_demo_data)
      values(v_school,'DEMO-S'||v_level||'A-'||lpad(v_n::text,3,'0'),'Demo Learner',v_level||'-'||lpad(v_n::text,3,'0'),'ACTIVE',true)
      on conflict(school_id,admission_number) do update set is_demo_data=true returning id into v_learner;
      insert into public.learner_class_enrolments(school_id,learner_id,academic_year_id,class_id,stream_id,status,effective_from,is_demo_data)
      values(v_school,v_learner,v_year,v_class,v_stream,'ACTIVE',current_date,true) on conflict(learner_id,academic_year_id) do nothing;
    end loop;
  end loop;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value) values(auth.uid()::text,'PLATFORM_ADMIN','DEMO_SCHOOL_SEEDED','school',v_school::text,jsonb_build_object('subjects',8,'teachers',8,'classes',4,'learners',40));
  return jsonb_build_object('school_id',v_school,'subjects',8,'teachers',8,'classes',4,'learners',40);
end $$;
grant execute on function public.create_demo_o_level_school_data() to authenticated;

create or replace function public.reset_demo_school_data(p_school_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_count integer;
begin
  if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.schools where id=p_school_id and is_demo_data) then raise exception 'DEMO_SCHOOL_REQUIRED'; end if;
  delete from public.learner_subject_enrolments where school_id=p_school_id and learner_id in(select id from public.learners where school_id=p_school_id and is_demo_data);
  delete from public.learner_class_enrolments where school_id=p_school_id and is_demo_data;
  delete from public.learners where school_id=p_school_id and is_demo_data; get diagnostics v_count=row_count;
  delete from public.teacher_allocations where school_id=p_school_id and is_demo_data;
  delete from public.class_subject_offerings where school_id=p_school_id and is_demo_data;
  delete from public.class_streams where school_id=p_school_id and is_demo_data;
  delete from public.academic_classes where school_id=p_school_id and is_demo_data;
  delete from public.school_subject_offerings where school_id=p_school_id and is_demo_data;
  delete from public.users where is_demo_data and id not in(select user_id from public.school_memberships);
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(auth.uid()::text,'PLATFORM_ADMIN','DEMO_SCHOOL_RESET','school',p_school_id::text,jsonb_build_object('learners_removed',v_count));
  return jsonb_build_object('school_id',p_school_id,'learners_removed',v_count);
end $$;
grant execute on function public.reset_demo_school_data(uuid) to authenticated;
