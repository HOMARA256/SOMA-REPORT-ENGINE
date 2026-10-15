-- OURSCHOOL Stage 05
-- Evidence-based report comment engine, review workflow and immutable publication records.

create type public.report_comment_role as enum (
  'SUBJECT_TEACHER',
  'CLASS_TEACHER',
  'HOD',
  'DOS',
  'HEAD_TEACHER',
  'CUSTOM_REPORT_ROLE'
);
create type public.report_comment_status as enum (
  'NOT_GENERATED',
  'GENERATED',
  'REVIEWED',
  'EDITED',
  'APPROVED',
  'PUBLISHED',
  'REQUIRES_ATTENTION'
);
create type public.report_comment_confidence as enum (
  'SUFFICIENT_EVIDENCE',
  'LIMITED_EVIDENCE',
  'INCOMPLETE_EVIDENCE'
);
insert into public.roles (code, name, description)
values ('HEAD_TEACHER', 'Head Teacher', 'Provides the final school-level report-card sign-off.')
on conflict (code) do nothing;
insert into public.permissions (code, description)
values
  ('comments.subject_generate', 'Generate subject-teacher report comment drafts.'),
  ('comments.subject_edit', 'Review and edit allocated subject comments.'),
  ('comments.class_generate', 'Generate class-teacher report comment drafts.'),
  ('comments.class_edit', 'Review and edit allocated class-teacher comments.'),
  ('comments.hod_generate', 'Generate department report comment drafts.'),
  ('comments.hod_edit', 'Review and edit department report comments.'),
  ('comments.dos_generate', 'Generate Director of Studies report comment drafts.'),
  ('comments.dos_edit', 'Review and edit Director of Studies comments.'),
  ('comments.headteacher_generate', 'Generate head-teacher report comment drafts.'),
  ('comments.headteacher_edit', 'Review and edit head-teacher report comments.'),
  ('comments.approve', 'Approve reviewed report comments for a report snapshot.'),
  ('comments.configure', 'Configure school comment templates and rules.'),
  ('comments.reopen', 'Reopen an approved comment through an audited correction workflow.')
on conflict (code) do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.code in ('PLATFORM_ADMIN', 'SCHOOL_ADMIN')
  and permission.code like 'comments.%'
on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on
  (role.code in ('TEACHER', 'CLASS_TEACHER') and permission.code in ('comments.subject_generate', 'comments.subject_edit'))
  or (role.code = 'CLASS_TEACHER' and permission.code in ('comments.class_generate', 'comments.class_edit'))
  or (role.code = 'HEAD_OF_DEPARTMENT' and permission.code in ('comments.hod_generate', 'comments.hod_edit', 'comments.subject_edit'))
  or (role.code = 'DIRECTOR_OF_STUDIES' and permission.code in ('comments.dos_generate', 'comments.dos_edit', 'comments.approve', 'comments.reopen'))
  or (role.code = 'HEAD_TEACHER' and permission.code in ('comments.headteacher_generate', 'comments.headteacher_edit', 'comments.approve'))
