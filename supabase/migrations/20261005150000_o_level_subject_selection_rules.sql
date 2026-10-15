-- Extend the existing O-Level curriculum and learner-subject system. Classes stay
-- pinned to their rule-set version; replacing a rule set never rewrites old classes.
alter table public.o_level_curriculum_rule_sets
  add column if not exists curriculum_version text not null default '2026.1',
  add column if not exists academic_year_id uuid references public.academic_years(id) on delete restrict,
  add column if not exists effective_from date not null default current_date,
  add column if not exists effective_to date,
  add column if not exists configured_by uuid references public.platform_admins(id) on delete restrict,
  add column if not exists change_reason text;

alter table public.o_level_curriculum_rule_sets
  drop constraint if exists o_level_curriculum_rule_sets_effective_dates_check;
alter table public.o_level_curriculum_rule_sets
  add constraint o_level_curriculum_rule_sets_effective_dates_check
  check (effective_to is null or effective_to >= effective_from);

drop index if exists public.one_active_o_level_rule_set;
create unique index if not exists one_active_global_o_level_rule_set
  on public.o_level_curriculum_rule_sets(status)
  where status='ACTIVE' and academic_year_id is null;
create unique index if not exists one_active_year_o_level_rule_set
  on public.o_level_curriculum_rule_sets(academic_year_id)
  where status='ACTIVE' and academic_year_id is not null;
create index if not exists o_level_rule_set_year_effective_idx
  on public.o_level_curriculum_rule_sets(academic_year_id,effective_from desc)
  where status='ACTIVE';

alter table public.learner_subject_enrolments
  add column if not exists selected_by uuid references public.users(id) on delete set null,
  add column if not exists changed_reason text;

-- Replace the all-time uniqueness key with one active row while retaining every
-- dropped/completed selection as history. These partial-key semantics are used by
-- the updated enrollment trigger and selection RPC below.
alter table public.learner_subject_enrolments
  drop constraint if exists learner_subject_scope_key;
create unique index if not exists learner_subject_one_active_offering
  on public.learner_subject_enrolments(enrolment_id,class_subject_offering_id)
  where status='ACTIVE';
create index if not exists learner_subject_history_idx
  on public.learner_subject_enrolments(school_id,learner_id,enrolment_id,effective_from desc);

-- Backfill the selection type of records created before the curriculum metadata
-- was connected. No marks, reports, or selection rows are deleted.
update public.learner_subject_enrolments ls
set selection_type = case
  when r.requirement='CORE' then 'REQUIRED'
  when r.requirement='SNE_REPLACEMENT' then 'SNE_REPLACEMENT'
  when r.requirement='RELIGION_OPTION' then 'RELIGION_REQUIRED'
  else 'ELECTIVE'
end
from public.learner_class_enrolments e
join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id
join public.class_subject_offerings co on co.class_id=c.id
join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.school_id=co.school_id
join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id
  and r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level
where ls.enrolment_id=e.id and c.programme='O_LEVEL'
  and co.id=ls.class_subject_offering_id and ls.selection_type='ELECTIVE';

-- Existing active learners receive any already-offered compulsory subjects. This
-- is idempotent and intentionally does not activate optional subjects or alter marks.
insert into public.learner_subject_enrolments(
  school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by
)
select e.school_id,e.learner_id,e.id,co.id,'ACTIVE',e.effective_from,'REQUIRED',null
from public.learner_class_enrolments e
join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id and c.programme='O_LEVEL'
join public.class_subject_offerings co on co.class_id=c.id and co.school_id=c.school_id
  and co.academic_year_id=e.academic_year_id and co.status='ACTIVE'
  and (co.stream_id is null or co.stream_id=e.stream_id)
join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  and so.school_id=co.school_id and so.status='ACTIVE'
join public.o_level_curriculum_subject_rules r on r.rule_set_id=c.o_level_rule_set_id
  and r.class_level=c.level and r.system_subject_id=so.system_subject_id
  and r.requirement='CORE' and r.is_active
where e.status='ACTIVE' and e.effective_to is null
  and not (so.school_subject_code in ('535','553','545') and exists(
    select 1 from public.o_level_curriculum_exceptions x where x.learner_id=e.learner_id
      and x.academic_year_id=e.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active
  ))
on conflict (enrolment_id,class_subject_offering_id) where status='ACTIVE' do nothing;

