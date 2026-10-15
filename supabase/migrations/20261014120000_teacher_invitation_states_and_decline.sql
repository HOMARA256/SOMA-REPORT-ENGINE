-- Keep account security global while exposing authoritative, school-scoped
-- invitation and membership states to the invited teacher and School Admin.
alter table public.school_teacher_invitations
  add column if not exists declined_at timestamptz,
  add column if not exists declined_by uuid references public.users(id) on delete restrict,
  add column if not exists decline_reason text;

alter table public.school_teacher_invitations drop constraint if exists school_teacher_invitations_status_check;
alter table public.school_teacher_invitations add constraint school_teacher_invitations_status_check
  check (status in ('PENDING','SENT','ACCEPTED','EXPIRED','REVOKED','DELIVERY_FAILED','DECLINED'));

create or replace function public.get_my_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_invitation public.school_teacher_invitations%rowtype;
  v_identity auth.users%rowtype;
  v_school public.schools%rowtype;
  v_user public.users%rowtype;
  v_membership public.school_memberships%rowtype;
  v_collision boolean := false;
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
    if not v_user.is_active or v_user.account_status<>'ACTIVE' then v_blocked_reason:='GLOBAL_ACCOUNT_RESTRICTED'; end if;
  end if;
  if v_invitation.status in ('PENDING','SENT') and v_invitation.expires_at>now() then
    if v_blocked_reason is not null then null;
    elsif v_identity.email_confirmed_at is null then v_blocked_reason:='EMAIL_NOT_VERIFIED';
    elsif v_collision then v_blocked_reason:='ACCOUNT_COLLISION';
    elsif v_user.id is not null and (not v_user.is_active or v_user.account_status<>'ACTIVE') then v_blocked_reason:='GLOBAL_ACCOUNT_RESTRICTED';
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
    'blockedReason',v_blocked_reason,
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

create or replace function public.accept_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_auth auth.users%rowtype;
  v_invitation public.school_teacher_invitations%rowtype;
  v_user public.users%rowtype;
begin
  select * into v_auth from auth.users where id=auth.uid();
  if v_auth.id is null or v_auth.email_confirmed_at is null then raise exception 'VERIFIED_INVITATION_EMAIL_REQUIRED'; end if;
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
  elsif not v_user.is_active or v_user.account_status<>'ACTIVE' then
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
end; $$;

create or replace function public.activate_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_invitation public.school_teacher_invitations%rowtype;
  v_actor public.users%rowtype;
  v_teacher public.users%rowtype;
  v_school public.schools%rowtype;
  v_role_id uuid;
  v_membership public.school_memberships%rowtype;
  v_assignment record;
