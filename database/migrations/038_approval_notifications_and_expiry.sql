-- Approval decision notifications, expiry processing and audit completion.

create or replace function public.notify_approval_request_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_recipient uuid;
begin
  if new.status is not distinct from old.status then return new; end if;
  select auth_user_id into v_recipient from public.users where id=new.requested_by;
  if v_recipient is not null then
    insert into public.system_notifications(
      category,event_type,title,message,idempotency_key,recipient_user_id,
      school_id,entity_type,entity_id
    ) values (
      'Academic','APPROVAL_'||new.status,new.title,
      format('Your approval request is now %s.',replace(new.status,'_',' ')),
      concat('approval-status:',new.id,':',new.status),v_recipient,
      new.school_id,'approval_request',new.id
    ) on conflict(idempotency_key) do nothing;
  end if;
  return new;
end $$;

drop trigger if exists approval_request_status_notification on public.approval_requests;
create trigger approval_request_status_notification
after update of status on public.approval_requests
for each row execute function public.notify_approval_request_status();

create or replace function public.expire_approval_workflow()
returns table(expired_delegations integer,expired_requests integer)
language plpgsql security definer set search_path=public as $$
declare v_delegations integer:=0; v_requests integer:=0;
begin
  with ended as (
    update public.approval_delegations
       set is_active=false
     where is_active=true and revoked_at is null and ends_at<=now()
     returning id,school_id,delegate_from_user_id,delegate_from_role
  ), audited as (
    insert into public.approval_audit_events(
      school_id,approval_request_id,actor_user_id,actor_role,action,note,metadata
    ) select school_id,null,delegate_from_user_id,delegate_from_role,
      'DELEGATION_EXPIRED','Delegated authority reached its configured end time.',
      jsonb_build_object('delegation_id',id) from ended returning 1
  ) select count(*) into v_delegations from audited;

  with ended as (
    update public.approval_requests
       set status='EXPIRED',updated_at=now()
     where status='PENDING_APPROVAL' and due_at<=now()
     returning id,school_id,requested_by,primary_approver_role
  ), audited as (
    insert into public.approval_audit_events(
      school_id,approval_request_id,actor_user_id,actor_role,action,from_status,to_status,note
    ) select school_id,id,requested_by,primary_approver_role,'EXPIRED',
      'PENDING_APPROVAL','EXPIRED','Approval deadline elapsed without a decision.' from ended returning 1
  ) select count(*) into v_requests from audited;
  return query select v_delegations,v_requests;
end $$;

revoke all on function public.notify_approval_request_status(),public.expire_approval_workflow() from public,anon,authenticated;
grant execute on function public.expire_approval_workflow() to service_role;
