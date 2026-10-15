-- Secure school subscription collection lifecycle. Provider keys are held only
-- in Supabase Edge Function secrets; this table contains non-secret readiness.
alter table public.platform_payment_accounts
  drop constraint if exists platform_payment_accounts_provider_check;
alter table public.platform_payment_accounts
  add constraint platform_payment_accounts_provider_check
  check (provider in ('MTN_MOMO','MTN_MOMO_UG','AIRTEL_MONEY_UG'));

alter table public.platform_subscription_payment_attempts
  alter column payment_account_id drop not null,
  drop constraint if exists platform_subscription_payment_attempts_provider_check,
  drop constraint if exists platform_subscription_payment_attempts_status_check;
alter table public.platform_subscription_payment_attempts
  add constraint platform_subscription_payment_attempts_provider_check
    check (provider in ('MTN_MOMO','MTN_MOMO_UG','AIRTEL_MONEY_UG')),
  add constraint platform_subscription_payment_attempts_status_check
    check (status in ('DRAFT','PENDING','AWAITING_PAYER_APPROVAL','PROCESSING','SUCCESSFUL','FAILED','REJECTED','EXPIRED','CANCELLED','REVERSED','RECONCILIATION_REQUIRED')),
  add column if not exists idempotency_key text,
  add column if not exists external_reference text,
  add column if not exists provider_reference text,
  add column if not exists completed_at timestamptz;
update public.platform_subscription_payment_attempts
set idempotency_key = coalesce(idempotency_key, payment_reference)
where idempotency_key is null;
alter table public.platform_subscription_payment_attempts
  alter column idempotency_key set not null;
create unique index if not exists platform_payment_attempt_idempotency_uq
  on public.platform_subscription_payment_attempts(idempotency_key);
create unique index if not exists platform_payment_attempt_provider_reference_uq
  on public.platform_subscription_payment_attempts(provider, provider_reference)
  where provider_reference is not null;
create unique index if not exists platform_payment_one_active_attempt_per_invoice_uq
  on public.platform_subscription_payment_attempts(invoice_id)
  where environment='LIVE' and status in ('DRAFT','PENDING','AWAITING_PAYER_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED');

