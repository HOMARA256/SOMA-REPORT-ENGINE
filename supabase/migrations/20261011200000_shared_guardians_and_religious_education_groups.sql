begin;

-- A person is stored once per school; learner-specific relationship and
-- permission data remains on learner_guardians. Existing rows are each
-- migrated to their own guardian record: similar names/phones are NOT merged.
create table if not exists public.school_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  full_name varchar(200) not null,
  phone varchar(60),
  email varchar(255),
  auth_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,school_id)
);
create index if not exists school_guardians_school_name_idx
  on public.school_guardians(school_id,lower(full_name));
create index if not exists school_guardians_school_phone_idx
  on public.school_guardians(school_id,phone) where phone is not null;
drop index if exists public.school_guardians_school_auth_user_idx;
create index if not exists school_guardians_school_auth_user_idx
  on public.school_guardians(school_id,auth_user_id) where auth_user_id is not null;

alter table public.learner_guardians add column if not exists guardian_id uuid;
alter table public.learner_guardians add column if not exists is_emergency boolean not null default false;
alter table public.learner_guardians add column if not exists communication_permissions jsonb not null
  default '{"academic":true,"administrative":true,"emergency":true}'::jsonb;
alter table public.learner_guardians add constraint learner_guardians_permissions_object
  check (jsonb_typeof(communication_permissions)='object'
    and communication_permissions - array['academic','administrative','emergency']::text[]='{}'::jsonb
    and (communication_permissions->'academic' is null or jsonb_typeof(communication_permissions->'academic')='boolean')
    and (communication_permissions->'administrative' is null or jsonb_typeof(communication_permissions->'administrative')='boolean')
    and (communication_permissions->'emergency' is null or jsonb_typeof(communication_permissions->'emergency')='boolean'));
do $$ begin
  if not exists(select 1 from pg_constraint where conname='learner_guardians_guardian_school_fk') then
    alter table public.learner_guardians add constraint learner_guardians_guardian_school_fk
      foreign key(guardian_id,school_id) references public.school_guardians(id,school_id) on delete restrict;
  end if;
end $$;

do $$ declare v_row record; v_guardian uuid; begin
  for v_row in select id,school_id,full_name,phone,email,auth_user_id from public.learner_guardians where guardian_id is null loop
    insert into public.school_guardians(school_id,full_name,phone,email,auth_user_id)
      values(v_row.school_id,v_row.full_name,v_row.phone,v_row.email,v_row.auth_user_id)
      returning id into v_guardian;
    update public.learner_guardians set guardian_id=v_guardian where id=v_row.id;
  end loop;
end $$;
create unique index if not exists learner_guardians_learner_guardian_unique
  on public.learner_guardians(learner_id,guardian_id) where guardian_id is not null;
create index if not exists learner_guardians_guardian_school_idx
  on public.learner_guardians(guardian_id,school_id) where guardian_id is not null;
-- The existing admission converter inserts its legacy contact row before the
-- new atomic wrapper assigns the canonical guardian_id; authenticated callers
-- are restricted to that wrapper below, so the temporary null stays internal.

alter table public.school_guardians enable row level security;
revoke all on public.school_guardians from anon,authenticated;
grant select on public.school_guardians to authenticated;
drop policy if exists school_guardians_school_admin_read on public.school_guardians;
create policy school_guardians_school_admin_read on public.school_guardians for select to authenticated
  using (public.is_school_admin_for(school_id) or public.is_active_platform_admin()
    or auth_user_id=auth.uid());

create or replace function public.sync_guardian_contact_to_learner_links()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.learner_guardians set full_name=new.full_name,phone=new.phone,email=new.email,auth_user_id=new.auth_user_id,updated_at=now()
    where guardian_id=new.id and school_id=new.school_id;
  update public.learners l set guardian_name=new.full_name,guardian_phone=new.phone,updated_at=now()
    where l.school_id=new.school_id and exists(select 1 from public.learner_guardians lg
      where lg.school_id=new.school_id and lg.learner_id=l.id and lg.guardian_id=new.id and lg.is_primary);
  return new;
end $$;
drop trigger if exists school_guardians_sync_contact on public.school_guardians;
create trigger school_guardians_sync_contact after update of full_name,phone,email,auth_user_id
  on public.school_guardians for each row execute function public.sync_guardian_contact_to_learner_links();

