-- Versioned O-Level subject structure. A class keeps the rule-set version it
-- started with, so a later platform change cannot rewrite historical choices.
create table if not exists public.o_level_curriculum_rule_sets (
 id uuid primary key default gen_random_uuid(),
 code text not null unique, label text not null,
 status text not null check(status in ('DRAFT','ACTIVE','RETIRED')),
 elective_min_s1_s2 integer not null default 1,
 elective_max_s1_s2 integer not null default 1,
 elective_min_s3_s4 integer not null default 1,
 elective_max_s3_s4 integer not null default 2,
 created_at timestamptz not null default now(), activated_at timestamptz,
 check(elective_min_s1_s2>=0 and elective_max_s1_s2>=elective_min_s1_s2),
 check(elective_min_s3_s4>=0 and elective_max_s3_s4>=elective_min_s3_s4)
);
create unique index if not exists one_active_o_level_rule_set on public.o_level_curriculum_rule_sets(status) where status='ACTIVE';

create table if not exists public.o_level_curriculum_subject_rules (
 id uuid primary key default gen_random_uuid(),
 rule_set_id uuid not null references public.o_level_curriculum_rule_sets(id) on delete restrict,
 class_level smallint not null check(class_level between 1 and 4),
 system_subject_id uuid not null references public.system_subjects(id) on delete restrict,
 requirement text not null check(requirement in ('CORE','RELIGION_OPTION','ELECTIVE','SNE_REPLACEMENT')),
 elective_category text,
 is_active boolean not null default true,
 unique(rule_set_id,class_level,system_subject_id)
);
create index if not exists o_level_rules_level_idx on public.o_level_curriculum_subject_rules(rule_set_id,class_level,requirement);

alter table public.academic_classes add column if not exists o_level_rule_set_id uuid references public.o_level_curriculum_rule_sets(id);
alter table public.class_subject_offerings add column if not exists curriculum_source text not null default 'SCHOOL_ELECTIVE'
 check(curriculum_source in ('REQUIRED_CURRICULUM','SCHOOL_ELECTIVE','A_LEVEL_OFFERING','SNE_REPLACEMENT'));
alter table public.learner_subject_enrolments add column if not exists selection_type text not null default 'ELECTIVE'
 check(selection_type in ('REQUIRED','RELIGION_REQUIRED','ELECTIVE','SNE_REPLACEMENT'));

create table if not exists public.o_level_curriculum_exceptions (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete restrict,
 academic_year_id uuid not null references public.academic_years(id) on delete restrict,
 learner_id uuid not null,
 exception_code text not null check(exception_code in ('GENERAL_SCIENCE_REPLACEMENT','DUAL_RELIGION')),
 reason text not null check(length(trim(reason))>=12),
 approved_by uuid not null references public.users(id) on delete restrict,
 approved_at timestamptz not null default now(),
 is_active boolean not null default true,
 foreign key(learner_id,school_id) references public.learners(id,school_id) on delete restrict,
 unique(learner_id,academic_year_id,exception_code)
);

insert into public.o_level_curriculum_rule_sets(code,label,status,activated_at)
values('NCDC_LOWER_SECONDARY_2026_V1','NCDC Lower Secondary 2026 · version 1','ACTIVE',now())
on conflict(code) do nothing;

with seed(level,code,requirement,category) as (
 values
 (1,'112','CORE',null),(1,'456','CORE',null),(1,'241','CORE',null),(1,'273','CORE',null),
 (1,'535','CORE',null),(1,'553','CORE',null),(1,'545','CORE',null),(1,'555','CORE',null),
 (1,'845','CORE',null),(1,'336','CORE',null),(1,'223','RELIGION_OPTION','RELIGIOUS'),(1,'225','RELIGION_OPTION','RELIGIOUS'),
 (2,'112','CORE',null),(2,'456','CORE',null),(2,'241','CORE',null),(2,'273','CORE',null),
 (2,'535','CORE',null),(2,'553','CORE',null),(2,'545','CORE',null),(2,'555','CORE',null),
 (2,'845','CORE',null),(2,'336','CORE',null),(2,'223','RELIGION_OPTION','RELIGIOUS'),(2,'225','RELIGION_OPTION','RELIGIOUS'),
 (3,'112','CORE',null),(3,'456','CORE',null),(3,'241','CORE',null),(3,'273','CORE',null),
 (3,'535','CORE',null),(3,'553','CORE',null),(3,'545','CORE',null),
 (4,'112','CORE',null),(4,'456','CORE',null),(4,'241','CORE',null),(4,'273','CORE',null),
 (4,'535','CORE',null),(4,'553','CORE',null),(4,'545','CORE',null)
), rules as (
 select rs.id rule_set_id,seed.level,ss.id subject_id,seed.requirement,seed.category
 from seed join public.system_subjects ss on ss.programme='O_LEVEL' and ss.subject_code=seed.code and ss.is_active
 cross join public.o_level_curriculum_rule_sets rs where rs.code='NCDC_LOWER_SECONDARY_2026_V1'
)
insert into public.o_level_curriculum_subject_rules(rule_set_id,class_level,system_subject_id,requirement,elective_category)
select rule_set_id,level,subject_id,requirement,category from rules
on conflict(rule_set_id,class_level,system_subject_id) do nothing;

-- Do not silently deploy an incomplete compulsory curriculum if a catalogue
-- import omitted any national subject code. Migration 023 seeds this catalogue.
do $$
declare v_missing text;
begin
 select string_agg('S'||expected.class_level||' / '||expected.subject_code,', ' order by expected.class_level,expected.subject_code)
 into v_missing
 from (values
  (1,'112'),(1,'456'),(1,'241'),(1,'273'),(1,'535'),(1,'553'),(1,'545'),(1,'555'),(1,'845'),(1,'336'),(1,'223'),(1,'225'),
  (2,'112'),(2,'456'),(2,'241'),(2,'273'),(2,'535'),(2,'553'),(2,'545'),(2,'555'),(2,'845'),(2,'336'),(2,'223'),(2,'225'),
  (3,'112'),(3,'456'),(3,'241'),(3,'273'),(3,'535'),(3,'553'),(3,'545'),
  (4,'112'),(4,'456'),(4,'241'),(4,'273'),(4,'535'),(4,'553'),(4,'545')
 ) expected(class_level,subject_code)
 left join public.system_subjects ss on ss.programme='O_LEVEL' and ss.subject_code=expected.subject_code and ss.is_active
 where ss.id is null;
 if v_missing is not null then raise exception 'NCDC O-Level curriculum cannot be activated; required catalogue entries are missing: %',v_missing; end if;
end $$;