on conflict do nothing;
create table public.report_comment_configurations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  role_type public.report_comment_role not null,
  is_enabled boolean not null default true,
  requires_manual_review boolean not null default true,
  minimum_evidence_state public.report_comment_confidence not null default 'LIMITED_EVIDENCE',
  custom_role_name varchar(120),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_comment_configuration_custom_role_check check (
    role_type = 'CUSTOM_REPORT_ROLE' or custom_role_name is null
  ),
  unique nulls not distinct (school_id, role_type, custom_role_name)
);
create table public.comment_templates (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  role_type public.report_comment_role not null,
  name varchar(160) not null,
  version varchar(40) not null,
  body_template text not null,
  language_code varchar(12) not null default 'en-UG',
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (school_id, role_type, name, version)
);
create table public.comment_rules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  role_type public.report_comment_role not null,
  name varchar(160) not null,
  priority integer not null default 100,
  evidence_condition jsonb not null default '{}'::jsonb,
  output_guidance jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (school_id, role_type, name)
);
create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  learner_id uuid not null,
  report_snapshot_id uuid,
  subject_offering_id uuid,
  role_type public.report_comment_role not null,
  custom_role_name varchar(120),
  generated_comment text,
  edited_comment text,
  final_comment text,
  status public.report_comment_status not null default 'NOT_GENERATED',
  confidence_state public.report_comment_confidence not null default 'INCOMPLETE_EVIDENCE',
  evidence_used jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  template_id uuid references public.comment_templates(id) on delete set null,
  template_version varchar(40),
  generation_method varchar(40) not null default 'DETERMINISTIC_RULES',
  responsible_user_id uuid references public.users(id) on delete set null,
  generated_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_comments_evidence_array check (jsonb_typeof(evidence_used) = 'array'),
  constraint report_comments_warnings_array check (jsonb_typeof(warnings) = 'array'),
  constraint report_comments_final_required check (
    status not in ('REVIEWED', 'EDITED', 'APPROVED', 'PUBLISHED')
    or nullif(trim(final_comment), '') is not null
  )
);
create table public.comment_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_year_id uuid not null references public.academic_years(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  role_type public.report_comment_role,
  scope jsonb not null default '{}'::jsonb,
  status varchar(30) not null default 'QUEUED',
  total_count integer not null default 0,
  processed_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint comment_generation_jobs_status_check check (status in ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED')),
  constraint comment_generation_jobs_counts_check check (total_count >= 0 and processed_count >= 0 and error_count >= 0)
);
create table public.report_comment_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  report_comment_id uuid not null references public.report_comments(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type varchar(50) not null,
  previous_status public.report_comment_status,
  new_status public.report_comment_status,
  reason text,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index report_comments_scope_idx on public.report_comments(school_id, academic_year_id, term_id, learner_id);
create index report_comments_status_idx on public.report_comments(school_id, status);
create index report_comments_subject_idx on public.report_comments(subject_offering_id) where subject_offering_id is not null;
create index report_comment_events_comment_idx on public.report_comment_events(report_comment_id, created_at);
create index comment_generation_jobs_scope_idx on public.comment_generation_jobs(school_id, term_id, created_at);
create trigger report_comment_configurations_set_updated_at before update on public.report_comment_configurations for each row execute function public.set_updated_at();
create trigger comment_templates_set_updated_at before update on public.comment_templates for each row execute function public.set_updated_at();
create trigger comment_rules_set_updated_at before update on public.comment_rules for each row execute function public.set_updated_at();
create trigger report_comments_set_updated_at before update on public.report_comments for each row execute function public.set_updated_at();
create or replace function public.protect_published_report_comment()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'PUBLISHED' then
    raise exception 'Published report comments are immutable; use an audited correction and new report version.';
  end if;
  if new.status = 'PUBLISHED' and (nullif(trim(new.final_comment), '') is null or new.report_snapshot_id is null) then
    raise exception 'A published comment requires final wording and a report snapshot.';
  end if;
  return new;
end;
$$;
create trigger report_comments_protect_publication
before update on public.report_comments
for each row execute function public.protect_published_report_comment();
alter table public.report_comment_configurations enable row level security;
alter table public.comment_templates enable row level security;
alter table public.comment_rules enable row level security;
alter table public.report_comments enable row level security;
alter table public.comment_generation_jobs enable row level security;
alter table public.report_comment_events enable row level security;
create policy "members can view report comment configurations"
on public.report_comment_configurations for select to authenticated
using (exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = report_comment_configurations.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view applicable comment templates"
on public.comment_templates for select to authenticated
using (school_id is null or exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = comment_templates.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view applicable comment rules"
on public.comment_rules for select to authenticated
using (school_id is null or exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = comment_rules.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view scoped report comments"
on public.report_comments for select to authenticated
using (exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = report_comments.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view scoped comment jobs"
on public.comment_generation_jobs for select to authenticated
using (exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = comment_generation_jobs.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view scoped report comment events"
on public.report_comment_events for select to authenticated
using (exists (
  select 1 from public.school_memberships membership
  join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = report_comment_events.school_id
    and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
-- Intentionally no browser insert/update/delete policies. The API service role
-- enforces membership, allocation, role permission and workflow transitions.;
