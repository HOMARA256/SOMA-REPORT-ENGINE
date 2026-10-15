-- OURSCHOOL Stage 07
-- Exact decimal conversion, competency evidence, allocation-linked initials,
-- single-page validation and immutable O-Level report snapshots.

alter table public.users
  add column first_name varchar(100),
  add column middle_name varchar(100),
  add column last_name varchar(100),
  add column staff_number varchar(80),
  add column teacher_initials varchar(30),
  add column signature_url text,
  add column department varchar(140),
  add constraint users_teacher_initials_format check (teacher_initials is null or teacher_initials ~ '^[A-Z]{1,6}(\s*/\s*[A-Z]{1,6})*$');
create table public.grading_conversion_configurations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  programme varchar(30) not null,
  name varchar(180) not null,
  version varchar(40) not null,
  method varchar(50) not null,
  aggregation_rule varchar(60) not null,
  display_decimal_places smallint not null default 1,
  is_approved boolean not null default false,
  effective_from date not null,
  approved_by uuid references public.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, programme, version),
  constraint grading_conversion_method_check check (method in ('PIECEWISE_LINEAR', 'LOOKUP_TABLE', 'FORMULA')),
  constraint grading_conversion_decimal_check check (display_decimal_places between 1 and 3),
  constraint grading_conversion_approval_check check (not is_approved or (approved_by is not null and approved_at is not null))
);
create table public.grading_conversion_points (
  id uuid primary key default gen_random_uuid(),
  configuration_id uuid not null references public.grading_conversion_configurations(id) on delete cascade,
  percentage_score numeric(6,2) not null,
  three_point_score numeric(5,3) not null,
  display_order integer not null,
  unique (configuration_id, percentage_score),
  unique (configuration_id, display_order),
  constraint grading_conversion_percentage_check check (percentage_score between 0 and 100),
  constraint grading_conversion_score_check check (three_point_score between 0 and 3)
);
create table public.subject_competencies (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  subject_id uuid not null,
  competency_code varchar(100) not null,
  competency_text varchar(250) not null,
  curriculum_outcome_reference varchar(160),
  is_reportable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year_id, term_id, subject_id, competency_code)
);
create table public.subject_teacher_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  class_id uuid not null,
  stream_id uuid,
  subject_offering_id uuid not null,
  teacher_user_id uuid not null references public.users(id) on delete restrict,
  allocation_role varchar(40) not null default 'PRIMARY',
  report_display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year_id, term_id, subject_offering_id, teacher_user_id),
  constraint subject_teacher_allocation_role_check check (allocation_role in ('PRIMARY', 'CO_TEACHER', 'ASSISTANT'))
);
create table public.report_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  learner_id uuid not null,
  class_id uuid not null,
  stream_id uuid,
  report_template_key varchar(60) not null,
  version integer not null default 1,
  status varchar(40) not null default 'PREPARED',
  snapshot_data jsonb not null,
  grading_configuration_version varchar(40) not null,
  conversion_configuration_version varchar(40) not null,
  prepared_by uuid references public.users(id) on delete set null,
  prepared_at timestamptz not null default now(),
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz,
  unique (school_id, academic_year_id, term_id, learner_id, report_template_key, version),
  constraint report_snapshot_status_check check (status in ('PREPARED', 'APPROVED', 'PUBLISHED', 'SUPERSEDED')),
  constraint report_snapshot_json_check check (jsonb_typeof(snapshot_data) = 'object'),
  constraint report_snapshot_publish_check check (status <> 'PUBLISHED' or (published_by is not null and published_at is not null))
);
create table public.report_subject_results (
  id uuid primary key default gen_random_uuid(),
  report_snapshot_id uuid not null references public.report_snapshots(id) on delete restrict,
  subject_id uuid not null,
  subject_code varchar(40),
  subject_name varchar(180) not null,
  percentage_score numeric(6,2) not null,
  three_point_score_exact numeric(5,3) not null,
  three_point_score_displayed numeric(3,1) not null,
  grading_band_id uuid,
  grading_descriptor varchar(100) not null,
  competency_id uuid,
  competency_text varchar(250) not null,
  teacher_allocation_ids uuid[] not null,
  teacher_user_ids uuid[] not null,
  teacher_initials varchar(80) not null,
  display_order integer not null,
  unique (report_snapshot_id, subject_id),
  constraint report_subject_percentage_check check (percentage_score between 0 and 100),
  constraint report_subject_three_point_check check (three_point_score_exact between 0 and 3 and three_point_score_displayed between 0 and 3),
  constraint report_subject_teacher_check check (cardinality(teacher_allocation_ids) > 0 and cardinality(teacher_user_ids) > 0 and nullif(trim(teacher_initials), '') is not null)
);
create table public.report_signatories (
  id uuid primary key default gen_random_uuid(),
  report_snapshot_id uuid not null references public.report_snapshots(id) on delete restrict,
  role_type public.report_comment_role not null,
  user_id uuid not null references public.users(id) on delete restrict,
  display_name varchar(200) not null,
  final_comment varchar(250) not null,
  signature_url text,
  signature_status varchar(40) not null,
  signed_at timestamptz,
  unique (report_snapshot_id, role_type),
  constraint report_signatory_role_check check (role_type in ('CLASS_TEACHER', 'HEAD_TEACHER')),
  constraint report_signatory_signature_check check (signature_status in ('HANDWRITTEN', 'DIGITAL_CONFIGURED', 'DIGITALLY_SIGNED'))
);
create table public.report_layout_validations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_snapshot_id uuid references public.report_snapshots(id) on delete cascade,
  learner_id uuid not null,
  status varchar(50) not null,
  page_count integer,
  subject_count integer not null,
  issues jsonb not null default '[]'::jsonb,
  validated_by uuid references public.users(id) on delete set null,
  validated_at timestamptz not null default now(),
  constraint report_layout_status_check check (status in ('READY', 'REQUIRES_ATTENTION', 'REPORT_LAYOUT_REQUIRES_ATTENTION')),
  constraint report_layout_issues_array check (jsonb_typeof(issues) = 'array'),
  constraint report_layout_page_check check (page_count is null or page_count > 0)
);
create table public.report_audit_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  report_snapshot_id uuid references public.report_snapshots(id) on delete restrict,
  learner_id uuid,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type varchar(80) not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint report_audit_event_type_check check (event_type in (
    'REPORT_GENERATED', 'REPORT_PREVIEWED', 'REPORT_PUBLISHED',
    'CLASS_TEACHER_COMMENT_GENERATED', 'CLASS_TEACHER_COMMENT_EDITED', 'CLASS_TEACHER_COMMENT_APPROVED',
    'HEAD_TEACHER_COMMENT_GENERATED', 'HEAD_TEACHER_COMMENT_EDITED', 'HEAD_TEACHER_COMMENT_APPROVED',
    'TEACHER_INITIALS_CHANGED', 'TEACHER_ALLOCATION_CHANGED',
    'GRADING_CONFIGURATION_CHANGED', 'CONVERSION_CONFIGURATION_CHANGED'
  ))
);
create index grading_conversion_configurations_scope_idx on public.grading_conversion_configurations(school_id, programme, effective_from);
create index subject_competencies_scope_idx on public.subject_competencies(school_id, academic_year_id, term_id, subject_id);
create index subject_teacher_allocations_scope_idx on public.subject_teacher_allocations(school_id, academic_year_id, term_id, class_id, stream_id, subject_offering_id);
create index report_snapshots_scope_idx on public.report_snapshots(school_id, academic_year_id, term_id, learner_id);
create index report_subject_results_snapshot_idx on public.report_subject_results(report_snapshot_id, display_order);
create index report_layout_validations_report_idx on public.report_layout_validations(report_snapshot_id, validated_at);
create index report_audit_events_scope_idx on public.report_audit_events(school_id, created_at);
create trigger grading_conversion_configurations_set_updated_at before update on public.grading_conversion_configurations for each row execute function public.set_updated_at();
create trigger subject_competencies_set_updated_at before update on public.subject_competencies for each row execute function public.set_updated_at();
create trigger subject_teacher_allocations_set_updated_at before update on public.subject_teacher_allocations for each row execute function public.set_updated_at();
create or replace function public.protect_published_report_snapshot()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Report snapshots are immutable and cannot be deleted; create a corrected version.';
  end if;
  if old.status = 'PUBLISHED' then
    raise exception 'Published report snapshots are immutable; create a corrected version.';
  end if;
  return new;
