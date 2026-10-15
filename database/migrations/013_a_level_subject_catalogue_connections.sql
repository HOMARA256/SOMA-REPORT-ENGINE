-- OURSCHOOL Stage 13 / AC-2
-- Versioned A-Level catalogue releases connected to tenant school offerings.

create table public.subject_curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  system_subject_id uuid not null references public.system_subjects(id) on delete restrict,
  version_code varchar(100) not null,
  programme public.subject_programme not null,
  source_authority varchar(180),
  source_document text,
  verification_status public.reference_verification_status not null default 'PENDING_VERIFICATION',
  effective_from date,
  effective_to date,
  status public.offering_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  constraint subject_curriculum_version_key unique(system_subject_id, version_code),
  constraint subject_curriculum_dates_check check (effective_to is null or effective_from is null or effective_to >= effective_from),
  constraint verified_curriculum_source_check check (verification_status <> 'VERIFIED' or (source_authority is not null and source_document is not null))
);

alter table public.system_subject_papers add column if not exists curriculum_version_id uuid references public.subject_curriculum_versions(id) on delete restrict;
alter table public.school_subject_offerings add column if not exists curriculum_version_id uuid references public.subject_curriculum_versions(id) on delete restrict;
alter table public.school_subject_offerings add column if not exists subject_level public.subject_level;
alter table public.school_subject_offerings add column if not exists retired_at timestamptz;

create index subject_curriculum_versions_subject_idx on public.subject_curriculum_versions(system_subject_id, status, effective_from);
create index system_subject_papers_version_idx on public.system_subject_papers(curriculum_version_id, display_order);
create index school_subject_offerings_version_idx on public.school_subject_offerings(school_id, curriculum_version_id, status);

alter table public.subject_curriculum_versions enable row level security;
create policy "authenticated users read available curriculum versions" on public.subject_curriculum_versions for select to authenticated using (status in ('ACTIVE','INACTIVE'));

insert into public.permissions (code, description) values
  ('alevel.subjects.view', 'View school A-Level subject offerings and their versioned papers.'),
  ('alevel.subjects.manage', 'Enable, configure and retire school A-Level subject offerings.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission on permission.code in ('alevel.subjects.view','alevel.subjects.manage')
where role.code in ('SCHOOL_ADMIN','DIRECTOR_OF_STUDIES') on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission on permission.code = 'alevel.subjects.view'
where role.code in ('HOD','TEACHER','CLASS_TEACHER') on conflict do nothing;

-- Mutations are API-only. The API must derive school_id from membership,
-- validate academic-year ownership, bind the selected system subject and active
-- curriculum version, and retire rather than delete historically used offerings.
