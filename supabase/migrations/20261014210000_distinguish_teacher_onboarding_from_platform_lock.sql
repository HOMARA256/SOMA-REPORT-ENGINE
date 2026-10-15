-- A verified invitation to a new/legacy INVITED teacher profile is account
-- onboarding, not a platform security lock. Only explicit LOCKED/SUSPENDED
-- account states or a real Supabase Auth ban require Platform Support.
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
    'accountActive',coalesce(v_user.is_active,not v_collision),'membershipStatus',coalesce(v_membership.status,'NONE'),
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

create or replace function public.list_school_teacher_invitations(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',i.id,'email',i.invited_email,'name',i.invited_name,'department',i.department,
    'status',case when i.status in ('PENDING','SENT') and i.expires_at<=now() then 'EXPIRED' else i.status end,
    'activated',coalesce(m.status='ACTIVE',false),'membershipStatus',coalesce(m.status,'NONE'),
    'accountStatus',coalesce(u.account_status,'UNLINKED'),
    'accountActive',coalesce((u.is_active and u.account_status='ACTIVE') or u.account_status='DISABLED',false),
    'globalSecurityRestricted',coalesce(u.account_status in ('LOCKED','SUSPENDED') or u.banned_until>now(),false),
    'expiresAt',i.expires_at,'createdAt',i.created_at,'sentAt',i.sent_at,'acceptedAt',i.accepted_at,
    'declinedAt',i.declined_at,'declineReason',i.decline_reason,'resendCount',i.resend_count,
    'assignmentCount',(select count(*) from public.school_teacher_invitation_allocations a where a.invitation_id=i.id)
  ) order by i.created_at desc) from public.school_teacher_invitations i
    left join lateral (
      select profile.account_status,profile.is_active,auth_identity.banned_until
      from public.users profile left join auth.users auth_identity on auth_identity.id=profile.auth_user_id
      where (i.accepted_user_id is not null and profile.id=i.accepted_user_id)
        or (i.accepted_user_id is null and i.target_auth_user_id is not null and profile.auth_user_id=i.target_auth_user_id)
        or (i.accepted_user_id is null and (i.target_auth_user_id is null or profile.auth_user_id=i.target_auth_user_id)
          and lower(trim(profile.email))=lower(trim(i.invited_email)))
      order by case when profile.id=i.accepted_user_id then 0 when profile.auth_user_id=i.target_auth_user_id then 1 else 2 end
      limit 1
    ) u on true
    left join public.school_memberships m on m.user_id=i.accepted_user_id and m.school_id=i.school_id
    where i.school_id=p_school_id),'[]'::jsonb);
end; $$;

revoke all on function public.get_my_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.list_school_teacher_invitations(uuid) from public,anon;
grant execute on function public.get_my_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.list_school_teacher_invitations(uuid) to authenticated;

-- Define the consent step explicitly rather than patching the stored function
-- text. It may activate the verified SOMA identity, but never the school
-- membership; School Admin activation remains a separate operation.
create or replace function public.accept_school_teacher_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_auth auth.users%rowtype;
  v_invitation public.school_teacher_invitations%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_auth from auth.users where id=auth.uid();
  if v_auth.id is null or v_auth.email_confirmed_at is null then raise exception 'VERIFIED_INVITATION_EMAIL_REQUIRED'; end if;
  if coalesce(v_auth.banned_until > now(),false) then raise exception 'TEACHER_ACCOUNT_GLOBAL_RESTRICTED'; end if;
  if exists(select 1 from public.platform_admins pa where pa.auth_user_id=v_auth.id) then raise exception 'PLATFORM_ACCOUNT_CANNOT_BE_TEACHER'; end if;
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or lower(v_auth.email) is distinct from v_invitation.invited_email
    or (v_invitation.target_auth_user_id is not null and v_invitation.target_auth_user_id<>v_auth.id)
  then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  if v_invitation.status='ACCEPTED' then
    return jsonb_build_object('schoolId',v_invitation.school_id,'status','ACCEPTED','activated',exists(
      select 1 from public.users u join public.school_memberships m on m.user_id=u.id
      where u.auth_user_id=v_auth.id and m.school_id=v_invitation.school_id and m.status='ACTIVE'));
  end if;
  if v_invitation.status not in ('PENDING','SENT') or v_invitation.expires_at<=now() then
    raise exception 'TEACHER_INVITATION_EXPIRED_OR_REVOKED';
  end if;

  select * into v_user from public.users where auth_user_id=v_auth.id for update;
  if v_user.id is null then
    if exists(select 1 from public.users where normalized_email=lower(v_auth.email)) then raise exception 'TEACHER_ACCOUNT_COLLISION'; end if;
    insert into public.users(email,full_name,first_name,last_name,department,auth_user_id,username,normalized_email,normalized_username,is_active,account_status,must_change_password)
      values(v_invitation.invited_email,v_invitation.invited_name,left(split_part(v_invitation.invited_name,' ',1),100),
        left(substring(v_invitation.invited_name from '[^ ]+$'),100),v_invitation.department,v_auth.id,
        v_invitation.invited_email,v_invitation.invited_email,v_invitation.invited_email,true,'ACTIVE',false)
      returning * into v_user;
  elsif v_user.account_status in ('LOCKED','SUSPENDED') then
    raise exception 'TEACHER_ACCOUNT_GLOBAL_RESTRICTED';
  elsif v_user.account_status='INVITED' then
    insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
      values(v_user.full_name,'TEACHER','TEACHER_ACCOUNT_ONBOARDING_CONFIRMED','user',v_user.id::text,
        jsonb_build_object('is_active',v_user.is_active,'account_status',v_user.account_status),
        jsonb_build_object('is_active',true,'account_status','ACTIVE','verified_email',v_auth.email,'invitation_id',v_invitation.id));
    update public.users set is_active=true,account_status='ACTIVE' where id=v_user.id returning * into v_user;
  elsif v_user.account_status='ACTIVE' and not v_user.is_active then
    raise exception 'TEACHER_ACCOUNT_GLOBAL_RESTRICTED';
  elsif v_user.account_status not in ('ACTIVE','DISABLED') then
    raise exception 'TEACHER_ACCOUNT_GLOBAL_RESTRICTED';
  end if;

  if exists(select 1 from public.school_memberships m where m.school_id=v_invitation.school_id and m.user_id=v_user.id and m.status='ACTIVE') then
    raise exception 'TEACHER_ALREADY_MEMBER';
  end if;
  if exists(select 1 from public.school_memberships m where m.school_id=v_invitation.school_id and m.user_id=v_user.id and m.status='INACTIVE') then
    raise exception 'SCHOOL_MEMBERSHIP_SUSPENDED';
  end if;
  update public.school_teacher_invitations set status='ACCEPTED',accepted_user_id=v_user.id,accepted_at=now(),updated_at=now() where id=v_invitation.id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_user.full_name,'TEACHER','SCHOOL_TEACHER_INVITATION_ACCEPTED','school_teacher_invitation',v_invitation.id::text,
      jsonb_build_object('school_id',v_invitation.school_id,'user_id',v_user.id,'membership_activated',false));
  return jsonb_build_object('schoolId',v_invitation.school_id,'userId',v_user.id,'status','ACCEPTED','activated',false);
end;
$$;

revoke all on function public.accept_school_teacher_invitation(uuid) from public,anon;
grant execute on function public.accept_school_teacher_invitation(uuid) to authenticated;

notify pgrst, 'reload schema';
