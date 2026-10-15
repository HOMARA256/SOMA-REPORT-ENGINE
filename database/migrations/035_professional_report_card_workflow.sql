-- Professional O-Level/A-Level report configuration and audited batch workflow.
-- Extends the existing immutable report_snapshots pipeline; does not duplicate it.

create table if not exists public.report_card_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  programme text not null check (programme in ('O_LEVEL','A_LEVEL')),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_by uuid references public.users(id),
  updated_at timestamptz not null default now(),
  unique (school_id, programme)
);

create table if not exists public.report_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid references public.academic_years(id),
  term_id uuid references public.terms(id),
  class_id uuid references public.classes(id),
  stream_id uuid,
  programme text not null check (programme in ('O_LEVEL','A_LEVEL')),
  output_type text not null check (output_type in ('INDIVIDUAL_PDF','BATCH_PDF','ZIP','PRINT')),
  status text not null default 'QUEUED' check (status in ('QUEUED','VALIDATING','GENERATING','COMPLETE','PARTIAL','FAILED','CANCELLED')),
  ready_count integer not null default 0 check (ready_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  request_key text not null,
  error_summary text,
  requested_by uuid not null references public.users(id),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (school_id, request_key)
);

create table if not exists public.report_generation_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.report_generation_jobs(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete restrict,
  report_snapshot_id uuid references public.report_snapshots(id) on delete restrict,
  status text not null check (status in ('READY','BLOCKED','GENERATED','FAILED','SKIPPED')),
  blockers jsonb not null default '[]'::jsonb check (jsonb_typeof(blockers) = 'array'),
  created_at timestamptz not null default now(),
  unique (job_id, learner_id)
);

create table if not exists public.report_portal_access_grants (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_snapshot_id uuid not null references public.report_snapshots(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('LEARNER','PARENT_GUARDIAN')),
  published_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (report_snapshot_id, recipient_user_id)
);

alter table public.report_card_settings enable row level security;
alter table public.report_generation_jobs enable row level security;
alter table public.report_generation_items enable row level security;
alter table public.report_portal_access_grants enable row level security;

create policy "school members read report settings" on public.report_card_settings for select to authenticated using (public.is_active_school_member(school_id));
create policy "school members read report jobs" on public.report_generation_jobs for select to authenticated using (public.is_active_school_member(school_id));
create policy "school members read report job items" on public.report_generation_items for select to authenticated using (exists (select 1 from public.report_generation_jobs job where job.id = job_id and public.is_active_school_member(job.school_id)));
create policy "recipients read own published reports" on public.report_portal_access_grants for select to authenticated using (recipient_user_id in (select id from public.users where auth_user_id = auth.uid()) and revoked_at is null);

revoke insert, update, delete, truncate, references, trigger on public.report_generation_jobs, public.report_generation_items, public.report_portal_access_grants from anon, authenticated;
revoke all on public.report_card_settings from anon;
revoke all on public.report_generation_jobs, public.report_generation_items, public.report_portal_access_grants from anon;

comment on table public.report_generation_jobs is 'Idempotent background jobs for individual or class-batch report output.';
comment on table public.report_generation_items is 'Per-learner readiness, blockers and immutable snapshot result for a report generation job.';
comment on table public.report_portal_access_grants is 'Explicit recipient-to-published-snapshot access; prevents cross-learner report exposure.';
