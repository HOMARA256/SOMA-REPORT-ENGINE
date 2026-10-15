-- OURSCHOOL Stage 33
-- Authoritative, tenant-scoped A-Level combinations, assessment paper selection,
-- paper marks, grading and audit. This migration is additive and idempotent.

alter table public.a_level_paper_marks
  add column if not exists assessment_id uuid references public.academic_assessments(id) on delete restrict;

-- The legacy uniqueness key used term_id and therefore prevented two different
-- assessments in the same term from recording the same subject paper.
do $$ declare constraint_name text; begin
  select c.conname into constraint_name
  from pg_constraint c
  where c.conrelid='public.a_level_paper_marks'::regclass and c.contype='u'
    and (select array_agg(a.attname order by a.attname) from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k)
      = array['academic_term_id','learner_assignment_id','school_subject_offering_id','system_subject_paper_id']::name[];
  if constraint_name is not null then execute format('alter table public.a_level_paper_marks drop constraint %I',constraint_name); end if;
end $$;

create unique index if not exists a_level_marks_assessment_paper_unique
  on public.a_level_paper_marks(assessment_id,learner_assignment_id,school_subject_offering_id,system_subject_paper_id)
  where assessment_id is not null;

create table if not exists public.a_level_grading_schemes(
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  subject_level public.subject_level not null,
  name varchar(180) not null,
  version varchar(40) not null,
  status public.offering_status not null default 'DRAFT',
  effective_from date not null,
  effective_to date,
  approved_by uuid references public.users(id) on delete restrict,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(school_id,academic_year_id,subject_level,version),
  check(subject_level in ('PRINCIPAL','SUBSIDIARY','GENERAL_PAPER')),
  check(effective_to is null or effective_to >= effective_from),
  check(status <> 'ACTIVE' or (approved_by is not null and approved_at is not null))
);

create table if not exists public.a_level_grading_bands(
  id uuid primary key default gen_random_uuid(),
  scheme_id uuid not null references public.a_level_grading_schemes(id) on delete cascade,
  grade varchar(8) not null,
  minimum_score numeric(5,2) not null check(minimum_score between 0 and 100),
  maximum_score numeric(5,2) not null check(maximum_score between 0 and 100),
  points numeric(5,2) not null check(points >= 0),
  descriptor varchar(180) not null,
  display_order smallint not null check(display_order > 0),
  unique(scheme_id,grade), unique(scheme_id,display_order),
  check(minimum_score <= maximum_score)
);

alter table public.a_level_grading_schemes enable row level security;
alter table public.a_level_grading_bands enable row level security;
drop policy if exists "members read A-Level grading schemes" on public.a_level_grading_schemes;
create policy "members read A-Level grading schemes" on public.a_level_grading_schemes for select to authenticated using(public.is_active_school_member(school_id));
drop policy if exists "members read A-Level grading bands" on public.a_level_grading_bands;
create policy "members read A-Level grading bands" on public.a_level_grading_bands for select to authenticated using(exists(select 1 from public.a_level_grading_schemes s where s.id=scheme_id and public.is_active_school_member(s.school_id)));

do $$ declare relation text; begin
  foreach relation in array array['a_level_combinations','a_level_combination_subjects','a_level_learner_assignments','a_level_paper_marks'] loop
    execute format('drop policy if exists "members read %1$s" on public.%1$I',relation);
  end loop;
end $$;
create policy "members read a_level_combinations" on public.a_level_combinations for select to authenticated using(public.is_active_school_member(school_id));
create policy "members read a_level_combination_subjects" on public.a_level_combination_subjects for select to authenticated using(exists(select 1 from public.a_level_combinations c where c.id=combination_id and public.is_active_school_member(c.school_id)));
create policy "members read a_level_learner_assignments" on public.a_level_learner_assignments for select to authenticated using(public.is_active_school_member(school_id));
create policy "members read a_level_paper_marks" on public.a_level_paper_marks for select to authenticated using(public.is_active_school_member(school_id));