create table if not exists public.platform_mobile_money_readiness (
  provider text primary key check (provider in ('MTN_MOMO_UG','AIRTEL_MONEY_UG')),
  mode text not null default 'SANDBOX' check (mode in ('SANDBOX','LIVE')),
  onboarding_status text not null default 'NOT_CONFIGURED' check (onboarding_status in ('NOT_CONFIGURED','PENDING','VERIFIED','FAILED')),
  merchant_verification_status text not null default 'NOT_VERIFIED' check (merchant_verification_status in ('NOT_VERIFIED','PENDING','VERIFIED','FAILED')),
  callback_status text not null default 'NOT_CONFIGURED' check (callback_status in ('NOT_CONFIGURED','PENDING','VERIFIED','FAILED')),
  reconciliation_status text not null default 'NOT_CONFIGURED' check (reconciliation_status in ('NOT_CONFIGURED','PENDING','VERIFIED','FAILED')),
  settlement_status text not null default 'NOT_CONFIGURED' check (settlement_status in ('NOT_CONFIGURED','PENDING','VERIFIED','FAILED')),
  collection_number_masked text,
  expected_account_holder text,
  provider_verified_account_holder text,
  verification_reference text,
  verified_at timestamptz,
  updated_by uuid references public.platform_admins(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (mode <> 'LIVE' or (onboarding_status='VERIFIED' and merchant_verification_status='VERIFIED'
    and callback_status='VERIFIED' and reconciliation_status='VERIFIED' and settlement_status='VERIFIED'))
);
insert into public.platform_mobile_money_readiness(provider,mode,onboarding_status,merchant_verification_status,callback_status,reconciliation_status,settlement_status)
values ('MTN_MOMO_UG','SANDBOX','PENDING','NOT_VERIFIED','NOT_CONFIGURED','NOT_CONFIGURED','NOT_CONFIGURED'),
       ('AIRTEL_MONEY_UG','SANDBOX','NOT_CONFIGURED','NOT_VERIFIED','NOT_CONFIGURED','NOT_CONFIGURED','NOT_CONFIGURED')
on conflict (provider) do nothing;
update public.platform_mobile_money_readiness r set
  collection_number_masked=a.collection_number_masked,
  expected_account_holder=a.expected_account_holder_name,
  provider_verified_account_holder=a.provider_verified_account_holder_name,
  verification_reference=a.verification_reference,
  verified_at=a.verified_at,
  merchant_verification_status=case a.verification_status when 'VERIFIED' then 'VERIFIED' when 'FAILED' then 'FAILED' when 'NAME_MISMATCH' then 'FAILED' when 'PENDING_VERIFICATION' then 'PENDING' else 'NOT_VERIFIED' end,
  updated_at=now()
from public.platform_payment_accounts a
where r.provider='MTN_MOMO_UG' and a.provider='MTN_MOMO' and a.owner_type='PLATFORM' and a.purpose='PLATFORM_SUBSCRIPTION_COLLECTION';
alter table public.platform_mobile_money_readiness enable row level security;
revoke all on public.platform_mobile_money_readiness from anon, authenticated;

-- Invoices were RLS-enabled without a tenant billing read policy. Expose only
-- the selected tenant's billing rows to its School Admin and to Platform Admin.
drop policy if exists "authorized billing admins read subscription invoices" on public.subscription_invoices;
create policy "authorized billing admins read subscription invoices" on public.subscription_invoices
  for select to authenticated using (
    public.is_active_platform_admin()
    or (public.is_active_school_member(school_id) and exists(
      select 1 from public.school_memberships m
      join public.users u on u.id=m.user_id
      join public.roles r on r.id=m.role_id
      where u.auth_user_id=auth.uid() and m.school_id=subscription_invoices.school_id
        and m.status='ACTIVE' and r.code='SCHOOL_ADMIN'
    ))
  );

-- Hide the legacy boolean-based sandbox callback and unconstrained attempt RPC.
revoke all on function public.initiate_sandbox_mtn_subscription_payment(uuid,text) from public,anon,authenticated;
revoke all on function public.process_sandbox_mtn_callback(text,text,text,boolean) from public,anon,authenticated;

alter table public.platform_subscription_payment_attempts
  add column if not exists provider_request_id uuid not null default gen_random_uuid();
create unique index if not exists platform_payment_provider_request_id_uq
  on public.platform_subscription_payment_attempts(provider_request_id);

create or replace function public.get_mobile_money_provider_readiness(p_school_id uuid default null)
returns table(provider text,mode text,onboarding_status text,merchant_verification_status text,callback_status text,
  reconciliation_status text,settlement_status text,collection_number_masked text,expected_account_holder text,
  provider_verified_account_holder text,verification_reference text,verified_at timestamptz,is_available boolean,unavailable_reason text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_platform boolean := public.is_active_platform_admin()
  or coalesce(current_setting('request.jwt.claim.role',true),'')='service_role';
begin
  if not v_platform then
    if p_school_id is null or not public.is_active_school_member(p_school_id) then raise exception 'BILLING_ACCESS_DENIED'; end if;
    if not exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
      where u.auth_user_id=auth.uid() and m.school_id=p_school_id and m.status='ACTIVE' and r.code='SCHOOL_ADMIN') then
      raise exception 'SCHOOL_ADMIN_REQUIRED';
    end if;
  end if;
  return query select r.provider,r.mode,r.onboarding_status,r.merchant_verification_status,r.callback_status,
    r.reconciliation_status,r.settlement_status,r.collection_number_masked,r.expected_account_holder,
    r.provider_verified_account_holder,r.verification_reference,r.verified_at,
    (r.mode='LIVE' and r.onboarding_status='VERIFIED' and r.merchant_verification_status='VERIFIED'
      and r.callback_status='VERIFIED' and r.reconciliation_status='VERIFIED' and r.settlement_status='VERIFIED'),
    case when r.mode<>'LIVE' then 'Provider is configured for sandbox only.'
      when r.onboarding_status<>'VERIFIED' then 'Merchant onboarding is incomplete.'
      when r.merchant_verification_status<>'VERIFIED' then 'Merchant verification is incomplete.'
      when r.callback_status<>'VERIFIED' then 'Signed callback verification is incomplete.'
      when r.reconciliation_status<>'VERIFIED' then 'Status reconciliation is incomplete.'
      when r.settlement_status<>'VERIFIED' then 'Settlement verification is incomplete.' else null end
    from public.platform_mobile_money_readiness r order by r.provider;
end $$;
grant execute on function public.get_mobile_money_provider_readiness(uuid) to authenticated;

create or replace function public.create_mobile_money_payment_attempt(
  p_actor_auth_user_id uuid,p_school_id uuid,p_invoice_id uuid,p_provider text,p_payer_phone text,p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_invoice public.subscription_invoices%rowtype; v_existing public.platform_subscription_payment_attempts%rowtype;
  v_readiness public.platform_mobile_money_readiness%rowtype; v_actor public.users%rowtype; v_platform boolean;
  v_phone text; v_masked text; v_secret uuid; v_attempt uuid; v_provider_request_id uuid; v_reference text; v_balance bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'SERVER_ACTION_REQUIRED'; end if;
  if p_actor_auth_user_id is null or p_school_id is null or p_invoice_id is null or p_idempotency_key !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'PAYMENT_REQUEST_FIELDS_REQUIRED';
  end if;
  if p_provider is null or p_provider not in ('MTN_MOMO_UG','AIRTEL_MONEY_UG') then raise exception 'PAYMENT_PROVIDER_UNSUPPORTED'; end if;
  v_phone:=regexp_replace(coalesce(p_payer_phone,''),'\D','','g');
  if v_phone like '0%' then v_phone:='256'||substr(v_phone,2); end if;
  if v_phone !~ '^2567[0-9]{8}$' then raise exception 'INVALID_UGANDA_MOBILE_NUMBER'; end if;
  select * into v_actor from public.users u where u.auth_user_id=p_actor_auth_user_id and u.is_active;
  if not found then raise exception 'ACTIVE_USER_PROFILE_REQUIRED'; end if;
  select exists(select 1 from public.platform_admins pa where pa.auth_user_id=p_actor_auth_user_id and pa.is_active) into v_platform;
  if not v_platform and not exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.user_id=v_actor.id and m.status='ACTIVE' and r.code='SCHOOL_ADMIN') then
    raise exception 'SCHOOL_ADMIN_REQUIRED_FOR_OWN_SCHOOL';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_invoice_id::text,0));
  select * into v_existing from public.platform_subscription_payment_attempts a where a.idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.invoice_id<>p_invoice_id or v_existing.school_id<>p_school_id or v_existing.provider<>p_provider then raise exception 'IDEMPOTENCY_KEY_REUSED'; end if;
    return jsonb_build_object('paymentAttemptId',v_existing.id,'paymentReference',v_existing.payment_reference,'providerRequestId',v_existing.provider_request_id,'status',v_existing.status,'environment',v_existing.environment,'amountMinor',v_existing.amount_minor,'currency',v_existing.currency,'idempotent',true);
  end if;
  select * into v_invoice from public.subscription_invoices i where i.id=p_invoice_id and i.school_id=p_school_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status::text not in ('ISSUED','OVERDUE','PENDING') then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  v_balance:=coalesce(v_invoice.balance_minor,v_invoice.amount_due);
  if v_balance<=0 or v_invoice.currency<>'UGX' then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  if exists(select 1 from public.platform_subscription_payment_attempts a where a.invoice_id=p_invoice_id and a.environment='LIVE' and a.status in ('DRAFT','PENDING','AWAITING_PAYER_APPROVAL','PROCESSING','RECONCILIATION_REQUIRED')) then raise exception 'PAYMENT_ALREADY_PENDING'; end if;
  select * into v_readiness from public.platform_mobile_money_readiness r where r.provider=p_provider for share;
  if not found or v_readiness.mode<>'LIVE' or v_readiness.onboarding_status<>'VERIFIED' or v_readiness.merchant_verification_status<>'VERIFIED'
    or v_readiness.callback_status<>'VERIFIED' or v_readiness.reconciliation_status<>'VERIFIED' or v_readiness.settlement_status<>'VERIFIED' then
    raise exception 'PAYMENT_PROVIDER_UNAVAILABLE';
  end if;
  v_secret:=vault.create_secret(v_phone,'payer-'||p_idempotency_key,'Encrypted school subscription payer phone.');
  v_masked:='+256******'||right(v_phone,3);
  v_reference:='SOMA-'||case when p_provider='MTN_MOMO_UG' then 'MTN' else 'AIRTEL' end||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
  insert into public.platform_subscription_payment_attempts(school_id,invoice_id,provider,provider_request_id,payer_phone_secret_id,payer_phone_masked,
    amount_minor,payment_reference,status,environment,initiated_at,initiated_by,idempotency_key,external_reference)
  values(p_school_id,p_invoice_id,p_provider,gen_random_uuid(),v_secret,v_masked,v_balance,v_reference,'PENDING','LIVE',now(),p_actor_auth_user_id,p_idempotency_key,v_invoice.payment_reference)
  returning id,provider_request_id into v_attempt,v_provider_request_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value,created_at)
  values(p_actor_auth_user_id,v_actor.full_name,case when v_platform then 'PLATFORM_ADMIN' else 'SCHOOL_ADMIN' end,
    'SUBSCRIPTION_PAYMENT_INITIATED','subscription_payment',v_attempt::text,
    jsonb_build_object('school_id',p_school_id,'invoice_id',p_invoice_id,'provider',p_provider,'environment','LIVE','masked_phone',v_masked),now());
  return jsonb_build_object('paymentAttemptId',v_attempt,'paymentReference',v_reference,'providerRequestId',v_provider_request_id,'status','PENDING','environment','LIVE','amountMinor',v_balance,'currency','UGX','idempotent',false);
