-- OURSCHOOL Stage 14 / AC-3
-- Tenant-scoped A-Level combinations, learner assignments and paper results.

create type public.a_level_subject_role as enum ('PRINCIPAL','SUBSIDIARY','GENERAL_PAPER','COMPULSORY');
create type public.a_level_assignment_status as enum ('ACTIVE','ENDED');
do $$ begin create type public.mark_state as enum ('PRESENT','MISSING','ABSENT','EXEMPT'); exception when duplicate_object then null; end $$;
create table public.a_level_combinations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  code varchar(12) not null, name varchar(180) not null, level varchar(10) not null default 'BOTH' check(level in ('S5','S6','BOTH')),
  status public.offering_status not null default 'DRAFT', effective_from date, effective_to date,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year_id, code)
);
create table public.a_level_combination_subjects (
  id uuid primary key default gen_random_uuid(), combination_id uuid not null references public.a_level_combinations(id) on delete cascade,
  school_subject_offering_id uuid not null references public.school_subject_offerings(id) on delete restrict,
  subject_role public.a_level_subject_role not null, principal_position smallint, display_order smallint not null, created_at timestamptz not null default now(),
  constraint principal_position_role_check check((subject_role='PRINCIPAL' and principal_position between 1 and 3) or (subject_role<>'PRINCIPAL' and principal_position is null)),
  unique (combination_id, school_subject_offering_id), unique (combination_id, display_order)
);
create unique index combination_principal_position_unique on public.a_level_combination_subjects(combination_id,principal_position) where subject_role='PRINCIPAL';
create unique index combination_one_general_unique on public.a_level_combination_subjects(combination_id) where subject_role='GENERAL_PAPER';
create unique index combination_one_subsidiary_unique on public.a_level_combination_subjects(combination_id) where subject_role='SUBSIDIARY';
create function public.validate_active_a_level_combination() returns trigger language plpgsql as $$
declare target_id uuid; combination_status public.offering_status; principal_count integer; general_count integer; subsidiary_count integer;
begin
 target_id := coalesce(new.combination_id,old.combination_id);
 select status into combination_status from public.a_level_combinations where id=target_id;
 if combination_status='ACTIVE' then
  select count(*) filter(where subject_role='PRINCIPAL'),count(*) filter(where subject_role='GENERAL_PAPER'),count(*) filter(where subject_role='SUBSIDIARY')
  into principal_count,general_count,subsidiary_count from public.a_level_combination_subjects where combination_id=target_id;
  if principal_count<>3 or general_count<>1 or subsidiary_count<>1 then raise exception 'Active A-Level combination requires three principals, one General Paper and one subsidiary.'; end if;
 end if;
 return coalesce(new,old);
end $$;
create constraint trigger validate_active_combination_subject_count after insert or update or delete on public.a_level_combination_subjects deferrable initially deferred for each row execute function public.validate_active_a_level_combination();
create table public.a_level_learner_assignments (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null references public.learners(id) on delete restrict,
  class_id uuid not null references public.academic_classes(id) on delete restrict,
  combination_id uuid not null references public.a_level_combinations(id) on delete restrict,
  status public.a_level_assignment_status not null default 'ACTIVE', starts_on date not null, ends_on date,
  assigned_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(),
  constraint assignment_dates_check check (ends_on is null or ends_on >= starts_on)
);
create unique index one_active_a_level_assignment_per_learner on public.a_level_learner_assignments(learner_id) where status = 'ACTIVE';
create table public.a_level_paper_marks (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  learner_assignment_id uuid not null references public.a_level_learner_assignments(id) on delete restrict,
  school_subject_offering_id uuid not null references public.school_subject_offerings(id) on delete restrict,
  system_subject_paper_id uuid not null references public.system_subject_papers(id) on delete restrict,
  academic_term_id uuid not null references public.terms(id) on delete restrict,
  mark numeric(5,2), mark_state public.mark_state not null default 'MISSING',
  grading_scheme_version varchar(100), recorded_by uuid references auth.users(id) on delete restrict,
  recorded_at timestamptz, updated_at timestamptz not null default now(),
  constraint a_level_mark_range check (mark is null or (mark >= 0 and mark <= 100)),
  constraint a_level_mark_state_value check ((mark_state = 'PRESENT' and mark is not null) or (mark_state <> 'PRESENT' and mark is null)),
  unique (learner_assignment_id, school_subject_offering_id, system_subject_paper_id, academic_term_id)
);
alter table public.a_level_combinations enable row level security;
alter table public.a_level_combination_subjects enable row level security;
alter table public.a_level_learner_assignments enable row level security;
alter table public.a_level_paper_marks enable row level security;
insert into public.permissions (code, description) values
 ('alevel.combinations.view','View A-Level combinations and learner assignments.'),
 ('alevel.combinations.manage','Manage A-Level combinations and learner assignments.'),
 ('alevel.marks.enter','Enter A-Level paper marks.'),
 ('alevel.reports.view','View A-Level school progress reports.')
on conflict (code) do update set description=excluded.description;
insert into public.role_permissions (role_id, permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('alevel.combinations.view','alevel.combinations.manage','alevel.marks.enter','alevel.reports.view')
where r.code in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES') on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.code in ('alevel.combinations.view','alevel.marks.enter','alevel.reports.view')
where r.code in ('HOD','TEACHER','CLASS_TEACHER') on conflict do nothing;
-- Direct client writes remain disabled. The API derives school_id from active membership,
-- validates class/learner ownership, injects General Paper from the active combination,
-- writes marks transactionally, and records every mutation in the audit log.;