create or replace function public.current_school_actor(p_permission text default null)
returns table(user_id uuid,school_id uuid,role_code text)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select u.id,m.school_id,r.code
  from public.users u join public.school_memberships m on m.user_id=u.id and m.status='ACTIVE'
  join public.roles r on r.id=m.role_id
  where u.auth_user_id=auth.uid() and u.is_active
    and (p_permission is null or exists(select 1 from public.role_permissions rp join public.permissions p on p.id=rp.permission_id where rp.role_id=r.id and p.code=p_permission))
  order by m.created_at limit 1
$$;
revoke all on function public.current_school_actor(text) from public,anon;
grant execute on function public.current_school_actor(text) to authenticated;

create or replace function public.save_a_level_combination(
  p_year uuid,p_code text,p_name text,p_level text,p_status text,p_principals uuid[],p_subsidiary uuid
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor record; v_combination uuid; v_gp uuid; v_existing uuid; v_used boolean; v_role public.offering_status;
begin
  select * into v_actor from public.current_school_actor('alevel.combinations.manage');
  if v_actor.user_id is null then raise exception 'NOT_AUTHORISED'; end if;
  if not exists(select 1 from public.academic_years y where y.id=p_year and y.school_id=v_actor.school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
  if nullif(trim(p_code),'') is null or nullif(trim(p_name),'') is null then raise exception 'CODE_AND_NAME_REQUIRED'; end if;
  if p_level not in ('S5','S6','BOTH') then raise exception 'INVALID_LEVEL'; end if;
  if p_status not in ('DRAFT','ACTIVE') then raise exception 'INVALID_STATUS'; end if;
  if cardinality(p_principals)<>3 or (select count(distinct x) from unnest(p_principals) x)<>3 then raise exception 'THREE_DISTINCT_PRINCIPALS_REQUIRED'; end if;
  if p_subsidiary is null then raise exception 'SUBSIDIARY_REQUIRED'; end if;
  if (select count(*) from public.school_subject_offerings o where o.id=any(p_principals) and o.school_id=v_actor.school_id and o.academic_year_id=p_year and o.programme='A_LEVEL' and o.subject_level='PRINCIPAL' and o.status='ACTIVE')<>3 then raise exception 'PRINCIPAL_OFFERING_NOT_AVAILABLE'; end if;
  if not exists(select 1 from public.school_subject_offerings o where o.id=p_subsidiary and o.school_id=v_actor.school_id and o.academic_year_id=p_year and o.programme='A_LEVEL' and o.subject_level='SUBSIDIARY' and o.status='ACTIVE') then raise exception 'SUBSIDIARY_OFFERING_NOT_AVAILABLE'; end if;
  select o.id into v_gp from public.school_subject_offerings o where o.school_id=v_actor.school_id and o.academic_year_id=p_year and o.programme='A_LEVEL' and o.subject_level='GENERAL_PAPER' and o.status='ACTIVE' order by o.created_at limit 1;
  if v_gp is null then raise exception 'ACTIVE_GENERAL_PAPER_REQUIRED'; end if;
  select id into v_existing from public.a_level_combinations where school_id=v_actor.school_id and academic_year_id=p_year and code=upper(trim(p_code));
  select exists(select 1 from public.a_level_learner_assignments where combination_id=v_existing) into v_used;
  if coalesce(v_used,false) then raise exception 'USED_COMBINATION_IS_VERSION_LOCKED'; end if;
  v_role:=p_status::public.offering_status;
  insert into public.a_level_combinations(school_id,academic_year_id,code,name,level,status,created_by,effective_from)
  values(v_actor.school_id,p_year,upper(trim(p_code)),trim(p_name),p_level,v_role,auth.uid(),current_date)
  on conflict(school_id,academic_year_id,code) do update set name=excluded.name,level=excluded.level,status=excluded.status,updated_at=now()
  returning id into v_combination;
  delete from public.a_level_combination_subjects where combination_id=v_combination;
  insert into public.a_level_combination_subjects(combination_id,school_subject_offering_id,subject_role,principal_position,display_order)
  select v_combination,p_principals[i],'PRINCIPAL'::public.a_level_subject_role,i,i from generate_series(1,3) i;
  insert into public.a_level_combination_subjects(combination_id,school_subject_offering_id,subject_role,display_order) values
    (v_combination,v_gp,'GENERAL_PAPER',4),(v_combination,p_subsidiary,'SUBSIDIARY',5);
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select u.id,u.full_name,v_actor.role_code,'A_LEVEL_COMBINATION_SAVED','a_level_combination',v_combination::text,jsonb_build_object('school_id',v_actor.school_id,'code',upper(trim(p_code)),'principals',p_principals,'general_paper',v_gp,'subsidiary',p_subsidiary,'status',p_status) from public.users u where u.id=v_actor.user_id;
  return v_combination;
end $$;
revoke all on function public.save_a_level_combination(uuid,text,text,text,text,uuid[],uuid) from public,anon;
grant execute on function public.save_a_level_combination(uuid,text,text,text,text,uuid[],uuid) to authenticated;

create or replace function public.assign_a_level_combination(p_combination uuid,p_learners uuid[],p_starts_on date)
returns integer language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor record; v_comb public.a_level_combinations%rowtype; v_learner uuid; v_class uuid; v_count int:=0;
begin
  select * into v_actor from public.current_school_actor('alevel.combinations.manage'); if v_actor.user_id is null then raise exception 'NOT_AUTHORISED'; end if;
  select * into v_comb from public.a_level_combinations where id=p_combination and school_id=v_actor.school_id and status='ACTIVE'; if v_comb.id is null then raise exception 'ACTIVE_COMBINATION_NOT_FOUND'; end if;
  if (select count(*) from public.a_level_combination_subjects where combination_id=p_combination and subject_role='PRINCIPAL')<>3 or (select count(*) from public.a_level_combination_subjects where combination_id=p_combination and subject_role='GENERAL_PAPER')<>1 or (select count(*) from public.a_level_combination_subjects where combination_id=p_combination and subject_role='SUBSIDIARY')<>1 then raise exception 'COMBINATION_INCOMPLETE'; end if;
  foreach v_learner in array p_learners loop
    select e.class_id into v_class from public.learner_class_enrolments e join public.academic_classes c on c.id=e.class_id where e.learner_id=v_learner and e.school_id=v_actor.school_id and e.academic_year_id=v_comb.academic_year_id and e.status='ACTIVE' and c.programme='A_LEVEL' order by e.created_at desc limit 1;
    if v_class is null then raise exception 'LEARNER_%_HAS_NO_ACTIVE_A_LEVEL_ENROLMENT',v_learner; end if;
    update public.a_level_learner_assignments set status='ENDED',ends_on=p_starts_on-1 where school_id=v_actor.school_id and learner_id=v_learner and status='ACTIVE';
    insert into public.a_level_learner_assignments(school_id,learner_id,class_id,combination_id,status,starts_on,assigned_by) values(v_actor.school_id,v_learner,v_class,p_combination,'ACTIVE',p_starts_on,auth.uid()); v_count:=v_count+1;
  end loop;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value) select u.id,u.full_name,v_actor.role_code,'A_LEVEL_LEARNERS_ASSIGNED','a_level_combination',p_combination::text,jsonb_build_object('school_id',v_actor.school_id,'learner_ids',p_learners,'starts_on',p_starts_on) from public.users u where u.id=v_actor.user_id;
  return v_count;
end $$;
revoke all on function public.assign_a_level_combination(uuid,uuid[],date) from public,anon;
grant execute on function public.assign_a_level_combination(uuid,uuid[],date) to authenticated;

create or replace function public.set_assessment_subject_papers(p_assessment uuid,p_offering uuid,p_papers uuid[])
returns integer language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor record; v_order int:=0; v_paper uuid; v_status public.offering_status;
begin
  select * into v_actor from public.current_school_actor('assessments.papers.manage'); if v_actor.user_id is null then raise exception 'NOT_AUTHORISED'; end if;
  select status into v_status from public.academic_assessments where id=p_assessment and school_id=v_actor.school_id;
  if v_status is null then raise exception 'ASSESSMENT_NOT_OWNED'; end if; if v_status not in ('DRAFT','ACTIVE') then raise exception 'ASSESSMENT_PAPERS_LOCKED'; end if;
  if not exists(select 1 from public.school_subject_offerings where id=p_offering and school_id=v_actor.school_id and status='ACTIVE') then raise exception 'OFFERING_NOT_AVAILABLE'; end if;
  if cardinality(coalesce(p_papers,array[]::uuid[]))<1 then raise exception 'SELECT_AT_LEAST_ONE_PAPER'; end if;
  if (select count(*) from unnest(p_papers) x join public.system_subject_papers p on p.id=x join public.school_subject_offerings o on o.id=p_offering and o.system_subject_id=p.system_subject_id where p.is_active and p.verification_status='VERIFIED')<>cardinality(p_papers) then raise exception 'PAPER_NOT_CONFIGURED_FOR_SUBJECT'; end if;
  delete from public.assessment_subject_papers where assessment_id=p_assessment and school_subject_offering_id=p_offering;
  foreach v_paper in array p_papers loop v_order:=v_order+1; insert into public.assessment_subject_papers(school_id,assessment_id,school_subject_offering_id,system_subject_paper_id,is_required,display_order,selected_by) values(v_actor.school_id,p_assessment,p_offering,v_paper,true,v_order,auth.uid()); end loop;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value) select u.id,u.full_name,v_actor.role_code,'ASSESSMENT_PAPERS_SELECTED','academic_assessment',p_assessment::text,jsonb_build_object('school_id',v_actor.school_id,'offering_id',p_offering,'paper_ids',p_papers) from public.users u where u.id=v_actor.user_id;
  return v_order;
