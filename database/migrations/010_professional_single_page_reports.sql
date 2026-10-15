-- OURSCHOOL professional single-page report finalisation.
-- Extends the existing report snapshot pipeline; it does not create a second report system.

alter table public.grading_conversion_configurations
  add column effective_to date,
  add column status varchar(20) not null default 'DRAFT',
  add constraint grading_conversion_effective_dates check (effective_to is null or effective_to >= effective_from),
  add constraint grading_conversion_status_check check (status in ('DRAFT','ACTIVE','RETIRED'));

alter table public.report_snapshots
  add column report_settings_version varchar(40) not null default '1.0',
  add column assessment_configuration_snapshot jsonb not null default '{}'::jsonb,
  add column school_logo_media_id uuid references public.media_assets(id) on delete restrict,
  add column learner_photo_media_id uuid references public.media_assets(id) on delete restrict,
  add column attendance_snapshot jsonb,
  add column next_term_start_date date,
  add column report_reference varchar(120),
  add column verification_reference varchar(120),
  add constraint report_snapshot_assessment_json check (jsonb_typeof(assessment_configuration_snapshot) = 'object'),
  add constraint report_snapshot_attendance_json check (attendance_snapshot is null or jsonb_typeof(attendance_snapshot) = 'object');

create unique index report_snapshots_reference_unique
  on public.report_snapshots(report_reference)
  where report_reference is not null;

alter table public.report_layout_validations
  add column measured_height_mm numeric(7,2),
  add column overflow_fields jsonb not null default '[]'::jsonb,
  add constraint report_layout_overflow_fields_array check (jsonb_typeof(overflow_fields) = 'array'),
  add constraint report_layout_ready_one_page check (status <> 'READY' or page_count = 1);

create table public.report_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  requested_by uuid not null references public.users(id) on delete restrict,
  learner_ids uuid[] not null,
  status varchar(30) not null default 'QUEUED',
  completed_count integer not null default 0,
  total_count integer not null,
  output_asset_id uuid references public.media_assets(id) on delete restrict,
  error_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint report_generation_job_status check (status in ('QUEUED','RUNNING','COMPLETE','FAILED')),
  constraint report_generation_job_counts check (total_count > 0 and completed_count between 0 and total_count),
  constraint report_generation_job_learners check (cardinality(learner_ids) = total_count)
);

create index report_generation_jobs_scope_idx on public.report_generation_jobs(school_id, created_at desc);
alter table public.report_generation_jobs enable row level security;

-- Browser clients receive report snapshots through authorised report APIs.
-- Service credentials, conversion execution, aggregation, PDF generation and
-- publication remain server-side and validate school membership and learner scope.
