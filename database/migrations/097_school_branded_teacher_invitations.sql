-- School-scoped Teacher invitations. Membership is activated only after the
-- invited email authenticates and explicitly accepts the invitation.
create table public.school_teacher_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  invited_email text not null,
  invited_name text not null,
  department text,
  invited_by uuid not null references public.users(id) on delete restrict,
  target_auth_user_id uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references public.users(id) on delete set null,
  status text not null default 'PENDING'
    check (status in ('PENDING','SENT','ACCEPTED','EXPIRED','REVOKED','DELIVERY_FAILED')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  resend_count integer not null default 0 check (resend_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_teacher_invitation_email_check check (
    invited_email = lower(trim(invited_email)) and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint school_teacher_invitation_name_check check (length(trim(invited_name)) between 2 and 200),
  unique (id, school_id)
);

create unique index school_teacher_invitation_one_open_per_email
  on public.school_teacher_invitations (school_id, invited_email)
  where status in ('PENDING','SENT');

create table public.school_teacher_invitation_allocations (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null,
  school_id uuid not null references public.schools(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  offering_id uuid not null,
  allocation_role text not null default 'CO_TEACHER'
    check (allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER','SUBJECT_MODERATOR')),
  created_at timestamptz not null default now(),
  constraint school_teacher_invitation_allocation_invite_fk
    foreign key (invitation_id, school_id)
    references public.school_teacher_invitations(id, school_id) on delete cascade,
  constraint school_teacher_invitation_allocation_offering_fk
    foreign key (offering_id, school_id)
    references public.class_subject_offerings(id, school_id) on delete restrict,
  unique (invitation_id, term_id, offering_id)
);

-- A saved school choice is a tenant-context preference only; membership and
-- role checks remain authoritative on every request.
create table public.school_user_context_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  updated_at timestamptz not null default now()
);

alter table public.school_teacher_invitations enable row level security;
alter table public.school_teacher_invitation_allocations enable row level security;
alter table public.school_user_context_preferences enable row level security;
revoke all on public.school_teacher_invitations, public.school_teacher_invitation_allocations, public.school_user_context_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.school_teacher_invitations, public.school_teacher_invitation_allocations to service_role;

create or replace function public.create_school_teacher_invitation(
  p_school_id uuid,
  p_actor_auth_user_id uuid,
  p_name text,
  p_email text,
  p_department text default null,
  p_assignments jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_actor public.users%rowtype;
  v_school public.schools%rowtype;
  v_auth_user_id uuid;
  v_role_id uuid;
  v_invitation_id uuid;
  v_assignment jsonb;
  v_term_id uuid;
  v_offering_id uuid;
  v_allocation_role text;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_name text := trim(coalesce(p_name,''));
begin
  if p_school_id is null or p_actor_auth_user_id is null or length(v_name) not between 2 and 200
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or length(v_email)>255 or length(coalesce(p_department,''))>140
    or jsonb_typeof(coalesce(p_assignments,'[]'::jsonb))<>'array'
    or jsonb_array_length(coalesce(p_assignments,'[]'::jsonb))>200
  then raise exception 'VALID_TEACHER_INVITATION_REQUIRED'; end if;

  select u.* into v_actor from public.users u
  join public.school_memberships m on m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE'
  join public.roles r on r.id=m.role_id and r.code='SCHOOL_ADMIN'
  where u.auth_user_id=p_actor_auth_user_id and u.is_active and u.account_status='ACTIVE'
  for update of u;
  if v_actor.id is null then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_school from public.schools where id=p_school_id and is_active and lifecycle_status not in ('SUSPENDED','ARCHIVED');
  if v_school.id is null then raise exception 'SCHOOL_NOT_ACTIVE'; end if;

  select au.id into v_auth_user_id from auth.users au where lower(au.email)=v_email limit 1;
  if v_auth_user_id is not null and exists(select 1 from public.platform_admins pa where pa.auth_user_id=v_auth_user_id) then
    raise exception 'PLATFORM_ACCOUNT_CANNOT_BE_TEACHER';
  end if;
  if exists(select 1 from public.users u where u.normalized_email=v_email
      and (v_auth_user_id is null or u.auth_user_id is distinct from v_auth_user_id)) then
    raise exception 'TEACHER_ACCOUNT_COLLISION';
  end if;
  select id into v_role_id from public.roles where code='TEACHER';
  if v_role_id is null then raise exception 'TEACHER_ROLE_NOT_CONFIGURED'; end if;
  if v_auth_user_id is not null and exists(select 1 from public.school_memberships m
      where m.school_id=p_school_id and m.user_id=(select u.id from public.users u where u.auth_user_id=v_auth_user_id)
        and m.status='ACTIVE') then raise exception 'TEACHER_ALREADY_MEMBER'; end if;

  update public.school_teacher_invitations set status='EXPIRED',updated_at=now()
    where school_id=p_school_id and invited_email=v_email and status in ('PENDING','SENT') and expires_at<=now();
  insert into public.school_teacher_invitations(school_id,invited_email,invited_name,department,invited_by,target_auth_user_id)
    values(p_school_id,v_email,v_name,nullif(trim(coalesce(p_department,'')),''),v_actor.id,v_auth_user_id)
    returning id into v_invitation_id;

  for v_assignment in select value from jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) loop
    v_term_id := nullif(v_assignment->>'termId','')::uuid;
    v_offering_id := nullif(v_assignment->>'offeringId','')::uuid;
    v_allocation_role := coalesce(nullif(v_assignment->>'role',''),'CO_TEACHER');
    if v_term_id is null or v_offering_id is null or v_allocation_role not in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER','SUBJECT_MODERATOR')
    then raise exception 'INVALID_TEACHER_ASSIGNMENT'; end if;
    if not exists(select 1 from public.class_subject_offerings o join public.school_subject_offerings so on so.id=o.school_subject_offering_id and so.school_id=o.school_id
      join public.terms t on t.id=v_term_id and t.school_id=o.school_id and t.academic_year_id=o.academic_year_id
      where o.id=v_offering_id and o.school_id=p_school_id and o.status='ACTIVE' and so.status='ACTIVE')
    then raise exception 'TEACHER_ASSIGNMENT_OUTSIDE_SCHOOL'; end if;
    if v_allocation_role='PRIMARY_SUBJECT_TEACHER' and exists(select 1 from public.teacher_allocations ta
       where ta.school_id=p_school_id and ta.term_id=v_term_id and ta.class_subject_offering_id=v_offering_id
         and ta.status='ACTIVE' and ta.allocation_role='PRIMARY_SUBJECT_TEACHER') then
      raise exception 'PRIMARY_TEACHER_ALREADY_ASSIGNED';
    end if;
    insert into public.school_teacher_invitation_allocations(invitation_id,school_id,term_id,offering_id,allocation_role)
      values(v_invitation_id,p_school_id,v_term_id,v_offering_id,v_allocation_role);
  end loop;

  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor.full_name,'SCHOOL_ADMIN','SCHOOL_TEACHER_INVITATION_CREATED','school_teacher_invitation',v_invitation_id::text,
    jsonb_build_object('school_id',p_school_id,'email',v_email,'role','TEACHER','assignment_count',jsonb_array_length(coalesce(p_assignments,'[]'::jsonb))));

  return jsonb_build_object('invitationId',v_invitation_id,'schoolId',p_school_id,'schoolName',v_school.official_name,
    'schoolLogo',v_school.logo_url,'inviterName',v_actor.full_name,'existingAuthUser',v_auth_user_id is not null,
    'targetAuthUserId',v_auth_user_id,'expiresAt',now()+interval '7 days');
end; $$;

create or replace function public.finalize_school_teacher_invitation(
  p_invitation_id uuid,p_auth_user_id uuid,p_sent boolean
) returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_invitation public.school_teacher_invitations%rowtype; v_email text;
begin
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or v_invitation.status not in ('PENDING','DELIVERY_FAILED') then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  if p_auth_user_id is not null then
    select lower(email) into v_email from auth.users where id=p_auth_user_id;
    if v_email is distinct from v_invitation.invited_email then raise exception 'INVITATION_AUTH_EMAIL_MISMATCH'; end if;
  end if;
  update public.school_teacher_invitations set target_auth_user_id=coalesce(p_auth_user_id,target_auth_user_id),
    status=case when p_auth_user_id is null then 'DELIVERY_FAILED' when p_sent then 'SENT' else 'PENDING' end,
    sent_at=case when p_sent then now() else sent_at end,
    resend_count=resend_count+case when p_sent then 1 else 0 end,updated_at=now()
    where id=p_invitation_id;
  return p_invitation_id;
end; $$;

create or replace function public.prepare_school_teacher_invitation_resend(p_invitation_id uuid,p_actor_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_invitation public.school_teacher_invitations%rowtype; v_actor public.users%rowtype; v_school public.schools%rowtype;
begin
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  select u.* into v_actor from public.users u join public.school_memberships m on m.user_id=u.id and m.school_id=v_invitation.school_id and m.status='ACTIVE'
    join public.roles r on r.id=m.role_id and r.code='SCHOOL_ADMIN'
    where u.auth_user_id=p_actor_auth_user_id and u.is_active and u.account_status='ACTIVE';
  if v_actor.id is null then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if v_invitation.status in ('ACCEPTED','REVOKED') then raise exception 'TEACHER_INVITATION_NOT_RESENDABLE'; end if;
  select * into v_school from public.schools where id=v_invitation.school_id and is_active;
  if v_school.id is null then raise exception 'SCHOOL_NOT_ACTIVE'; end if;
  update public.school_teacher_invitations set expires_at=now()+interval '7 days',status='PENDING',updated_at=now() where id=p_invitation_id;
  return jsonb_build_object('invitationId',v_invitation.id,'schoolId',v_school.id,'schoolName',v_school.official_name,
    'schoolLogo',v_school.logo_url,'inviterName',v_actor.full_name,'email',v_invitation.invited_email,
    'teacherName',v_invitation.invited_name,'department',v_invitation.department,'targetAuthUserId',v_invitation.target_auth_user_id,
    'expiresAt',now()+interval '7 days');
end; $$;

create or replace function public.get_my_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
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

create or replace function public.get_school_teacher_invitation_setup(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return jsonb_build_object(
    'terms',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'academicYearId',t.academic_year_id,'name',t.name,'status',t.lifecycle_status)
      order by t.starts_on desc),'[]'::jsonb) from public.terms t where t.school_id=p_school_id),
    'offerings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'academicYearId',o.academic_year_id,
      'className',c.class_name,'streamName',st.stream_name,'subjectCode',coalesce(so.school_subject_code,ss.subject_code),
      'subjectName',coalesce(so.display_name_override,ss.subject_name)) order by c.level,c.class_name,so.display_name_override),'[]'::jsonb)
      from public.class_subject_offerings o join public.academic_classes c on c.id=o.class_id and c.school_id=o.school_id
      left join public.class_streams st on st.id=o.stream_id and st.school_id=o.school_id
      join public.school_subject_offerings so on so.id=o.school_subject_offering_id and so.school_id=o.school_id
      left join public.system_subjects ss on ss.id=so.system_subject_id
      where o.school_id=p_school_id and o.status='ACTIVE' and so.status='ACTIVE'),
    'permittedFeatures',(select coalesce(jsonb_agg(jsonb_build_object('code',p.code,'description',p.description) order by p.code),'[]'::jsonb)
      from public.roles r join public.role_permissions rp on rp.role_id=r.id join public.permissions p on p.id=rp.permission_id
      where r.code='TEACHER')
  );