-- Platform-controlled, versioned configuration. New rules apply to future classes
-- for the selected year; existing classes remain linked to their original version.
create or replace function public.create_o_level_curriculum_version(
  p_code text,p_label text,p_curriculum_version text,p_academic_year_id uuid,
  p_effective_from date,p_elective_min_s1_s2 integer,p_elective_max_s1_s2 integer,
  p_elective_min_s3_s4 integer,p_elective_max_s3_s4 integer,p_reason text
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor uuid;v_base uuid;v_id uuid;v_school uuid;v_previous jsonb;
begin
  select id into v_actor from public.platform_admins
   where auth_user_id=auth.uid() and is_active;
  if v_actor is null or not public.is_active_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if nullif(trim(p_code),'') is null or nullif(trim(p_label),'') is null
     or nullif(trim(p_curriculum_version),'') is null then raise exception 'CURRICULUM_VERSION_DETAILS_REQUIRED'; end if;
  if p_effective_from is null or p_effective_from < current_date then raise exception 'EFFECTIVE_DATE_MUST_NOT_BE_IN_THE_PAST'; end if;
  if nullif(trim(p_reason),'') is null or length(trim(p_reason))<12 then raise exception 'CURRICULUM_CHANGE_REASON_REQUIRED'; end if;
  if p_elective_min_s1_s2 is null or p_elective_max_s1_s2 is null or p_elective_min_s3_s4 is null or p_elective_max_s3_s4 is null
     or p_elective_min_s1_s2<0 or p_elective_max_s1_s2<p_elective_min_s1_s2 or p_elective_max_s1_s2>6
     or p_elective_min_s3_s4<0 or p_elective_max_s3_s4<p_elective_min_s3_s4 or p_elective_max_s3_s4>6
  then raise exception 'INVALID_ELECTIVE_LIMITS'; end if;
  if p_academic_year_id is not null then
    select school_id into v_school from public.academic_years where id=p_academic_year_id;
    if v_school is null then raise exception 'ACADEMIC_YEAR_NOT_FOUND'; end if;
  end if;
  select id into v_base from public.o_level_curriculum_rule_sets
   where status='ACTIVE' and academic_year_id is not distinct from p_academic_year_id
   order by effective_from desc limit 1 for update;
  if v_base is null and p_academic_year_id is not null then
    select id into v_base from public.o_level_curriculum_rule_sets
     where status='ACTIVE' and academic_year_id is null order by effective_from desc limit 1 for update;
  end if;
  if v_base is null then raise exception 'ACTIVE_BASE_CURRICULUM_NOT_FOUND'; end if;
  if exists(select 1 from public.o_level_curriculum_rule_sets where id=v_base and p_effective_from<=effective_from) then
    raise exception 'NEW_VERSION_MUST_START_AFTER_BASE_VERSION';
  end if;
  select to_jsonb(r) into v_previous from public.o_level_curriculum_rule_sets r where id=v_base;
  update public.o_level_curriculum_rule_sets set status='RETIRED',effective_to=p_effective_from-1
   where status='ACTIVE' and academic_year_id is not distinct from p_academic_year_id;
  insert into public.o_level_curriculum_rule_sets(
    code,label,status,elective_min_s1_s2,elective_max_s1_s2,elective_min_s3_s4,elective_max_s3_s4,
    activated_at,curriculum_version,academic_year_id,effective_from,configured_by,change_reason
  ) values(
    trim(p_code),trim(p_label),'ACTIVE',p_elective_min_s1_s2,p_elective_max_s1_s2,
    p_elective_min_s3_s4,p_elective_max_s3_s4,now(),trim(p_curriculum_version),p_academic_year_id,
    p_effective_from,v_actor,trim(p_reason)
  ) returning id into v_id;
  insert into public.o_level_curriculum_subject_rules(rule_set_id,class_level,system_subject_id,requirement,elective_category,is_active)
   select v_id,class_level,system_subject_id,requirement,elective_category,is_active
   from public.o_level_curriculum_subject_rules where rule_set_id=v_base;
  insert into public.platform_audit_logs(platform_admin_id,school_id,action,target_type,target_id,previous_state,new_state,reason)
  values(v_actor,v_school,'O_LEVEL_CURRICULUM_VERSION_CREATED','o_level_curriculum_rule_set',v_id::text,v_previous,
    jsonb_build_object('code',trim(p_code),'version',trim(p_curriculum_version),'academic_year_id',p_academic_year_id,
      'effective_from',p_effective_from,'elective_min_s1_s2',p_elective_min_s1_s2,'elective_max_s1_s2',p_elective_max_s1_s2,
      'elective_min_s3_s4',p_elective_min_s3_s4,'elective_max_s3_s4',p_elective_max_s3_s4),trim(p_reason));
  return v_id;
end $$;
revoke all on function public.create_o_level_curriculum_version(text,text,text,uuid,date,integer,integer,integer,integer,text) from public,anon;
grant execute on function public.create_o_level_curriculum_version(text,text,text,uuid,date,integer,integer,integer,integer,text) to authenticated;

create or replace function public.get_o_level_curriculum(
  p_school_id uuid,p_academic_year_id uuid,p_class_level integer,p_term_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rule_set public.o_level_curriculum_rule_sets%rowtype;
begin
  if not (public.is_active_school_member(p_school_id) or public.is_active_platform_admin()) then raise exception 'School membership required'; end if;
  if p_class_level not between 1 and 4 then raise exception 'Select Senior 1 to Senior 4'; end if;
  if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'Invalid academic year'; end if;
  select * into v_rule_set from public.o_level_curriculum_rule_sets
   where status='ACTIVE' and (academic_year_id=p_academic_year_id or academic_year_id is null)
   order by (academic_year_id=p_academic_year_id) desc nulls last,effective_from desc limit 1;
  if v_rule_set.id is null then raise exception 'ACTIVE_O_LEVEL_CURRICULUM_NOT_FOUND'; end if;
  return jsonb_build_object(
    'ruleSetId',v_rule_set.id,'curriculumVersion',v_rule_set.curriculum_version,
    'classLevel',p_class_level,'requiredCount',case when p_class_level<=2 then 11 else 7 end,
    'electiveMin',case when p_class_level<=2 then v_rule_set.elective_min_s1_s2 else v_rule_set.elective_min_s3_s4 end,
    'electiveMax',case when p_class_level<=2 then v_rule_set.elective_max_s1_s2 else v_rule_set.elective_max_s3_s4 end,
    'subjects',coalesce((select jsonb_agg(jsonb_build_object(
      'systemSubjectId',ss.id,'code',ss.subject_code,'name',ss.subject_name,
      'requirement',r.requirement,'category',r.elective_category,'offeringId',so.id,
      'available',so.status='ACTIVE',
      'teacherAssigned',case when p_term_id is null then false else exists(
        select 1 from public.class_subject_offerings co join public.teacher_allocations ta on ta.class_subject_offering_id=co.id
        where co.school_subject_offering_id=so.id and ta.term_id=p_term_id and ta.status='ACTIVE'
          and ta.allocation_role='PRIMARY_SUBJECT_TEACHER') end
    ) order by case r.requirement when 'CORE' then 0 when 'RELIGION_OPTION' then 1 when 'ELECTIVE' then 2 else 3 end,ss.subject_name)
    from public.o_level_curriculum_subject_rules r join public.system_subjects ss on ss.id=r.system_subject_id
    left join public.school_subject_offerings so on so.school_id=p_school_id and so.academic_year_id=p_academic_year_id and so.system_subject_id=ss.id and so.status='ACTIVE'
    where r.rule_set_id=v_rule_set.id and r.class_level=p_class_level and r.is_active),'[]'::jsonb)
  );
end $$;

create or replace function public.sync_o_level_class_curriculum(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_actor uuid;v_count integer;v_rule_set_id uuid;
begin
  select * into v_class from public.academic_classes where id=p_class_id for update;
  if v_class.id is null or v_class.programme<>'O_LEVEL' or not public.is_school_admin_for(v_class.school_id) then raise exception 'School Administrator and O-Level class required'; end if;
  v_actor:=public.current_app_user_id();
  if v_class.o_level_rule_set_id is null then
    select id into v_rule_set_id from public.o_level_curriculum_rule_sets
     where status='ACTIVE' and (academic_year_id=v_class.academic_year_id or academic_year_id is null)
     order by (academic_year_id=v_class.academic_year_id) desc nulls last,effective_from desc limit 1;
    if v_rule_set_id is null then raise exception 'ACTIVE_O_LEVEL_CURRICULUM_NOT_FOUND'; end if;
    update public.academic_classes set o_level_rule_set_id=v_rule_set_id where id=p_class_id;
    v_class.o_level_rule_set_id:=v_rule_set_id;
  end if;
  with connected as (
    insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by,curriculum_source)
    select v_class.school_id,so.id,v_class.academic_year_id,v_class.id,true,'ACTIVE',v_actor,v_actor,'REQUIRED_CURRICULUM'
    from public.o_level_curriculum_subject_rules r join public.school_subject_offerings so
      on so.system_subject_id=r.system_subject_id and so.school_id=v_class.school_id and so.academic_year_id=v_class.academic_year_id and so.status='ACTIVE'
    where r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement in ('CORE','RELIGION_OPTION') and r.is_active
    on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=true,curriculum_source='REQUIRED_CURRICULUM',updated_by=v_actor,updated_at=now()
    returning id
  ) select count(*) into v_count from connected;
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
  select e.school_id,e.learner_id,e.id,co.id,'ACTIVE',e.effective_from,'REQUIRED',v_actor
  from public.learner_class_enrolments e join public.class_subject_offerings co on co.class_id=e.class_id and co.status='ACTIVE'
    and (co.stream_id is null or co.stream_id=e.stream_id)
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
  join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id
    and r.class_level=v_class.level and r.requirement='CORE' and r.is_active
  where e.class_id=p_class_id and e.status='ACTIVE' and e.effective_to is null
    and not (so.school_subject_code in ('535','553','545') and exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=e.learner_id and x.academic_year_id=e.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active))
  on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update
    set selection_type='REQUIRED',selected_by=excluded.selected_by;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_ADMIN','O_LEVEL_REQUIRED_SUBJECTS_SYNCED','academic_class',p_class_id::text,jsonb_build_object('rule_set_id',v_class.o_level_rule_set_id,'offerings_processed',v_count));
  return jsonb_build_object('offeringsProcessed',v_count,'ruleSetId',v_class.o_level_rule_set_id);
end $$;

create or replace function public.assign_o_level_required_on_enrolment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_religion_count integer;v_actor uuid;
begin
  if new.status<>'ACTIVE' then return new; end if;
  select * into v_class from public.academic_classes where id=new.class_id;
  if v_class.programme<>'O_LEVEL' then return new; end if;
  v_actor:=public.current_app_user_id();
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
  select new.school_id,new.learner_id,new.id,co.id,'ACTIVE',new.effective_from,'REQUIRED',v_actor
  from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
  join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='CORE' and r.is_active
  where co.class_id=new.class_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=new.stream_id)
    and not (so.school_subject_code in ('535','553','545') and exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=new.learner_id and x.academic_year_id=new.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active))
  on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update set selection_type='REQUIRED',selected_by=excluded.selected_by;
  if v_class.level<=2 then
    select count(*) into v_religion_count from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
    join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='RELIGION_OPTION' and r.is_active
    where co.class_id=new.class_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=new.stream_id);
    if v_religion_count=1 then
      insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
      select new.school_id,new.learner_id,new.id,co.id,'ACTIVE',new.effective_from,'RELIGION_REQUIRED',v_actor
      from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
      join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='RELIGION_OPTION' and r.is_active
      where co.class_id=new.class_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=new.stream_id)
      on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update set selection_type='RELIGION_REQUIRED',selected_by=excluded.selected_by;
    end if;
  end if;
  if exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=new.learner_id and x.academic_year_id=new.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) then
    perform public.apply_o_level_sne_replacement(new.id);
  end if;
  return new;
