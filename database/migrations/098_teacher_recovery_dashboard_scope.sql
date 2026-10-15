-- Server-authorized school-admin recovery requests and teacher-only status scope.
create table public.teacher_password_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  teacher_auth_user_id uuid not null references auth.users(id) on delete restrict,
  requested_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  delivery_status text not null default 'PENDING'
    check (delivery_status in ('PENDING','SENT','DELIVERY_FAILED','RATE_LIMITED')),
  failure_category text check (failure_category is null or failure_category in ('NOT_CONFIGURED','LINK_GENERATION_FAILED','EMAIL_PROVIDER_FAILED')),
  delivered_at timestamptz,
  completed_at timestamptz,
  constraint teacher_recovery_delivery_state check (
    (delivery_status = 'SENT' and delivered_at is not null)
    or (delivery_status <> 'SENT' and delivered_at is null)
  )
);
create index teacher_recovery_rate_limit_idx
  on public.teacher_password_recovery_requests(teacher_auth_user_id, requested_at desc)
  where delivery_status <> 'RATE_LIMITED';
alter table public.teacher_password_recovery_requests enable row level security;
revoke all on public.teacher_password_recovery_requests from public, anon, authenticated;

create or replace function public.prepare_school_teacher_password_recovery(
  p_school_id uuid, p_teacher_user_id uuid, p_actor_auth_user_id uuid
) returns jsonb
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_actor public.users%rowtype;
  v_teacher public.users%rowtype;
  v_auth auth.users%rowtype;
  v_school public.schools%rowtype;
  v_request_id uuid;
  v_recent integer;
  v_hourly integer;
begin
  if p_school_id is null or p_teacher_user_id is null or p_actor_auth_user_id is null then
    raise exception 'RECOVERY_REQUEST_INVALID';
  end if;

  select u.* into v_actor
  from public.users u
  join public.school_memberships m on m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE'
  join public.roles r on r.id=m.role_id and r.code='SCHOOL_ADMIN'
  where u.auth_user_id=p_actor_auth_user_id and u.is_active and u.account_status='ACTIVE';
  if v_actor.id is null then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;

  select * into v_school from public.schools
  where id=p_school_id and is_active and lifecycle_status not in ('SUSPENDED','ARCHIVED');
  if v_school.id is null then raise exception 'SCHOOL_NOT_ACTIVE'; end if;

  select u.* into v_teacher
  from public.users u
  join auth.users au on au.id=u.auth_user_id
  join public.school_memberships m on m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE'
  join public.roles r on r.id=m.role_id and r.code='TEACHER'
  where u.id=p_teacher_user_id and u.is_active and u.account_status='ACTIVE';
  if v_teacher.id is null then raise exception 'ACTIVE_SCHOOL_TEACHER_REQUIRED'; end if;
  select * into v_auth from auth.users where id=v_teacher.auth_user_id and email is not null;
  if v_auth.id is null then raise exception 'ACTIVE_SCHOOL_TEACHER_REQUIRED'; end if;

  -- One login may be shared across schools, so throttle globally per Auth user.
  perform pg_advisory_xact_lock(hashtextextended(v_teacher.auth_user_id::text, 0));
  select count(*) filter (where requested_at > now()-interval '60 seconds'),
         count(*) filter (where requested_at > now()-interval '1 hour')
    into v_recent,v_hourly
  from public.teacher_password_recovery_requests
  where teacher_auth_user_id=v_teacher.auth_user_id
    and delivery_status in ('PENDING','SENT','DELIVERY_FAILED');
  if v_recent >= 1 or v_hourly >= 5 then
    insert into public.teacher_password_recovery_requests(
      school_id,teacher_auth_user_id,requested_by_auth_user_id,delivery_status
    ) values (p_school_id,v_teacher.auth_user_id,p_actor_auth_user_id,'RATE_LIMITED')
    returning id into v_request_id;
    insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor.id,v_actor.full_name,'SCHOOL_ADMIN','TEACHER_PASSWORD_RECOVERY_RATE_LIMITED',
      'teacher_password_recovery',v_request_id::text,
      jsonb_build_object('school_id',p_school_id,'teacher_user_id',v_teacher.id,'request_id',v_request_id));
    return jsonb_build_object('error','RATE_LIMITED');
  end if;

  insert into public.teacher_password_recovery_requests(
    school_id,teacher_auth_user_id,requested_by_auth_user_id
  ) values (p_school_id,v_teacher.auth_user_id,p_actor_auth_user_id)
  returning id into v_request_id;

  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor.id,v_actor.full_name,'SCHOOL_ADMIN','TEACHER_PASSWORD_RECOVERY_REQUESTED',
    'teacher_password_recovery',v_request_id::text,
    jsonb_build_object('school_id',p_school_id,'teacher_user_id',v_teacher.id,'request_id',v_request_id));

  return jsonb_build_object('requestId',v_request_id,'authUserId',v_auth.id,
    'email',lower(v_auth.email),'teacherName',v_teacher.full_name,
    'schoolId',v_school.id,'schoolName',v_school.official_name,
    'schoolLogo',v_school.logo_url,'requesterName',v_actor.full_name);