-- Expose NCDC compulsory subjects as required in the shared subject catalogue.
-- Religious Education remains a one-of-two learner choice, not two compulsory
-- subjects; its per-level rule is returned separately by the settings RPC.
update public.system_subjects ss set is_compulsory=true,default_activation=true
from public.o_level_curriculum_subject_rules r join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id and rs.status='ACTIVE'
where r.system_subject_id=ss.id and r.requirement='CORE' and r.is_active and ss.programme='O_LEVEL';

with elective(code,category) as (values
 ('527','PRACTICAL'),('845','PRACTICAL'),('612','PRACTICAL'),('840','PRACTICAL'),
 ('662','PRACTICAL'),('621','PRACTICAL'),('555','PRACTICAL'),('745','PRACTICAL'),
 ('336','LANGUAGE'),('208','LANGUAGE'),('335','LOCAL_LANGUAGE'),('305','LOCAL_LANGUAGE'),
 ('315','LOCAL_LANGUAGE'),('325','LOCAL_LANGUAGE'),('345','LOCAL_LANGUAGE'),
 ('355','LOCAL_LANGUAGE'),('365','LOCAL_LANGUAGE'),('375','LOCAL_LANGUAGE'),
 ('385','LOCAL_LANGUAGE'),('395','LOCAL_LANGUAGE'),('314','FOREIGN_LANGUAGE'),
 ('309','FOREIGN_LANGUAGE'),('337','FOREIGN_LANGUAGE'),('396','FOREIGN_LANGUAGE'),
 ('301','FOREIGN_LANGUAGE'),('223','RELIGIOUS'),('225','RELIGIOUS')
), eligible as (
 select rs.id rule_set_id,l.level,ss.id subject_id,e.category
 from elective e join public.system_subjects ss on ss.programme='O_LEVEL' and ss.subject_code=e.code and ss.is_active
 cross join (values(1),(2),(3),(4)) l(level)
 cross join public.o_level_curriculum_rule_sets rs
 where rs.code='NCDC_LOWER_SECONDARY_2026_V1'
 and not exists(select 1 from public.o_level_curriculum_subject_rules r
  where r.rule_set_id=rs.id and r.class_level=l.level and r.system_subject_id=ss.id)
)
insert into public.o_level_curriculum_subject_rules(rule_set_id,class_level,system_subject_id,requirement,elective_category)
select rule_set_id,level,subject_id,'ELECTIVE',category from eligible
on conflict(rule_set_id,class_level,system_subject_id) do nothing;

insert into public.o_level_curriculum_subject_rules(rule_set_id,class_level,system_subject_id,requirement,elective_category)
select rs.id,l.level,ss.id,'SNE_REPLACEMENT','SNE'
from public.o_level_curriculum_rule_sets rs
cross join (values(3),(4)) l(level)
join public.system_subjects ss on ss.programme='O_LEVEL' and ss.subject_code='500'
where rs.code='NCDC_LOWER_SECONDARY_2026_V1'
on conflict(rule_set_id,class_level,system_subject_id) do nothing;

update public.academic_classes c set o_level_rule_set_id=rs.id
from public.o_level_curriculum_rule_sets rs
where c.programme='O_LEVEL' and c.o_level_rule_set_id is null and rs.code='NCDC_LOWER_SECONDARY_2026_V1';
update public.class_subject_offerings co set curriculum_source='REQUIRED_CURRICULUM'
from public.academic_classes c,public.school_subject_offerings so,public.o_level_curriculum_subject_rules r
where co.class_id=c.id and co.school_subject_offering_id=so.id and so.system_subject_id=r.system_subject_id
and c.programme='O_LEVEL' and r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level
and r.requirement in ('CORE','RELIGION_OPTION');
update public.class_subject_offerings co set curriculum_source='A_LEVEL_OFFERING'
from public.academic_classes c where co.class_id=c.id and c.programme='A_LEVEL';

alter table public.o_level_curriculum_rule_sets enable row level security;
alter table public.o_level_curriculum_subject_rules enable row level security;
alter table public.o_level_curriculum_exceptions enable row level security;
create policy o_level_rule_sets_read on public.o_level_curriculum_rule_sets for select to authenticated using(true);
create policy o_level_subject_rules_read on public.o_level_curriculum_subject_rules for select to authenticated using(true);
create policy o_level_exceptions_read on public.o_level_curriculum_exceptions for select to authenticated using(public.is_active_school_member(school_id) or public.is_active_platform_admin());
revoke all on public.o_level_curriculum_rule_sets,public.o_level_curriculum_subject_rules,public.o_level_curriculum_exceptions from anon;
revoke insert,update,delete,truncate,references,trigger on public.o_level_curriculum_rule_sets,public.o_level_curriculum_subject_rules,public.o_level_curriculum_exceptions from authenticated;
grant select on public.o_level_curriculum_rule_sets,public.o_level_curriculum_subject_rules,public.o_level_curriculum_exceptions to authenticated;

-- Enrich the existing catalogue settings endpoint rather than introducing a
-- parallel subject/settings record. UI receives the exact O-Level rule levels.
create or replace function public.get_school_subject_settings(p_school_id uuid,p_academic_year_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'schoolName',(select s.official_name from public.schools s where s.id=p_school_id),
  'catalogue',coalesce((select jsonb_agg(to_jsonb(ss)||jsonb_build_object(
   'curriculum_required_levels',coalesce((select jsonb_agg(levels.class_level order by levels.class_level) from (
    select distinct r.class_level from public.o_level_curriculum_subject_rules r join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id
    where rs.status='ACTIVE' and r.is_active and r.requirement='CORE' and r.system_subject_id=ss.id) levels),'[]'::jsonb),
   'curriculum_choice_levels',coalesce((select jsonb_agg(levels.class_level order by levels.class_level) from (
    select distinct r.class_level from public.o_level_curriculum_subject_rules r join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id
    where rs.status='ACTIVE' and r.is_active and r.requirement='RELIGION_OPTION' and r.system_subject_id=ss.id) levels),'[]'::jsonb),
   'system_subject_papers',coalesce((select jsonb_agg(to_jsonb(sp) order by sp.paper_code,sp.paper_name) from public.system_subject_papers sp where sp.system_subject_id=ss.id and sp.is_active),'[]'::jsonb)
  ) order by ss.subject_name) from public.system_subjects ss where ss.is_active),'[]'::jsonb),
  'offerings',coalesce((select jsonb_agg(to_jsonb(so) order by so.created_at) from public.school_subject_offerings so where so.school_id=p_school_id and so.academic_year_id=p_academic_year_id),'[]'::jsonb)
 )
 where (public.is_active_school_member(p_school_id) or public.is_active_platform_admin())
  and exists(select 1 from public.academic_years ay where ay.id=p_academic_year_id and ay.school_id=p_school_id)
$$;