end $$;
revoke all on function public.create_mobile_money_payment_attempt(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.create_mobile_money_payment_attempt(uuid,uuid,uuid,text,text,text) to service_role;

create or replace function public.get_mobile_money_attempt_context(p_attempt_id uuid)
returns jsonb language plpgsql security definer set search_path=public,vault,pg_temp as $$
declare v_attempt public.platform_subscription_payment_attempts%rowtype; v_phone text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'SERVER_ACTION_REQUIRED'; end if;
  select * into v_attempt from public.platform_subscription_payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  select decrypted_secret into v_phone from vault.decrypted_secrets where id=v_attempt.payer_phone_secret_id;
  if v_phone is null then raise exception 'PAYER_NUMBER_SECRET_NOT_FOUND'; end if;
  return jsonb_build_object('paymentAttemptId',v_attempt.id,'schoolId',v_attempt.school_id,'invoiceId',v_attempt.invoice_id,
    'provider',v_attempt.provider,'providerRequestId',v_attempt.provider_request_id,'externalReference',v_attempt.external_reference,
    'paymentReference',v_attempt.payment_reference,'payerPhone',v_phone,'amountMinor',v_attempt.amount_minor,
    'currency',v_attempt.currency,'status',v_attempt.status,'environment',v_attempt.environment);
end $$;
revoke all on function public.get_mobile_money_attempt_context(uuid) from public,anon,authenticated;
grant execute on function public.get_mobile_money_attempt_context(uuid) to service_role;

create or replace function public.send_platform_subscription_payment_reminder(
  p_actor_auth_user_id uuid,p_school_id uuid,p_invoice_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invoice public.subscription_invoices%rowtype; v_admin record; v_count integer:=0; v_actor public.platform_admins%rowtype; v_key text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'SERVER_ACTION_REQUIRED'; end if;
  select * into v_actor from public.platform_admins where auth_user_id=p_actor_auth_user_id and is_active;
  if not found then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  select * into v_invoice from public.subscription_invoices where id=p_invoice_id and school_id=p_school_id for update;
  if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status::text not in ('ISSUED','OVERDUE','PENDING') or coalesce(v_invoice.balance_minor,v_invoice.amount_due)<=0 then raise exception 'INVOICE_NOT_PAYABLE'; end if;
  v_key:='subscription-payment-reminder-'||v_invoice.id||'-'||to_char((now() at time zone 'UTC')::date,'YYYYMMDD');
  for v_admin in
    select u.auth_user_id,u.full_name from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.status='ACTIVE' and u.is_active and u.auth_user_id is not null and r.code='SCHOOL_ADMIN'
  loop
    insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
    values(p_school_id,v_admin.auth_user_id,'Payments','SUBSCRIPTION_PAYMENT_REMINDER','Payment reminder',
      'Invoice '||v_invoice.invoice_number||' has an outstanding balance of UGX '||coalesce(v_invoice.balance_minor,v_invoice.amount_due)::text||'. Please contact Platform Billing if you need assistance.',
      'subscription_invoice',v_invoice.id,v_key||'-'||v_admin.auth_user_id)
    on conflict(idempotency_key) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value,created_at)
  values(p_actor_auth_user_id,v_actor.full_name,'PLATFORM_ADMIN','SUBSCRIPTION_PAYMENT_REMINDER_SENT','subscription_invoice',v_invoice.id::text,
    jsonb_build_object('school_id',p_school_id,'invoice_number',v_invoice.invoice_number,'recipients',v_count,'delivery','IN_APP'),now());
  return jsonb_build_object('sent',v_count>0,'recipientCount',v_count,'delivery','IN_APP');
end $$;
revoke all on function public.send_platform_subscription_payment_reminder(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.send_platform_subscription_payment_reminder(uuid,uuid,uuid) to service_role;

create or replace function public.record_mobile_money_request_result(p_attempt_id uuid,p_accepted boolean,p_failure_category text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_attempt public.platform_subscription_payment_attempts%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'SERVER_ACTION_REQUIRED'; end if;
  select * into v_attempt from public.platform_subscription_payment_attempts where id=p_attempt_id for update;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status not in ('PENDING','AWAITING_PAYER_APPROVAL') then return jsonb_build_object('status',v_attempt.status,'idempotent',true); end if;
  update public.platform_subscription_payment_attempts set status=case when p_accepted then 'AWAITING_PAYER_APPROVAL' else 'FAILED' end,
    failure_reason=case when p_accepted then null else left(coalesce(p_failure_category,'PROVIDER_REQUEST_FAILED'),120) end,
    failed_at=case when p_accepted then null else now() end,updated_at=now() where id=p_attempt_id;
  return jsonb_build_object('status',case when p_accepted then 'AWAITING_PAYER_APPROVAL' else 'FAILED' end,'idempotent',false);
end $$;
revoke all on function public.record_mobile_money_request_result(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.record_mobile_money_request_result(uuid,boolean,text) to service_role;

create or replace function public.finalize_mobile_money_payment(
  p_attempt_id uuid,p_final_status text,p_provider_reference text,p_amount_minor bigint,p_currency text,p_provider_event_id text
) returns jsonb
language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare v_attempt public.platform_subscription_payment_attempts%rowtype; v_invoice public.subscription_invoices%rowtype;
  v_period public.subscription_periods%rowtype; v_receipt uuid; v_status text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'SERVER_ACTION_REQUIRED'; end if;
  if p_final_status not in ('SUCCESSFUL','FAILED','REJECTED','EXPIRED','CANCELLED','PENDING','PROCESSING') then raise exception 'UNSUPPORTED_PROVIDER_STATUS'; end if;
  select * into v_attempt from public.platform_subscription_payment_attempts where id=p_attempt_id for update;
  if not found then raise exception 'PAYMENT_ATTEMPT_NOT_FOUND'; end if;
  if v_attempt.status='SUCCESSFUL' then return jsonb_build_object('status','SUCCESSFUL','receiptId',v_attempt.receipt_id,'idempotent',true); end if;
  if v_attempt.status in ('FAILED','REJECTED','EXPIRED','CANCELLED') then return jsonb_build_object('status',v_attempt.status,'idempotent',true); end if;
  if p_final_status='SUCCESSFUL' then
    if p_amount_minor is distinct from v_attempt.amount_minor or p_currency is distinct from 'UGX' or nullif(trim(p_provider_reference),'') is null then
      update public.platform_subscription_payment_attempts set status='RECONCILIATION_REQUIRED',failure_reason='PROVIDER_SETTLEMENT_MISMATCH',updated_at=now() where id=p_attempt_id;
      return jsonb_build_object('status','RECONCILIATION_REQUIRED','idempotent',false);
    end if;
    select * into v_invoice from public.subscription_invoices where id=v_attempt.invoice_id and school_id=v_attempt.school_id for update;
    if not found then raise exception 'INVOICE_NOT_FOUND'; end if;
    if v_invoice.status::text in ('PAID','CANCELLED','WAIVED') then
      update public.platform_subscription_payment_attempts set status='RECONCILIATION_REQUIRED',failure_reason='INVOICE_STATE_CONFLICT',updated_at=now() where id=p_attempt_id;
      return jsonb_build_object('status','RECONCILIATION_REQUIRED','idempotent',false);
    end if;
    select * into v_period from public.subscription_periods where id=v_invoice.subscription_period_id and school_id=v_attempt.school_id for update;
    if not found or not exists(select 1 from public.school_subscriptions where id=v_period.subscription_id and school_id=v_attempt.school_id and status<>'CANCELLED') then
      update public.platform_subscription_payment_attempts set status='RECONCILIATION_REQUIRED',failure_reason='SUBSCRIPTION_PERIOD_NOT_SETTLEABLE',updated_at=now() where id=p_attempt_id;
      return jsonb_build_object('status','RECONCILIATION_REQUIRED','idempotent',false);
    end if;
  end if;
  v_status:=case p_final_status when 'PROCESSING' then 'PROCESSING' else p_final_status end;
  update public.platform_subscription_payment_attempts set status=v_status,provider_status=v_status,
    provider_transaction_id=case when p_final_status='SUCCESSFUL' then p_provider_reference else provider_transaction_id end,
    provider_reference=case when p_final_status='SUCCESSFUL' then p_provider_reference else provider_reference end,
    confirmed_at=case when p_final_status='SUCCESSFUL' then now() else confirmed_at end,
    completed_at=case when p_final_status in ('SUCCESSFUL','FAILED','REJECTED','EXPIRED','CANCELLED') then now() else completed_at end,
    failed_at=case when p_final_status in ('FAILED','REJECTED','EXPIRED','CANCELLED') then now() else failed_at end,
    failure_reason=case when p_final_status in ('FAILED','REJECTED','EXPIRED','CANCELLED') then p_final_status else null end,updated_at=now()
  where id=p_attempt_id;
  if p_final_status='SUCCESSFUL' then
    update public.subscription_invoices set balance_minor=0,status='PAID',paid_at=now(),updated_at=now() where id=v_invoice.id;
    update public.subscription_periods set status='PAID',updated_at=now() where id=v_period.id;
    update public.school_subscriptions set status='ACTIVE',expires_on=greatest(expires_on,v_period.ends_on),updated_at=now()
      where id=v_period.subscription_id and school_id=v_attempt.school_id and status<>'CANCELLED';
    insert into public.platform_subscription_receipts(receipt_number,school_id,invoice_id,payment_attempt_id,amount_minor,financial_snapshot)
    values('SOMA-RCP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,14)),v_attempt.school_id,v_invoice.id,v_attempt.id,
      v_attempt.amount_minor,jsonb_build_object('provider',v_attempt.provider,'provider_reference',p_provider_reference,'payment_reference',v_attempt.payment_reference,'amount_minor',v_attempt.amount_minor,'currency','UGX','environment','LIVE'))
    on conflict(payment_attempt_id) do nothing returning id into v_receipt;
    if v_receipt is null then select id into v_receipt from public.platform_subscription_receipts where payment_attempt_id=v_attempt.id; end if;
    update public.platform_subscription_payment_attempts set receipt_id=v_receipt where id=v_attempt.id;
    insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
    select v_attempt.school_id,u.auth_user_id,'Payments','SUBSCRIPTION_PAYMENT_SUCCESSFUL','Payment confirmed',
      'Invoice '||v_invoice.invoice_number||' is settled and the subscription is active.','subscription_payment',v_attempt.id,'subscription-paid-'||v_attempt.id||'-'||u.auth_user_id
    from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
    where m.school_id=v_attempt.school_id and m.status='ACTIVE' and r.code='SCHOOL_ADMIN' and u.auth_user_id is not null
    on conflict(idempotency_key) do nothing;
    insert into public.platform_payment_provider_events(payment_attempt_id,provider_event_id,event_type,signature_valid,payload_digest,processed_at,processing_result)
    values(v_attempt.id,v_attempt.provider||':'||coalesce(nullif(p_provider_event_id,''),p_provider_reference),'VERIFIED_PAYMENT_STATUS',true,
      encode(digest(v_attempt.id::text||':'||coalesce(p_provider_event_id,p_provider_reference),'sha256'),'hex'),now(),'SUCCESSFUL')
    on conflict(provider_event_id) do nothing;
  end if;
  return jsonb_build_object('status',v_status,'receiptId',v_receipt,'idempotent',false);
end $$;
revoke all on function public.finalize_mobile_money_payment(uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.finalize_mobile_money_payment(uuid,text,text,bigint,text,text) to service_role;

comment on table public.platform_mobile_money_readiness is 'Non-secret live merchant readiness. Enabling a provider requires verified onboarding, signed callback, reconciliation, and settlement; API credentials remain in Edge Function secrets.';
comment on function public.create_mobile_money_payment_attempt(uuid,uuid,uuid,text,text,text) is 'Service-role-only tenant-authorized creation; enforces one active attempt per invoice and encrypts the payer number in Vault.';
