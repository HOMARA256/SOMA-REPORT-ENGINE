-- Teacher acceptance records consent only. A School Admin separately activates
-- the school membership; new accounts receive a password-setup email after that.

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
    update public.school_teacher_invitations set status='EXPIRED',updated_at=now() where id=v_invitation.id;
    raise exception 'TEACHER_INVITATION_EXPIRED_OR_REVOKED';
  end if;

  select * into v_user from public.users where auth_user_id=v_auth.id for update;
  if v_user.id is null then
    if exists(select 1 from public.users where normalized_email=v_invitation.invited_email) then raise exception 'TEACHER_ACCOUNT_COLLISION'; end if;
    insert into public.users(email,full_name,first_name,last_name,department,auth_user_id,username,normalized_email,normalized_username,is_active,account_status,must_change_password)
      values(v_invitation.invited_email,v_invitation.invited_name,left(split_part(v_invitation.invited_name,' ',1),100),
        left(substring(v_invitation.invited_name from '[^ ]+$'),100),v_invitation.department,v_auth.id,
        v_invitation.invited_email,v_invitation.invited_email,v_invitation.invited_email,true,'ACTIVE',false)
      returning * into v_user;
  elsif not v_user.is_active or v_user.account_status<>'ACTIVE' then raise exception 'TEACHER_ACCOUNT_INACTIVE';
  end if;
  if exists(select 1 from public.school_memberships m where m.school_id=v_invitation.school_id and m.user_id=v_user.id and m.status='ACTIVE') then
    raise exception 'TEACHER_ALREADY_MEMBER';
  end if;

  update public.school_teacher_invitations set status='ACCEPTED',accepted_user_id=v_user.id,accepted_at=now(),updated_at=now()
    where id=v_invitation.id;
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
  if v_invitation.status<>'ACCEPTED' or v_invitation.accepted_user_id is null then raise exception 'TEACHER_ACCEPTANCE_REQUIRED'; end if;
  select * into v_actor from public.users where auth_user_id=auth.uid() and is_active and account_status='ACTIVE';
  select * into v_school from public.schools where id=v_invitation.school_id and is_active and lifecycle_status not in ('SUSPENDED','ARCHIVED');
  if v_school.id is null then raise exception 'SCHOOL_NOT_ACTIVE'; end if;
  select * into v_teacher from public.users where id=v_invitation.accepted_user_id and auth_user_id is not null and is_active and account_status='ACTIVE' for update;
  if v_teacher.id is null then raise exception 'ACCEPTED_TEACHER_ACCOUNT_UNAVAILABLE'; end if;
  select id into v_role_id from public.roles where code='TEACHER';
  if v_role_id is null then raise exception 'TEACHER_ROLE_NOT_CONFIGURED'; end if;
  select * into v_membership from public.school_memberships where school_id=v_invitation.school_id and user_id=v_teacher.id for update;
  if v_membership.id is not null and v_membership.role_id<>v_role_id then raise exception 'SCHOOL_MEMBERSHIP_EXISTS_WITH_DIFFERENT_ROLE'; end if;
  if v_membership.id is null then
    insert into public.school_memberships(school_id,user_id,role_id,status) values(v_invitation.school_id,v_teacher.id,v_role_id,'ACTIVE');
  else
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

create or replace function public.get_my_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_invitation public.school_teacher_invitations%rowtype; v_identity auth.users%rowtype; v_school public.schools%rowtype;
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
  return jsonb_build_object('invitationId',v_invitation.id,'status',v_invitation.status,
    'schoolId',v_school.id,'schoolName',v_school.official_name,'schoolLogo',v_school.logo_url,
    'teacherName',v_invitation.invited_name,'teacherEmail',v_invitation.invited_email,
    'department',v_invitation.department,'role','TEACHER','expiresAt',v_invitation.expires_at,
    'needsPasswordSetup',coalesce(v_identity.encrypted_password,'')='',
    'activated',exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id
      where m.school_id=v_invitation.school_id and u.auth_user_id=v_identity.id and m.status='ACTIVE'),
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
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invited_email,'name',i.invited_name,
    'department',i.department,'status',case when i.status in ('PENDING','SENT') and i.expires_at<=now() then 'EXPIRED' else i.status end,
    'activated',exists(select 1 from public.school_memberships m where m.user_id=i.accepted_user_id and m.school_id=i.school_id and m.status='ACTIVE'),
    'expiresAt',i.expires_at,'createdAt',i.created_at,'sentAt',i.sent_at,'acceptedAt',i.accepted_at,
    'resendCount',i.resend_count,'assignmentCount',(select count(*) from public.school_teacher_invitation_allocations a where a.invitation_id=i.id))
    order by i.created_at desc) from public.school_teacher_invitations i where i.school_id=p_school_id),'[]'::jsonb);
end; $$;

revoke all on function public.accept_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.activate_school_teacher_invitation(uuid) from public,anon;
grant execute on function public.accept_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.activate_school_teacher_invitation(uuid) to authenticated;
notify pgrst, 'reload schema';