end $$;

-- Keep the restricted SNE helper compatible with the new active-only index.
-- Historical selections stay as rows; a new active replacement is inserted when needed.
create or replace function public.apply_o_level_sne_replacement(p_enrolment_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_actor uuid;
 v_subject_id uuid;v_school_offering_id uuid;v_class_offering_id uuid;
begin
 select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id for update;
 if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null then raise exception 'Active learner placement required for SNE substitution'; end if;
 select * into v_class from public.academic_classes where id=v_enrolment.class_id;
 if v_class.programme<>'O_LEVEL' or v_class.level not in (3,4) then raise exception 'SNE General Science replacement is available only in Senior 3 and Senior 4'; end if;
 if not exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) then raise exception 'Approved platform SNE exception required'; end if;
 select id into v_subject_id from public.system_subjects where programme='O_LEVEL' and subject_code='500' and is_active;
 select id into v_school_offering_id from public.school_subject_offerings where school_id=v_enrolment.school_id and academic_year_id=v_enrolment.academic_year_id and system_subject_id=v_subject_id and status='ACTIVE';
 if v_subject_id is null or v_school_offering_id is null then raise exception 'Activate General Science (catalogue code 500) for this academic year before approving the replacement'; end if;
 v_actor:=public.current_app_user_id();
 insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by,curriculum_source)
 values(v_enrolment.school_id,v_school_offering_id,v_enrolment.academic_year_id,v_class.id,true,'ACTIVE',v_actor,v_actor,'SNE_REPLACEMENT')
 on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=true,curriculum_source='SNE_REPLACEMENT',updated_by=excluded.updated_by,updated_at=now()
 returning id into v_class_offering_id;
 update public.learner_subject_enrolments ls set status='DROPPED',effective_to=greatest(ls.effective_from,current_date)
 from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
 where ls.enrolment_id=v_enrolment.id and ls.class_subject_offering_id=co.id and co.class_id=v_class.id and so.school_subject_code in ('535','553','545') and ls.status='ACTIVE' and ls.selection_type='REQUIRED';
 insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by)
 values(v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,v_class_offering_id,'ACTIVE',v_enrolment.effective_from,'SNE_REPLACEMENT',v_actor)
 on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update set selection_type='SNE_REPLACEMENT',selected_by=excluded.selected_by,updated_at=now();
 return v_class_offering_id;