begin
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or not public.is_school_admin_for(v_invitation.school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if v_invitation.status='DECLINED' then return v_invitation.id; end if;
  if v_invitation.status<>'ACCEPTED' or v_invitation.accepted_user_id is null then raise exception 'TEACHER_ACCEPTANCE_REQUIRED'; end if;
  select * into v_actor from public.users where auth_user_id=auth.uid() and is_active and account_status='ACTIVE';
  select * into v_school from public.schools where id=v_invitation.school_id and is_active and lifecycle_status not in ('SUSPENDED','ARCHIVED');
  if v_school.id is null then raise exception 'SCHOOL_NOT_ACTIVE'; end if;
  select * into v_teacher from public.users where id=v_invitation.accepted_user_id and auth_user_id is not null for update;
  if v_teacher.id is null then raise exception 'ACCEPTED_TEACHER_ACCOUNT_UNAVAILABLE'; end if;
  if not v_teacher.is_active or v_teacher.account_status<>'ACTIVE' then raise exception 'TEACHER_ACCOUNT_GLOBAL_RESTRICTED'; end if;
  select id into v_role_id from public.roles where code='TEACHER';
  if v_role_id is null then raise exception 'TEACHER_ROLE_NOT_CONFIGURED'; end if;
  select * into v_membership from public.school_memberships where school_id=v_invitation.school_id and user_id=v_teacher.id for update;
  if v_membership.id is not null and v_membership.role_id<>v_role_id then raise exception 'SCHOOL_MEMBERSHIP_EXISTS_WITH_DIFFERENT_ROLE'; end if;
  if v_membership.id is not null and v_membership.status='INACTIVE' then raise exception 'SCHOOL_MEMBERSHIP_SUSPENDED'; end if;
  if v_membership.id is null then
    insert into public.school_memberships(school_id,user_id,role_id,status) values(v_invitation.school_id,v_teacher.id,v_role_id,'ACTIVE');
  elsif v_membership.status<>'ACTIVE' then
    update public.school_memberships set status='ACTIVE',updated_at=now() where id=v_membership.id;
  end if;
  for v_assignment in select * from public.school_teacher_invitation_allocations where invitation_id=v_invitation.id loop
    if not exists(select 1 from public.class_subject_offerings o join public.school_subject_offerings so on so.id=o.school_subject_offering_id and so.school_id=o.school_id
      join public.terms t on t.id=v_assignment.term_id and t.school_id=o.school_id and t.academic_year_id=o.academic_year_id
      where o.id=v_assignment.offering_id and o.school_id=v_invitation.school_id and o.status='ACTIVE' and so.status='ACTIVE')
    then raise exception 'INVITED_TEACHER_ASSIGNMENT_NO_LONGER_AVAILABLE'; end if;
    if v_assignment.allocation_role='PRIMARY_SUBJECT_TEACHER' and exists(select 1 from public.teacher_allocations ta where ta.school_id=v_invitation.school_id
      and ta.term_id=v_assignment.term_id and ta.class_subject_offering_id=v_assignment.offering_id and ta.status='ACTIVE' and ta.allocation_role='PRIMARY_SUBJECT_TEACHER' and ta.teacher_id<>v_teacher.id)
    then raise exception 'PRIMARY_TEACHER_ALREADY_ASSIGNED'; end if;
    if not exists(select 1 from public.teacher_allocations ta where ta.school_id=v_invitation.school_id and ta.term_id=v_assignment.term_id
      and ta.teacher_id=v_teacher.id and ta.class_subject_offering_id=v_assignment.offering_id and ta.status='ACTIVE') then
      insert into public.teacher_allocations(school_id,academic_year_id,term_id,teacher_id,class_subject_offering_id,stream_id,status,allocation_role,effective_from,created_by)
      select o.school_id,o.academic_year_id,v_assignment.term_id,v_teacher.id,o.id,o.stream_id,'ACTIVE',v_assignment.allocation_role,current_date,v_invitation.invited_by
      from public.class_subject_offerings o where o.id=v_assignment.offering_id and o.school_id=v_invitation.school_id;
    end if;
  end loop;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(v_actor.full_name,'SCHOOL_ADMIN','SCHOOL_TEACHER_INVITATION_ACTIVATED','school_teacher_invitation',v_invitation.id::text,
      jsonb_build_object('status','ACCEPTED','membership_active',coalesce(v_membership.status='ACTIVE',false)),
      jsonb_build_object('status','ACCEPTED','membership_active',true,'school_id',v_invitation.school_id,'teacher_user_id',v_teacher.id));
  return jsonb_build_object('schoolId',v_invitation.school_id,'invitationId',v_invitation.id,'teacherUserId',v_teacher.id,
    'teacherAuthUserId',v_teacher.auth_user_id,'teacherName',v_teacher.full_name,'teacherEmail',v_teacher.email,
    'schoolName',v_school.official_name,'schoolLogo',v_school.logo_url,'activated',true,
    'passwordSetupRequired',coalesce((select nullif(au.encrypted_password,'') is null from auth.users au where au.id=v_teacher.auth_user_id),true));
end; $$;

create or replace function public.decline_school_teacher_invitation(p_invitation_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_invitation public.school_teacher_invitations%rowtype;
  v_actor uuid;
  v_actor_name text;
begin
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'TEACHER_INVITATION_DECLINE_REASON_REQUIRED'; end if;
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or not public.is_school_admin_for(v_invitation.school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if v_invitation.status<>'ACCEPTED' or v_invitation.accepted_user_id is null then raise exception 'TEACHER_ACCEPTANCE_REQUIRED'; end if;
  if exists(select 1 from public.school_memberships m where m.school_id=v_invitation.school_id and m.user_id=v_invitation.accepted_user_id and m.status='ACTIVE') then
    raise exception 'ACTIVE_TEACHER_MEMBERSHIP_CANNOT_BE_DECLINED';
  end if;
  v_actor:=public.current_app_user_id();
  select full_name into v_actor_name from public.users where id=v_actor;
  update public.school_teacher_invitations set status='DECLINED',declined_at=now(),declined_by=v_actor,decline_reason=trim(p_reason),updated_at=now()
    where id=v_invitation.id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(v_actor_name,'SCHOOL_ADMIN','SCHOOL_TEACHER_INVITATION_DECLINED','school_teacher_invitation',v_invitation.id::text,
      jsonb_build_object('status','ACCEPTED'),jsonb_build_object('status','DECLINED','school_id',v_invitation.school_id,'teacher_user_id',v_invitation.accepted_user_id,'reason',trim(p_reason)));
  return v_invitation.id;
end; $$;

create or replace function public.list_school_teacher_invitations(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invited_email,'name',i.invited_name,
    'department',i.department,'status',case when i.status in ('PENDING','SENT') and i.expires_at<=now() then 'EXPIRED' else i.status end,
    'activated',coalesce(m.status='ACTIVE',false),'membershipStatus',coalesce(m.status,'NONE'),
    'accountStatus',u.account_status,'accountActive',u.is_active,
    'expiresAt',i.expires_at,'createdAt',i.created_at,'sentAt',i.sent_at,'acceptedAt',i.accepted_at,
    'declinedAt',i.declined_at,'declineReason',i.decline_reason,
    'resendCount',i.resend_count,'assignmentCount',(select count(*) from public.school_teacher_invitation_allocations a where a.invitation_id=i.id))
    order by i.created_at desc) from public.school_teacher_invitations i
    left join public.users u on u.id=i.accepted_user_id
    left join public.school_memberships m on m.user_id=i.accepted_user_id and m.school_id=i.school_id
    where i.school_id=p_school_id),'[]'::jsonb);
end; $$;

revoke all on function public.get_my_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.accept_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.activate_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.decline_school_teacher_invitation(uuid,text) from public,anon;
revoke all on function public.list_school_teacher_invitations(uuid) from public,anon;
grant execute on function public.get_my_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.accept_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.activate_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.decline_school_teacher_invitation(uuid,text) to authenticated;
grant execute on function public.list_school_teacher_invitations(uuid) to authenticated;
notify pgrst, 'reload schema';
