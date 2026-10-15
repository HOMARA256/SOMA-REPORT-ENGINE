-- MTN Mobile Money Uganda sandbox collection for OURSCHOOL platform billing only.
-- Secret values are referenced from Supabase Vault and are never returned to browsers.

create table if not exists public.platform_payment_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null default 'PLATFORM' check (owner_type='PLATFORM'),
  provider text not null check (provider='MTN_MOMO'),
  purpose text not null check (purpose='PLATFORM_SUBSCRIPTION_COLLECTION'),
  collection_number_secret_id uuid not null,
  collection_number_masked text not null,
  expected_account_holder_name text not null,
  provider_verified_account_holder_name text,
  verification_status text not null default 'PENDING_VERIFICATION' check (verification_status in ('UNVERIFIED','PENDING_VERIFICATION','VERIFIED','FAILED','NAME_MISMATCH')),
  verification_reference text,
  verified_at timestamptz,
  verified_by uuid references public.platform_admins(id),
  status text not null default 'SANDBOX' check (status in ('SANDBOX','PENDING_VERIFICATION','ACTIVE','SUSPENDED')),
  created_by uuid not null references public.platform_admins(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_type,provider,purpose)
);

create table if not exists public.platform_subscription_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
  provider text not null default 'MTN_MOMO' check (provider='MTN_MOMO'),
  payment_account_id uuid not null references public.platform_payment_accounts(id) on delete restrict,
  payer_phone_secret_id uuid not null,
  payer_phone_masked text not null,
  amount_minor bigint not null check (amount_minor>0),
  provider_charge_minor bigint not null default 0 check (provider_charge_minor>=0),
  total_amount_minor bigint generated always as (amount_minor+provider_charge_minor) stored,
  currency char(3) not null default 'UGX' check (currency='UGX'),
  payment_reference text not null unique,
  provider_transaction_id text unique,
  provider_status text,
  status text not null default 'DRAFT' check (status in ('DRAFT','PENDING','AWAITING_PAYER_APPROVAL','PROCESSING','SUCCESSFUL','FAILED','EXPIRED','CANCELLED','REVERSED','RECONCILIATION_REQUIRED')),
  environment text not null default 'SANDBOX' check (environment in ('SANDBOX','LIVE')),
  initiated_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  receipt_id uuid,
  initiated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  payment_attempt_id uuid references public.platform_subscription_payment_attempts(id) on delete restrict,
  provider_event_id text not null unique,
  event_type text not null,
  signature_valid boolean not null,
  payload_digest text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_result text
);

create table if not exists public.platform_subscription_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number text not null unique,
  school_id uuid not null references public.schools(id) on delete restrict,
  invoice_id uuid not null references public.subscription_invoices(id) on delete restrict,
  payment_attempt_id uuid not null unique references public.platform_subscription_payment_attempts(id) on delete restrict,
  amount_minor bigint not null,
  currency char(3) not null default 'UGX',
  financial_snapshot jsonb not null,
  status text not null default 'ISSUED' check(status in ('ISSUED','VOID','REVERSED')),
  generated_at timestamptz not null default now()
);

alter table public.platform_subscription_payment_attempts
  drop constraint if exists platform_subscription_payment_attempts_receipt_id_fkey;
alter table public.platform_subscription_payment_attempts
  add constraint platform_subscription_payment_attempts_receipt_id_fkey foreign key(receipt_id) references public.platform_subscription_receipts(id) on delete restrict;

alter table public.platform_payment_accounts enable row level security;
alter table public.platform_subscription_payment_attempts enable row level security;
alter table public.platform_payment_provider_events enable row level security;
alter table public.platform_subscription_receipts enable row level security;
revoke all on public.platform_payment_accounts, public.platform_subscription_payment_attempts, public.platform_payment_provider_events, public.platform_subscription_receipts from anon, authenticated;

create or replace function public.is_active_platform_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.platform_admins p where p.auth_user_id=auth.uid() and p.is_active);
$$;