end $$;
revoke all on function public.apply_o_level_sne_replacement(uuid) from public,anon,authenticated;

drop function if exists public.get_o_level_learner_subject_choices(uuid);
create function public.get_o_level_learner_subject_choices(p_enrolment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_sne boolean;v_rules public.o_level_curriculum_rule_sets%rowtype;
begin
  select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id;
  if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null or not public.is_active_school_member(v_enrolment.school_id) then raise exception 'Learner enrolment unavailable'; end if;
  select * into v_class from public.academic_classes where id=v_enrolment.class_id and school_id=v_enrolment.school_id;
  if v_class.id is null or v_class.programme<>'O_LEVEL' then raise exception 'O-Level learner required'; end if;
  select * into v_rules from public.o_level_curriculum_rule_sets where id=v_class.o_level_rule_set_id;
  if v_rules.id is null then raise exception 'CLASS_CURRICULUM_NOT_CONFIGURED'; end if;
  select exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) into v_sne;
  return jsonb_build_object(
    'classLevel',v_class.level,'className',v_class.class_name,'streamName',(select stream_name from public.class_streams where id=v_enrolment.stream_id),
    'academicYearId',v_enrolment.academic_year_id,'academicYearName',(select name from public.academic_years where id=v_enrolment.academic_year_id),
    'curriculumVersion',v_rules.curriculum_version,'learnerId',v_enrolment.learner_id,'enrolmentId',v_enrolment.id,
    'requiredCount',case when v_class.level<=2 then 11 when v_sne then 5 else 7 end,'sneReplacement',v_sne,
    'electiveMin',case when v_class.level<=2 then v_rules.elective_min_s1_s2 else v_rules.elective_min_s3_s4 end,
    'electiveMax',case when v_class.level<=2 then v_rules.elective_max_s1_s2 else v_rules.elective_max_s3_s4 end,
    'subjects',coalesce((select jsonb_agg(jsonb_build_object(
      'offeringId',co.id,'schoolOfferingId',so.id,'systemSubjectId',ss.id,
      'schoolActive',so.status='ACTIVE','classOffered',co.id is not null and co.status='ACTIVE',
      'code',coalesce(so.school_subject_code,ss.subject_code),'name',coalesce(so.display_name_override,ss.subject_name),
      'requirement',r.requirement,'category',r.elective_category,
      'available',co.id is not null and co.status='ACTIVE' and so.status='ACTIVE' and ss.is_active,
      'availabilityReason',case
        when not ss.is_active then 'This subject is inactive in the platform catalogue.'
        when so.id is null then 'This subject is not active for this school year.'
        when so.status<>'ACTIVE' then 'This subject is inactive for this school year.'
        when co.id is null and exists(select 1 from public.class_subject_offerings other_co where other_co.class_id=v_class.id and other_co.school_subject_offering_id=so.id and other_co.stream_id is not null and other_co.stream_id<>v_enrolment.stream_id) then 'This subject is offered to a different stream.'
        when co.id is null then 'This subject has not been offered to this class or stream.'
        when co.status<>'ACTIVE' then 'This class offering is inactive.'
        else null end,
      'selected',ls.id is not null,'selectionType',ls.selection_type,
      'hasHistory',exists(select 1 from public.academic_mark_records mr where mr.learner_id=v_enrolment.learner_id and mr.class_subject_offering_id=co.id)
        or exists(select 1 from public.assessment_subject_papers asp join public.academic_assessments aa on aa.id=asp.assessment_id
          where asp.school_subject_offering_id=so.id and aa.school_id=v_enrolment.school_id and aa.academic_year_id=v_enrolment.academic_year_id)
        or exists(select 1 from public.report_snapshots rs join public.report_subject_results rr on rr.report_snapshot_id=rs.id where rs.learner_id=v_enrolment.learner_id and rs.academic_year_id=v_enrolment.academic_year_id and rr.subject_id=ss.id)
    ) order by case r.requirement when 'CORE' then 0 when 'SNE_REPLACEMENT' then 0 when 'RELIGION_OPTION' then 1 else 2 end,ss.subject_name)
    from public.o_level_curriculum_subject_rules r join public.system_subjects ss on ss.id=r.system_subject_id
    left join lateral (select candidate.* from public.school_subject_offerings candidate
      where candidate.school_id=v_enrolment.school_id and candidate.academic_year_id=v_enrolment.academic_year_id and candidate.system_subject_id=ss.id
      order by (candidate.status='ACTIVE') desc,candidate.updated_at desc limit 1) so on true
    left join lateral (select candidate.* from public.class_subject_offerings candidate
      where candidate.class_id=v_class.id and candidate.school_id=v_enrolment.school_id and candidate.academic_year_id=v_enrolment.academic_year_id
        and candidate.school_subject_offering_id=so.id and (candidate.stream_id is null or candidate.stream_id=v_enrolment.stream_id)
      order by (candidate.stream_id=v_enrolment.stream_id) desc nulls last,(candidate.status='ACTIVE') desc limit 1) co on true
    left join public.learner_subject_enrolments ls on ls.enrolment_id=v_enrolment.id and ls.class_subject_offering_id=co.id and ls.status='ACTIVE'
    where r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement in ('CORE','SNE_REPLACEMENT','RELIGION_OPTION','ELECTIVE')
      and ((r.requirement<>'SNE_REPLACEMENT' and r.is_active) or (r.requirement='SNE_REPLACEMENT' and r.is_active and v_sne))
      and not (v_sne and r.requirement='CORE' and ss.subject_code in ('535','553','545'))),'[]'::jsonb)
  );
