begin;

alter table public.identity_cards
  add column if not exists printed_school_name text,
  add column if not exists printed_school_logo text,
  add column if not exists printed_person_name text,
  add column if not exists printed_identifier text,
  add column if not exists printed_role text,
  add column if not exists printed_department text,
  add column if not exists printed_photo_path text,
  add column if not exists printed_class_id uuid,
  add column if not exists printed_stream_id uuid,
  add column if not exists printed_academic_year_id uuid,
  add column if not exists snapshot_captured_at timestamptz;

create or replace function public.capture_school_identity_card_snapshot()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_school public.schools%rowtype; v_learner public.learners%rowtype;
  v_staff public.users%rowtype; v_enrolment public.learner_class_enrolments%rowtype;
  v_role text;
begin
  select * into v_school from public.schools where id=new.school_id;
  if v_school.id is null then raise exception 'CARD_SCHOOL_NOT_FOUND'; end if;
  new.printed_school_name:=v_school.official_name;
  new.printed_school_logo:=v_school.logo_url;
  if new.person_type='LEARNER' then
    select * into v_learner from public.learners
    where id=new.learner_id and school_id=new.school_id and status='ACTIVE';
    if v_learner.id is null then raise exception 'CARD_LEARNER_NOT_ACTIVE'; end if;
    select * into v_enrolment from public.learner_class_enrolments
    where learner_id=new.learner_id and school_id=new.school_id
      and status='ACTIVE' and effective_to is null
    order by effective_from desc limit 1;
    if v_enrolment.id is null then raise exception 'CARD_CURRENT_ENROLMENT_REQUIRED'; end if;
    new.printed_person_name:=concat_ws(' ',v_learner.first_name,v_learner.other_name,v_learner.last_name);
    new.printed_identifier:=v_learner.admission_number;
    new.printed_photo_path:=v_learner.profile_photo_path;
    new.printed_class_id:=v_enrolment.class_id;
    new.printed_stream_id:=v_enrolment.stream_id;
    new.printed_academic_year_id:=v_enrolment.academic_year_id;
  else
    select * into v_staff from public.users
    where id=new.staff_id and is_active and account_status='ACTIVE';
    if v_staff.id is null then raise exception 'CARD_STAFF_NOT_ACTIVE'; end if;
    if nullif(trim(v_staff.staff_number),'') is null then raise exception 'CARD_STAFF_NUMBER_REQUIRED'; end if;
    if exists(select 1 from public.users other
      join public.school_memberships membership on membership.user_id=other.id
      where membership.school_id=new.school_id and membership.status='ACTIVE'
        and other.id<>v_staff.id and lower(trim(other.staff_number))=lower(trim(v_staff.staff_number))) then
      raise exception 'CARD_STAFF_NUMBER_NOT_UNIQUE_IN_SCHOOL';
    end if;
    select r.code into v_role from public.school_memberships membership
      join public.roles r on r.id=membership.role_id
      where membership.school_id=new.school_id and membership.user_id=new.staff_id
        and membership.status='ACTIVE' and r.code not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN')
      order by (r.code='TEACHER') desc limit 1;
    if v_role is null then raise exception 'CARD_STAFF_MEMBERSHIP_REQUIRED'; end if;
    new.printed_person_name:=v_staff.full_name;
    new.printed_identifier:=v_staff.staff_number;
    new.printed_photo_path:=v_staff.profile_photo_path;
    new.printed_role:=v_role;
    new.printed_department:=v_staff.department;
  end if;
  new.snapshot_captured_at:=now();
  return new;
end;
$$;
drop trigger if exists capture_school_identity_card_snapshot_before_insert on public.identity_cards;
create trigger capture_school_identity_card_snapshot_before_insert
before insert on public.identity_cards for each row
execute function public.capture_school_identity_card_snapshot();

