-- Keep the teacher-facing invitation response aligned with the school admin
-- list: an accepted invitation is activated when this school's membership is
-- active. The account and other school memberships are not changed here.
create or replace function public.get_my_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_invitation public.school_teacher_invitations%rowtype;
  v_identity auth.users%rowtype;
  v_school public.schools%rowtype;
  v_user public.users%rowtype;
  v_membership public.school_memberships%rowtype;
  v_collision boolean := false;
  v_global_lock boolean := false;
  v_blocked_reason text;
begin
  select * into v_identity from auth.users where id=auth.uid();
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id;
  if v_identity.id is null or v_invitation.id is null or lower(v_identity.email) is distinct from v_invitation.invited_email
    or (v_invitation.target_auth_user_id is not null and v_invitation.target_auth_user_id<>v_identity.id)
  then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  select * into v_school from public.schools where id=v_invitation.school_id;
  if v_school.id is null then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  if v_invitation.expires_at<=now() and v_invitation.status in ('PENDING','SENT') then
    update public.school_teacher_invitations set status='EXPIRED',updated_at=now() where id=v_invitation.id;
    v_invitation.status:='EXPIRED';
  end if;
  select * into v_user from public.users where auth_user_id=v_identity.id;
  if v_user.id is null then
    select exists(select 1 from public.users u where u.normalized_email=lower(v_identity.email)) into v_collision;
  else
    select * into v_membership from public.school_memberships where school_id=v_school.id and user_id=v_user.id;
  end if;
  v_global_lock := coalesce(v_user.account_status in ('LOCKED','SUSPENDED'),false)
    or coalesce(v_identity.banned_until>now(),false);
  if v_invitation.status in ('PENDING','SENT') and v_invitation.expires_at>now() then
    if v_global_lock then v_blocked_reason:='GLOBAL_ACCOUNT_RESTRICTED';
    elsif v_identity.email_confirmed_at is null then v_blocked_reason:='EMAIL_NOT_VERIFIED';
    elsif v_collision then v_blocked_reason:='ACCOUNT_COLLISION';
    elsif v_membership.status='ACTIVE' then v_blocked_reason:='MEMBERSHIP_ALREADY_ACTIVE';
    elsif v_membership.status='INACTIVE' then v_blocked_reason:='SCHOOL_MEMBERSHIP_SUSPENDED';
    end if;
  elsif v_invitation.status='ACCEPTED' and v_membership.status='INACTIVE' then
    v_blocked_reason:='SCHOOL_MEMBERSHIP_SUSPENDED';
  elsif v_invitation.status='ACCEPTED' and v_membership.status='ACTIVE' then
    v_blocked_reason:='MEMBERSHIP_ALREADY_ACTIVE';
  elsif v_invitation.status='DECLINED' then v_blocked_reason:='INVITATION_DECLINED';
  elsif v_invitation.status not in ('PENDING','SENT') then v_blocked_reason:='INVITATION_NOT_ACTIONABLE';
  end if;
  return jsonb_build_object(
    'invitationId',v_invitation.id,'status',v_invitation.status,'schoolId',v_school.id,
    'schoolName',v_school.official_name,'schoolLogo',v_school.logo_url,'schoolEmail',v_school.email,'schoolTelephone',v_school.telephone,
    'teacherName',v_invitation.invited_name,'teacherEmail',v_invitation.invited_email,'department',v_invitation.department,
    'role','TEACHER','expiresAt',v_invitation.expires_at,'needsPasswordSetup',coalesce(v_identity.encrypted_password,'')='',
    'accountStatus',coalesce(v_user.account_status,case when v_collision then 'COLLISION' else 'UNLINKED' end),
    'accountActive',coalesce(v_user.is_active,not v_collision),'activated',coalesce(v_membership.status='ACTIVE',false),
    'membershipStatus',coalesce(v_membership.status,'NONE'),
    'acceptanceAllowed',v_blocked_reason is null and v_invitation.status in ('PENDING','SENT'),
    'blockedReason',v_blocked_reason,'globalSecurityRestricted',v_global_lock,
    'assignments',(select coalesce(jsonb_agg(jsonb_build_object('termId',a.term_id,'termName',t.name,
      'offeringId',a.offering_id,'className',c.class_name,'streamName',st.stream_name,
      'subjectName',coalesce(so.display_name_override,ss.subject_name),'role',a.allocation_role)
      order by c.level,c.class_name,so.display_name_override),'[]'::jsonb)
      from public.school_teacher_invitation_allocations a join public.terms t on t.id=a.term_id
      join public.class_subject_offerings o on o.id=a.offering_id and o.school_id=a.school_id
      join public.academic_classes c on c.id=o.class_id and c.school_id=o.school_id
      left join public.class_streams st on st.id=o.stream_id and st.school_id=o.school_id
      join public.school_subject_offerings so on so.id=o.school_subject_offering_id and so.school_id=o.school_id
      left join public.system_subjects ss on ss.id=so.system_subject_id where a.invitation_id=v_invitation.id));
end; $$;

revoke all on function public.get_my_school_teacher_invitation(uuid) from public,anon;
grant execute on function public.get_my_school_teacher_invitation(uuid) to authenticated;
