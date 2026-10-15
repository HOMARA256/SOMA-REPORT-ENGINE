-- Shared subject reference data and tenant-scoped school offerings.
-- Official codes/papers are intentionally nullable and remain pending until
-- loaded from an authorised UNEB/NCDC source.

create type public.subject_programme as enum ('O_LEVEL', 'A_LEVEL');
create type public.subject_level as enum ('ORDINARY', 'PRINCIPAL', 'SUBSIDIARY', 'GENERAL_PAPER', 'OTHER');
create type public.reference_verification_status as enum ('VERIFIED', 'PENDING_VERIFICATION', 'RETIRED');
create type public.subject_component_type as enum ('THEORY', 'PRACTICAL', 'ORAL', 'AURAL', 'COURSEWORK', 'PROJECT', 'STUDIO', 'PERFORMANCE', 'ICT_PRACTICAL', 'OTHER');
create type public.offering_status as enum ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
create table public.system_subjects (
  id uuid primary key default gen_random_uuid(),
  programme public.subject_programme not null,
  subject_code varchar(50),
  subject_name varchar(180) not null,
  short_name varchar(100) not null,
  department_category varchar(120) not null,
  subject_category varchar(120),
  subject_level public.subject_level,
  curriculum_version varchar(100),
  exam_body varchar(100),
  is_examinable boolean not null default true,
  is_active boolean not null default true,
  verification_status public.reference_verification_status not null default 'PENDING_VERIFICATION',
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_subjects_effective_dates check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint system_subjects_programme_name_key unique (programme, subject_name)
);
create table public.system_subject_papers (
  id uuid primary key default gen_random_uuid(),
  system_subject_id uuid not null references public.system_subjects(id) on delete restrict,
  paper_code varchar(50),
  paper_number varchar(30),
  paper_name varchar(180) not null,
  component_type public.subject_component_type not null,
  maximum_mark numeric(8,2),
  duration_minutes integer,
  display_order smallint not null default 1,
  is_required boolean not null default true,
  is_active boolean not null default true,
  curriculum_version varchar(100),
  examination_year integer,
  verification_status public.reference_verification_status not null default 'PENDING_VERIFICATION',
  source_reference text,
  effective_from date,
  effective_to date,
  constraint system_subject_papers_marks check (maximum_mark is null or maximum_mark > 0),
  constraint system_subject_papers_duration check (duration_minutes is null or duration_minutes > 0),
  constraint system_subject_papers_order check (display_order > 0),
  constraint system_subject_papers_effective_dates check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create table public.academic_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  programme public.subject_programme not null,
  class_name varchar(100) not null,
  level smallint not null,
  status public.offering_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_classes_level check ((programme = 'O_LEVEL' and level between 1 and 4) or (programme = 'A_LEVEL' and level between 5 and 6)),
  constraint academic_classes_school_name_key unique (school_id, academic_year_id, class_name),
  constraint academic_classes_id_school_key unique (id, school_id)
);
create table public.class_streams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  class_id uuid not null,
  stream_name varchar(100) not null,
  status public.offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint class_streams_class_school_fk foreign key (class_id, school_id) references public.academic_classes(id, school_id) on delete restrict,
  constraint class_streams_class_name_key unique (class_id, stream_name),
  constraint class_streams_id_school_key unique (id, school_id)
);
create table public.school_subject_offerings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  system_subject_id uuid references public.system_subjects(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  programme public.subject_programme not null,
  department_id uuid,
  school_subject_code varchar(50),
  display_name_override varchar(180),
  subject_source varchar(30) not null default 'SYSTEM_CATALOGUE',
  status public.offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_subject_source check (subject_source in ('SYSTEM_CATALOGUE', 'SCHOOL_DEFINED')),
  constraint school_subject_master_required check ((subject_source = 'SYSTEM_CATALOGUE' and system_subject_id is not null) or subject_source = 'SCHOOL_DEFINED'),
  constraint school_subject_offering_key unique (school_id, academic_year_id, system_subject_id),
  constraint school_subject_offerings_id_school_key unique (id, school_id)
);
create table public.class_subject_offerings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  school_subject_offering_id uuid not null,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_id uuid not null,
  stream_id uuid,
  is_compulsory boolean not null default true,
  status public.offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_subject_school_subject_fk foreign key (school_subject_offering_id, school_id) references public.school_subject_offerings(id, school_id) on delete restrict,
  constraint class_subject_class_fk foreign key (class_id, school_id) references public.academic_classes(id, school_id) on delete restrict,
  constraint class_subject_stream_fk foreign key (stream_id, school_id) references public.class_streams(id, school_id) on delete restrict,
  constraint class_subject_scope_key unique nulls not distinct (school_subject_offering_id, class_id, stream_id),
  constraint class_subject_offerings_id_school_key unique (id, school_id)
);
create table public.teacher_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  class_subject_offering_id uuid not null,
  stream_id uuid,
  status public.offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_allocation_offering_fk foreign key (class_subject_offering_id, school_id) references public.class_subject_offerings(id, school_id) on delete restrict,
  constraint teacher_allocation_stream_fk foreign key (stream_id, school_id) references public.class_streams(id, school_id) on delete restrict,
  constraint teacher_allocation_scope_key unique nulls not distinct (term_id, teacher_id, class_subject_offering_id, stream_id)
);
create table public.subject_combinations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  code varchar(40) not null,
  name varchar(140) not null,
  status public.offering_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subject_combinations_school_code_key unique (school_id, academic_year_id, code),
  constraint subject_combinations_id_school_key unique (id, school_id)
);
create table public.combination_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  combination_id uuid not null,
  school_subject_offering_id uuid not null,
  subject_level public.subject_level not null,
  display_order smallint not null,
  constraint combination_subject_combination_fk foreign key (combination_id, school_id) references public.subject_combinations(id, school_id) on delete cascade,
  constraint combination_subject_offering_fk foreign key (school_subject_offering_id, school_id) references public.school_subject_offerings(id, school_id) on delete restrict,
  constraint combination_subject_order check (display_order > 0),
  constraint combination_subject_unique unique (combination_id, school_subject_offering_id)
);
create table public.learners (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  admission_number varchar(80) not null,
  first_name varchar(100) not null,
  other_name varchar(100),
  last_name varchar(100) not null,
  status varchar(30) not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learners_status check (status in ('ACTIVE', 'INACTIVE', 'WITHDRAWN', 'COMPLETED')),
  constraint learners_school_admission_key unique (school_id, admission_number),
  constraint learners_id_school_key unique (id, school_id)
);
create table public.learner_class_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  class_id uuid not null,
  stream_id uuid,
  status varchar(30) not null default 'ACTIVE',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint learner_class_learner_fk foreign key (learner_id, school_id) references public.learners(id, school_id) on delete restrict,
  constraint learner_class_class_fk foreign key (class_id, school_id) references public.academic_classes(id, school_id) on delete restrict,
  constraint learner_class_stream_fk foreign key (stream_id, school_id) references public.class_streams(id, school_id) on delete restrict,
  constraint learner_class_status check (status in ('ACTIVE', 'TRANSFERRED', 'PROMOTED', 'WITHDRAWN', 'COMPLETED')),
  constraint learner_class_dates check (effective_to is null or effective_to >= effective_from),
  constraint learner_class_scope_key unique (learner_id, academic_year_id)
);
create table public.learner_subject_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  learner_id uuid not null,
  enrolment_id uuid not null references public.learner_class_enrolments(id) on delete restrict,
  class_subject_offering_id uuid not null,
  status varchar(30) not null default 'ACTIVE',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint learner_subject_learner_fk foreign key (learner_id, school_id) references public.learners(id, school_id) on delete restrict,
  constraint learner_subject_offering_fk foreign key (class_subject_offering_id, school_id) references public.class_subject_offerings(id, school_id) on delete restrict,
  constraint learner_subject_status check (status in ('ACTIVE', 'DROPPED', 'COMPLETED')),
  constraint learner_subject_dates check (effective_to is null or effective_to >= effective_from),
  constraint learner_subject_scope_key unique (enrolment_id, class_subject_offering_id)
);
create table public.learner_combination_enrolments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  enrolment_id uuid not null references public.learner_class_enrolments(id) on delete restrict,
  combination_id uuid not null,
  status varchar(30) not null default 'ACTIVE',
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  constraint learner_combination_fk foreign key (combination_id, school_id) references public.subject_combinations(id, school_id) on delete restrict,
  constraint learner_combination_status check (status in ('ACTIVE', 'CHANGED', 'COMPLETED')),
  constraint learner_combination_dates check (effective_to is null or effective_to >= effective_from),
  constraint learner_combination_scope_key unique (enrolment_id, combination_id)
);
create index system_subjects_programme_idx on public.system_subjects(programme, is_active);
create index system_subject_papers_subject_idx on public.system_subject_papers(system_subject_id);
create index school_subject_offerings_school_idx on public.school_subject_offerings(school_id, academic_year_id);
create index class_subject_offerings_school_idx on public.class_subject_offerings(school_id, class_id);
create index teacher_allocations_teacher_idx on public.teacher_allocations(school_id, teacher_id, term_id);
create index learner_class_enrolments_school_idx on public.learner_class_enrolments(school_id, academic_year_id, class_id);
create index learner_subject_enrolments_school_idx on public.learner_subject_enrolments(school_id, class_subject_offering_id);
insert into public.system_subjects (programme, subject_name, short_name, department_category, subject_category, subject_level, verification_status)
values
  ('O_LEVEL', 'Mathematics', 'Mathematics', 'Mathematics', 'Mathematics', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'English Language', 'English', 'Languages', 'Languages', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Physics', 'Physics', 'Sciences', 'Sciences', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Chemistry', 'Chemistry', 'Sciences', 'Sciences', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Biology', 'Biology', 'Sciences', 'Sciences', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Geography', 'Geography', 'Humanities', 'Humanities', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'History & Political Education', 'History', 'Humanities', 'Humanities', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Information and Communication Technology', 'ICT', 'Technology', 'Technology', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Agriculture', 'Agriculture', 'Vocational', 'Vocational', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Entrepreneurship Education', 'Entrepreneurship', 'Vocational', 'Vocational', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Kiswahili', 'Kiswahili', 'Languages', 'Languages', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('O_LEVEL', 'Religious Education', 'Religious Education', 'Humanities', 'Humanities', 'ORDINARY', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'General Paper', 'General Paper', 'General', 'General', 'GENERAL_PAPER', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Mathematics', 'Mathematics', 'Mathematics', 'Mathematics', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Physics', 'Physics', 'Sciences', 'Sciences', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Chemistry', 'Chemistry', 'Sciences', 'Sciences', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Biology', 'Biology', 'Sciences', 'Sciences', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'History', 'History', 'Humanities', 'Humanities', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Geography', 'Geography', 'Humanities', 'Humanities', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Economics', 'Economics', 'Humanities', 'Humanities', 'PRINCIPAL', 'PENDING_VERIFICATION'),
  ('A_LEVEL', 'Literature in English', 'Literature', 'Languages', 'Languages', 'PRINCIPAL', 'PENDING_VERIFICATION')
on conflict (programme, subject_name) do nothing;
create trigger system_subjects_set_updated_at before update on public.system_subjects for each row execute function public.set_updated_at();
create trigger academic_classes_set_updated_at before update on public.academic_classes for each row execute function public.set_updated_at();
create trigger school_subject_offerings_set_updated_at before update on public.school_subject_offerings for each row execute function public.set_updated_at();
create trigger class_subject_offerings_set_updated_at before update on public.class_subject_offerings for each row execute function public.set_updated_at();
create trigger teacher_allocations_set_updated_at before update on public.teacher_allocations for each row execute function public.set_updated_at();
create trigger subject_combinations_set_updated_at before update on public.subject_combinations for each row execute function public.set_updated_at();
create trigger learners_set_updated_at before update on public.learners for each row execute function public.set_updated_at();
create trigger learner_subject_enrolments_set_updated_at before update on public.learner_subject_enrolments for each row execute function public.set_updated_at();
alter table public.system_subjects enable row level security;
alter table public.system_subject_papers enable row level security;
alter table public.academic_classes enable row level security;
alter table public.class_streams enable row level security;
alter table public.school_subject_offerings enable row level security;
alter table public.class_subject_offerings enable row level security;
alter table public.teacher_allocations enable row level security;
alter table public.subject_combinations enable row level security;
alter table public.combination_subjects enable row level security;
alter table public.learners enable row level security;
alter table public.learner_class_enrolments enable row level security;
alter table public.learner_subject_enrolments enable row level security;
alter table public.learner_combination_enrolments enable row level security;
create policy "authenticated users can read active subject catalogue" on public.system_subjects for select to authenticated using (is_active);
create policy "authenticated users can read active subject papers" on public.system_subject_papers for select to authenticated using (is_active);
do $$
declare table_name text;
begin
  foreach table_name in array array['academic_classes','class_streams','school_subject_offerings','class_subject_offerings','teacher_allocations','subject_combinations','combination_subjects','learners','learner_class_enrolments','learner_subject_enrolments','learner_combination_enrolments']
  loop
    execute format('create policy "members read %1$s" on public.%1$I for select to authenticated using (exists (select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id where membership.school_id = %1$I.school_id and membership.status = ''ACTIVE'' and app_user.auth_user_id = auth.uid()))', table_name);
  end loop;
end $$;
-- No direct browser INSERT/UPDATE/DELETE policies are created. Tenant-scoped
-- mutations must pass through the authorised API/service layer, which also
-- validates matching school, year, programme, class, stream and allocations.;
