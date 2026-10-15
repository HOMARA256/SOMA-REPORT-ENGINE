-- Ensure an already-open teacher account review still notifies platform admins
-- when the school retries the request (for example, after a prior notification
-- was missed). The message-centre idempotency key prevents duplicate alerts.
begin;

alter function public.create_school_teacher_account_access_review(uuid,text)
  rename to create_school_teacher_account_access_review_internal;

revoke all on function public.create_school_teacher_account_access_review_internal(uuid,text)
  from public,anon,authenticated;

create function public.create_school_teacher_account_access_review(
  p_invitation_id uuid,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_conversation_id uuid;
  v_message_id uuid;
  v_subject text;
begin
  v_conversation_id := public.create_school_teacher_account_access_review_internal(
    p_invitation_id,
    p_details
  );

  select subject into v_subject
  from public.school_platform_conversations
  where id=v_conversation_id;

  select id into v_message_id
  from public.school_platform_conversation_messages
  where conversation_id=v_conversation_id and deleted_at is null
  order by sent_at desc
  limit 1;

  perform public.message_centre_notify(
    v_conversation_id,
    v_message_id,
    'CONVERSATION_OPENED',
    'Teacher account access review requested',
    coalesce(v_subject,'Teacher account access review'),
    'PLATFORM'
  );

  return v_conversation_id;
end;
$$;

revoke all on function public.create_school_teacher_account_access_review(uuid,text)
  from public,anon;
grant execute on function public.create_school_teacher_account_access_review(uuid,text)
  to authenticated;

commit;