end;
$$;
create trigger report_snapshots_protect_publication before update or delete on public.report_snapshots for each row execute function public.protect_published_report_snapshot();
alter table public.grading_conversion_configurations enable row level security;
alter table public.grading_conversion_points enable row level security;
alter table public.subject_competencies enable row level security;
alter table public.subject_teacher_allocations enable row level security;
alter table public.report_snapshots enable row level security;
alter table public.report_subject_results enable row level security;
alter table public.report_signatories enable row level security;
alter table public.report_layout_validations enable row level security;
alter table public.report_audit_events enable row level security;
create or replace function public.is_active_school_member(target_school_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.school_id = target_school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
  );
$$;
create policy "members view conversion configurations" on public.grading_conversion_configurations for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view conversion points" on public.grading_conversion_points for select to authenticated using (exists (select 1 from public.grading_conversion_configurations configuration where configuration.id = grading_conversion_points.configuration_id and public.is_active_school_member(configuration.school_id)));
create policy "members view subject competencies" on public.subject_competencies for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view teacher allocations" on public.subject_teacher_allocations for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view report snapshots" on public.report_snapshots for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view report subject results" on public.report_subject_results for select to authenticated using (exists (select 1 from public.report_snapshots snapshot where snapshot.id = report_subject_results.report_snapshot_id and public.is_active_school_member(snapshot.school_id)));
create policy "members view report signatories" on public.report_signatories for select to authenticated using (exists (select 1 from public.report_snapshots snapshot where snapshot.id = report_signatories.report_snapshot_id and public.is_active_school_member(snapshot.school_id)));
create policy "members view report validations" on public.report_layout_validations for select to authenticated using (public.is_active_school_member(school_id));
create policy "members view report audit events" on public.report_audit_events for select to authenticated using (public.is_active_school_member(school_id));
-- Writes remain API-only. The service role validates permissions, allocations,
-- approvals, one-page layout and immutable version transitions.;