-- Preserve compulsory subjects and prevent deactivation from silently leaving
-- active class or learner subject records attached to an inactive offering.
create or replace function public.set_school_catalogue_subject_status(
 p_school_id uuid,p_academic_year_id uuid,p_system_subject_id uuid,p_active boolean,p_reason text
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_subject public.system_subjects%rowtype;v_id uuid;v_existing_id uuid;v_old jsonb;v_has_choice_rule boolean;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'REASON_REQUIRED'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
 select * into v_subject from public.system_subjects where id=p_system_subject_id and is_active;
 if v_subject.id is null then raise exception 'CATALOGUE_SUBJECT_NOT_AVAILABLE'; end if;
 select o.id,to_jsonb(o) into v_existing_id,v_old from public.school_subject_offerings o
  where o.school_id=p_school_id and o.academic_year_id=p_academic_year_id and o.system_subject_id=p_system_subject_id;
 if not p_active and v_subject.is_compulsory then raise exception 'NCDC_REQUIRED_SUBJECT_CANNOT_BE_DEACTIVATED'; end if;
 if not p_active and v_existing_id is not null and exists(
  select 1 from public.class_subject_offerings co
  join public.academic_classes c on c.id=co.class_id
  where co.school_subject_offering_id=v_existing_id and co.status='ACTIVE' and c.status='ACTIVE'
 ) then raise exception 'SUBJECT_IS_OFFERED_TO_AN_ACTIVE_CLASS'; end if;
 if not p_active and v_existing_id is not null and exists(
  select 1 from public.learner_subject_enrolments ls
  join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
  where co.school_subject_offering_id=v_existing_id and ls.status='ACTIVE'
 ) then raise exception 'SUBJECT_IS_SELECTED_BY_AN_ACTIVE_LEARNER'; end if;
 select exists(select 1 from public.o_level_curriculum_subject_rules r join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id
  where rs.status='ACTIVE' and r.is_active and r.system_subject_id=p_system_subject_id and r.requirement='RELIGION_OPTION') into v_has_choice_rule;
 if not p_active and v_has_choice_rule and not exists(
  select 1 from public.o_level_curriculum_subject_rules r join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id and rs.status='ACTIVE'
  join public.school_subject_offerings alternative on alternative.school_id=p_school_id and alternative.academic_year_id=p_academic_year_id
   and alternative.system_subject_id=r.system_subject_id and alternative.status='ACTIVE'
  where r.is_active and r.requirement='RELIGION_OPTION' and r.class_level in (1,2) and r.system_subject_id<>p_system_subject_id
 ) then raise exception 'AT_LEAST_ONE_RELIGIOUS_EDUCATION_OPTION_MUST_REMAIN_ACTIVE'; end if;
 insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level,retired_at)
 values(p_school_id,p_academic_year_id,p_system_subject_id,v_subject.programme,v_subject.subject_code,'SYSTEM_CATALOGUE',case when p_active then 'ACTIVE' else 'INACTIVE' end,v_subject.subject_level,case when p_active then null else now() end)
 on conflict(school_id,academic_year_id,system_subject_id) do update set status=excluded.status,retired_at=excluded.retired_at,updated_at=now()
 returning id into v_id;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,old_value,new_value)
 select u.id,u.full_name,'SCHOOL_ADMIN',case when p_active then 'SCHOOL_SUBJECT_ACTIVATED' else 'SCHOOL_SUBJECT_DEACTIVATED' end,'school_subject_offering',v_id::text,v_old,
  jsonb_build_object('school_id',p_school_id,'system_subject_id',p_system_subject_id,'active',p_active,'reason',trim(p_reason))
 from public.users u where u.auth_user_id=auth.uid();
 return v_id;
end $$;
revoke all on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) to authenticated;