end $$;
revoke all on function public.set_assessment_subject_papers(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.set_assessment_subject_papers(uuid,uuid,uuid[]) to authenticated;

create or replace function public.save_a_level_paper_mark(p_assessment uuid,p_assignment uuid,p_offering uuid,p_paper uuid,p_state public.mark_state,p_mark numeric)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor record; v_term uuid; v_id uuid; v_admin boolean; v_allowed boolean;
begin
  select * into v_actor from public.current_school_actor('alevel.marks.enter'); if v_actor.user_id is null then raise exception 'NOT_AUTHORISED'; end if;
  select a.term_id into v_term from public.academic_assessments a where a.id=p_assessment and a.school_id=v_actor.school_id and a.status='ACTIVE'; if v_term is null then raise exception 'ASSESSMENT_NOT_OPEN'; end if;
  if not exists(select 1 from public.a_level_learner_assignments la join public.a_level_combination_subjects cs on cs.combination_id=la.combination_id where la.id=p_assignment and la.school_id=v_actor.school_id and la.status='ACTIVE' and cs.school_subject_offering_id=p_offering) then raise exception 'LEARNER_NOT_ASSIGNED_TO_SUBJECT'; end if;
  if not exists(select 1 from public.assessment_subject_papers asp where asp.assessment_id=p_assessment and asp.school_subject_offering_id=p_offering and asp.system_subject_paper_id=p_paper and asp.is_required) then raise exception 'PAPER_NOT_SELECTED_FOR_ASSESSMENT'; end if;
  select v_actor.role_code in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES') into v_admin;
  select v_admin or exists(select 1 from public.subject_teacher_allocations ta where ta.school_id=v_actor.school_id and ta.term_id=v_term and ta.subject_offering_id=p_offering and ta.teacher_user_id=v_actor.user_id and ta.is_active) into v_allowed;
  if not v_allowed then raise exception 'TEACHER_ALLOCATION_REQUIRED'; end if;
  if (p_state='PRESENT' and (p_mark is null or p_mark<0 or p_mark>100)) or (p_state<>'PRESENT' and p_mark is not null) then raise exception 'INVALID_MARK_STATE_OR_VALUE'; end if;
  insert into public.a_level_paper_marks(school_id,assessment_id,learner_assignment_id,school_subject_offering_id,system_subject_paper_id,academic_term_id,mark,mark_state,recorded_by,recorded_at)
  values(v_actor.school_id,p_assessment,p_assignment,p_offering,p_paper,v_term,p_mark,p_state,auth.uid(),now())
  on conflict(assessment_id,learner_assignment_id,school_subject_offering_id,system_subject_paper_id) where assessment_id is not null
  do update set mark=excluded.mark,mark_state=excluded.mark_state,recorded_by=auth.uid(),recorded_at=now(),updated_at=now() returning id into v_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value) select u.id,u.full_name,v_actor.role_code,'A_LEVEL_PAPER_MARK_SAVED','a_level_paper_mark',v_id::text,jsonb_build_object('school_id',v_actor.school_id,'assessment_id',p_assessment,'assignment_id',p_assignment,'offering_id',p_offering,'paper_id',p_paper,'state',p_state,'mark',p_mark) from public.users u where u.id=v_actor.user_id;
  return v_id;