end $$;

drop function if exists public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[]);
create function public.set_o_level_learner_subject_choices(
  p_enrolment_id uuid,p_religion_offering_ids uuid[],p_elective_offering_ids uuid[],p_change_reason text default null
) returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_actor uuid;v_role text;v_rules public.o_level_curriculum_rule_sets%rowtype;
  v_elective_count integer;v_religion_count integer;v_valid_electives integer;v_valid_religion integer;v_required_actual integer;v_required_expected integer;
  v_elective_min integer;v_elective_max integer;v_offering_id uuid;v_sne boolean;v_has_history boolean;v_old jsonb;
begin
  select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id for update;
  if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null then raise exception 'ACTIVE_LEARNER_ENROLMENT_REQUIRED'; end if;
  select r.code into v_role from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where m.school_id=v_enrolment.school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid() and u.is_active limit 1;
  if coalesce(v_role,'') not in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES') then raise exception 'ACADEMIC_LEADERSHIP_PERMISSION_REQUIRED'; end if;
  select * into v_class from public.academic_classes where id=v_enrolment.class_id and school_id=v_enrolment.school_id and status='ACTIVE';
  if v_class.id is null or v_class.programme<>'O_LEVEL' then raise exception 'ACTIVE_O_LEVEL_CLASS_REQUIRED'; end if;
  select * into v_rules from public.o_level_curriculum_rule_sets where id=v_class.o_level_rule_set_id;
  if v_rules.id is null then raise exception 'CLASS_CURRICULUM_NOT_CONFIGURED'; end if;
  v_actor:=public.current_app_user_id();
  select exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) into v_sne;
  v_elective_min:=case when v_class.level<=2 then v_rules.elective_min_s1_s2 else v_rules.elective_min_s3_s4 end;
  v_elective_max:=case when v_class.level<=2 then v_rules.elective_max_s1_s2 else v_rules.elective_max_s3_s4 end;
  if cardinality(coalesce(p_elective_offering_ids,'{}'::uuid[]))<>(select count(distinct x) from unnest(coalesce(p_elective_offering_ids,'{}'::uuid[])) x)
     or cardinality(coalesce(p_religion_offering_ids,'{}'::uuid[]))<>(select count(distinct x) from unnest(coalesce(p_religion_offering_ids,'{}'::uuid[])) x) then raise exception 'DUPLICATE_SUBJECT_SELECTION'; end if;
  select count(distinct x) into v_elective_count from unnest(coalesce(p_elective_offering_ids,'{}'::uuid[])) x;
  select count(distinct x) into v_religion_count from unnest(coalesce(p_religion_offering_ids,'{}'::uuid[])) x;
  if v_elective_count<v_elective_min or v_elective_count>v_elective_max then raise exception 'ELECTIVE_SELECTION_LIMIT: choose between % and % for Senior %',v_elective_min,v_elective_max,v_class.level; end if;
  if v_class.level<=2 and v_religion_count<>1 and not (v_religion_count=2 and exists(select 1 from public.o_level_curriculum_exceptions where learner_id=v_enrolment.learner_id and academic_year_id=v_enrolment.academic_year_id and exception_code='DUAL_RELIGION' and is_active)) then raise exception 'SELECT_EXACTLY_ONE_RELIGIOUS_EDUCATION_OPTION'; end if;
  if v_class.level>=3 and v_religion_count<>0 then raise exception 'RELIGIOUS_EDUCATION_IS_AN_ELECTIVE_IN_SENIOR_3_4'; end if;
  select count(distinct co.id) into v_valid_electives from unnest(coalesce(p_elective_offering_ids,'{}'::uuid[])) x
   join public.class_subject_offerings co on co.id=x and co.class_id=v_class.id and co.school_id=v_enrolment.school_id and co.academic_year_id=v_enrolment.academic_year_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=v_enrolment.stream_id)
   join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
   join public.system_subjects ss on ss.id=so.system_subject_id and ss.is_active
   join public.o_level_curriculum_subject_rules r on r.system_subject_id=ss.id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='ELECTIVE' and r.is_active;
  if v_valid_electives<>v_elective_count then raise exception 'ELECTIVE_NOT_ACTIVE_OR_OFFERED_TO_THIS_LEARNER'; end if;
  if exists(select 1 from unnest(coalesce(p_elective_offering_ids,'{}'::uuid[])) x join public.class_subject_offerings co on co.id=x join public.school_subject_offerings so on so.id=co.school_subject_offering_id join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='ELECTIVE' group by so.system_subject_id having count(*)>1) then raise exception 'DUPLICATE_ELECTIVE_SUBJECT'; end if;
  select count(distinct co.id) into v_valid_religion from unnest(coalesce(p_religion_offering_ids,'{}'::uuid[])) x
   join public.class_subject_offerings co on co.id=x and co.class_id=v_class.id and co.school_id=v_enrolment.school_id and co.academic_year_id=v_enrolment.academic_year_id and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=v_enrolment.stream_id)
   join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
   join public.system_subjects ss on ss.id=so.system_subject_id and ss.is_active
   join public.o_level_curriculum_subject_rules r on r.system_subject_id=ss.id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='RELIGION_OPTION' and r.is_active;
  if v_valid_religion<>v_religion_count then raise exception 'RELIGIOUS_EDUCATION_NOT_ACTIVE_OR_OFFERED_TO_THIS_LEARNER'; end if;
  select count(*) into v_required_expected from public.o_level_curriculum_subject_rules r join public.system_subjects ss on ss.id=r.system_subject_id
    where r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='CORE' and r.is_active
      and not (v_sne and ss.subject_code in ('535','553','545'));
  if v_sne then v_required_expected:=v_required_expected+1; end if;
  select count(distinct co.id) into v_required_actual from public.learner_subject_enrolments ls join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
    where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('REQUIRED','SNE_REPLACEMENT') and co.status='ACTIVE' and (co.stream_id is null or co.stream_id=v_enrolment.stream_id);
  if v_required_actual<>v_required_expected then raise exception 'REQUIRED_SUBJECTS_INCOMPLETE: % of % assigned',v_required_actual,v_required_expected; end if;
  select coalesce(jsonb_agg(jsonb_build_object('offering_id',ls.class_subject_offering_id,'selection_type',ls.selection_type)
    order by ls.selection_type,ls.class_subject_offering_id),'[]'::jsonb)
    into v_old from public.learner_subject_enrolments ls
    where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('ELECTIVE','RELIGION_REQUIRED');
  select exists(select 1 from public.learner_subject_enrolments ls where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('ELECTIVE','RELIGION_REQUIRED')
    and ls.class_subject_offering_id<>all(coalesce(p_elective_offering_ids,'{}'::uuid[])||coalesce(p_religion_offering_ids,'{}'::uuid[]))
    and (exists(select 1 from public.academic_mark_records mr where mr.learner_id=ls.learner_id and mr.class_subject_offering_id=ls.class_subject_offering_id)
      or exists(select 1 from public.assessment_subject_papers asp
        join public.academic_assessments aa on aa.id=asp.assessment_id
        where asp.school_subject_offering_id=(select school_subject_offering_id from public.class_subject_offerings where id=ls.class_subject_offering_id)
          and aa.school_id=ls.school_id and aa.academic_year_id=v_enrolment.academic_year_id)
      or exists(select 1 from public.report_snapshots rs where rs.learner_id=ls.learner_id and rs.academic_year_id=v_enrolment.academic_year_id and rs.status in ('APPROVED','PUBLISHED')))) into v_has_history;
  if v_has_history and (nullif(trim(p_change_reason),'') is null or length(trim(p_change_reason))<12) then raise exception 'SUBJECT_CHANGE_REASON_REQUIRED_FOR_EXISTING_ASSESSMENTS_OR_MARKS'; end if;
  update public.learner_subject_enrolments ls set status='DROPPED',effective_to=greatest(ls.effective_from,current_date),selected_by=v_actor,
    changed_reason=case when v_has_history then trim(p_change_reason) else ls.changed_reason end,updated_at=now()
   where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('ELECTIVE','RELIGION_REQUIRED')
     and ls.class_subject_offering_id<>all(coalesce(p_elective_offering_ids,'{}'::uuid[])||coalesce(p_religion_offering_ids,'{}'::uuid[]));
  foreach v_offering_id in array coalesce(p_religion_offering_ids,'{}'::uuid[]) loop
    insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by,changed_reason)
    values(v_enrolment.school_id,v_enrolment.learner_id,p_enrolment_id,v_offering_id,'ACTIVE',v_enrolment.effective_from,'RELIGION_REQUIRED',v_actor,nullif(trim(p_change_reason),''))
    on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update set selection_type='RELIGION_REQUIRED',selected_by=excluded.selected_by,changed_reason=coalesce(excluded.changed_reason,learner_subject_enrolments.changed_reason),updated_at=now();
  end loop;
  foreach v_offering_id in array coalesce(p_elective_offering_ids,'{}'::uuid[]) loop
    insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type,selected_by,changed_reason)
    values(v_enrolment.school_id,v_enrolment.learner_id,p_enrolment_id,v_offering_id,'ACTIVE',v_enrolment.effective_from,'ELECTIVE',v_actor,nullif(trim(p_change_reason),''))
    on conflict(enrolment_id,class_subject_offering_id) where status='ACTIVE' do update set selection_type='ELECTIVE',selected_by=excluded.selected_by,changed_reason=coalesce(excluded.changed_reason,learner_subject_enrolments.changed_reason),updated_at=now();
  end loop;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
   values(v_actor::text,v_role,'O_LEVEL_LEARNER_SUBJECTS_SELECTED','learner_enrolment',p_enrolment_id::text,v_old,
     jsonb_build_object('religion_offering_ids',coalesce(p_religion_offering_ids,'{}'::uuid[]),'elective_offering_ids',coalesce(p_elective_offering_ids,'{}'::uuid[]),'change_reason',nullif(trim(p_change_reason),''),'curriculum_version',v_rules.curriculum_version));
  return jsonb_build_object('requiredCount',v_required_actual+v_religion_count,'electiveCount',v_elective_count,'electiveMin',v_elective_min,'electiveMax',v_elective_max,'ready',true);