create or replace function public.get_o_level_curriculum(p_school_id uuid,p_academic_year_id uuid,p_class_level integer,p_term_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_rule_set_id uuid;
begin
 if not (public.is_active_school_member(p_school_id) or public.is_active_platform_admin()) then raise exception 'School membership required'; end if;
 if p_class_level not between 1 and 4 then raise exception 'Select Senior 1 to Senior 4'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'Invalid academic year'; end if;
 select id into v_rule_set_id from public.o_level_curriculum_rule_sets where status='ACTIVE' limit 1;
 return jsonb_build_object(
  'ruleSetId',v_rule_set_id,
  'classLevel',p_class_level,
  'requiredCount',case when p_class_level<=2 then 11 else 7 end,
  'electiveMin',case when p_class_level<=2 then 1 else 1 end,
  'electiveMax',case when p_class_level<=2 then 1 else 2 end,
  'subjects',coalesce((select jsonb_agg(jsonb_build_object(
   'systemSubjectId',ss.id,'code',ss.subject_code,'name',ss.subject_name,
   'requirement',r.requirement,'category',r.elective_category,
   'offeringId',so.id,'available',so.status='ACTIVE',
   'teacherAssigned',case when p_term_id is null then false else exists(
     select 1 from public.class_subject_offerings co join public.teacher_allocations ta on ta.class_subject_offering_id=co.id
     where co.school_subject_offering_id=so.id and ta.term_id=p_term_id and ta.status='ACTIVE'
       and ta.allocation_role='PRIMARY_SUBJECT_TEACHER') end
  ) order by case r.requirement when 'CORE' then 0 when 'RELIGION_OPTION' then 1 when 'ELECTIVE' then 2 else 3 end,ss.subject_name)
  from public.o_level_curriculum_subject_rules r join public.system_subjects ss on ss.id=r.system_subject_id
  left join public.school_subject_offerings so on so.school_id=p_school_id and so.academic_year_id=p_academic_year_id and so.system_subject_id=ss.id and so.status='ACTIVE'
  where r.rule_set_id=v_rule_set_id and r.class_level=p_class_level and r.is_active),'[]'::jsonb)
 );
end $$;

create or replace function public.sync_o_level_class_curriculum(p_class_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_actor uuid;v_count integer;
begin
 select * into v_class from public.academic_classes where id=p_class_id for update;
 if v_class.id is null or v_class.programme<>'O_LEVEL' or not public.is_school_admin_for(v_class.school_id) then raise exception 'School Administrator and O-Level class required'; end if;
 v_actor:=public.current_app_user_id();
 if v_class.o_level_rule_set_id is null then
  select id into v_class.o_level_rule_set_id from public.o_level_curriculum_rule_sets where status='ACTIVE';
  update public.academic_classes set o_level_rule_set_id=v_class.o_level_rule_set_id where id=p_class_id;
 end if;
 with connected as (
  insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by,curriculum_source)
  select v_class.school_id,so.id,v_class.academic_year_id,v_class.id,true,'ACTIVE',v_actor,v_actor,'REQUIRED_CURRICULUM'
  from public.o_level_curriculum_subject_rules r
  join public.school_subject_offerings so on so.system_subject_id=r.system_subject_id and so.school_id=v_class.school_id
    and so.academic_year_id=v_class.academic_year_id and so.status='ACTIVE'
  where r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement in ('CORE','RELIGION_OPTION') and r.is_active
  on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=true,curriculum_source='REQUIRED_CURRICULUM',updated_by=v_actor,updated_at=now()
  returning id
 ) select count(*) into v_count from connected;
 -- Existing learners must receive newly connected core subjects too. A trigger
 -- handles future placements, but cannot retroactively handle an old class.
 insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
 select e.school_id,e.learner_id,e.id,co.id,'ACTIVE',e.effective_from,'REQUIRED'
 from public.learner_class_enrolments e
 join public.class_subject_offerings co on co.class_id=e.class_id and co.status='ACTIVE'
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id
  and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level
  and r.requirement='CORE' and r.is_active
 where e.class_id=p_class_id and e.status='ACTIVE' and e.effective_to is null
  and not (so.school_subject_code in ('535','553','545') and exists(select 1 from public.o_level_curriculum_exceptions x
   where x.learner_id=e.learner_id and x.academic_year_id=e.academic_year_id
    and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active))
 on conflict(enrolment_id,class_subject_offering_id) do update
 set status='ACTIVE',selection_type='REQUIRED',effective_to=null;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
 values(v_actor::text,'SCHOOL_ADMIN','O_LEVEL_REQUIRED_SUBJECTS_SYNCED','academic_class',p_class_id::text,jsonb_build_object('rule_set_id',v_class.o_level_rule_set_id,'offerings_processed',v_count));
 return jsonb_build_object('offeringsProcessed',v_count);
end $$;

create or replace function public.set_o_level_class_electives(p_class_id uuid,p_offering_ids uuid[])
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_actor uuid;v_requested integer;v_valid integer;
begin
 select * into v_class from public.academic_classes where id=p_class_id for update;
 if v_class.id is null or v_class.programme<>'O_LEVEL' or not public.is_school_admin_for(v_class.school_id) then raise exception 'School Administrator and O-Level class required'; end if;
 v_actor:=public.current_app_user_id();
 select count(distinct x) into v_requested from unnest(coalesce(p_offering_ids,'{}'::uuid[])) x;
 if v_requested<1 then raise exception 'Offer at least one elective for learners to choose'; end if;
 select count(distinct so.id) into v_valid
 from unnest(p_offering_ids) x
 join public.school_subject_offerings so on so.id=x and so.school_id=v_class.school_id
  and so.academic_year_id=v_class.academic_year_id and so.programme='O_LEVEL' and so.status='ACTIVE'
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id
  and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='ELECTIVE' and r.is_active;
 if v_requested<>v_valid then raise exception 'Each class elective must be active and allowed for this level'; end if;
 if exists(
  select 1 from public.class_subject_offerings co
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  join public.academic_mark_records mr on mr.class_subject_offering_id=co.id
  where co.class_id=p_class_id and co.status='ACTIVE' and co.curriculum_source='SCHOOL_ELECTIVE'
   and so.id<>all(coalesce(p_offering_ids,'{}'::uuid[]))
 ) then raise exception 'An elective with recorded marks cannot be removed from this class'; end if;
 if exists(
  select 1 from public.class_subject_offerings co
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  join public.learner_subject_enrolments ls on ls.class_subject_offering_id=co.id and ls.status='ACTIVE'
  where co.class_id=p_class_id and co.status='ACTIVE' and co.curriculum_source='SCHOOL_ELECTIVE'
   and so.id<>all(coalesce(p_offering_ids,'{}'::uuid[]))
 ) then raise exception 'An elective selected by a learner cannot be removed from this class menu'; end if;
 update public.class_subject_offerings co set status='INACTIVE',updated_by=v_actor,updated_at=now()
 from public.school_subject_offerings so where so.id=co.school_subject_offering_id and co.class_id=p_class_id
  and co.status='ACTIVE' and co.curriculum_source='SCHOOL_ELECTIVE'
  and so.id<>all(coalesce(p_offering_ids,'{}'::uuid[]));
 insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by,curriculum_source)
 select v_class.school_id,so.id,v_class.academic_year_id,v_class.id,false,'ACTIVE',v_actor,v_actor,'SCHOOL_ELECTIVE'
 from public.school_subject_offerings so where so.id=any(p_offering_ids)
 on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=false,curriculum_source='SCHOOL_ELECTIVE',updated_by=v_actor,updated_at=now();
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
 values(v_actor::text,'SCHOOL_ADMIN','O_LEVEL_CLASS_ELECTIVES_SET','academic_class',p_class_id::text,jsonb_build_object('offering_ids',p_offering_ids));
 return jsonb_build_object('electiveMenuCount',v_requested);
end $$;

create or replace function public.get_o_level_class_elective_menu(p_class_id uuid)
returns uuid[] language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid;v_programme text;
begin
 select school_id,programme into v_school_id,v_programme from public.academic_classes where id=p_class_id;
 if v_school_id is null or v_programme<>'O_LEVEL' or not (public.is_active_school_member(v_school_id) or public.is_active_platform_admin()) then
  raise exception 'O-Level class membership required';
 end if;
 return coalesce((select array_agg(so.id order by so.display_name_override,so.school_subject_code)
  from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  where co.class_id=p_class_id and co.status='ACTIVE' and co.curriculum_source='SCHOOL_ELECTIVE'),'{}'::uuid[]);
end $$;

