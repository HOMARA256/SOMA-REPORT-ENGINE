-- OURSCHOOL Stage 12
-- Hierarchical import/export governance. Platform policy controls availability;
-- school policy may only narrow it; role/scope and workflow checks remain API-only.

create type public.data_exchange_direction as enum ('IMPORT', 'EXPORT', 'TEMPLATE');
create type public.data_exchange_policy_state as enum ('ALLOWED', 'DISABLED', 'APPROVAL_REQUIRED');
create type public.data_exchange_scope as enum ('OWN', 'ASSIGNMENT', 'CLASS', 'DEPARTMENT', 'SCHOOL');
create table public.platform_data_exchange_policies (
  id uuid primary key default gen_random_uuid(),
  operation_code varchar(80) not null,
  direction public.data_exchange_direction not null,
  state public.data_exchange_policy_state not null default 'DISABLED',
  maximum_rows integer,
  maximum_bytes bigint,
  allowed_formats text[] not null default array['XLSX']::text[],
  sensitive_field_policy jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_by uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint platform_exchange_operation_version_key unique(operation_code, version),
  constraint platform_exchange_limits_check check ((maximum_rows is null or maximum_rows > 0) and (maximum_bytes is null or maximum_bytes > 0)),
  constraint platform_exchange_effective_check check (effective_to is null or effective_to >= effective_from)
);
create table public.school_data_exchange_policies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  platform_policy_id uuid not null references public.platform_data_exchange_policies(id) on delete restrict,
  enabled boolean not null default false,
  approval_required boolean not null default false,
  maximum_rows integer,
  maximum_bytes bigint,
  allowed_roles text[] not null default array[]::text[],
  maximum_scope public.data_exchange_scope not null default 'OWN',
  permitted_fields text[] not null default array[]::text[],
  version integer not null default 1,
  updated_by uuid references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint school_exchange_policy_key unique(school_id, platform_policy_id, version),
  constraint school_exchange_limits_check check ((maximum_rows is null or maximum_rows > 0) and (maximum_bytes is null or maximum_bytes > 0))
);
create table public.data_exchange_approvals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  import_job_id uuid references public.import_jobs(id) on delete restrict,
  requested_by uuid not null references public.users(id) on delete restrict,
  reviewed_by uuid references public.users(id) on delete restrict,
  status varchar(30) not null default 'AWAITING_APPROVAL',
  review_note text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint exchange_approval_status_check check (status in ('AWAITING_APPROVAL','APPROVED','RETURNED','REJECTED','CANCELLED')),
  constraint exchange_approval_job_key unique(import_job_id)
);
alter table public.import_jobs add column if not exists policy_snapshot_json jsonb not null default '{}'::jsonb;
alter table public.import_jobs add column if not exists approval_status varchar(30);
alter table public.export_jobs add column if not exists policy_snapshot_json jsonb not null default '{}'::jsonb;
alter table public.export_jobs add column if not exists expires_at timestamptz;
alter table public.platform_data_exchange_policies enable row level security;
alter table public.school_data_exchange_policies enable row level security;
alter table public.data_exchange_approvals enable row level security;
create policy "platform policies are readable by authenticated users" on public.platform_data_exchange_policies for select to authenticated using (effective_from <= now() and (effective_to is null or effective_to > now()));
create policy "members read school exchange policies" on public.school_data_exchange_policies for select to authenticated using (public.is_active_school_member(school_id));
create policy "members read scoped exchange approvals" on public.data_exchange_approvals for select to authenticated using (public.is_active_school_member(school_id));
insert into public.platform_data_exchange_policies (operation_code, direction, state, maximum_rows, maximum_bytes, allowed_formats, version)
values
  ('LEARNERS_IMPORT','IMPORT','ALLOWED',1000,10485760,array['XLSX'],1),
  ('STAFF_IMPORT','IMPORT','ALLOWED',500,10485760,array['XLSX'],1),
  ('TEACHER_ALLOCATIONS_IMPORT','IMPORT','ALLOWED',1000,10485760,array['XLSX'],1),
  ('MARKS_IMPORT','IMPORT','ALLOWED',500,10485760,array['XLSX'],1),
  ('LEARNERS_EXPORT','EXPORT','ALLOWED',10000,null,array['XLSX','CSV'],1),
  ('STAFF_EXPORT','EXPORT','ALLOWED',5000,null,array['XLSX'],1),
  ('MARKS_EXPORT','EXPORT','ALLOWED',10000,null,array['XLSX'],1),
  ('RESULTS_EXPORT','EXPORT','ALLOWED',10000,null,array['XLSX'],1),
  ('CONTROLLED_TEMPLATE_DOWNLOAD','TEMPLATE','ALLOWED',null,null,array['XLSX'],1)
on conflict (operation_code, version) do nothing;
-- No browser mutation policies. The API resolves platform policy, subscription,
-- school policy, role capability, academic assignment, record scope, workflow
-- state and current permission again at commit/download time.;