end $$;
revoke all on function public.get_o_level_learner_subject_choices(uuid),public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[],text) from public,anon;
grant execute on function public.get_o_level_learner_subject_choices(uuid),public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[],text) to authenticated;

create or replace function public.get_o_level_subject_selection_health(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object('issues',coalesce(jsonb_agg(jsonb_build_object(
  'priority',issue.priority,'code',issue.code,'severity',issue.severity,'title',issue.title,'detail',issue.detail,'path',issue.path
) order by issue.priority,issue.title,issue.detail),'[]'::jsonb))
from (
  select 1 priority,'O_LEVEL_LEARNER_MISSING_REQUIRED_SUBJECT' code,'error' severity,'Learner missing a compulsory subject' title,
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'in',c.class_name,'is missing',ss.subject_code,'·',ss.subject_name,'.') detail,
    '/school/o-level/learners/'||l.id::text||'/subjects' path
  from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id and l.school_id=e.school_id
  join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id
  join public.o_level_curriculum_subject_rules r on r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='CORE' and r.is_active
  join public.system_subjects ss on ss.id=r.system_subject_id
  where e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null and c.programme='O_LEVEL'
    and not exists(select 1 from public.learner_subject_enrolments ls join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
      join public.school_subject_offerings so on so.id=co.school_subject_offering_id
      where ls.enrolment_id=e.id and ls.status='ACTIVE' and ls.selection_type in ('REQUIRED','SNE_REPLACEMENT') and so.system_subject_id=ss.id
        and co.status='ACTIVE' and so.status='ACTIVE' and (co.stream_id is null or co.stream_id=e.stream_id))
    and not exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=e.learner_id and x.academic_year_id=e.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active and ss.subject_code in ('535','553','545'))
  union all
  select 1,'O_LEVEL_LEARNER_RELIGION_CHOICE_MISSING','error','Learner needs a religious education choice',
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'in',c.class_name,'needs exactly one active CRE or IRE choice.'),
    '/school/o-level/learners/'||l.id::text||'/subjects'
  from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id and l.school_id=e.school_id
  join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id
  where e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null and c.programme='O_LEVEL' and c.level<=2
    and not exists(select 1 from public.learner_subject_enrolments ls join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
      join public.school_subject_offerings so on so.id=co.school_subject_offering_id
      join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='RELIGION_OPTION' and r.is_active
      where ls.enrolment_id=e.id and ls.status='ACTIVE' and ls.selection_type='RELIGION_REQUIRED' and co.status='ACTIVE' and so.status='ACTIVE'
        and (co.stream_id is null or co.stream_id=e.stream_id))
  union all
  select 2,'O_LEVEL_LEARNER_ELECTIVE_COUNT','error','Learner elective count is outside the curriculum limit',
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'in',c.class_name,'has',count(ls.id),'electives; this curriculum version allows',
      case when c.level<=2 then rs.elective_min_s1_s2 else rs.elective_min_s3_s4 end,'to',case when c.level<=2 then rs.elective_max_s1_s2 else rs.elective_max_s3_s4 end,'.'),
    '/school/o-level/learners/'||l.id::text||'/subjects'
  from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id join public.academic_classes c on c.id=e.class_id
  join public.o_level_curriculum_rule_sets rs on rs.id=c.o_level_rule_set_id
  left join public.learner_subject_enrolments ls on ls.enrolment_id=e.id and ls.status='ACTIVE' and ls.selection_type='ELECTIVE'
  where e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null and c.programme='O_LEVEL'
  group by e.id,l.id,c.id,rs.id
  having count(ls.id)<case when c.level<=2 then rs.elective_min_s1_s2 else rs.elective_min_s3_s4 end
      or count(ls.id)>case when c.level<=2 then rs.elective_max_s1_s2 else rs.elective_max_s3_s4 end
  union all
  select 1,'O_LEVEL_DUPLICATE_LEARNER_SUBJECT' code,'error','Learner has duplicate active selections for a subject',
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'in',c.class_name,'has more than one active offering for',ss.subject_name,'.'),
    '/school/o-level/learners/'||l.id::text||'/subjects'
  from public.learner_subject_enrolments ls join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
  join public.learners l on l.id=ls.learner_id join public.academic_classes c on c.id=e.class_id
  join public.class_subject_offerings co on co.id=ls.class_subject_offering_id join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  join public.system_subjects ss on ss.id=so.system_subject_id
  where ls.school_id=p_school_id and ls.status='ACTIVE' and c.programme='O_LEVEL' and e.status='ACTIVE'
  group by e.id,l.id,c.id,ss.id having count(*)>1
  union all
  select 1,'O_LEVEL_INELIGIBLE_ACTIVE_SELECTION' code,'error','Learner selected an inactive, unoffered, or wrong-stream subject',
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'in',c.class_name,'has an active selection for',ss.subject_name,'which is not active and eligible for their class/stream.'),
    '/school/o-level/learners/'||l.id::text||'/subjects'
  from public.learner_subject_enrolments ls join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
  join public.learners l on l.id=ls.learner_id join public.academic_classes c on c.id=e.class_id
  join public.class_subject_offerings co on co.id=ls.class_subject_offering_id join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  join public.system_subjects ss on ss.id=so.system_subject_id
  where ls.school_id=p_school_id and ls.status='ACTIVE' and c.programme='O_LEVEL' and e.status='ACTIVE'
    and (co.status<>'ACTIVE' or so.status<>'ACTIVE' or not ss.is_active or (co.stream_id is not null and co.stream_id<>e.stream_id))
  union all
  select 3,'O_LEVEL_HISTORIC_MARKS_UNSELECTED_SUBJECT' code,'info','Historic marks belong to a previous subject selection',
    concat_ws(' ',l.admission_number,'·',concat_ws(' ',l.first_name,l.last_name),'has historic marks in',ss.subject_name,'but no longer has it selected. Marks and published reports are retained.'),
    '/school/o-level/learners/'||l.id::text||'/subjects'
  from public.academic_mark_records mr join public.learners l on l.id=mr.learner_id and l.school_id=mr.school_id
  join public.class_subject_offerings co on co.id=mr.class_subject_offering_id and co.school_id=mr.school_id
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.school_id=co.school_id
  join public.system_subjects ss on ss.id=so.system_subject_id
  join public.academic_classes c on c.id=co.class_id and c.school_id=co.school_id and c.programme='O_LEVEL'
  where mr.school_id=p_school_id and not exists(select 1 from public.learner_subject_enrolments ls
    where ls.learner_id=mr.learner_id and ls.class_subject_offering_id=mr.class_subject_offering_id and ls.status='ACTIVE')
) issue
where public.is_active_school_member(p_school_id) or public.is_active_platform_admin();
$$;
revoke all on function public.get_o_level_subject_selection_health(uuid) from public,anon;
grant execute on function public.get_o_level_subject_selection_health(uuid) to authenticated;