create or replace function public.finalize_o_level_class(p_class_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_actor uuid;v_core_expected integer;v_core_actual integer;v_religion integer;v_elective integer;
begin
 select * into v_class from public.academic_classes where id=p_class_id for update;
 if v_class.id is null or v_class.programme<>'O_LEVEL' or not public.is_school_admin_for(v_class.school_id) then raise exception 'School Administrator and O-Level class required'; end if;
 v_actor:=public.current_app_user_id();
 v_core_expected:=case when v_class.level<=2 then 10 else 7 end;
 select count(distinct co.id) into v_core_actual from public.class_subject_offerings co
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level
 where co.class_id=p_class_id and co.status='ACTIVE' and so.status='ACTIVE' and r.requirement='CORE' and r.is_active;
 select count(distinct co.id) into v_religion from public.class_subject_offerings co
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level
 where co.class_id=p_class_id and co.status='ACTIVE' and so.status='ACTIVE' and r.requirement='RELIGION_OPTION' and r.is_active;
 select count(*) into v_elective from public.class_subject_offerings where class_id=p_class_id and status='ACTIVE' and curriculum_source='SCHOOL_ELECTIVE';
 if v_core_actual<>v_core_expected then raise exception 'Required core subjects missing: % of % active',v_core_actual,v_core_expected; end if;
 if v_class.level<=2 and v_religion<1 then raise exception 'Activate CRE or IRE for the required Religious Education choice'; end if;
 if v_elective<1 then raise exception 'Offer at least one allowed elective'; end if;
 if not exists(select 1 from public.class_streams where class_id=p_class_id and status='ACTIVE') then
  raise exception 'Add at least one active stream before activating the class';
 end if;
 update public.academic_classes set status='ACTIVE',updated_by=v_actor,updated_at=now() where id=p_class_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
 values(v_actor::text,'SCHOOL_ADMIN','O_LEVEL_CLASS_CURRICULUM_READY','academic_class',p_class_id::text,jsonb_build_object('core_subjects',v_core_actual,'religion_options',v_religion,'elective_menu',v_elective));
 return p_class_id;
end $$;

revoke all on function public.get_o_level_curriculum(uuid,uuid,integer,uuid),public.sync_o_level_class_curriculum(uuid),public.set_o_level_class_electives(uuid,uuid[]),public.finalize_o_level_class(uuid) from public,anon;
grant execute on function public.get_o_level_curriculum(uuid,uuid,integer,uuid),public.sync_o_level_class_curriculum(uuid),public.set_o_level_class_electives(uuid,uuid[]),public.finalize_o_level_class(uuid) to authenticated;
revoke all on function public.get_o_level_class_elective_menu(uuid) from public,anon;
grant execute on function public.get_o_level_class_elective_menu(uuid) to authenticated;

create or replace function public.create_o_level_curriculum_class(
 p_school_id uuid,p_academic_year_id uuid,p_term_id uuid,p_level integer,
 p_class_name text,p_capacity integer,p_class_teacher_user_id uuid,
 p_stream_names text[],p_elective_offering_ids uuid[],p_activate boolean
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_stream text;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'School Administrator permission required'; end if;
 if p_level not between 1 and 4 then raise exception 'Senior 1 to Senior 4 required'; end if;
 if p_term_id is null or not exists(select 1 from public.terms where id=p_term_id and school_id=p_school_id and academic_year_id=p_academic_year_id) then raise exception 'Select a term in this school and academic year'; end if;
 if p_activate and cardinality(coalesce(p_stream_names,'{}'::text[]))=0 then raise exception 'Add a stream before activating the class'; end if;
 v_id:=public.create_academic_class(p_school_id,p_academic_year_id,'O_LEVEL',p_level,p_class_name,'DRAFT',p_capacity,p_class_teacher_user_id);
 perform public.sync_o_level_class_curriculum(v_id);
 foreach v_stream in array coalesce(p_stream_names,'{}'::text[]) loop
  if nullif(trim(v_stream),'') is null then raise exception 'Stream names cannot be blank'; end if;
  perform public.create_class_stream(v_id,v_stream,null);
 end loop;
 if cardinality(coalesce(p_elective_offering_ids,'{}'::uuid[]))>0 then
  perform public.set_o_level_class_electives(v_id,p_elective_offering_ids);
 end if;
 if p_activate then perform public.finalize_o_level_class(v_id); end if;
 return v_id;
end $$;
revoke all on function public.create_o_level_curriculum_class(uuid,uuid,uuid,integer,text,integer,uuid,text[],uuid[],boolean) from public,anon;
grant execute on function public.create_o_level_curriculum_class(uuid,uuid,uuid,integer,text,integer,uuid,text[],uuid[],boolean) to authenticated;

create or replace function public.assign_o_level_required_on_enrolment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;v_religion_count integer;
begin
 if new.status<>'ACTIVE' then return new; end if;
 select * into v_class from public.academic_classes where id=new.class_id;
 if v_class.programme<>'O_LEVEL' then return new; end if;
 insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
 select new.school_id,new.learner_id,new.id,co.id,'ACTIVE',new.effective_from,'REQUIRED'
 from public.class_subject_offerings co
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id
  and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='CORE' and r.is_active
 where co.class_id=new.class_id and co.status='ACTIVE'
  and not (so.school_subject_code in ('535','553','545') and exists(select 1 from public.o_level_curriculum_exceptions x
   where x.learner_id=new.learner_id and x.academic_year_id=new.academic_year_id
    and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active))
 on conflict(enrolment_id,class_subject_offering_id) do update set status='ACTIVE',selection_type='REQUIRED',effective_to=null;
 if v_class.level<=2 then
  select count(*) into v_religion_count from public.class_subject_offerings co
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
  join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id
   and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='RELIGION_OPTION'
  where co.class_id=new.class_id and co.status='ACTIVE';
  if v_religion_count=1 then
   insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
   select new.school_id,new.learner_id,new.id,co.id,'ACTIVE',new.effective_from,'RELIGION_REQUIRED'
   from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
   join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id
    and r.class_level=v_class.level and r.requirement='RELIGION_OPTION'
   where co.class_id=new.class_id and co.status='ACTIVE' and so.status='ACTIVE'
   on conflict(enrolment_id,class_subject_offering_id) do update set status='ACTIVE',selection_type='RELIGION_REQUIRED',effective_to=null;
  end if;
 end if;
 if exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=new.learner_id
   and x.academic_year_id=new.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) then
  perform public.apply_o_level_sne_replacement(new.id);
 end if;
 return new;
end $$;

drop trigger if exists assign_o_level_required_subjects on public.learner_class_enrolments;
create trigger assign_o_level_required_subjects after insert on public.learner_class_enrolments
for each row execute function public.assign_o_level_required_on_enrolment();

create or replace function public.close_subjects_on_class_transfer()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if old.status='ACTIVE' and new.status<>'ACTIVE' then
  update public.learner_subject_enrolments set status='COMPLETED',effective_to=greatest(effective_from,coalesce(new.effective_to,current_date))
  where enrolment_id=old.id and status='ACTIVE';
 end if;
 return new;
end $$;
drop trigger if exists close_subjects_on_class_transfer on public.learner_class_enrolments;
create trigger close_subjects_on_class_transfer after update of status on public.learner_class_enrolments
for each row execute function public.close_subjects_on_class_transfer();

-- An approved SNE exception changes only the learner's active subject load.
-- Existing Physics, Biology, Chemistry and mark rows are retained as history.
create or replace function public.apply_o_level_sne_replacement(p_enrolment_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_actor uuid;
 v_subject_id uuid;v_school_offering_id uuid;v_class_offering_id uuid;
begin
 select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id for update;
 if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null then
  raise exception 'Active learner placement required for SNE substitution';
 end if;
 select * into v_class from public.academic_classes where id=v_enrolment.class_id;
 if v_class.programme<>'O_LEVEL' or v_class.level not in (3,4) then raise exception 'SNE General Science replacement is available only in Senior 3 and Senior 4'; end if;
 if not exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id
  and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) then
  raise exception 'Approved platform SNE exception required';
 end if;
 select id into v_subject_id from public.system_subjects where programme='O_LEVEL' and subject_code='500' and is_active;
 select id into v_school_offering_id from public.school_subject_offerings where school_id=v_enrolment.school_id
  and academic_year_id=v_enrolment.academic_year_id and system_subject_id=v_subject_id and status='ACTIVE';
 if v_subject_id is null or v_school_offering_id is null then raise exception 'Activate General Science (catalogue code 500) for this academic year before approving the replacement'; end if;
 v_actor:=public.current_app_user_id();
 insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by,curriculum_source)
 values(v_enrolment.school_id,v_school_offering_id,v_enrolment.academic_year_id,v_class.id,true,'ACTIVE',v_actor,v_actor,'SNE_REPLACEMENT')
 on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=true,curriculum_source='SNE_REPLACEMENT',updated_by=excluded.updated_by,updated_at=now()
 returning id into v_class_offering_id;
 update public.learner_subject_enrolments ls set status='DROPPED',effective_to=greatest(ls.effective_from,current_date)
 from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
 where ls.enrolment_id=v_enrolment.id and ls.class_subject_offering_id=co.id and co.class_id=v_class.id
  and so.school_subject_code in ('535','553','545') and ls.status='ACTIVE' and ls.selection_type='REQUIRED';
 insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
 values(v_enrolment.school_id,v_enrolment.learner_id,v_enrolment.id,v_class_offering_id,'ACTIVE',v_enrolment.effective_from,'SNE_REPLACEMENT')
 on conflict(enrolment_id,class_subject_offering_id) do update set status='ACTIVE',selection_type='SNE_REPLACEMENT',effective_to=null;
 return v_class_offering_id;