end $$;
revoke all on function public.save_a_level_paper_mark(uuid,uuid,uuid,uuid,public.mark_state,numeric) from public,anon;
grant execute on function public.save_a_level_paper_mark(uuid,uuid,uuid,uuid,public.mark_state,numeric) to authenticated;

create or replace function public.a_level_subject_result(p_assessment uuid,p_assignment uuid,p_offering uuid)
returns table(result_status text,subject_score numeric,grade text,points numeric,descriptor text,scheme_version text)
language sql stable security definer set search_path=public,auth,pg_temp as $$
with selected as (
 select asp.system_subject_paper_id from public.assessment_subject_papers asp join public.academic_assessments a on a.id=asp.assessment_id
 where asp.assessment_id=p_assessment and asp.school_subject_offering_id=p_offering and asp.is_required and public.is_active_school_member(a.school_id)
), resolved as (
 select s.system_subject_paper_id,m.mark,m.mark_state from selected s left join public.a_level_paper_marks m on m.assessment_id=p_assessment and m.learner_assignment_id=p_assignment and m.school_subject_offering_id=p_offering and m.system_subject_paper_id=s.system_subject_paper_id
), score as (
 select case when count(*)=0 then 'NOT_CONFIGURED' when count(*) filter(where mark_state='PRESENT' and mark is not null)<>count(*) then 'INCOMPLETE' else 'COMPLETE' end status,
 case when count(*)>0 and count(*) filter(where mark_state='PRESENT' and mark is not null)=count(*) then round(avg(mark),1) end value from resolved
), scheme as (
 select gs.* from public.a_level_grading_schemes gs join public.a_level_learner_assignments la on la.id=p_assignment join public.school_subject_offerings o on o.id=p_offering and o.school_id=la.school_id
 where gs.school_id=la.school_id and gs.academic_year_id=(select academic_year_id from public.a_level_combinations where id=la.combination_id) and gs.subject_level=o.subject_level and gs.status='ACTIVE' order by gs.effective_from desc limit 1
)
select score.status,score.value,b.grade,b.points,b.descriptor,scheme.version from score left join scheme on true left join public.a_level_grading_bands b on b.scheme_id=scheme.id and score.value between b.minimum_score and b.maximum_score
$$;
revoke all on function public.a_level_subject_result(uuid,uuid,uuid) from public,anon;
grant execute on function public.a_level_subject_result(uuid,uuid,uuid) to authenticated;

revoke insert,update,delete,truncate,references,trigger on public.a_level_combinations,public.a_level_combination_subjects,public.a_level_learner_assignments,public.a_level_paper_marks,public.assessment_subject_papers,public.a_level_grading_schemes,public.a_level_grading_bands from authenticated,anon;