create or replace function public.search_school_guardians(p_school_id uuid,p_query text default '')
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'fullName',g.full_name,'phone',g.phone,'email',g.email,
    'linkedLearnerCount',(select count(*) from public.learner_guardians lg where lg.guardian_id=g.id and lg.school_id=p_school_id))
    order by g.full_name) from (select * from public.school_guardians where school_id=p_school_id
      and (nullif(trim(p_query),'') is null or full_name ilike '%'||trim(p_query)||'%'
        or coalesce(phone,'') ilike '%'||trim(p_query)||'%' or coalesce(email,'') ilike '%'||trim(p_query)||'%')
      order by full_name limit 30) g),'[]'::jsonb);
end $$;

create or replace function public.update_school_guardian_profile(
  p_school_id uuid,p_guardian_id uuid,p_full_name text,p_phone text,p_email text default null
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
  if not (public.is_school_admin_for(p_school_id) or exists(select 1 from public.school_guardians g
    where g.id=p_guardian_id and g.school_id=p_school_id and g.auth_user_id=auth.uid())) then
    raise exception 'GUARDIAN_PROFILE_PERMISSION_REQUIRED';
  end if;
  if length(trim(coalesce(p_full_name,'')))<2 or length(trim(coalesce(p_phone,'')))<5 then raise exception 'GUARDIAN_DETAILS_REQUIRED'; end if;
  update public.school_guardians set full_name=trim(p_full_name),phone=nullif(trim(p_phone),''),
    email=nullif(lower(trim(coalesce(p_email,''))),''),updated_at=now()
    where id=p_guardian_id and school_id=p_school_id returning id into v_id;
  if v_id is null then raise exception 'GUARDIAN_NOT_FOUND_IN_SCHOOL'; end if;
  return v_id;
end $$;

create or replace function public.get_learner_guardian_links(p_school_id uuid,p_learner_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.learners where id=p_learner_id and school_id=p_school_id) then raise exception 'LEARNER_NOT_FOUND_IN_SCHOOL'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('guardianId',g.id,'fullName',g.full_name,'phone',g.phone,'email',g.email,
    'relationship',lg.relationship,'isPrimary',lg.is_primary,'isEmergency',lg.is_emergency,
    'communicationPermissions',lg.communication_permissions) order by lg.is_primary desc,g.full_name)
    from public.learner_guardians lg join public.school_guardians g on g.id=lg.guardian_id and g.school_id=p_school_id
    where lg.school_id=p_school_id and lg.learner_id=p_learner_id),'[]'::jsonb);
end $$;

