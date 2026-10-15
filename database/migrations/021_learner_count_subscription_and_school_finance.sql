-- OURSCHOOL learner-count subscription, onboarding, concessions and school finance controls.

alter table public.subscription_plans drop constraint if exists subscription_plans_billing_period_check;
alter table public.subscription_plans
  add column if not exists billing_cadence varchar(20) not null default 'TERMLY' check (billing_cadence in ('ANNUAL','TERMLY')),
  add column if not exists pricing_model varchar(30) not null default 'PER_ACTIVE_LEARNER' check (pricing_model='PER_ACTIVE_LEARNER'),
  add column if not exists unit_price_minor bigint not null default 3000 check (unit_price_minor>=0),
  add column if not exists minimum_charge_minor bigint not null default 300000 check (minimum_charge_minor>=0),
  add column if not exists volume_cap_minor bigint check (volume_cap_minor is null or volume_cap_minor>=minimum_charge_minor),
  add column if not exists census_deadline_days integer not null default 21 check (census_deadline_days between 0 and 120);
alter table public.subscription_plans alter column billing_period drop not null;

update public.subscription_plans set status='RETIRED',updated_at=now() where code='OURSCHOOL_TERMLY';
insert into public.subscription_plans(code,name,price_minor,currency,billing_period_months,billing_period,storage_limit_bytes,entitlements,status,billing_cadence,pricing_model,unit_price_minor,minimum_charge_minor,census_deadline_days)
values
('OURSCHOOL_ANNUAL','OURSCHOOL Annual Subscription',800000,'UGX',12,null,5368709120,'{"unlimitedAccounts":true,"reportCards":true,"excelImport":true,"aLevel":true}'::jsonb,'ACTIVE','ANNUAL','PER_ACTIVE_LEARNER',8000,800000,21),
('OURSCHOOL_TERMLY_V2','OURSCHOOL Termly Subscription',300000,'UGX',4,'ACADEMIC_TERM',5368709120,'{"unlimitedAccounts":true,"reportCards":true,"excelImport":true,"aLevel":true}'::jsonb,'ACTIVE','TERMLY','PER_ACTIVE_LEARNER',3000,300000,21)
on conflict(code) do update set name=excluded.name,price_minor=excluded.price_minor,billing_period_months=excluded.billing_period_months,billing_period=excluded.billing_period,entitlements=excluded.entitlements,status=excluded.status,billing_cadence=excluded.billing_cadence,pricing_model=excluded.pricing_model,unit_price_minor=excluded.unit_price_minor,minimum_charge_minor=excluded.minimum_charge_minor,census_deadline_days=excluded.census_deadline_days,updated_at=now();

create table if not exists public.onboarding_fee_bands(
 id uuid primary key default gen_random_uuid(), minimum_learners integer not null, maximum_learners integer,
 fee_minor bigint not null check(fee_minor>=0), currency char(3) not null default 'UGX', is_from_price boolean not null default false,
 status varchar(20) not null default 'ACTIVE' check(status in ('ACTIVE','RETIRED')), effective_from date not null default current_date,
 effective_to date, created_at timestamptz not null default now(),
 check(minimum_learners>=1 and (maximum_learners is null or maximum_learners>=minimum_learners)),
 check(effective_to is null or effective_to>=effective_from)
);
create unique index if not exists onboarding_fee_active_band on public.onboarding_fee_bands(minimum_learners,coalesce(maximum_learners,2147483647)) where status='ACTIVE';
insert into public.onboarding_fee_bands(minimum_learners,maximum_learners,fee_minor,is_from_price) values
(1,300,500000,false),(301,1000,1500000,false),(1001,2000,3000000,false),(2001,null,6150000,true)
on conflict do nothing;

