-- OURSCHOOL Stage 15: production billing, merchant payments, immutable receipts and notifications.
-- Provider endpoints, credentials and merchant codes are deployment configuration and are never seeded here.

create type public.payment_provider_code as enum ('MTN_MOMOPAY','AIRTEL_MONEY_MERCHANT');
create type public.payment_processing_status as enum ('PENDING','AWAITING_PAYMENT','AWAITING_VERIFICATION','PROCESSING','VERIFIED','PAID','FAILED','REJECTED','CANCELLED','EXPIRED','REVERSED','REFUNDED','REQUIRES_REVIEW');
create type public.invoice_lifecycle_status as enum ('DRAFT','ISSUED','PENDING','PAID','OVERDUE','CANCELLED','WAIVED');
create type public.delivery_lifecycle_status as enum ('QUEUED','SENDING','SENT','DELIVERED','FAILED','BOUNCED');
create table public.platform_payment_provider_configs (
 id uuid primary key default gen_random_uuid(), provider public.payment_provider_code not null,
 status public.offering_status not null default 'INACTIVE', merchant_code text, merchant_name text,
 currency char(3) not null default 'UGX', integration_mode varchar(20) not null check(integration_mode in ('MERCHANT_CODE','API','HYBRID')),
 instructions text, integration_status varchar(30) not null check(integration_status in ('NOT_CONFIGURED','SANDBOX','PENDING_APPROVAL','LIVE')),
 credential_reference text, webhook_status varchar(30), version integer not null default 1,
 effective_from timestamptz not null default now(), effective_to timestamptz,
 configured_by uuid not null references public.platform_admins(id) on delete restrict, created_at timestamptz not null default now(),
 constraint live_provider_configuration_check check(integration_status <> 'LIVE' or (merchant_code is not null and merchant_name is not null and credential_reference is not null))
);
create unique index one_active_provider_configuration on public.platform_payment_provider_configs(provider) where effective_to is null;
create table public.subscription_invoices (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 subscription_period_id uuid not null references public.subscription_periods(id) on delete restrict,
 invoice_number varchar(80) not null unique, payment_reference varchar(80) not null unique,
 plan_code varchar(80) not null, academic_year integer not null, academic_term varchar(20) not null,
 amount_due bigint not null check(amount_due >= 0), currency char(3) not null,
 provider_config_snapshot jsonb not null default '{}'::jsonb, status public.invoice_lifecycle_status not null default 'ISSUED',
 issued_at timestamptz not null default now(), due_at timestamptz not null, paid_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.merchant_payment_claims (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 invoice_id uuid not null references public.subscription_invoices(id) on delete restrict, provider public.payment_provider_code not null,
 provider_transaction_reference varchar(180) not null, payer_number_masked varchar(40), payment_date date not null,
 amount_claimed bigint not null check(amount_claimed > 0), currency char(3) not null default 'UGX',
 status public.payment_processing_status not null default 'AWAITING_VERIFICATION', submitted_by uuid not null references auth.users(id) on delete restrict,
 reviewed_by uuid references public.platform_admins(id) on delete restrict, review_note text, reviewed_at timestamptz,
 created_at timestamptz not null default now(), unique(provider, provider_transaction_reference)
);
create table public.verified_payment_transactions (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 invoice_id uuid not null unique references public.subscription_invoices(id) on delete restrict,
 claim_id uuid unique references public.merchant_payment_claims(id) on delete restrict,
 provider public.payment_provider_code not null, provider_transaction_reference varchar(180) not null,
 amount bigint not null check(amount > 0), currency char(3) not null, status public.payment_processing_status not null,
 idempotency_key varchar(200) not null unique, verified_by uuid references public.platform_admins(id) on delete restrict,
 provider_verified_at timestamptz, verified_at timestamptz not null, reversal_of uuid references public.verified_payment_transactions(id) on delete restrict,
 created_at timestamptz not null default now(), unique(provider, provider_transaction_reference)
);
create table public.digital_receipts (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 payment_id uuid not null unique references public.verified_payment_transactions(id) on delete restrict,
 receipt_number varchar(80) not null unique, financial_snapshot jsonb not null,
 pdf_storage_key text not null, pdf_sha256 varchar(64) not null, status varchar(20) not null check(status in ('GENERATED','REVERSED')),
 generated_at timestamptz not null default now()
);
create table public.system_notifications (
 id uuid primary key default gen_random_uuid(), school_id uuid references public.schools(id) on delete restrict,
 recipient_user_id uuid not null references auth.users(id) on delete restrict, category varchar(30) not null,
 event_type varchar(100) not null, title varchar(180) not null, message text not null,
 entity_type varchar(80), entity_id uuid, idempotency_key varchar(200) not null unique,
 read_at timestamptz, created_at timestamptz not null default now()
);
create table public.receipt_email_deliveries (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
 receipt_id uuid not null references public.digital_receipts(id) on delete restrict,
 recipient_snapshot varchar(255) not null, status public.delivery_lifecycle_status not null default 'QUEUED',
 attempt_count integer not null default 0, provider_reference varchar(255), failure_category varchar(100),
 idempotency_key varchar(200) not null unique, sent_at timestamptz, created_at timestamptz not null default now()
);
create index invoice_school_period_idx on public.subscription_invoices(school_id, academic_year desc, academic_term);
create index receipt_school_idx on public.digital_receipts(school_id, generated_at desc);
create index notification_recipient_idx on public.system_notifications(recipient_user_id, read_at, created_at desc);
alter table public.platform_payment_provider_configs enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.merchant_payment_claims enable row level security;
alter table public.verified_payment_transactions enable row level security;
alter table public.digital_receipts enable row level security;
alter table public.system_notifications enable row level security;
alter table public.receipt_email_deliveries enable row level security;
insert into public.permissions(code,description) values
 ('platform.merchant_settings.manage','Manage versioned merchant payment settings.'),('platform.payments.verify','Verify merchant payment claims.'),
 ('platform.payments.reconcile','Reconcile provider transactions.'),('platform.receipts.view','View platform receipt operations.'),
 ('school.billing.view','View the school billing account.'),('school.billing.pay','Submit a merchant payment claim.'),
 ('school.receipts.view','View own school receipts.'),('school.receipts.download','Download own school receipt PDFs.'),
 ('school.notifications.view','View own authorised notifications.')
on conflict(code) do update set description=excluded.description;
-- Mutations and secure receipt downloads are API-only. No direct client write policy is created.
-- Receipt PDF objects belong in a private storage bucket and are served only after membership and school_id checks.;
