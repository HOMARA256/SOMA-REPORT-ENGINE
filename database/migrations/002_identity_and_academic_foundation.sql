-- OURSCHOOL Stage 01B
-- Supabase identity, capability authorization and academic context foundation.
-- This migration is additive to 001_platform_foundation.sql.

create type public.membership_status as enum (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED'
);

create type public.academic_year_status as enum (
  'DRAFT',
  'ACTIVE',
  'CLOSED'
);

create type public.term_lifecycle_status as enum (
  'DRAFT',
  'OPEN',
  'MARKS_OPEN',
  'REVIEW',
  'LOCKED',
  'PUBLISHED',
  'CLOSED'
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code varchar(80) not null unique,
  name varchar(120) not null,
  description text,
  is_system_role boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_code_format check (code = upper(code))
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code varchar(120) not null unique,
  description text not null,
  created_at timestamptz not null default now(),
  constraint permissions_code_format check (code ~ '^[a-z_]+(\.[a-z_]+)+$')
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

alter table public.users
  add column auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.school_memberships
  add column role_id uuid references public.roles(id),
  add column updated_at timestamptz not null default now();

alter table public.school_memberships
  alter column status drop default;

alter table public.school_memberships
  alter column status type public.membership_status
  using status::public.membership_status;

alter table public.school_memberships
  alter column status set default 'ACTIVE';

insert into public.roles (code, name, description)
values
  ('PLATFORM_ADMIN', 'Platform Administrator', 'Manages platform-wide tenant operations.'),
  ('SCHOOL_ADMIN', 'School Administrator', 'Manages one school and its authorized users.'),
  ('DIRECTOR_OF_STUDIES', 'Director of Studies', 'Oversees academic workflows and approvals.'),
  ('HEAD_OF_DEPARTMENT', 'Head of Department', 'Oversees allocated departments and subjects.'),
  ('TEACHER', 'Teacher', 'Enters and submits marks for assigned teaching allocations.'),
  ('CLASS_TEACHER', 'Class Teacher', 'Completes authorized class-level academic actions.'),
  ('BURSAR_READ_ONLY', 'Bursar Read Only', 'Views approved finance-integrated report information only.'),
  ('LEARNER', 'Learner', 'Views enabled personal academic information.'),
  ('PARENT_GUARDIAN', 'Parent Guardian', 'Views enabled linked learner academic information.')
on conflict (code) do nothing;

insert into public.permissions (code, description)
values
  ('dashboard.view', 'View the scoped operational dashboard.'),
  ('users.view', 'View school users and memberships.'),
  ('users.manage', 'Manage school memberships and user roles.'),
  ('academics.manage', 'Manage academic years, terms and academic structure.'),
  ('marks.enter', 'Enter marks for authorized allocations.'),
  ('marks.review', 'Review marks and missing-mark status.'),
  ('marks.moderate', 'Moderate authorized marks submissions.'),
  ('results.view', 'View calculated results.'),
  ('results.approve', 'Approve authorized result scopes.'),
  ('reports.view', 'View authorized report cards.'),
  ('reports.generate', 'Generate draft report cards.'),
  ('reports.publish', 'Publish approved report versions.'),
  ('audit.view', 'View authorized audit history.'),
  ('settings.manage', 'Manage authorized school settings.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles roles
cross join public.permissions permissions
where roles.code in ('PLATFORM_ADMIN', 'SCHOOL_ADMIN')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles roles
join public.permissions permissions on permissions.code in (
  'dashboard.view',
  'users.view',
  'academics.manage',
  'marks.review',
  'marks.moderate',
  'results.view',
  'results.approve',
  'reports.view',
  'reports.generate',
  'audit.view'
)
where roles.code = 'DIRECTOR_OF_STUDIES'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select roles.id, permissions.id
from public.roles roles
join public.permissions permissions on permissions.code in (
  'dashboard.view',
  'marks.enter',
  'results.view',
  'reports.view'
)
where roles.code in ('TEACHER', 'CLASS_TEACHER')
on conflict do nothing;

update public.school_memberships membership
set role_id = roles.id
from public.roles roles
where membership.role_id is null
  and roles.code = case membership.role
    when 'SCHOOL_ADMIN' then 'SCHOOL_ADMIN'
    when 'TEACHER' then 'TEACHER'
    when 'HOD' then 'HEAD_OF_DEPARTMENT'
    when 'DOS' then 'DIRECTOR_OF_STUDIES'
    else 'SCHOOL_ADMIN'
  end;

alter table public.school_memberships
  alter column role_id set not null;

alter table public.school_memberships
  drop constraint school_memberships_school_id_user_id_role_key,
  drop column role,
  add constraint school_memberships_school_user_key unique (school_id, user_id);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  name varchar(30) not null,
  starts_on date not null,
  ends_on date not null,
  status public.academic_year_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_dates_check check (ends_on >= starts_on),
  constraint academic_years_school_name_key unique (school_id, name)
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_number smallint not null,
  name varchar(40) not null,
  starts_on date not null,
  ends_on date not null,
  lifecycle_status public.term_lifecycle_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terms_number_check check (term_number between 1 and 3),
  constraint terms_dates_check check (ends_on >= starts_on),
  constraint terms_school_year_number_key unique (school_id, academic_year_id, term_number)
);

create index school_memberships_role_id_idx on public.school_memberships(role_id);
create index academic_years_school_id_idx on public.academic_years(school_id);
create index terms_school_id_idx on public.terms(school_id);
create index terms_academic_year_id_idx on public.terms(academic_year_id);

create or replace function public.terms_match_academic_year_school()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.academic_years academic_year
    where academic_year.id = new.academic_year_id
      and academic_year.school_id = new.school_id
  ) then
    raise exception 'term school_id must match its academic year school_id';
  end if;

  return new;
end;
$$;

create trigger terms_require_matching_school
before insert or update of school_id, academic_year_id on public.terms
for each row execute function public.terms_match_academic_year_school();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger schools_set_updated_at
before update on public.schools
for each row execute function public.set_updated_at();

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

create trigger school_memberships_set_updated_at
before update on public.school_memberships
for each row execute function public.set_updated_at();

create trigger academic_years_set_updated_at
before update on public.academic_years
for each row execute function public.set_updated_at();

create trigger terms_set_updated_at
before update on public.terms
for each row execute function public.set_updated_at();

-- Direct browser access is read-only and limited to the authenticated user's
-- active school memberships. Service-role API operations bypass these policies.
alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.school_memberships enable row level security;
alter table public.academic_years enable row level security;
alter table public.terms enable row level security;

create policy "members can view their school"
on public.schools for select to authenticated
using (
  exists (
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.school_id = schools.id
      and membership.status = 'ACTIVE'
      and app_user.auth_user_id = auth.uid()
  )
);

create policy "users can view their own profile"
on public.users for select to authenticated
using (auth_user_id = auth.uid());

create policy "users can view their own memberships"
on public.school_memberships for select to authenticated
using (
  exists (
    select 1 from public.users app_user
    where app_user.id = school_memberships.user_id
      and app_user.auth_user_id = auth.uid()
  )
);

create policy "members can view scoped academic years"
on public.academic_years for select to authenticated
using (
  exists (
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.school_id = academic_years.school_id
      and membership.status = 'ACTIVE'
      and app_user.auth_user_id = auth.uid()
  )
);

create policy "members can view scoped terms"
on public.terms for select to authenticated
using (
  exists (
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    where membership.school_id = terms.school_id
      and membership.status = 'ACTIVE'
      and app_user.auth_user_id = auth.uid()
  )
);