create table if not exists public.school_billing_profiles(
 school_id uuid primary key references public.schools(id) on delete restrict,
 plan_id uuid not null references public.subscription_plans(id) on delete restrict,
 census_deadline_days integer not null default 21 check(census_deadline_days between 0 and 120),
 late_learner_treatment varchar(30) not null default 'NEXT_PERIOD' check(late_learner_treatment in ('PRORATE','NEXT_PERIOD')),
 onboarding_fee_minor bigint not null default 0 check(onboarding_fee_minor>=0), volume_cap_minor bigint,
 configured_by uuid references public.platform_admins(id) on delete restrict, updated_at timestamptz not null default now()
);
create table if not exists public.learner_census_snapshots(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 plan_id uuid not null references public.subscription_plans(id) on delete restrict,
 academic_year integer not null check(academic_year between 2000 and 2200), academic_term varchar(20),
 census_date date not null, active_learner_count integer not null check(active_learner_count>=0),
 projected_amount_minor bigint not null check(projected_amount_minor>=0), confirmed_at timestamptz,
 confirmed_by uuid references public.users(id) on delete restrict, locked_at timestamptz,
 created_at timestamptz not null default now(), unique(school_id,plan_id,academic_year,academic_term)
);
create table if not exists public.support_concessions(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 concession_type varchar(30) not null check(concession_type in ('SUBSCRIPTION_DISCOUNT','ONBOARDING_REDUCTION','INSTALLMENT','GRACE_PERIOD','SPONSORSHIP','PILOT')),
 reason text not null, amount_minor bigint, percentage numeric(5,2), sponsor_name varchar(200),
 starts_on date not null, expires_on date not null, status varchar(20) not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','EXPIRED','REVOKED')),
 approved_by uuid references public.platform_admins(id) on delete restrict, approved_at timestamptz,
 created_at timestamptz not null default now(), check(expires_on>=starts_on),
 check(amount_minor is not null or percentage is not null or concession_type in ('INSTALLMENT','GRACE_PERIOD','PILOT'))
);

alter table public.subscription_invoices
 add column if not exists billing_cadence varchar(20) check(billing_cadence in ('ANNUAL','TERMLY')),
 add column if not exists active_learner_count integer check(active_learner_count>=0),
 add column if not exists unit_price_minor bigint check(unit_price_minor>=0),
 add column if not exists minimum_charge_minor bigint check(minimum_charge_minor>=0),
 add column if not exists gross_amount_minor bigint check(gross_amount_minor>=0),
 add column if not exists discount_minor bigint not null default 0 check(discount_minor>=0),
 add column if not exists onboarding_amount_minor bigint not null default 0 check(onboarding_amount_minor>=0),
 add column if not exists balance_minor bigint check(balance_minor>=0);
create table if not exists public.subscription_invoice_adjustments(
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
 school_id uuid not null references public.schools(id) on delete restrict,
 adjustment_type varchar(20) not null check(adjustment_type in ('ADJUSTMENT','WAIVER','CREDIT','REFUND','REVERSAL')),
 amount_minor bigint not null check(amount_minor>0), reason text not null,
 status varchar(20) not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED','POSTED')),
 requested_by uuid not null references auth.users(id) on delete restrict, approved_by uuid references public.platform_admins(id) on delete restrict,
 created_at timestamptz not null default now(), approved_at timestamptz
);