end $$;
revoke all on function public.apply_o_level_sne_replacement(uuid) from public,anon,authenticated;

create or replace function public.approve_o_level_curriculum_exception(
 p_school_id uuid,p_academic_year_id uuid,p_learner_id uuid,p_exception_code text,p_reason text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid;v_id uuid;
begin
 if not public.is_active_platform_admin() then raise exception 'Platform Administrator approval required'; end if;
 if p_exception_code not in ('GENERAL_SCIENCE_REPLACEMENT','DUAL_RELIGION') then raise exception 'Unsupported exception policy'; end if;
 if length(trim(coalesce(p_reason,'')))<12 then raise exception 'A specific audit reason of at least 12 characters is required'; end if;
 if not exists(select 1 from public.learner_class_enrolments e join public.academic_classes c on c.id=e.class_id
  where e.learner_id=p_learner_id and e.school_id=p_school_id and e.academic_year_id=p_academic_year_id and e.status='ACTIVE' and c.programme='O_LEVEL'
  and ((p_exception_code='GENERAL_SCIENCE_REPLACEMENT' and c.level in (3,4)) or p_exception_code='DUAL_RELIGION'))
 then raise exception 'Exception does not match an active O-Level learner placement'; end if;
 v_actor:=public.current_app_user_id();
 insert into public.o_level_curriculum_exceptions(school_id,academic_year_id,learner_id,exception_code,reason,approved_by)
 values(p_school_id,p_academic_year_id,p_learner_id,p_exception_code,trim(p_reason),v_actor)
 on conflict(learner_id,academic_year_id,exception_code) do update set reason=excluded.reason,approved_by=v_actor,approved_at=now(),is_active=true
 returning id into v_id;
 if p_exception_code='GENERAL_SCIENCE_REPLACEMENT' then
  perform public.apply_o_level_sne_replacement((select e.id from public.learner_class_enrolments e
   join public.academic_classes c on c.id=e.class_id where e.learner_id=p_learner_id and e.school_id=p_school_id
    and e.academic_year_id=p_academic_year_id and e.status='ACTIVE' and e.effective_to is null
    and c.programme='O_LEVEL' and c.level in (3,4) order by e.effective_from desc limit 1));
 end if;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
 values(v_actor::text,'PLATFORM_ADMIN','O_LEVEL_POLICY_EXCEPTION_APPROVED','curriculum_exception',v_id::text,
 jsonb_build_object('school_id',p_school_id,'learner_id',p_learner_id,'exception_code',p_exception_code,'reason',trim(p_reason)));
 return v_id;
end $$;

create or replace function public.get_o_level_learner_subject_choices(p_enrolment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_sne boolean;
begin
 select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id;
 if v_enrolment.id is null or not public.is_active_school_member(v_enrolment.school_id) then raise exception 'Learner enrolment unavailable'; end if;
 select * into v_class from public.academic_classes where id=v_enrolment.class_id;
 if v_class.programme<>'O_LEVEL' then raise exception 'O-Level learner required'; end if;
 select exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id
  and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) into v_sne;
 return jsonb_build_object(
  'classLevel',v_class.level,'learnerId',v_enrolment.learner_id,'enrolmentId',v_enrolment.id,
  'requiredCount',case when v_class.level<=2 then 11 when v_sne then 5 else 7 end,'sneReplacement',v_sne,
  'electiveMin',1,'electiveMax',case when v_class.level<=2 then 1 else 2 end,
  'subjects',coalesce((select jsonb_agg(jsonb_build_object(
   'offeringId',co.id,'code',coalesce(so.school_subject_code,ss.subject_code),'name',coalesce(so.display_name_override,ss.subject_name),
   'requirement',r.requirement,'category',r.elective_category,
   'selected',ls.id is not null and ls.status='ACTIVE','selectionType',ls.selection_type
  ) order by case r.requirement when 'CORE' then 0 when 'RELIGION_OPTION' then 1 else 2 end,ss.subject_name)
  from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
  join public.system_subjects ss on ss.id=so.system_subject_id
  join public.o_level_curriculum_subject_rules r on r.system_subject_id=ss.id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.is_active
  left join public.learner_subject_enrolments ls on ls.enrolment_id=v_enrolment.id and ls.class_subject_offering_id=co.id
  where co.class_id=v_class.id and co.status='ACTIVE'
   and (not v_sne or r.requirement<>'CORE' or ss.subject_code not in ('535','553','545'))),'[]'::jsonb)
 );
end $$;

create or replace function public.set_o_level_learner_subject_choices(
 p_enrolment_id uuid,p_religion_offering_ids uuid[],p_elective_offering_ids uuid[]
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_actor uuid;
 v_elective_count integer;v_religion_count integer;v_valid_electives integer;v_valid_religion integer;
 v_required_actual integer;v_required_expected integer;v_offering_id uuid;v_sne boolean;
begin
 select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id for update;
 if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null or not public.is_school_admin_for(v_enrolment.school_id)
 then raise exception 'Active learner enrolment and School Administrator permission required'; end if;
 select * into v_class from public.academic_classes where id=v_enrolment.class_id;
 if v_class.programme<>'O_LEVEL' or v_class.status<>'ACTIVE' then raise exception 'Active O-Level class required'; end if;
 v_actor:=public.current_app_user_id();
 select exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id
  and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) into v_sne;
 select count(distinct x) into v_elective_count from unnest(coalesce(p_elective_offering_ids,'{}'::uuid[])) x;
 select count(distinct x) into v_religion_count from unnest(coalesce(p_religion_offering_ids,'{}'::uuid[])) x;
 if v_elective_count<1 or v_elective_count>(case when v_class.level<=2 then 1 else 2 end) then
  raise exception 'Senior % requires % elective(s), maximum %',v_class.level,1,(case when v_class.level<=2 then 1 else 2 end);
 end if;
 if v_class.level<=2 and v_religion_count<>1 and not (v_religion_count=2 and exists(select 1 from public.o_level_curriculum_exceptions
   where learner_id=v_enrolment.learner_id and academic_year_id=v_enrolment.academic_year_id and exception_code='DUAL_RELIGION' and is_active))
 then raise exception 'Select exactly one of CRE or IRE'; end if;
 if v_class.level>=3 and v_religion_count<>0 then raise exception 'Religious Education is an elective in Senior 3 and 4'; end if;
 select count(distinct co.id) into v_valid_electives from unnest(p_elective_offering_ids) x
 join public.class_subject_offerings co on co.id=x and co.class_id=v_class.id and co.school_id=v_enrolment.school_id and co.status='ACTIVE'
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='ELECTIVE' and r.is_active;
 if v_valid_electives<>v_elective_count then raise exception 'One or more electives are not active or allowed for this learner'; end if;
 select count(distinct co.id) into v_valid_religion from unnest(p_religion_offering_ids) x
 join public.class_subject_offerings co on co.id=x and co.class_id=v_class.id and co.school_id=v_enrolment.school_id and co.status='ACTIVE'
 join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.status='ACTIVE'
 join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement='RELIGION_OPTION' and r.is_active;
 if v_valid_religion<>v_religion_count then raise exception 'Religious Education choice is not available for this class'; end if;
 select count(*) into v_required_actual from public.learner_subject_enrolments ls
 join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
 where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('REQUIRED','SNE_REPLACEMENT') and co.status='ACTIVE';
 v_required_expected:=case when v_class.level<=2 then 10 when v_sne then 5 else 7 end;
 if v_required_actual<>v_required_expected then raise exception 'Required subjects are incomplete: % of % assigned',v_required_actual,v_required_expected; end if;
 -- Preserve marks history: a selected offering with marks cannot be removed.
 if exists(select 1 from public.learner_subject_enrolments ls join public.academic_mark_records mr
   on mr.learner_id=ls.learner_id and mr.class_subject_offering_id=ls.class_subject_offering_id
   where ls.enrolment_id=p_enrolment_id and ls.status='ACTIVE' and ls.selection_type in ('ELECTIVE','RELIGION_REQUIRED')
   and ls.class_subject_offering_id<>all(coalesce(p_elective_offering_ids,'{}'::uuid[])||coalesce(p_religion_offering_ids,'{}'::uuid[])))
 then raise exception 'A subject with recorded marks cannot be removed'; end if;
 update public.learner_subject_enrolments set status='DROPPED',effective_to=current_date
 where enrolment_id=p_enrolment_id and status='ACTIVE' and selection_type in ('ELECTIVE','RELIGION_REQUIRED')
 and class_subject_offering_id<>all(coalesce(p_elective_offering_ids,'{}'::uuid[])||coalesce(p_religion_offering_ids,'{}'::uuid[]));
 foreach v_offering_id in array coalesce(p_religion_offering_ids,'{}'::uuid[]) loop
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
  values(v_enrolment.school_id,v_enrolment.learner_id,p_enrolment_id,v_offering_id,'ACTIVE',v_enrolment.effective_from,'RELIGION_REQUIRED')
  on conflict(enrolment_id,class_subject_offering_id) do update set status='ACTIVE',selection_type='RELIGION_REQUIRED',effective_to=null;
 end loop;
 foreach v_offering_id in array coalesce(p_elective_offering_ids,'{}'::uuid[]) loop
  insert into public.learner_subject_enrolments(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type)
  values(v_enrolment.school_id,v_enrolment.learner_id,p_enrolment_id,v_offering_id,'ACTIVE',v_enrolment.effective_from,'ELECTIVE')
  on conflict(enrolment_id,class_subject_offering_id) do update set status='ACTIVE',selection_type='ELECTIVE',effective_to=null;
 end loop;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
 values(v_actor::text,'SCHOOL_ADMIN','O_LEVEL_LEARNER_SUBJECTS_SELECTED','learner_enrolment',p_enrolment_id::text,
  jsonb_build_object('religion_offering_ids',p_religion_offering_ids,'elective_offering_ids',p_elective_offering_ids));
 return jsonb_build_object('requiredCount',v_required_actual+v_religion_count,'electiveCount',v_elective_count,'ready',true);
end $$;

revoke all on function public.approve_o_level_curriculum_exception(uuid,uuid,uuid,text,text),public.get_o_level_learner_subject_choices(uuid),public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[]) from public,anon;
grant execute on function public.approve_o_level_curriculum_exception(uuid,uuid,uuid,text,text),public.get_o_level_learner_subject_choices(uuid),public.set_o_level_learner_subject_choices(uuid,uuid[],uuid[]) to authenticated;

