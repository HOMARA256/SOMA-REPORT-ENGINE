-- OURSCHOOL authoritative platform identity, academic-term billing, invitations and onboarding.
-- Passwords and invitation tokens are never stored in plaintext by this migration.

alter table public.subscription_plans
  add column if not exists billing_period varchar(30) not null default 'ACADEMIC_TERM'
    check (billing_period in ('ACADEMIC_TERM'));

insert into public.subscription_plans
  (code, name, price_minor, currency, billing_period_months, billing_period, storage_limit_bytes, entitlements, status)
values
  ('OURSCHOOL_TERMLY', 'OURSCHOOL Termly Subscription', 450000, 'UGX', 4, 'ACADEMIC_TERM', 5368709120,
   '{"reportCards":true,"excelImport":true,"offlineMarks":true,"aLevel":true,"attendance":true,"bulkReports":true}'::jsonb, 'ACTIVE')
on conflict (code) do update set
  name = excluded.name,
  price_minor = excluded.price_minor,
  currency = excluded.currency,
  billing_period = excluded.billing_period,
  status = excluded.status,
  updated_at = now();

create table public.subscription_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  subscription_id uuid not null references public.school_subscriptions(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  academic_year integer not null check (academic_year between 2000 and 2200),
  academic_term varchar(20) not null check (academic_term in ('TERM_I','TERM_II','TERM_III')),
  amount_snapshot bigint not null check (amount_snapshot >= 0),
  currency char(3) not null default 'UGX',
  billing_period varchar(30) not null default 'ACADEMIC_TERM' check (billing_period = 'ACADEMIC_TERM'),
  starts_on date not null,
  due_on date not null,
  ends_on date not null,
  status varchar(30) not null check (status in ('DUE','PART_PAID','PAID','GRACE_PERIOD','SUSPENDED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, academic_year, academic_term),
  check (due_on >= starts_on and ends_on >= due_on)
);

alter table public.subscription_payments
  add column if not exists subscription_period_id uuid references public.subscription_periods(id) on delete restrict,
  add column if not exists academic_year integer,
  add column if not exists academic_term varchar(20) check (academic_term in ('TERM_I','TERM_II','TERM_III')),
  add column if not exists expected_amount_snapshot bigint check (expected_amount_snapshot >= 0);

create table public.school_admin_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invited_user_id uuid references auth.users(id) on delete restrict,
  full_name varchar(200) not null,
  email varchar(255) not null,
  telephone varchar(50),
  role varchar(40) not null default 'SCHOOL_ADMIN' check (role = 'SCHOOL_ADMIN'),
  token_hash text not null unique,
  status varchar(20) not null default 'PENDING' check (status in ('PENDING','SENT','DELIVERED','ACCEPTED','EXPIRED','REVOKED','FAILED')),
  expires_at timestamptz not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  attempt_count integer not null default 0,
  failure_category varchar(100),
  created_by uuid not null references public.platform_admins(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index school_admin_one_open_invitation
  on public.school_admin_invitations (school_id, lower(email))
  where status in ('PENDING','SENT','DELIVERED');

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete restrict,
  invitation_id uuid references public.school_admin_invitations(id) on delete restrict,
  message_type varchar(80) not null,
  recipient varchar(255) not null,
  status varchar(20) not null check (status in ('QUEUED','SENT','DELIVERED','FAILED')),
  attempt_count integer not null default 0,
  provider_message_reference varchar(255),
  failure_category varchar(100),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.school_onboarding_states (
  school_id uuid primary key references public.schools(id) on delete restrict,
  status varchar(30) not null check (status in ('REGISTERED','ADMIN_INVITED','ADMIN_ACTIVATED','SETUP_IN_PROGRESS','READY','ACTIVE')),
  milestones jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index subscription_period_school_idx on public.subscription_periods(school_id, academic_year desc, academic_term);
create index invitation_school_idx on public.school_admin_invitations(school_id, created_at desc);
create index notification_delivery_school_idx on public.notification_deliveries(school_id, created_at desc);

alter table public.subscription_periods enable row level security;
alter table public.school_admin_invitations enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.school_onboarding_states enable row level security;

comment on table public.platform_admins is 'Exactly one active deployment-provisioned Platform Administrator; authorization resolves by auth_user_id, not email comparison alone.';
comment on table public.subscription_periods is 'Immutable-price academic-term billing snapshots. Academic records are never deleted or altered by billing state.';
comment on column public.school_admin_invitations.token_hash is 'One-way hash only. The expiring raw token is sent once and never persisted.';

-- Deployment bootstrap must link auth.users.id for omarawilliam83@gmail.com to
-- platform_admins in an idempotent server-side operation. No password belongs in SQL.
