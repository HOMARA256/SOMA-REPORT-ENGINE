begin;

-- Counts unread conversation messages for the signed-in identity only.
create or replace function public.get_unread_message_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.system_notifications n
  where n.recipient_user_id = auth.uid()
    and n.conversation_id is not null
    and n.read_at is null
    and n.event_type in ('CONVERSATION_OPENED', 'CONVERSATION_REPLY');
$$;

-- Opening a thread marks its notices read for this user only.
create or replace function public.mark_school_platform_conversation_notifications_read(
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if p_conversation_id is null
    or not public.can_access_school_platform_conversation(p_conversation_id) then
    raise exception 'CONVERSATION_NOT_AVAILABLE';
  end if;

  update public.system_notifications
  set read_at = coalesce(read_at, now())
  where recipient_user_id = auth.uid()
    and conversation_id = p_conversation_id
    and read_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_unread_message_count() from public, anon;
revoke all on function public.mark_school_platform_conversation_notifications_read(uuid) from public, anon;
grant execute on function public.get_unread_message_count() to authenticated;
grant execute on function public.mark_school_platform_conversation_notifications_read(uuid) to authenticated;

commit;