end;
$$;

create or replace function public.finalize_school_teacher_password_recovery(
  p_request_id uuid, p_sent boolean, p_failure_category text default null
) returns boolean
language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_request public.teacher_password_recovery_requests%rowtype;
begin
  if p_request_id is null or p_sent is null
    or (p_sent and p_failure_category is not null)
    or (not p_sent and (p_failure_category is null or p_failure_category not in ('NOT_CONFIGURED','LINK_GENERATION_FAILED','EMAIL_PROVIDER_FAILED'))) then
    raise exception 'RECOVERY_DELIVERY_RESULT_INVALID';
  end if;
  select * into v_request from public.teacher_password_recovery_requests
  where id=p_request_id and delivery_status='PENDING' for update;
  if v_request.id is null then return false; end if;
  update public.teacher_password_recovery_requests set
    delivery_status=case when p_sent then 'SENT' else 'DELIVERY_FAILED' end,
    failure_category=case when p_sent then null else p_failure_category end,
    delivered_at=case when p_sent then now() else null end
  where id=p_request_id;
  if p_sent then
    insert into public.system_notifications(school_id,recipient_user_id,category,event_type,title,message,entity_type,entity_id,idempotency_key)
    values(v_request.school_id,v_request.teacher_auth_user_id,'SECURITY','TEACHER_PASSWORD_RECOVERY_SENT',
      'Password reset link sent','A secure password reset link was requested by your school. If you did not expect this, contact a School Administrator.',
      'teacher_password_recovery',p_request_id,'teacher-password-recovery:'||p_request_id::text)
    on conflict(idempotency_key) do nothing;
  end if;
  return true;
end;
$$;