create policy "platform admins read payment accounts" on public.platform_payment_accounts for select to authenticated using (public.is_active_platform_admin());
create policy "tenant members read own subscription attempts" on public.platform_subscription_payment_attempts for select to authenticated using (
  public.is_active_platform_admin() or exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id where u.auth_user_id=auth.uid() and m.school_id=school_id and m.status='ACTIVE')
);
create policy "tenant members read own platform receipts" on public.platform_subscription_receipts for select to authenticated using (
  public.is_active_platform_admin() or exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id where u.auth_user_id=auth.uid() and m.school_id=school_id and m.status='ACTIVE')
);
create policy "platform admins read payment events" on public.platform_payment_provider_events for select to authenticated using (public.is_active_platform_admin());
grant select on public.platform_payment_accounts, public.platform_subscription_payment_attempts, public.platform_subscription_receipts to authenticated;
grant select on public.platform_payment_provider_events to authenticated;

create or replace function public.get_platform_mtn_payment_account()
returns table(id uuid,provider text,purpose text,collection_number_masked text,expected_account_holder_name text,provider_verified_account_holder_name text,verification_status text,verification_reference text,verified_at timestamptz,status text)
language sql stable security definer set search_path=public as $$
  select a.id,a.provider,a.purpose,a.collection_number_masked,a.expected_account_holder_name,a.provider_verified_account_holder_name,a.verification_status,a.verification_reference,a.verified_at,a.status
  from public.platform_payment_accounts a
  where public.is_active_platform_admin() and a.owner_type='PLATFORM' and a.provider='MTN_MOMO' and a.purpose='PLATFORM_SUBSCRIPTION_COLLECTION';
$$;
grant execute on function public.get_platform_mtn_payment_account() to authenticated;

create or replace function public.initiate_sandbox_mtn_subscription_payment(p_invoice_id uuid,p_payer_phone text)
returns jsonb language plpgsql security definer set search_path=public,vault as $$
declare v_invoice public.subscription_invoices%rowtype; v_account public.platform_payment_accounts%rowtype; v_secret uuid; v_reference text; v_attempt uuid; v_phone text;
begin
  v_phone:=regexp_replace(coalesce(p_payer_phone,''),'\D','','g');
  if v_phone like '0%' then v_phone:='256'||substr(v_phone,2); end if;
  if v_phone !~ '^2567[78][0-9]{7}$' then raise exception 'INVALID_MTN_UGANDA_NUMBER'; end if;
  select * into v_invoice from public.subscription_invoices where id=p_invoice_id;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if not (public.is_active_platform_admin() or exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id where u.auth_user_id=auth.uid() and m.school_id=v_invoice.school_id and m.status='ACTIVE')) then raise exception 'NOT_AUTHORISED'; end if;
  if v_invoice.balance_minor<=0 or v_invoice.status::text in ('PAID','VOID','CANCELLED') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  select * into v_account from public.platform_payment_accounts where provider='MTN_MOMO' and purpose='PLATFORM_SUBSCRIPTION_COLLECTION';
  if not found then raise exception 'PAYMENT_ACCOUNT_NOT_CONFIGURED'; end if;
  if v_account.status not in ('SANDBOX','PENDING_VERIFICATION') then raise exception 'SANDBOX_NOT_AVAILABLE'; end if;
  v_secret:=vault.create_secret(v_phone,'mtn-payer-'||gen_random_uuid()::text,'Encrypted MTN payer number for a sandbox subscription attempt');
  v_reference:='OS-MTN-SBX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.platform_subscription_payment_attempts(school_id,invoice_id,payment_account_id,payer_phone_secret_id,payer_phone_masked,amount_minor,payment_reference,status,environment,initiated_at,initiated_by)
  values(v_invoice.school_id,v_invoice.id,v_account.id,v_secret,'+256******'||right(v_phone,3),v_invoice.balance_minor,v_reference,'AWAITING_PAYER_APPROVAL','SANDBOX',now(),auth.uid()) returning id into v_attempt;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value,created_at)
  values(auth.uid(),'Authenticated user','SCHOOL_ADMIN','MTN_SANDBOX_PAYMENT_INITIATED','subscription_payment',v_attempt::text,jsonb_build_object('invoice_id',v_invoice.id,'school_id',v_invoice.school_id,'reference',v_reference,'environment','SANDBOX'),now());
  return jsonb_build_object('paymentAttemptId',v_attempt,'paymentReference',v_reference,'status','AWAITING_PAYER_APPROVAL','environment','SANDBOX','amountMinor',v_invoice.balance_minor,'currency','UGX');
