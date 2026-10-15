-- Route blocked teacher invitations through the existing School–Platform
-- Message Centre. This review never accepts an invitation or activates a
-- school membership; only a Platform Administrator can clear a global lock.
begin;

alter table public.school_platform_conversations
  drop constraint if exists school_platform_conversations_category_check;
alter table public.school_platform_conversations
  add constraint school_platform_conversations_category_check check (category in (
    'GENERAL_SUPPORT','SCHOOL_REGISTRATION','SCHOOL_PROFILE_AND_SETUP','SUBSCRIPTION_AND_BILLING',
    'PAYMENT_INITIATION','PAYMENT_FAILURE','PAYMENT_REFUND','SUBJECT_ACTIVATION','ACADEMIC_SETUP',
    'CLASS_AND_LEARNER_SETUP','STAFF_AND_ROLE_SETUP','IMPORT_OR_EXPORT','ASSESSMENT_AND_MARKS',
    'APPROVAL_OR_REPORT','TECHNICAL_ISSUE','FEATURE_REQUEST','PLATFORM_ANNOUNCEMENT',
    'TEACHER_ACCOUNT_ACCESS'
  ));

create or replace function public.create_school_teacher_account_access_review(
  p_invitation_id uuid,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_invitation public.school_teacher_invitations%rowtype;
  v_school_name text;
  v_id uuid;
  v_existing_conversation_id uuid;
  v_message_id uuid;
  v_body text;
begin
  select * into v_invitation
  from public.school_teacher_invitations
  where id=p_invitation_id
  for update;
  if v_invitation.id is null then raise exception 'TEACHER_INVITATION_NOT_FOUND'; end if;
  if not public.is_school_message_member(v_invitation.school_id) then raise exception 'SCHOOL_MESSAGE_ACCESS_REQUIRED'; end if;
  if v_invitation.status in ('REVOKED','DECLINED') then raise exception 'TEACHER_INVITATION_NOT_REVIEWABLE'; end if;
  if p_details is not null and length(trim(p_details)) > 3000 then raise exception 'REVIEW_DETAILS_TOO_LONG'; end if;

  select id into v_existing_conversation_id
  from public.school_platform_conversations
  where category='TEACHER_ACCOUNT_ACCESS'
    and related_entity_type='school_teacher_invitation'
    and related_entity_id=v_invitation.id
    and status not in ('RESOLVED','CLOSED')
  order by created_at desc
  limit 1;
  if v_existing_conversation_id is not null then return v_existing_conversation_id; end if;

  select official_name into v_school_name from public.schools where id=v_invitation.school_id;
  v_body := format(
    E'Teacher account access review requested by the school.\n\nSchool: %s\nTeacher: %s\nInvited email: %s\nInvitation reference: %s\nInvitation status: %s\n\nPlease review the global account restriction. Clearing it must not accept this invitation or activate the school membership.%s',
    coalesce(v_school_name,'School'), v_invitation.invited_name, v_invitation.invited_email,
    v_invitation.id, v_invitation.status,
    case when nullif(trim(coalesce(p_details,'')),'') is null then '' else E'\n\nSchool notes: '||trim(p_details) end
  );

  insert into public.school_platform_conversations(
    school_id,category,subject,status,priority,related_entity_type,related_entity_id,action_url,opened_by_auth_user_id
  ) values (
    v_invitation.school_id,'TEACHER_ACCOUNT_ACCESS',left('Teacher account access review · '||v_invitation.invited_name,180),
    'AWAITING_PLATFORM','HIGH','school_teacher_invitation',v_invitation.id,'/staff',auth.uid()
  ) returning id into v_id;
  insert into public.school_platform_conversation_participants(conversation_id,auth_user_id,participant_role,last_read_at)
  values(v_id,auth.uid(),'SCHOOL',now());
  insert into public.school_platform_conversation_messages(conversation_id,sender_auth_user_id,body)
  values(v_id,auth.uid(),v_body) returning id into v_message_id;
  perform public.message_centre_notify(v_id,v_message_id,'CONVERSATION_OPENED','Teacher account access review requested',v_invitation.invited_email,'PLATFORM');
  return v_id;
end;
$$;

revoke all on function public.create_school_teacher_account_access_review(uuid,text) from public,anon;
grant execute on function public.create_school_teacher_account_access_review(uuid,text) to authenticated;

commit;