create or replace function public.get_my_teacher_password_recovery_context(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_request public.teacher_password_recovery_requests%rowtype; v_school_name text;
begin
  if auth.uid() is null or p_request_id is null then raise exception 'RECOVERY_SESSION_REQUIRED'; end if;
  select * into v_request from public.teacher_password_recovery_requests
  where id=p_request_id and teacher_auth_user_id=auth.uid() and delivery_status='SENT'
    and completed_at is null and delivered_at>now()-interval '1 hour';
  if v_request.id is null then raise exception 'RECOVERY_REQUEST_UNAVAILABLE'; end if;
  select s.official_name into v_school_name
  from public.schools s join public.users u on u.auth_user_id=auth.uid()
  join public.school_memberships m on m.school_id=s.id and m.user_id=u.id and m.status='ACTIVE'
  join public.roles r on r.id=m.role_id and r.code='TEACHER'
  where s.id=v_request.school_id and u.is_active and u.account_status='ACTIVE';
  return jsonb_build_object('schoolName',v_school_name,'requestId',v_request.id);
end;
$$;

create or replace function public.complete_my_teacher_password_recovery(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_request public.teacher_password_recovery_requests%rowtype; v_name text;
begin
  if auth.uid() is null or p_request_id is null then return false; end if;
  update public.teacher_password_recovery_requests set completed_at=now()
  where id=p_request_id and teacher_auth_user_id=auth.uid() and delivery_status='SENT'
    and completed_at is null and delivered_at>now()-interval '1 hour'
  returning * into v_request;
  if v_request.id is null then return false; end if;
  select full_name into v_name from public.users where auth_user_id=auth.uid();
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  values(auth.uid(),coalesce(v_name,'Teacher'),'TEACHER','TEACHER_PASSWORD_RECOVERY_COMPLETED',
    'teacher_password_recovery',v_request.id::text,jsonb_build_object('school_id',v_request.school_id,'request_id',v_request.id));
  return true;
end;
$$;

revoke all on function public.prepare_school_teacher_password_recovery(uuid,uuid,uuid),
  public.finalize_school_teacher_password_recovery(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.get_my_teacher_password_recovery_context(uuid),
  public.complete_my_teacher_password_recovery(uuid) from public,anon;
grant execute on function public.prepare_school_teacher_password_recovery(uuid,uuid,uuid),
  public.finalize_school_teacher_password_recovery(uuid,boolean,text) to service_role;
grant execute on function public.get_my_teacher_password_recovery_context(uuid),
  public.complete_my_teacher_password_recovery(uuid) to authenticated;

-- A teacher may read only their assigned offerings' workflow statuses.
-- Other authorized school roles retain the full school-scoped view.
create or replace function public.get_academic_mark_submission_statuses(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid; v_actor uuid; v_role text;
begin
  v_actor:=public.current_app_user_id();
  select school_id into v_school_id from public.terms where id=p_term_id;
  if v_school_id is null or v_actor is null or not public.is_active_school_member(v_school_id) then
    raise exception 'Active school membership and a valid term are required';
  end if;
  select r.code into v_role from public.school_memberships m
    join public.roles r on r.id=m.role_id
    where m.school_id=v_school_id and m.user_id=v_actor and m.status='ACTIVE';
  if v_role is null then raise exception 'Active school membership and a valid term are required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'offeringId',s.class_subject_offering_id,'status',s.status,
    'submittedAt',s.submitted_at,'reviewedAt',s.reviewed_at,'reviewNote',s.review_note
  ) order by s.submitted_at desc) from public.academic_mark_submissions s
    where s.school_id=v_school_id and s.term_id=p_term_id
      and (v_role<>'TEACHER' or exists(
        select 1 from public.teacher_allocations ta
        where ta.school_id=v_school_id and ta.term_id=p_term_id
          and ta.class_subject_offering_id=s.class_subject_offering_id
          and ta.teacher_id=v_actor and ta.status='ACTIVE'
          and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')
      ))),'[]'::jsonb);
end;
$$;
revoke all on function public.get_academic_mark_submission_statuses(uuid) from public,anon;
grant execute on function public.get_academic_mark_submission_statuses(uuid) to authenticated;

-- Return only the current authorized A-Level roster for one offering. The
-- former browser query fetched every active assignment in the school first.
create or replace function public.get_authorized_a_level_marks_roster(p_term_id uuid,p_offering_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_school_id uuid; v_actor uuid; v_role text;
begin
  v_actor:=public.current_app_user_id();
  select school_id into v_school_id from public.terms where id=p_term_id;
  if v_actor is null or v_school_id is null or not public.is_active_school_member(v_school_id) then
    raise exception 'Active school membership and a valid term are required';
  end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=v_school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if not exists(select 1 from public.school_subject_offerings so where so.id=p_offering_id
      and so.school_id=v_school_id and so.academic_year_id=(select academic_year_id from public.terms where id=p_term_id)) then
    raise exception 'Offering is unavailable in this school and term';
  end if;
  if v_role='TEACHER' and not exists(select 1 from public.teacher_allocations ta
      where ta.school_id=v_school_id and ta.term_id=p_term_id and ta.class_subject_offering_id=p_offering_id
        and ta.teacher_id=v_actor and ta.status='ACTIVE' and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then
    raise exception 'Teacher is not allocated to this offering';
  elsif v_role not in ('TEACHER','SCHOOL_ADMIN','DIRECTOR_OF_STUDIES','HEAD_TEACHER','DEPUTY_HEAD_TEACHER') then
    raise exception 'Role cannot view A-Level marks';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'learnerId',a.learner_id,
      'admission',l.admission_number,'learnerName',concat_ws(' ',l.first_name,l.last_name),
      'combination',c.code) order by l.admission_number)
    from public.a_level_learner_assignments a
    join public.learners l on l.id=a.learner_id and l.school_id=v_school_id
    join public.a_level_combinations c on c.id=a.combination_id and c.school_id=v_school_id
    join public.a_level_combination_subjects cs on cs.combination_id=c.id and cs.school_subject_offering_id=p_offering_id
    where a.school_id=v_school_id and a.status='ACTIVE'
      and a.starts_on<=(select ends_on from public.terms where id=p_term_id)
      and (a.ends_on is null or a.ends_on>=(select starts_on from public.terms where id=p_term_id))
      and exists(select 1 from public.academic_classes cl where cl.id=a.class_id and cl.school_id=v_school_id
        and cl.academic_year_id=(select academic_year_id from public.terms where id=p_term_id))), '[]'::jsonb);
