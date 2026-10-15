begin;

-- The original notification INSERT listed 14 target columns but passed the
-- idempotency-key parts as separate values. Concatenate them into one value.
create or replace function public.message_centre_notify(
  p_conversation_id uuid,
  p_message_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_recipient_role text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation public.school_platform_conversations%rowtype;
  v_recipient record;
begin
  select * into v_conversation
  from public.school_platform_conversations
  where id = p_conversation_id;

  if v_conversation.id is null then
    return;
  end if;

  for v_recipient in
    select distinct pa.auth_user_id
    from public.platform_admins pa
    where p_recipient_role = 'PLATFORM' and pa.is_active
    union
    select distinct u.auth_user_id
    from public.school_memberships m
    join public.users u on u.id = m.user_id
    join public.roles r on r.id = m.role_id
    where p_recipient_role = 'SCHOOL'
      and m.school_id = v_conversation.school_id
      and m.status = 'ACTIVE'
      and u.is_active
      and u.auth_user_id is not null
      and r.code in ('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','BURSAR_READ_ONLY')
  loop
    insert into public.system_notifications(
      school_id, recipient_user_id, category, event_type, title, message,
      entity_type, entity_id, conversation_id, conversation_message_id,
      related_entity_type, related_entity_id, action_url, idempotency_key
    ) values (
      v_conversation.school_id,
      v_recipient.auth_user_id,
      'Messages',
      p_event_type,
      p_title,
      p_message,
      'school_platform_conversation',
      v_conversation.id,
      p_conversation_id,
      p_message_id,
      v_conversation.related_entity_type,
      v_conversation.related_entity_id,
      concat('/messages?conversation=', p_conversation_id),
      concat('message:', p_event_type, ':', p_conversation_id, ':', coalesce(p_message_id::text, 'state'), ':', v_recipient.auth_user_id)
    ) on conflict (idempotency_key) do nothing;
  end loop;
end;
$$;

commit;