create table if not exists public.school_fee_structures(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 academic_year integer not null, academic_term varchar(20) not null, name varchar(180) not null,
 class_id uuid references public.academic_classes(id) on delete restrict, stream_id uuid references public.class_streams(id) on delete restrict,
 learner_type varchar(60), residence_type varchar(20) check(residence_type in ('DAY','BOARDING')),
 status varchar(20) not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','RETIRED')),
 created_by uuid not null references public.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.school_fee_items(
 id uuid primary key default gen_random_uuid(), fee_structure_id uuid not null references public.school_fee_structures(id) on delete restrict,
 item_name varchar(180) not null, amount_minor bigint not null check(amount_minor>=0), is_optional boolean not null default false,
 due_on date, display_order integer not null default 1 check(display_order>0)
);
create table if not exists public.learner_fee_invoices(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 learner_id uuid not null references public.learners(id) on delete restrict, fee_structure_id uuid references public.school_fee_structures(id) on delete restrict,
 invoice_number varchar(80) not null unique, payment_reference varchar(80) not null unique,
 gross_amount_minor bigint not null check(gross_amount_minor>=0), provider_charge_minor bigint not null default 0 check(provider_charge_minor>=0),
 discount_minor bigint not null default 0 check(discount_minor>=0), credit_minor bigint not null default 0 check(credit_minor>=0),
 amount_paid_minor bigint not null default 0 check(amount_paid_minor>=0), currency char(3) not null default 'UGX',
 status varchar(20) not null default 'ISSUED' check(status in ('DRAFT','ISSUED','PART_PAID','PAID','OVERDUE','WAIVED','CANCELLED')),
 due_on date not null, issued_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.school_payment_channels(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 channel_type varchar(30) not null check(channel_type in ('MOBILE_MONEY','BANK','CARD','AGENT','CASH')),
 provider_name varchar(120) not null, is_enabled boolean not null default false,
 charge_policy varchar(20) not null default 'SCHOOL_ABSORBS' check(charge_policy in ('SCHOOL_ABSORBS','PARENT_PAYS','SPLIT')),
 school_share_percentage numeric(5,2) not null default 100 check(school_share_percentage between 0 and 100),
 credential_reference text, updated_at timestamptz not null default now(), unique(school_id,channel_type,provider_name)
);
create table if not exists public.school_fee_payments(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 learner_invoice_id uuid not null references public.learner_fee_invoices(id) on delete restrict,
 payment_reference varchar(100) not null, provider_transaction_reference varchar(180), amount_minor bigint not null check(amount_minor>0),
 provider_charge_minor bigint not null default 0 check(provider_charge_minor>=0), currency char(3) not null default 'UGX',
 status varchar(30) not null default 'PENDING' check(status in ('PENDING','CONFIRMED','FAILED','DELAYED','UNMATCHED','DUPLICATE','REVERSED','REFUNDED')),
 received_at timestamptz, confirmed_at timestamptz, recorded_by uuid references public.users(id) on delete restrict,
 correction_of uuid references public.school_fee_payments(id) on delete restrict, created_at timestamptz not null default now()
);
create table if not exists public.finance_approval_rules(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 action_type varchar(30) not null check(action_type in ('DISCOUNT','WAIVER','REVERSAL','REFUND')),
 threshold_minor bigint not null default 0 check(threshold_minor>=0), required_approvals integer not null default 1 check(required_approvals between 1 and 5),
 is_active boolean not null default true, updated_at timestamptz not null default now(), unique(school_id,action_type)
);
create table if not exists public.finance_audit_events(
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict, action varchar(100) not null,
 entity_type varchar(80) not null, entity_id uuid, previous_value jsonb, new_value jsonb, reason text not null,
 created_at timestamptz not null default now()
);

create or replace function public.prevent_confirmed_financial_payment_update() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin if old.status='CONFIRMED' then raise exception 'Confirmed payments are immutable; create a reversal or adjustment.'; end if; return new; end $$;
drop trigger if exists immutable_confirmed_subscription_payment on public.subscription_payments;
create trigger immutable_confirmed_subscription_payment before update or delete on public.subscription_payments for each row execute function public.prevent_confirmed_financial_payment_update();
drop trigger if exists immutable_confirmed_school_fee_payment on public.school_fee_payments;
create trigger immutable_confirmed_school_fee_payment before update or delete on public.school_fee_payments for each row execute function public.prevent_confirmed_financial_payment_update();

alter table public.onboarding_fee_bands enable row level security; alter table public.school_billing_profiles enable row level security;
alter table public.learner_census_snapshots enable row level security; alter table public.support_concessions enable row level security;
alter table public.subscription_invoice_adjustments enable row level security; alter table public.school_fee_structures enable row level security;
alter table public.school_fee_items enable row level security; alter table public.learner_fee_invoices enable row level security;
alter table public.school_payment_channels enable row level security; alter table public.school_fee_payments enable row level security;
alter table public.finance_approval_rules enable row level security; alter table public.finance_audit_events enable row level security;

create policy "authenticated read onboarding bands" on public.onboarding_fee_bands for select to authenticated using(true);
create policy "authorized read billing profiles" on public.school_billing_profiles for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "authorized read census snapshots" on public.learner_census_snapshots for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "authorized read support concessions" on public.support_concessions for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "authorized read invoice adjustments" on public.subscription_invoice_adjustments for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "school read fee structures" on public.school_fee_structures for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "school read fee items" on public.school_fee_items for select to authenticated using(exists(select 1 from public.school_fee_structures f where f.id=fee_structure_id and (public.is_platform_administrator() or public.is_active_school_member(f.school_id))));
create policy "school read learner fee invoices" on public.learner_fee_invoices for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "school read payment channels" on public.school_payment_channels for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "school read fee payments" on public.school_fee_payments for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "school read approval rules" on public.finance_approval_rules for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));
create policy "authorized read finance audit" on public.finance_audit_events for select to authenticated using(public.is_platform_administrator() or public.is_active_school_member(school_id));

revoke insert,update,delete,truncate,references,trigger on public.onboarding_fee_bands,public.school_billing_profiles,public.learner_census_snapshots,public.support_concessions,public.subscription_invoice_adjustments,public.school_fee_structures,public.school_fee_items,public.learner_fee_invoices,public.school_payment_channels,public.school_fee_payments,public.finance_approval_rules,public.finance_audit_events from authenticated,anon;

