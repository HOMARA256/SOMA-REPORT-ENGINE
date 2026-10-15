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
    insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
    select v_attempt.school_id,u.id,'Payments','MTN_SANDBOX_PAYMENT_SUCCESSFUL','Sandbox MTN payment confirmed','A sandbox subscription payment was confirmed. No real money moved.','subscription_payment',v_attempt.id,'mtn-sbx-success-'||v_attempt.id
    from public.users u where u.auth_user_id=v_attempt.initiated_by
    on conflict(idempotency_key) do nothing;
  end if;
  update public.platform_payment_provider_events set processed_at=now(),processing_result=v_status where id=v_event;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value,created_at)
  values(auth.uid(),v_platform.full_name,'PLATFORM_ADMIN','MTN_SANDBOX_CALLBACK_PROCESSED','subscription_payment',v_attempt.id::text,jsonb_build_object('outcome',v_status,'event_id',p_provider_event_id,'environment','SANDBOX'),now());
  return jsonb_build_object('idempotent',false,'status',v_status,'receiptId',v_receipt);
end $$;
grant execute on function public.process_sandbox_mtn_callback(text,text,text,boolean) to authenticated;

;