create or replace function public.link_school_guardian_to_learner(
  p_school_id uuid,p_learner_id uuid,p_guardian_id uuid default null,
  p_full_name text default null,p_phone text default null,p_email text default null,
  p_relationship text default 'Parent/Guardian',p_is_primary boolean default false,
  p_is_emergency boolean default false,
  p_communication_permissions jsonb default '{"academic":true,"administrative":true,"emergency":true}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_guardian uuid;v_actor uuid;v_role text;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.learners where id=p_learner_id and school_id=p_school_id) then raise exception 'LEARNER_NOT_FOUND_IN_SCHOOL'; end if;
  if jsonb_typeof(coalesce(p_communication_permissions,'{}'::jsonb))<>'object' then raise exception 'GUARDIAN_PERMISSIONS_INVALID'; end if;
  if p_guardian_id is null then
    if length(trim(coalesce(p_full_name,'')))<2 or length(trim(coalesce(p_phone,'')))<5 then raise exception 'GUARDIAN_DETAILS_REQUIRED'; end if;
    insert into public.school_guardians(school_id,full_name,phone,email,auth_user_id,created_by)
      values(p_school_id,trim(p_full_name),nullif(trim(p_phone),''),nullif(lower(trim(coalesce(p_email,''))),''),
        (select u.auth_user_id from public.users u join public.school_memberships m on m.user_id=u.id join public.roles r on r.id=m.role_id
          where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and r.code='PARENT_GUARDIAN'
            and lower(u.email)=lower(coalesce(p_email,'')) limit 1),public.current_app_user_id()) returning id into v_guardian;
  else
    select id into v_guardian from public.school_guardians where id=p_guardian_id and school_id=p_school_id for update;
    if v_guardian is null then raise exception 'GUARDIAN_NOT_FOUND_IN_SCHOOL'; end if;
  end if;
  if p_is_primary then update public.learner_guardians set is_primary=false where learner_id=p_learner_id and school_id=p_school_id; end if;
  insert into public.learner_guardians(school_id,learner_id,guardian_id,full_name,relationship,phone,email,auth_user_id,is_primary,is_emergency,communication_permissions)
    select p_school_id,p_learner_id,g.id,g.full_name,coalesce(nullif(trim(p_relationship),''),'Parent/Guardian'),g.phone,g.email,g.auth_user_id,
      p_is_primary,p_is_emergency,p_communication_permissions from public.school_guardians g where g.id=v_guardian and g.school_id=p_school_id
  on conflict(learner_id,guardian_id) where guardian_id is not null do update set
    relationship=excluded.relationship,is_primary=excluded.is_primary,is_emergency=excluded.is_emergency,
    communication_permissions=excluded.communication_permissions,updated_at=now();
  update public.learners l set
    guardian_name=(select lg.full_name from public.learner_guardians lg where lg.learner_id=l.id and lg.school_id=p_school_id order by lg.is_primary desc,lg.created_at limit 1),
    guardian_phone=(select lg.phone from public.learner_guardians lg where lg.learner_id=l.id and lg.school_id=p_school_id order by lg.is_primary desc,lg.created_at limit 1),
    updated_at=now() where l.id=p_learner_id and l.school_id=p_school_id;
  v_actor:=public.current_app_user_id();
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
    select v_actor,u.full_name,coalesce(v_role,'SCHOOL_ADMIN'),'LEARNER_GUARDIAN_LINK_UPDATED','learner_guardian',p_learner_id::text,
      jsonb_build_object('guardian_id',v_guardian,'relationship',p_relationship,'is_primary',p_is_primary,
        'is_emergency',p_is_emergency,'communication_permissions',p_communication_permissions)
    from public.users u where u.id=v_actor;
  return v_guardian;
end $$;

create or replace function public.get_guardian_linked_learners(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('guardianId',g.id,'guardianName',g.full_name,
    'phone',g.phone,'email',g.email,'relationship',lg.relationship,'isPrimary',lg.is_primary,
    'isEmergency',lg.is_emergency,'communicationPermissions',lg.communication_permissions,
    'learnerId',l.id,'learnerName',concat_ws(' ',l.first_name,l.other_name,l.last_name),
    'admissionNumber',l.admission_number,'photoPath',l.profile_photo_path,'className',c.class_name,'streamName',st.stream_name)
    order by l.last_name,l.first_name) from public.school_guardians g
    join public.learner_guardians lg on lg.guardian_id=g.id and lg.school_id=p_school_id
    join public.learners l on l.id=lg.learner_id and l.school_id=p_school_id
    left join lateral(select e.* from public.learner_class_enrolments e where e.learner_id=l.id and e.school_id=p_school_id
      and e.status='ACTIVE' and e.effective_to is null order by e.effective_from desc limit 1)e on true
    left join public.academic_classes c on c.id=e.class_id and c.school_id=p_school_id
    left join public.class_streams st on st.id=e.stream_id and st.school_id=p_school_id
    where g.school_id=p_school_id and g.auth_user_id=auth.uid()),'[]'::jsonb);
end $$;