end $$;
grant execute on function public.initiate_sandbox_mtn_subscription_payment(uuid,text) to authenticated;

create or replace function public.process_sandbox_mtn_callback(p_payment_reference text,p_provider_event_id text,p_outcome text,p_signature_valid boolean default true)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_attempt public.platform_subscription_payment_attempts%rowtype; v_event uuid; v_receipt uuid; v_status text; v_platform public.platform_admins%rowtype;
begin
  select * into v_platform from public.platform_admins where auth_user_id=auth.uid() and is_active;
  if not found then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  if not p_signature_valid then raise exception 'INVALID_CALLBACK_SIGNATURE'; end if;
  select * into v_attempt from public.platform_subscription_payment_attempts where payment_reference=p_payment_reference for update;
  if not found then raise exception 'UNMATCHED_PAYMENT'; end if;
  insert into public.platform_payment_provider_events(payment_attempt_id,provider_event_id,event_type,signature_valid,payload_digest)
  values(v_attempt.id,p_provider_event_id,p_outcome,true,encode(digest(p_provider_event_id||':'||p_outcome,'sha256'),'hex'))
  on conflict(provider_event_id) do nothing returning id into v_event;
  if v_event is null then return jsonb_build_object('idempotent',true,'status',v_attempt.status); end if;
  if v_attempt.environment<>'SANDBOX' then raise exception 'SANDBOX_CALLBACK_ONLY'; end if;
  v_status:=case upper(p_outcome) when 'SUCCESSFUL' then 'SUCCESSFUL' when 'FAILED' then 'FAILED' when 'CANCELLED' then 'CANCELLED' when 'EXPIRED' then 'EXPIRED' when 'REVERSED' then 'REVERSED' else 'RECONCILIATION_REQUIRED' end;
  update public.platform_subscription_payment_attempts set status=v_status,provider_status=upper(p_outcome),confirmed_at=case when v_status='SUCCESSFUL' then now() else confirmed_at end,failed_at=case when v_status in ('FAILED','CANCELLED','EXPIRED') then now() else failed_at end,failure_reason=case when v_status='FAILED' then 'SANDBOX_PROVIDER_FAILURE' else failure_reason end,updated_at=now() where id=v_attempt.id;
  if v_status='SUCCESSFUL' and v_attempt.receipt_id is null then
    insert into public.platform_subscription_receipts(receipt_number,school_id,invoice_id,payment_attempt_id,amount_minor,financial_snapshot)
    values('OS-RCP-SBX-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14)),v_attempt.school_id,v_attempt.invoice_id,v_attempt.id,v_attempt.amount_minor,jsonb_build_object('environment','SANDBOX','payment_reference',v_attempt.payment_reference,'amount_minor',v_attempt.amount_minor,'currency','UGX')) returning id into v_receipt;
    update public.platform_subscription_payment_attempts set receipt_id=v_receipt where id=v_attempt.id;
    update public.subscription_invoices set balance_minor=greatest(0,balance_minor-v_attempt.amount_minor),status=case when balance_minor-v_attempt.amount_minor<=0 then 'PAID'::public.invoice_lifecycle_status else status end,paid_at=case when balance_minor-v_attempt.amount_minor<=0 then now() else paid_at end,updated_at=now() where id=v_attempt.invoice_id;
    insert into public.system_notifications(school_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
    values(v_attempt.school_id,'Payments','MTN_SANDBOX_PAYMENT_SUCCESSFUL','Sandbox MTN payment confirmed','A sandbox subscription payment was confirmed. No real money moved.','subscription_payment',v_attempt.id,'mtn-sbx-success-'||v_attempt.id) on conflict(idempotency_key) do nothing;
  end if;
  update public.platform_payment_provider_events set processed_at=now(),processing_result=v_status where id=v_event;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value,created_at)
  values(auth.uid(),v_platform.full_name,'PLATFORM_ADMIN','MTN_SANDBOX_CALLBACK_PROCESSED','subscription_payment',v_attempt.id::text,jsonb_build_object('outcome',v_status,'event_id',p_provider_event_id,'environment','SANDBOX'),now());
  return jsonb_build_object('idempotent',false,'status',v_status,'receiptId',v_receipt);
end $$;
grant execute on function public.process_sandbox_mtn_callback(text,text,text,boolean) to authenticated;

;
