-- OURSCHOOL Platform Admin Control Centre
-- Global platform context and selected-school tenant administration.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  full_name varchar(200) not null,
  email varchar(255) not null unique,
  telephone varchar(50),
  mfa_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code varchar(50) not null unique,
  name varchar(100) not null,
  price_minor bigint not null check (price_minor >= 0),
  currency char(3) not null default 'UGX',
  billing_period_months integer not null default 12 check (billing_period_months > 0),
  storage_limit_bytes bigint not null check (storage_limit_bytes >= 0),
  learner_limit integer,
  user_limit integer,
  entitlements jsonb not null default '{}'::jsonb,
  status varchar(20) not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','RETIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status varchar(30) not null check (status in ('TRIAL','ACTIVE','PAYMENT_DUE','SUSPENDED','CANCELLED','EXPIRED')),
  starts_on date not null,
  expires_on date not null,
  grace_period_days integer not null default 0 check (grace_period_days between 0 and 90),
  renewal_status varchar(30) not null default 'MANUAL',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_subscriptions_dates check (expires_on >= starts_on)
);

create unique index school_subscriptions_one_current
  on public.school_subscriptions (school_id)
  where status in ('TRIAL','ACTIVE','PAYMENT_DUE','SUSPENDED');

create table public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid references public.school_subscriptions(id) on delete restrict,
  reference varchar(100) not null unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null default 'UGX',
  method varchar(50) not null,
  transaction_reference varchar(150),
  status varchar(20) not null default 'PENDING' check (status in ('PENDING','CONFIRMED','REVERSED','FAILED')),
  paid_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references public.platform_admins(id) on delete restrict,
  correction_of uuid references public.subscription_payments(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  key varchar(100) primary key,
  label varchar(160) not null,
  global_enabled boolean not null default true,
  school_override_permitted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.school_feature_overrides (
  school_id uuid not null references public.schools(id) on delete cascade,
  feature_key varchar(100) not null references public.feature_flags(key) on delete restrict,
  override_state varchar(20) not null check (override_state in ('DEFAULT','ENABLED','DISABLED')),
  reason text not null,
  changed_by uuid not null references public.platform_admins(id) on delete restrict,
  changed_at timestamptz not null default now(),
  primary key (school_id, feature_key)
);

create table public.system_jobs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete restrict,
  job_type varchar(100) not null,
  status varchar(20) not null check (status in ('QUEUED','RUNNING','COMPLETE','FAILED','CANCELLED')),
  is_idempotent boolean not null default false,
  attempts integer not null default 0,
  error_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete restrict,
  event_type varchar(100) not null,
  severity varchar(20) not null check (severity in ('INFO','WARNING','HIGH','CRITICAL')),
  summary text not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid not null references public.platform_admins(id) on delete restrict,
  school_id uuid references public.schools(id) on delete restrict,
  action varchar(120) not null,
  target_type varchar(100) not null,
  target_id varchar(150),
  previous_state jsonb,
  new_state jsonb,
  reason text,
  session_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index school_subscriptions_school_idx on public.school_subscriptions(school_id);
create index subscription_payments_school_idx on public.subscription_payments(school_id, created_at desc);
create index system_jobs_school_idx on public.system_jobs(school_id, created_at desc);
create index security_events_school_idx on public.security_events(school_id, occurred_at desc);
create index platform_audit_school_idx on public.platform_audit_logs(school_id, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.school_subscriptions enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.feature_flags enable row level security;
alter table public.school_feature_overrides enable row level security;
alter table public.system_jobs enable row level security;
alter table public.security_events enable row level security;
alter table public.platform_audit_logs enable row level security;

-- No browser-write policies are created. Platform mutations must run through
-- authenticated /api/v1/platform/* endpoints that validate the target school,
-- operation, reason, and Platform Administrator before using server credentials.