-- Conversion is wrapped atomically: guardian creation/linking and learner
-- conversion succeed or fail together. A guardian match is explicit and scoped.
create or replace function public.admit_school_applicant_as_learner_with_guardian(
  p_school_id uuid,p_application_id uuid,p_class_id uuid,p_stream_id uuid,p_admission_date date,
  p_religion_offering_ids uuid[] default '{}',p_elective_offering_ids uuid[] default '{}',
  p_a_level_combination_id uuid default null,p_existing_learner_id uuid default null,
  p_guardian_id uuid default null,p_guardian_name text default null,p_guardian_phone text default null,
  p_guardian_email text default null,p_relationship text default 'Parent/Guardian',
  p_is_primary boolean default true,p_is_emergency boolean default true,
  p_communication_permissions jsonb default '{"academic":true,"administrative":true,"emergency":true}'::jsonb
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_learner uuid;v_guardian uuid;v_app public.admission_applications%rowtype;v_actor uuid;
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  if jsonb_typeof(coalesce(p_communication_permissions,'{}'::jsonb))<>'object' then raise exception 'GUARDIAN_PERMISSIONS_INVALID'; end if;
  if p_guardian_id is null and (length(trim(coalesce(p_guardian_name,'')))<2 or length(trim(coalesce(p_guardian_phone,'')))<5) then raise exception 'GUARDIAN_DETAILS_REQUIRED'; end if;
  select * into v_app from public.admission_applications where id=p_application_id and school_id=p_school_id for update;
  if v_app.id is null then raise exception 'APPLICATION_NOT_FOUND_IN_SCHOOL'; end if;
  v_actor:=public.current_app_user_id();
  if p_guardian_id is not null then
    select id into v_guardian from public.school_guardians where id=p_guardian_id and school_id=p_school_id for update;
    if v_guardian is null then raise exception 'GUARDIAN_NOT_FOUND_IN_SCHOOL'; end if;
  else
    insert into public.school_guardians(school_id,full_name,phone,email,auth_user_id,created_by)
      values(p_school_id,trim(p_guardian_name),nullif(trim(p_guardian_phone),''),nullif(lower(trim(coalesce(p_guardian_email,''))),''),
       (select u.auth_user_id from public.users u join public.school_memberships m on m.user_id=u.id
        join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE'
        and u.is_active and r.code='PARENT_GUARDIAN' and lower(u.email)=lower(coalesce(p_guardian_email,'')) limit 1),v_actor)
      returning id into v_guardian;
  end if;
  v_learner:=public.admit_school_applicant_as_learner(p_school_id,p_application_id,p_class_id,p_stream_id,p_admission_date,
    p_religion_offering_ids,p_elective_offering_ids,p_a_level_combination_id,p_existing_learner_id);
  if p_is_primary then update public.learner_guardians set is_primary=false where learner_id=v_learner and school_id=p_school_id; end if;
  update public.learner_guardians set guardian_id=v_guardian,full_name=g.full_name,phone=g.phone,email=g.email,
    auth_user_id=g.auth_user_id,relationship=coalesce(nullif(trim(p_relationship),''),'Parent/Guardian'),
    is_primary=p_is_primary,is_emergency=p_is_emergency,communication_permissions=p_communication_permissions,updated_at=now()
  from public.school_guardians g where g.id=v_guardian and g.school_id=p_school_id
    and learner_guardians.learner_id=v_learner and learner_guardians.school_id=p_school_id
    and learner_guardians.id=(select candidate.id from public.learner_guardians candidate
      where candidate.learner_id=v_learner and candidate.school_id=p_school_id
        and (candidate.guardian_id=v_guardian or candidate.phone is not distinct from nullif(trim(coalesce(v_app.guardian_details->>'phone','')),''))
      order by (candidate.guardian_id=v_guardian) desc,candidate.is_primary desc limit 1);
  if not exists(select 1 from public.learner_guardians where learner_id=v_learner and school_id=p_school_id and guardian_id=v_guardian) then
    insert into public.learner_guardians(school_id,learner_id,guardian_id,full_name,relationship,phone,email,auth_user_id,is_primary,is_emergency,communication_permissions)
      select p_school_id,v_learner,g.id,g.full_name,coalesce(nullif(trim(p_relationship),''),'Parent/Guardian'),g.phone,g.email,g.auth_user_id,
        p_is_primary,p_is_emergency,p_communication_permissions from public.school_guardians g where g.id=v_guardian and g.school_id=p_school_id;
  end if;
  update public.learners l set
    guardian_name=(select lg.full_name from public.learner_guardians lg where lg.learner_id=l.id and lg.school_id=p_school_id order by lg.is_primary desc,lg.created_at limit 1),
    guardian_phone=(select lg.phone from public.learner_guardians lg where lg.learner_id=l.id and lg.school_id=p_school_id order by lg.is_primary desc,lg.created_at limit 1),
    updated_at=now() where l.id=v_learner and l.school_id=p_school_id;
  return v_learner;
end $$;

-- Keep the curriculum requirement group configurable. Existing NCDC rules stay
-- one-of-CRE/IRE, while a future approved rule-set may set a different range.
alter table public.o_level_curriculum_rule_sets add column if not exists religion_min_s1_s2 integer not null default 1;
alter table public.o_level_curriculum_rule_sets add column if not exists religion_max_s1_s2 integer not null default 1;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='o_level_religion_group_range_check') then
    alter table public.o_level_curriculum_rule_sets add constraint o_level_religion_group_range_check
      check(religion_min_s1_s2>=0 and religion_max_s1_s2>=religion_min_s1_s2);
  end if;