end;
$$;
revoke all on function public.get_authorized_a_level_marks_roster(uuid,uuid) from public,anon;
grant execute on function public.get_authorized_a_level_marks_roster(uuid,uuid) to authenticated;

create or replace function public.get_school_unread_notification_count(p_school_id uuid)
returns integer language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or p_school_id is null or not public.is_active_school_member(p_school_id) then
    raise exception 'Active school membership is required';
  end if;
  return (select count(*)::integer from public.system_notifications n
    where n.recipient_user_id=auth.uid() and n.school_id=p_school_id and n.read_at is null);
end;
$$;
revoke all on function public.get_school_unread_notification_count(uuid) from public,anon;
grant execute on function public.get_school_unread_notification_count(uuid) to authenticated;

-- Make assignment-scoped reads authoritative at the table boundary too.
drop policy if exists "school members can view a level assignments" on public.a_level_learner_assignments;
create policy "school members can view authorized a level assignments"
on public.a_level_learner_assignments for select to authenticated
using (
  public.is_platform_administrator()
  or (public.is_active_school_member(school_id) and (
    not exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id
      where m.school_id=a_level_learner_assignments.school_id and m.user_id=public.current_app_user_id()
        and m.status='ACTIVE' and r.code='TEACHER')
    or exists(select 1 from public.teacher_allocations ta
      join public.a_level_combination_subjects cs on cs.school_subject_offering_id=ta.class_subject_offering_id
      join public.a_level_combinations c on c.id=cs.combination_id
      join public.academic_classes cl on cl.id=a_level_learner_assignments.class_id and cl.school_id=ta.school_id
      join public.terms t on t.id=ta.term_id and t.academic_year_id=cl.academic_year_id
      where ta.school_id=a_level_learner_assignments.school_id and ta.teacher_id=public.current_app_user_id()
        and ta.status='ACTIVE' and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')
        and c.id=a_level_learner_assignments.combination_id and c.school_id=a_level_learner_assignments.school_id
        and cl.academic_year_id=c.academic_year_id and a_level_learner_assignments.status='ACTIVE'
        and a_level_learner_assignments.starts_on<=t.ends_on
        and (a_level_learner_assignments.ends_on is null or a_level_learner_assignments.ends_on>=t.starts_on))
  ))
);
drop policy if exists "school members can view a level marks" on public.a_level_paper_marks;
create policy "school members can view authorized a level marks"
on public.a_level_paper_marks for select to authenticated
using (
  public.is_platform_administrator()
  or (public.is_active_school_member(school_id) and (
    not exists(select 1 from public.school_memberships m join public.roles r on r.id=m.role_id
      where m.school_id=a_level_paper_marks.school_id and m.user_id=public.current_app_user_id()
        and m.status='ACTIVE' and r.code='TEACHER')
    or exists(select 1 from public.teacher_allocations ta
      where ta.school_id=a_level_paper_marks.school_id and ta.term_id=a_level_paper_marks.academic_term_id
        and ta.class_subject_offering_id=a_level_paper_marks.school_subject_offering_id
        and ta.teacher_id=public.current_app_user_id() and ta.status='ACTIVE'
        and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER'))
  ))
);
notify pgrst, 'reload schema';