-- Retain the existing allocation and mark state checks, then narrow O-Level
-- rosters to actual learner subject selections.
alter function public.get_marks_entry_workspace(uuid) rename to get_marks_entry_workspace_core;
revoke all on function public.get_marks_entry_workspace_core(uuid) from public,anon,authenticated;
create or replace function public.get_marks_entry_workspace(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_payload jsonb;v_offerings jsonb;
begin
 v_payload:=public.get_marks_entry_workspace_core(p_term_id);
 select coalesce(jsonb_agg(
  case when offering->>'programme'='O_LEVEL' then
   jsonb_set(offering,'{learners}',coalesce((select jsonb_agg(learner)
    from jsonb_array_elements(offering->'learners') learner
    where exists(select 1 from public.learner_subject_enrolments ls
     join public.learner_class_enrolments e on e.id=ls.enrolment_id
     where ls.class_subject_offering_id=(offering->>'id')::uuid
      and ls.learner_id=(learner->>'id')::uuid and ls.status='ACTIVE'
      and e.status='ACTIVE' and e.effective_to is null)),'[]'::jsonb))
  else offering end
 ),'[]'::jsonb) into v_offerings from jsonb_array_elements(v_payload->'offerings') offering;
 return jsonb_set(v_payload,'{offerings}',v_offerings);
end $$;

alter function public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) rename to save_academic_mark_record_core;
revoke all on function public.save_academic_mark_record_core(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon,authenticated;
create or replace function public.save_academic_mark_record(
 p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
 p_aoi_mark numeric,p_aoi_status text,p_exam_mark numeric,p_exam_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes;
begin
 select c.* into v_class from public.class_subject_offerings co
 join public.academic_classes c on c.id=co.class_id where co.id=p_class_subject_offering_id;
 if v_class.programme='O_LEVEL' then
  if not exists(select 1 from public.learner_subject_enrolments ls
   join public.learner_class_enrolments e on e.id=ls.enrolment_id
   where ls.class_subject_offering_id=p_class_subject_offering_id and ls.learner_id=p_learner_id
    and ls.status='ACTIVE' and e.status='ACTIVE' and e.effective_to is null)
  then raise exception 'Learner has not selected this O-Level subject'; end if;
  if not exists(select 1 from public.teacher_allocations ta
   where ta.term_id=p_term_id and ta.class_subject_offering_id=p_class_subject_offering_id
    and ta.status='ACTIVE' and ta.allocation_role='PRIMARY_SUBJECT_TEACHER')
  then raise exception 'Allocate a primary teacher before entering O-Level marks'; end if;
 end if;
 return public.save_academic_mark_record_core(p_term_id,p_class_subject_offering_id,p_learner_id,p_aoi_mark,p_aoi_status,p_exam_mark,p_exam_status);
end $$;
revoke all on function public.get_marks_entry_workspace(uuid),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) from public,anon;
grant execute on function public.get_marks_entry_workspace(uuid),public.save_academic_mark_record(uuid,uuid,uuid,numeric,text,numeric,text) to authenticated;

alter function public.get_academic_setup_health(uuid) rename to get_academic_setup_health_core;
revoke all on function public.get_academic_setup_health_core(uuid) from public,anon,authenticated;
create or replace function public.get_academic_setup_health(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_base jsonb;v_extra jsonb;
begin
 if not (public.is_active_school_member(p_school_id) or public.is_active_platform_admin()) then
  raise exception 'School membership required';
 end if;
 v_base:=public.get_academic_setup_health_core(p_school_id);
 select coalesce(jsonb_agg(to_jsonb(i) order by i.priority,i.title),'[]'::jsonb) into v_extra from (
  select 1 priority,'NCDC_REQUIRED_SUBJECT_NOT_ACTIVE' code,'error' severity,
   'Required subject not active' title,c.class_name||' requires '||ss.subject_name||' ('||ss.subject_code||').' detail,
   '/setup/subjects?search='||ss.subject_code path
  from public.academic_classes c join public.o_level_curriculum_subject_rules r on r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='CORE' and r.is_active
  join public.system_subjects ss on ss.id=r.system_subject_id
  where c.school_id=p_school_id and c.programme='O_LEVEL' and c.status in ('DRAFT','ACTIVE')
   and not exists(select 1 from public.school_subject_offerings so where so.school_id=p_school_id and so.academic_year_id=c.academic_year_id and so.system_subject_id=ss.id and so.status='ACTIVE')
  union all
  select 1,'NCDC_REQUIRED_SUBJECT_NOT_OFFERED','error','Class missing compulsory subject',
   c.class_name||' is missing '||ss.subject_name||' ('||ss.subject_code||').','/setup/classes/'||c.id
  from public.academic_classes c join public.o_level_curriculum_subject_rules r on r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='CORE' and r.is_active
  join public.system_subjects ss on ss.id=r.system_subject_id
  where c.school_id=p_school_id and c.programme='O_LEVEL' and c.status in ('DRAFT','ACTIVE')
   and not exists(select 1 from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
    where co.class_id=c.id and so.system_subject_id=ss.id and co.status='ACTIVE')
  union all
  select 1,'NCDC_RELIGION_OPTION_MISSING','error','Religious Education option missing',
   c.class_name||' requires CRE or IRE.','/setup/subjects?search=Religious'
  from public.academic_classes c where c.school_id=p_school_id and c.programme='O_LEVEL' and c.level in (1,2) and c.status in ('DRAFT','ACTIVE')
   and not exists(select 1 from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id
    join public.o_level_curriculum_subject_rules r on r.system_subject_id=so.system_subject_id and r.rule_set_id=c.o_level_rule_set_id and r.class_level=c.level and r.requirement='RELIGION_OPTION'
    where co.class_id=c.id and co.status='ACTIVE' and so.status='ACTIVE')
  union all
  select 1,'NCDC_LEARNER_ELECTIVE_LOAD','error','Learner elective selection needed',
   l.admission_number||' · '||c.class_name||' has '||count(ls.id)||' elective(s); expected '||case when c.level<=2 then 'exactly 1' else '1 or 2' end||'.',
   '/school/learners/'||l.id||'/subjects'
  from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id
  join public.academic_classes c on c.id=e.class_id
  left join public.learner_subject_enrolments ls on ls.enrolment_id=e.id and ls.status='ACTIVE' and ls.selection_type='ELECTIVE'
  where e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null and c.programme='O_LEVEL'
  group by e.id,l.id,l.admission_number,c.id,c.class_name,c.level
  having count(ls.id)<1 or count(ls.id)>case when c.level<=2 then 1 else 2 end
  union all
  select 1,'NCDC_LEARNER_RELIGION','error','Learner Religious Education choice needed',
   l.admission_number||' · select one of CRE or IRE.','/school/learners/'||l.id||'/subjects'
  from public.learner_class_enrolments e join public.learners l on l.id=e.learner_id
  join public.academic_classes c on c.id=e.class_id
  where e.school_id=p_school_id and e.status='ACTIVE' and e.effective_to is null and c.programme='O_LEVEL' and c.level in (1,2)
   and (select count(*) from public.learner_subject_enrolments ls where ls.enrolment_id=e.id and ls.status='ACTIVE' and ls.selection_type='RELIGION_REQUIRED')<>1
  union all
  select 1,'NCDC_INACTIVE_LEARNER_SUBJECT','error','Learner assigned to inactive subject',
   l.admission_number||' · '||coalesce(ss.subject_name,so.display_name_override,'Subject')||' is inactive.','/school/learners/'||l.id||'/subjects'
  from public.learner_subject_enrolments ls join public.learners l on l.id=ls.learner_id
  join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
  join public.school_subject_offerings so on so.id=co.school_subject_offering_id
  left join public.system_subjects ss on ss.id=so.system_subject_id
  where ls.school_id=p_school_id and ls.status='ACTIVE' and (co.status<>'ACTIVE' or so.status<>'ACTIVE')
 ) i;
 return jsonb_set(v_base,'{issues}',coalesce(v_base->'issues','[]'::jsonb)||v_extra);
end $$;
revoke all on function public.get_academic_setup_health(uuid) from public,anon;
grant execute on function public.get_academic_setup_health(uuid) to authenticated;