-- The broad setup health check must use the same year-specific rule set that
-- new classes use. Otherwise a global baseline and a year override can produce
-- duplicate or misleading "required subject" warnings.
create or replace function public.get_o_level_setup_health(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object('issues',coalesce(jsonb_agg(jsonb_build_object(
 'priority',i.priority,'code',i.code,'severity',i.severity,'title',i.title,'detail',i.detail,'path',i.path
) order by i.priority,i.title),'[]'::jsonb))
from (
 select 1 priority,'O_LEVEL_CLASS_WITHOUT_TEACHER' code,'warning' severity,'O-Level class without class teacher' title,
  c.class_name||' has no assigned class teacher.' detail,'/school/o-level/classes/'||c.id::text path
 from public.academic_classes c where c.school_id=p_school_id and c.programme='O_LEVEL' and c.status='ACTIVE' and c.class_teacher_user_id is null
 union all
 select 1,'O_LEVEL_REQUIRED_SUBJECT_NOT_ACTIVE','error','Required O-Level subject is not active',
  coalesce(ss.subject_code,'?')||' · '||ss.subject_name||' is required by the selected NCDC curriculum but is not activated for this school year.',
  '/school/o-level/subjects?search='||coalesce(ss.subject_code,'')
 from public.academic_years ay
 join lateral (select rs.id from public.o_level_curriculum_rule_sets rs
   where rs.status='ACTIVE' and (rs.academic_year_id=ay.id or rs.academic_year_id is null)
   order by (rs.academic_year_id=ay.id) desc nulls last,rs.effective_from desc limit 1) rs on true
 join public.o_level_curriculum_subject_rules r on r.rule_set_id=rs.id and r.is_active and r.requirement='CORE'
 join public.system_subjects ss on ss.id=r.system_subject_id and ss.programme='O_LEVEL'
 where ay.school_id=p_school_id and ay.status='ACTIVE' and not exists(
  select 1 from public.school_subject_offerings so where so.school_id=p_school_id and so.academic_year_id=ay.id and so.system_subject_id=ss.id and so.status='ACTIVE'
 )
 union all
 select 1,'O_LEVEL_CLASS_MISSING_CORE','error','O-Level class is missing a compulsory subject',
  c.class_name||' is missing required subject '||coalesce(ss.subject_code,'?')||' · '||ss.subject_name||'.',
  '/school/o-level/classes/'||c.id::text
 from public.academic_classes c join public.o_level_curriculum_subject_rules r on r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='CORE' and r.is_active
 join public.system_subjects ss on ss.id=r.system_subject_id
 where c.school_id=p_school_id and c.programme='O_LEVEL' and c.status<>'ARCHIVED' and not exists(
  select 1 from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  where co.class_id=c.id and co.status='ACTIVE' and so.status='ACTIVE' and so.system_subject_id=ss.id
 )
 union all
 select 2,'O_LEVEL_CLASS_NO_ELECTIVE_MENU','warning','O-Level elective menu is empty',
  c.class_name||' needs at least one active elective offering for learner selection.',
  '/school/o-level/classes/'||c.id::text
 from public.academic_classes c where c.school_id=p_school_id and c.programme='O_LEVEL' and c.status<>'ARCHIVED' and not exists(
  select 1 from public.class_subject_offerings co where co.class_id=c.id and co.status='ACTIVE' and co.curriculum_source='SCHOOL_ELECTIVE'
 )
) i where public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
$$;
revoke all on function public.get_o_level_setup_health(uuid) from public,anon;
grant execute on function public.get_o_level_setup_health(uuid) to authenticated;

notify pgrst,'reload schema';