end $$;

do $$ declare v_def text; begin
  v_def:=pg_get_functiondef('public.get_school_admissions_workspace(uuid)'::regprocedure);
  if position('religionMin' in v_def)=0 then
    v_def:=replace(v_def,
      '''electiveMax'',(select case when c.level<=2 then rules.elective_max_s1_s2 else rules.elective_max_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),',
      '''electiveMax'',(select case when c.level<=2 then rules.elective_max_s1_s2 else rules.elective_max_s3_s4 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),
        ''religionMin'',(select case when c.level<=2 then rules.religion_min_s1_s2 else 0 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),
        ''religionMax'',(select case when c.level<=2 then rules.religion_max_s1_s2 else 0 end from public.o_level_curriculum_rule_sets rules where rules.id=c.o_level_rule_set_id),');
    if position('religionMin' in v_def)=0 then raise exception 'Could not add Religious Education group range to admissions workspace'; end if;
  end if;
  if position('''streamId'',co.stream_id' in v_def)=0 then
    v_def:=replace(v_def,'''id'',co.id,''name'',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code)',
      '''id'',co.id,''streamId'',co.stream_id,''name'',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code)');
    if position('''streamId'',co.stream_id' in v_def)=0 then raise exception 'Could not add stream scope to admissions class offerings'; end if;
  end if;
  execute v_def;
end $$;

do $$ declare v_def text; begin
  v_def:=pg_get_functiondef('public.get_o_level_learner_subject_choices(uuid)'::regprocedure);
  if position('religionMin' in v_def)=0 then
    v_def:=replace(v_def,
      '''electiveMax'',case when v_class.level<=2 then v_rules.elective_max_s1_s2 else v_rules.elective_max_s3_s4 end,',
      '''electiveMax'',case when v_class.level<=2 then v_rules.elective_max_s1_s2 else v_rules.elective_max_s3_s4 end,
    ''religionMin'',case when v_class.level<=2 then v_rules.religion_min_s1_s2 else 0 end,
    ''religionMax'',case when v_class.level<=2 then v_rules.religion_max_s1_s2 else 0 end,');
    if position('religionMin' in v_def)=0 then raise exception 'Could not add curriculum Religious Education range to learner-subject RPC'; end if;
    execute v_def;
  end if;
end $$;

do $$ declare v_def text; v_old text; v_new text; begin
  v_def:=pg_get_functiondef('public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[],text)'::regprocedure);
  v_old:='if v_class.level<=2 and v_religion_count<>1 and not (v_religion_count=2 and exists(select 1 from public.o_level_curriculum_exceptions where learner_id=v_enrolment.learner_id and academic_year_id=v_enrolment.academic_year_id and exception_code=''DUAL_RELIGION'' and is_active)) then raise exception ''SELECT_EXACTLY_ONE_RELIGIOUS_EDUCATION_OPTION''; end if;';
  v_new:='if v_class.level<=2 and (v_religion_count<v_rules.religion_min_s1_s2 or v_religion_count>v_rules.religion_max_s1_s2) then raise exception ''RELIGIOUS_EDUCATION_GROUP_SELECTION_LIMIT: choose between % and %'',v_rules.religion_min_s1_s2,v_rules.religion_max_s1_s2; end if;';
  if position(v_new in v_def)=0 then
    v_def:=replace(v_def,v_old,v_new);
    if position(v_new in v_def)=0 then raise exception 'Could not replace hard-coded Religious Education exception in learner-subject validator'; end if;
    execute v_def;
  end if;
end $$;

revoke all on function public.search_school_guardians(uuid,text),public.update_school_guardian_profile(uuid,uuid,text,text,text),
  public.get_learner_guardian_links(uuid,uuid),public.link_school_guardian_to_learner(uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb),
  public.get_guardian_linked_learners(uuid),public.admit_school_applicant_as_learner_with_guardian(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb)
  from public,anon;
revoke all on function public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.search_school_guardians(uuid,text),public.update_school_guardian_profile(uuid,uuid,text,text,text),
  public.get_learner_guardian_links(uuid,uuid),public.link_school_guardian_to_learner(uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb),
  public.get_guardian_linked_learners(uuid),public.admit_school_applicant_as_learner_with_guardian(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid,uuid,text,text,text,text,boolean,boolean,jsonb)
  to authenticated;
notify pgrst,'reload schema';
commit;
