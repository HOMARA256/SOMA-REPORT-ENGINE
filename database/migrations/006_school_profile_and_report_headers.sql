-- OURSCHOOL Stage 06
-- Authoritative school profile and report-header display preferences.

-- Broaden the permission namespace segment to support established identifiers
-- such as school_profile.* and report_header.* while retaining lowercase-only validation.
alter table public.permissions drop constraint if exists permissions_code_format;
alter table public.permissions add constraint permissions_code_format check (code ~ '^[a-z_]+(\.[a-z_]+)+$');

alter table public.schools
  rename column school_name to official_name;

alter table public.schools
  add column short_name varchar(120),
  add column motto varchar(240),
  add column slogan varchar(240),
  add column registration_number varchar(100),
  add column uneb_centre_number varchar(100),
  add column emis_number varchar(100),
  add column school_level varchar(100),
  add column school_type varchar(100),
  add column ownership varchar(160),
  add column gender_category varchar(80),
  add column year_established integer,
  add column country varchar(100),
  add column secondary_logo_url text,
  add column seal_url text,
  add column primary_colour varchar(20) not null default '#173b79',
  add column secondary_colour varchar(20) not null default '#e8f0ff',
  add column report_header_style varchar(40) not null default 'CENTRED',
  add column additional_information jsonb not null default '{}'::jsonb,
  add constraint schools_year_established_check check (year_established is null or year_established between 1800 and 2200),
  add constraint schools_primary_colour_check check (primary_colour ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint schools_secondary_colour_check check (secondary_colour ~ '^#[0-9A-Fa-f]{6}$');

create table public.school_contacts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  contact_type varchar(40) not null,
  label varchar(100) not null,
  value text not null,
  is_primary boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_contacts_type_check check (contact_type in ('TELEPHONE', 'EMAIL', 'WEBSITE', 'OTHER')),
  constraint school_contacts_order_check check (display_order >= 0)
);

create table public.school_addresses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  address_type varchar(40) not null,
  address_line text,
  village varchar(120),
  parish varchar(120),
  subcounty varchar(120),
  district varchar(120),
  region varchar(120),
  country varchar(100),
  postal_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, address_type)
);

create table public.school_administration_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  role_key varchar(60) not null,
  user_id uuid references public.users(id) on delete set null,
  fallback_name varchar(200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, role_key),
  constraint school_administration_identity_check check (user_id is not null or nullif(trim(fallback_name), '') is not null)
);

create table public.report_header_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  report_template_key varchar(60),
  field_key varchar(80) not null,
  is_visible boolean not null default false,
  display_order integer not null default 0,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint report_header_settings_order_check check (display_order >= 0),
  unique nulls not distinct (school_id, report_template_key, field_key)
);

create table public.school_profile_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type varchar(70) not null,
  field_key varchar(100),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  constraint school_profile_event_type_check check (event_type in ('SCHOOL_PROFILE_UPDATED', 'SCHOOL_LOGO_CHANGED', 'REPORT_HEADER_CONFIGURATION_CHANGED', 'REPORT_BRANDING_CHANGED'))
);

create table public.published_report_header_snapshots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  report_snapshot_id uuid not null,
  report_template_key varchar(60),
  resolved_header jsonb not null,
  published_by uuid references public.users(id) on delete set null,
  published_at timestamptz not null default now(),
  constraint published_report_header_snapshot_object check (jsonb_typeof(resolved_header) = 'object'),
  unique (school_id, report_snapshot_id)
);

insert into public.permissions (code, description)
values
  ('school_profile.view', 'View the complete profile for the active school.'),
  ('school_profile.edit', 'Edit the complete profile for the active school.'),
  ('report_header.view', 'View report-card header configuration.'),
  ('report_header.configure', 'Configure fields displayed in report-card headers.'),
  ('report_header.preview', 'Preview report-card header configuration.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('school_profile.view', 'school_profile.edit', 'report_header.view', 'report_header.configure', 'report_header.preview')
where role.code in ('PLATFORM_ADMIN', 'SCHOOL_ADMIN')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select role.id, permission.id
from public.roles role
join public.permissions permission on permission.code in ('school_profile.view', 'report_header.view', 'report_header.preview')
where role.code in ('DIRECTOR_OF_STUDIES', 'HEAD_TEACHER')
on conflict do nothing;

create index school_contacts_school_idx on public.school_contacts(school_id, display_order);
create index school_addresses_school_idx on public.school_addresses(school_id);
create index report_header_settings_school_idx on public.report_header_settings(school_id, report_template_key, display_order);
create index school_profile_events_school_idx on public.school_profile_events(school_id, created_at);
create index published_report_header_snapshots_school_idx on public.published_report_header_snapshots(school_id, published_at);

create trigger school_contacts_set_updated_at before update on public.school_contacts for each row execute function public.set_updated_at();
create trigger school_addresses_set_updated_at before update on public.school_addresses for each row execute function public.set_updated_at();
create trigger school_administration_assignments_set_updated_at before update on public.school_administration_assignments for each row execute function public.set_updated_at();

alter table public.school_contacts enable row level security;
alter table public.school_addresses enable row level security;
alter table public.school_administration_assignments enable row level security;
alter table public.report_header_settings enable row level security;
alter table public.school_profile_events enable row level security;
alter table public.published_report_header_snapshots enable row level security;

create policy "members can view school contacts" on public.school_contacts for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = school_contacts.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view school addresses" on public.school_addresses for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = school_addresses.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view school administration" on public.school_administration_assignments for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = school_administration_assignments.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view report header settings" on public.report_header_settings for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = report_header_settings.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view school profile events" on public.school_profile_events for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = school_profile_events.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));
create policy "members can view published report headers" on public.published_report_header_snapshots for select to authenticated using (exists (
  select 1 from public.school_memberships membership join public.users app_user on app_user.id = membership.user_id
  where membership.school_id = published_report_header_snapshots.school_id and membership.status = 'ACTIVE' and app_user.auth_user_id = auth.uid()
));

-- No direct browser write policies are provided. The API service role validates
-- school membership, capability permissions and audit entries for every change.