end; $$;

create or replace function public.accept_school_teacher_invitation(p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_auth auth.users%rowtype; v_invitation public.school_teacher_invitations%rowtype;
  v_user public.users%rowtype; v_role_id uuid; v_membership public.school_memberships%rowtype;
  v_actor_name text; v_assignment record; v_user_id uuid;
begin
  select * into v_auth from auth.users where id=auth.uid();
  if v_auth.id is null or v_auth.email_confirmed_at is null then raise exception 'VERIFIED_INVITATION_EMAIL_REQUIRED'; end if;
  if exists(select 1 from public.platform_admins pa where pa.auth_user_id=v_auth.id) then raise exception 'PLATFORM_ACCOUNT_CANNOT_BE_TEACHER'; end if;
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or lower(v_auth.email) is distinct from v_invitation.invited_email
    or (v_invitation.target_auth_user_id is not null and v_invitation.target_auth_user_id<>v_auth.id)
  then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
  if v_invitation.status='ACCEPTED' then return jsonb_build_object('schoolId',v_invitation.school_id,'status','ACCEPTED'); end if;
  if v_invitation.status not in ('PENDING','SENT') or v_invitation.expires_at<=now() then
    update public.school_teacher_invitations set status='EXPIRED',updated_at=now() where id=v_invitation.id;
    raise exception 'TEACHER_INVITATION_EXPIRED_OR_REVOKED';
  end if;
  if v_invitation.target_auth_user_id is not null and v_invitation.target_auth_user_id<>v_auth.id then raise exception 'TEACHER_INVITATION_UNAVAILABLE'; end if;
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
  v_user_id:=v_user.id;
  select id into v_role_id from public.roles where code='TEACHER';
  if v_role_id is null then raise exception 'TEACHER_ROLE_NOT_CONFIGURED'; end if;
  select * into v_membership from public.school_memberships where school_id=v_invitation.school_id and user_id=v_user_id for update;
  if v_membership.id is not null and v_membership.role_id<>v_role_id then raise exception 'SCHOOL_MEMBERSHIP_EXISTS_WITH_DIFFERENT_ROLE'; end if;
  if v_membership.id is null then
    insert into public.school_memberships(school_id,user_id,role_id,status) values(v_invitation.school_id,v_user_id,v_role_id,'ACTIVE');
  else
    update public.school_memberships set status='ACTIVE',updated_at=now() where id=v_membership.id;
  end if;

  for v_assignment in select * from public.school_teacher_invitation_allocations where invitation_id=v_invitation.id loop
    if not exists(select 1 from public.class_subject_offerings o join public.school_subject_offerings so on so.id=o.school_subject_offering_id and so.school_id=o.school_id
      join public.terms t on t.id=v_assignment.term_id and t.school_id=o.school_id and t.academic_year_id=o.academic_year_id
      where o.id=v_assignment.offering_id and o.school_id=v_invitation.school_id and o.status='ACTIVE' and so.status='ACTIVE')
    then raise exception 'INVITED_TEACHER_ASSIGNMENT_NO_LONGER_AVAILABLE'; end if;
    if v_assignment.allocation_role='PRIMARY_SUBJECT_TEACHER' and exists(select 1 from public.teacher_allocations ta where ta.school_id=v_invitation.school_id
      and ta.term_id=v_assignment.term_id and ta.class_subject_offering_id=v_assignment.offering_id and ta.status='ACTIVE' and ta.allocation_role='PRIMARY_SUBJECT_TEACHER')
    then raise exception 'PRIMARY_TEACHER_ALREADY_ASSIGNED'; end if;
    if not exists(select 1 from public.teacher_allocations ta where ta.school_id=v_invitation.school_id and ta.term_id=v_assignment.term_id
      and ta.teacher_id=v_user_id and ta.class_subject_offering_id=v_assignment.offering_id and ta.status='ACTIVE') then
      insert into public.teacher_allocations(school_id,academic_year_id,term_id,teacher_id,class_subject_offering_id,stream_id,status,allocation_role,effective_from,created_by)
      select o.school_id,o.academic_year_id,v_assignment.term_id,v_user_id,o.id,o.stream_id,'ACTIVE',v_assignment.allocation_role,current_date,v_invitation.invited_by
      from public.class_subject_offerings o where o.id=v_assignment.offering_id and o.school_id=v_invitation.school_id;
    end if;
  end loop;
  select full_name into v_actor_name from public.users where id=v_user_id;
  update public.school_teacher_invitations set status='ACCEPTED',accepted_user_id=v_user_id,accepted_at=now(),updated_at=now() where id=v_invitation.id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor_name,'TEACHER','SCHOOL_TEACHER_INVITATION_ACCEPTED','school_teacher_invitation',v_invitation.id::text,
      jsonb_build_object('school_id',v_invitation.school_id,'user_id',v_user_id,'allocation_count',(select count(*) from public.school_teacher_invitation_allocations where invitation_id=v_invitation.id)));
  return jsonb_build_object('schoolId',v_invitation.school_id,'userId',v_user_id,'status','ACCEPTED');