-- Cards issued before this migration have no trusted historical snapshot.
-- They remain in history, but public verification asks for controlled reissue.
create or replace function public.verify_school_identity_card(p_verification_token text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'valid',coalesce(checks.current_and_matching,false),
    'cardStatus',case
      when c.status='ACTIVE' and c.expiry_date<current_date then 'EXPIRED'
      when c.status='ACTIVE' and not coalesce(checks.current_and_matching,false) then 'REISSUE_REQUIRED'
      else c.status end,
    'personType',c.person_type,
    'schoolName',coalesce(c.printed_school_name,s.official_name),
    'fullName',c.printed_person_name,
    'admissionOrStaffNumber',c.printed_identifier,
    'className',case when c.person_type='LEARNER' then cl.class_name else null end,
    'streamName',case when c.person_type='LEARNER' then st.stream_name else null end,
    'roleOrDepartment',case when c.person_type='STAFF' then coalesce(c.printed_role,c.printed_department) else null end,
    'issueDate',c.issue_date,'expiryDate',c.expiry_date
  )
  from public.identity_cards c
  join public.schools s on s.id=c.school_id
  left join public.learners l on l.id=c.learner_id and l.school_id=c.school_id
  left join public.users u on u.id=c.staff_id
  left join lateral(select e.* from public.learner_class_enrolments e
    where e.learner_id=l.id and e.school_id=c.school_id and e.status='ACTIVE' and e.effective_to is null
    order by e.effective_from desc limit 1) e on true
  left join public.academic_classes cl on cl.id=c.printed_class_id and cl.school_id=c.school_id
  left join public.class_streams st on st.id=c.printed_stream_id and st.school_id=c.school_id
  left join lateral(select r.code from public.school_memberships m
    join public.roles r on r.id=m.role_id
    where m.user_id=u.id and m.school_id=c.school_id and m.status='ACTIVE'
      and r.code not in ('LEARNER','PARENT_GUARDIAN','PLATFORM_ADMIN')
    order by (r.code='TEACHER') desc limit 1) active_membership_role on true
  cross join lateral(select
    c.status='ACTIVE' and (c.expiry_date is null or c.expiry_date>=current_date)
    and c.snapshot_captured_at is not null
    and c.printed_school_name=s.official_name
    and c.printed_school_logo is not distinct from s.logo_url
    and (case when c.person_type='LEARNER' then
      l.status='ACTIVE' and c.printed_person_name=concat_ws(' ',l.first_name,l.other_name,l.last_name)
      and c.printed_identifier=l.admission_number
      and c.printed_photo_path is not distinct from l.profile_photo_path
      and c.printed_class_id=e.class_id
      and c.printed_stream_id is not distinct from e.stream_id
      and c.printed_academic_year_id=e.academic_year_id
    else
      u.is_active and u.account_status='ACTIVE'
      and c.printed_person_name=u.full_name
      and c.printed_identifier=u.staff_number
      and c.printed_photo_path is not distinct from u.profile_photo_path
      and c.printed_role=active_membership_role.code
      and c.printed_department is not distinct from u.department
    end) as current_and_matching) checks
  where c.secure_verification_token=p_verification_token limit 1;
$$;

create or replace function public.get_school_identity_card_print_snapshot(p_school_id uuid,p_card_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_card public.identity_cards%rowtype;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_card from public.identity_cards where id=p_card_id and school_id=p_school_id;
  if v_card.id is null then raise exception 'SCHOOL_ID_CARD_NOT_FOUND'; end if;
  return jsonb_build_object(
    'schoolName',v_card.printed_school_name,'schoolLogo',v_card.printed_school_logo,
    'fullName',v_card.printed_person_name,'identifier',v_card.printed_identifier,
    'role',v_card.printed_role,'department',v_card.printed_department,
    'photoPath',v_card.printed_photo_path,
    'className',(select class_name from public.academic_classes where id=v_card.printed_class_id and school_id=p_school_id),
    'streamName',(select stream_name from public.class_streams where id=v_card.printed_stream_id and school_id=p_school_id),
    'academicYear',(select name from public.academic_years where id=v_card.printed_academic_year_id and school_id=p_school_id),
    'needsReissue',coalesce((public.verify_school_identity_card(v_card.secure_verification_token)->>'cardStatus')='REISSUE_REQUIRED',false)
  );
end;
$$;
revoke all on function public.get_school_identity_card_print_snapshot(uuid,uuid) from public,anon;
grant execute on function public.get_school_identity_card_print_snapshot(uuid,uuid) to authenticated;

commit;
