-- Let the invited teacher see whether a school-linked Platform account review
-- exists, without exposing message content or unrelated school conversations.
create or replace function public.get_my_teacher_account_review_status(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_identity auth.users%rowtype;
  v_invitation public.school_teacher_invitations%rowtype;
  v_conversation public.school_platform_conversations%rowtype;
begin
  select * into v_identity from auth.users where id=auth.uid();
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id;
  if v_identity.id is null or v_invitation.id is null
    or lower(v_identity.email) is distinct from v_invitation.invited_email
    or (v_invitation.target_auth_user_id is not null and v_invitation.target_auth_user_id<>v_identity.id)
  then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;

  select * into v_conversation
  from public.school_platform_conversations
  where school_id=v_invitation.school_id
    and category='TEACHER_ACCOUNT_ACCESS'
    and related_entity_type='school_teacher_invitation'
    and related_entity_id=v_invitation.id
  order by created_at desc
  limit 1;

  if v_conversation.id is null then
    return jsonb_build_object('requestStatus','NONE');
  end if;
  return jsonb_build_object(
    'requestStatus',v_conversation.status,
    'submittedAt',v_conversation.created_at,
    'updatedAt',v_conversation.updated_at
  );
end;
$$;

revoke all on function public.get_my_teacher_account_review_status(uuid) from public,anon;
grant execute on function public.get_my_teacher_account_review_status(uuid) to authenticated;

notify pgrst, 'reload schema';
