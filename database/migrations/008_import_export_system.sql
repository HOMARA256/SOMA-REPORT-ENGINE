-- OURSCHOOL Stage 08
-- Controlled school-scoped import/export jobs, templates, media references,
-- optimistic marks templates, audit history and API-only commits.

insert into public.permissions (code, description) values
  ('imports.view', 'View school import operations.'),
  ('imports.marks', 'Import marks for authorised teacher allocations.'),
  ('imports.learners', 'Import school learner records.'),
  ('imports.staff', 'Import staff profiles without authentication secrets.'),
  ('imports.allocations', 'Import teacher allocations using stable references.'),
  ('imports.academic', 'Import controlled academic structure records.'),
  ('imports.competencies', 'Import authorised competency catalogue records.'),
  ('imports.media', 'Import school media using stable entity references.'),
  ('exports.view', 'View school export operations.'),
  ('exports.marks', 'Export authorised marks data.'),
  ('exports.learners', 'Export authorised learner data.'),
  ('exports.staff', 'Export authorised staff data.'),
  ('exports.results', 'Export authorised result data.'),
  ('exports.analysis', 'Export authorised academic analysis.'),
  ('templates.download', 'Download current import templates.'),
  ('templates.generate', 'Generate context-specific school templates.')
on conflict (code) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role cross join public.permissions permission
where role.code in ('SCHOOL_ADMIN', 'DIRECTOR_OF_STUDIES')
  and (permission.code like 'imports.%' or permission.code like 'exports.%' or permission.code like 'templates.%')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id from public.roles role join public.permissions permission on permission.code in ('imports.view','imports.marks','exports.view','exports.marks','templates.download','templates.generate')
where role.code in ('TEACHER', 'CLASS_TEACHER')
on conflict do nothing;

create table public.import_templates (
  id uuid primary key default gen_random_uuid(),
  template_type varchar(40) not null,
  version integer not null,
  programme varchar(30),
  status varchar(20) not null default 'ACTIVE',
  schema_json jsonb not null default '{}'::jsonb,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint import_templates_status_check check (status in ('DRAFT','ACTIVE','RETIRED')),
  constraint import_templates_version_check check (version > 0),
  constraint import_templates_type_version_key unique(template_type, version, programme)
);

create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  import_type varchar(40) not null,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  original_filename text not null,
  storage_asset_id uuid,
  template_id uuid references public.import_templates(id) on delete restrict,
  template_instance_id uuid,
  template_version integer not null,
  academic_context_json jsonb not null default '{}'::jsonb,
  source_fingerprint varchar(128),
  status varchar(40) not null default 'VALIDATING',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  created_rows integer not null default 0,
  updated_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  source_delete_after timestamptz,
  created_at timestamptz not null default now(),
  constraint import_jobs_status_check check (status in ('VALIDATING','READY','IMPORTING','COMPLETED','COMPLETED_WITH_WARNINGS','FAILED','CANCELLED')),
  constraint import_jobs_nonnegative_counts check (total_rows >= 0 and valid_rows >= 0 and warning_rows >= 0 and error_rows >= 0 and created_rows >= 0 and updated_rows >= 0 and unchanged_rows >= 0),
  constraint import_jobs_fingerprint_key unique nulls not distinct (school_id, import_type, source_fingerprint)
);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  import_job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_number integer not null,
  entity_reference text,
  operation varchar(20) not null,
  validation_status varchar(20) not null,
  base_record_version text,
  current_record_version text,
  proposed_values_json jsonb not null default '{}'::jsonb,
  error_json jsonb not null default '[]'::jsonb,
  warning_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint import_rows_operation_check check (operation in ('CREATE','UPDATE','UNCHANGED','REJECT')),
  constraint import_rows_validation_check check (validation_status in ('READY','WARNING','ERROR','UNCHANGED','CONFLICT')),
  constraint import_rows_job_row_key unique(import_job_id, row_number)
);

create table public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  export_type varchar(50) not null,
  requested_by uuid not null references public.users(id) on delete restrict,
  format varchar(10) not null,
  filters_json jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'QUEUED',
  record_count integer not null default 0,
  file_asset_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint export_jobs_format_check check (format in ('XLSX','CSV','PDF')),
  constraint export_jobs_status_check check (status in ('QUEUED','GENERATING','COMPLETED','FAILED','EXPIRED')),
  constraint export_jobs_record_count_check check (record_count >= 0)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  asset_type varchar(40) not null,
  entity_type varchar(30) not null,
  entity_id uuid,
  storage_path text not null,
  mime_type varchar(100) not null,
  byte_size bigint not null,
  checksum varchar(128) not null,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  status varchar(20) not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  constraint media_assets_type_check check (asset_type in ('SCHOOL_LOGO','SCHOOL_SEAL','LEARNER_PHOTO','STAFF_PHOTO','STAFF_SIGNATURE','IMPORT_SOURCE','EXPORT_FILE')),
  constraint media_assets_status_check check (status in ('ACTIVE','QUARANTINED','DELETED')),
  constraint media_assets_size_check check (byte_size > 0),
  constraint media_assets_checksum_key unique(school_id, checksum)
);

alter table public.import_jobs add constraint import_jobs_storage_asset_fk foreign key (storage_asset_id) references public.media_assets(id) on delete set null;
alter table public.export_jobs add constraint export_jobs_file_asset_fk foreign key (file_asset_id) references public.media_assets(id) on delete set null;

create table public.import_export_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  actor_role varchar(60) not null,
  event_type varchar(60) not null,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  export_job_id uuid references public.export_jobs(id) on delete set null,
  context_json jsonb not null default '{}'::jsonb,
  affected_record_count integer not null default 0,
  result_status varchar(40) not null,
  created_at timestamptz not null default now(),
  constraint import_export_audit_type_check check (event_type in ('IMPORT_FILE_UPLOADED','IMPORT_VALIDATED','IMPORT_FAILED','IMPORT_COMMITTED','MARKS_TEMPLATE_DOWNLOADED','MARKS_IMPORTED','MARKS_UPDATED_BY_IMPORT','LEARNERS_IMPORTED','STAFF_IMPORTED','TEACHER_ALLOCATIONS_IMPORTED','MEDIA_IMPORTED','EXPORT_GENERATED','EXPORT_DOWNLOADED')),
  constraint import_export_audit_count_check check (affected_record_count >= 0)
);

create index import_jobs_school_created_idx on public.import_jobs(school_id, created_at desc);
create index import_rows_job_status_idx on public.import_rows(import_job_id, validation_status);
create index export_jobs_school_created_idx on public.export_jobs(school_id, created_at desc);
create index media_assets_entity_idx on public.media_assets(school_id, entity_type, entity_id);
create index import_export_audit_school_idx on public.import_export_audit_events(school_id, created_at desc);

alter table public.import_templates enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
alter table public.export_jobs enable row level security;
alter table public.media_assets enable row level security;
alter table public.import_export_audit_events enable row level security;

create policy "authenticated view active import templates" on public.import_templates for select to authenticated using (status = 'ACTIVE');
create policy "members view import jobs" on public.import_jobs for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view import rows" on public.import_rows for select to authenticated using (exists (select 1 from public.import_jobs job where job.id = import_rows.import_job_id and public.is_active_school_member(job.school_id)));
create policy "members view export jobs" on public.export_jobs for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view media" on public.media_assets for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view import export audit" on public.import_export_audit_events for select to authenticated using (public.is_active_school_member(school_id));

-- Import/export writes remain API-only. The service role revalidates school
-- membership, capability permissions, teacher allocation, locks, versions,
-- workbook identity and every row inside one database transaction.