end; $$;

create or replace function public.list_school_teacher_invitations(p_school_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.invited_email,'name',i.invited_name,
    'department',i.department,'status',case when i.status in ('PENDING','SENT') and i.expires_at<=now() then 'EXPIRED' else i.status end,
    'expiresAt',i.expires_at,'createdAt',i.created_at,'sentAt',i.sent_at,'acceptedAt',i.accepted_at,
    'resendCount',i.resend_count,'assignmentCount',(select count(*) from public.school_teacher_invitation_allocations a where a.invitation_id=i.id))
    order by i.created_at desc) from public.school_teacher_invitations i where i.school_id=p_school_id),'[]'::jsonb);
end; $$;

create or replace function public.cancel_school_teacher_invitation(p_invitation_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_invitation public.school_teacher_invitations%rowtype; v_actor_name text;
begin
  select * into v_invitation from public.school_teacher_invitations where id=p_invitation_id for update;
  if v_invitation.id is null or not public.is_school_admin_for(v_invitation.school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if v_invitation.status not in ('PENDING','SENT','DELIVERY_FAILED','EXPIRED') then raise exception 'TEACHER_INVITATION_NOT_CANCELLABLE'; end if;
  if length(trim(coalesce(p_reason,'')))<3 then raise exception 'REASON_REQUIRED'; end if;
  select u.full_name into v_actor_name from public.users u where u.auth_user_id=auth.uid();
  update public.school_teacher_invitations set status='REVOKED',revoked_at=now(),updated_at=now() where id=p_invitation_id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(v_actor_name,'SCHOOL_ADMIN','SCHOOL_TEACHER_INVITATION_REVOKED','school_teacher_invitation',p_invitation_id::text,
      jsonb_build_object('status',v_invitation.status),jsonb_build_object('status','REVOKED','reason',trim(p_reason)));
  return p_invitation_id;
end; $$;

create or replace function public.set_my_school_context(p_school_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_user_id uuid;
begin
  if auth.uid() is null or p_school_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into v_user_id from public.users where auth_user_id=auth.uid() and is_active and account_status='ACTIVE';
  if v_user_id is null or not exists(select 1 from public.school_memberships m join public.schools s on s.id=m.school_id
    where m.user_id=v_user_id and m.school_id=p_school_id and m.status='ACTIVE' and s.is_active and s.lifecycle_status not in ('SUSPENDED','ARCHIVED'))
  then raise exception 'ACTIVE_SCHOOL_MEMBERSHIP_REQUIRED'; end if;
  insert into public.school_user_context_preferences(auth_user_id,school_id,updated_at) values(auth.uid(),p_school_id,now())
    on conflict(auth_user_id) do update set school_id=excluded.school_id,updated_at=excluded.updated_at;
  return p_school_id;
end; $$;

create or replace function public.get_my_school_context_preference()
returns uuid language sql stable security definer set search_path=public,auth,pg_temp as $$
  select pref.school_id from public.school_user_context_preferences pref
  join public.users u on u.auth_user_id=pref.auth_user_id and u.is_active and u.account_status='ACTIVE'
  join public.school_memberships m on m.user_id=u.id and m.school_id=pref.school_id and m.status='ACTIVE'
  join public.schools s on s.id=m.school_id and s.is_active and s.lifecycle_status not in ('SUSPENDED','ARCHIVED')
  where pref.auth_user_id=auth.uid()
$$;

revoke all on function public.create_school_teacher_invitation(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.finalize_school_teacher_invitation(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.prepare_school_teacher_invitation_resend(uuid,uuid) from public,anon,authenticated;
revoke all on function public.get_my_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.get_school_teacher_invitation_setup(uuid) from public,anon;
revoke all on function public.accept_school_teacher_invitation(uuid) from public,anon;
revoke all on function public.list_school_teacher_invitations(uuid) from public,anon;
revoke all on function public.cancel_school_teacher_invitation(uuid,text) from public,anon;
grant execute on function public.create_school_teacher_invitation(uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.finalize_school_teacher_invitation(uuid,uuid,boolean) to service_role;
grant execute on function public.prepare_school_teacher_invitation_resend(uuid,uuid) to service_role;
grant execute on function public.get_my_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.get_school_teacher_invitation_setup(uuid) to authenticated;
grant execute on function public.accept_school_teacher_invitation(uuid) to authenticated;
grant execute on function public.list_school_teacher_invitations(uuid) to authenticated;
grant execute on function public.get_school_teacher_invitation_setup(uuid) to authenticated;
grant execute on function public.cancel_school_teacher_invitation(uuid,text) to authenticated;
revoke all on function public.set_my_school_context(uuid) from public,anon;
revoke all on function public.get_my_school_context_preference() from public,anon;
grant execute on function public.set_my_school_context(uuid) to authenticated;
grant execute on function public.get_my_school_context_preference() to authenticated;

notify pgrst, 'reload schema';
