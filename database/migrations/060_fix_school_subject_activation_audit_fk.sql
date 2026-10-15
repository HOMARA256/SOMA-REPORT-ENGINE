-- Keep catalogue activation audit identity aligned with audit_logs.user_id,
-- which references the authenticated Supabase user rather than users.id.
create or replace function public.set_school_catalogue_subject_status(
 p_school_id uuid,
 p_academic_year_id uuid,
 p_system_subject_id uuid,
 p_active boolean,
 p_reason text
) returns uuid
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
 v_subject public.system_subjects%rowtype;
 v_actor public.users%rowtype;
 v_id uuid;
 v_existing_id uuid;
 v_old jsonb;
 v_has_choice_rule boolean;
begin
 if not public.is_school_admin_for(p_school_id) then
  raise exception 'SCHOOL_ADMIN_REQUIRED';
 end if;
 if nullif(trim(p_reason),'') is null then
  raise exception 'REASON_REQUIRED';
 end if;
 if not exists(
  select 1 from public.academic_years
  where id=p_academic_year_id and school_id=p_school_id
 ) then
  raise exception 'ACADEMIC_YEAR_NOT_OWNED';
 end if;

 select * into v_actor
 from public.users
 where auth_user_id=auth.uid() and is_active=true;
 if v_actor.id is null or v_actor.auth_user_id is null then
  raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
 end if;

 select * into v_subject
 from public.system_subjects
 where id=p_system_subject_id and is_active;
 if v_subject.id is null then
  raise exception 'CATALOGUE_SUBJECT_NOT_AVAILABLE';
 end if;
 select o.id,to_jsonb(o) into v_existing_id,v_old
 from public.school_subject_offerings o
 where o.school_id=p_school_id
   and o.academic_year_id=p_academic_year_id
   and o.system_subject_id=p_system_subject_id;

 if not p_active and v_subject.is_compulsory then
  raise exception 'NCDC_REQUIRED_SUBJECT_CANNOT_BE_DEACTIVATED';
 end if;
 if not p_active and v_existing_id is not null and exists(
  select 1
  from public.class_subject_offerings co
  join public.academic_classes c on c.id=co.class_id
  where co.school_subject_offering_id=v_existing_id
    and co.status='ACTIVE' and c.status='ACTIVE'
 ) then
  raise exception 'SUBJECT_IS_OFFERED_TO_AN_ACTIVE_CLASS';
 end if;
 if not p_active and v_existing_id is not null and exists(
  select 1
  from public.learner_subject_enrolments ls
  join public.class_subject_offerings co on co.id=ls.class_subject_offering_id
  where co.school_subject_offering_id=v_existing_id and ls.status='ACTIVE'
 ) then
  raise exception 'SUBJECT_IS_SELECTED_BY_AN_ACTIVE_LEARNER';
 end if;

 select exists(
  select 1
  from public.o_level_curriculum_subject_rules r
  join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id
  where rs.status='ACTIVE' and r.is_active
    and r.system_subject_id=p_system_subject_id
    and r.requirement='RELIGION_OPTION'
 ) into v_has_choice_rule;
 if not p_active and v_has_choice_rule and not exists(
  select 1
  from public.o_level_curriculum_subject_rules r
  join public.o_level_curriculum_rule_sets rs on rs.id=r.rule_set_id and rs.status='ACTIVE'
  join public.school_subject_offerings alternative
    on alternative.school_id=p_school_id
   and alternative.academic_year_id=p_academic_year_id
   and alternative.system_subject_id=r.system_subject_id
   and alternative.status='ACTIVE'
  where r.is_active and r.requirement='RELIGION_OPTION'
    and r.class_level in (1,2)
    and r.system_subject_id<>p_system_subject_id
 ) then
  raise exception 'AT_LEAST_ONE_RELIGIOUS_EDUCATION_OPTION_MUST_REMAIN_ACTIVE';
 end if;

 insert into public.school_subject_offerings(
  school_id,academic_year_id,system_subject_id,programme,school_subject_code,
  subject_source,status,subject_level,retired_at,activated_by,activated_at,is_demo_data
 ) values(
  p_school_id,p_academic_year_id,p_system_subject_id,v_subject.programme,
  v_subject.subject_code,'SYSTEM_CATALOGUE',
  (case when p_active then 'ACTIVE' else 'INACTIVE' end)::public.offering_status,
  v_subject.subject_level,case when p_active then null else now() end,
  case when p_active then v_actor.id else null end,
  case when p_active then now() else null end,false
 )
 on conflict(school_id,academic_year_id,system_subject_id) do update
 set status=excluded.status,
     retired_at=excluded.retired_at,
     activated_by=excluded.activated_by,
     activated_at=excluded.activated_at,
     is_demo_data=false,
     updated_at=now()
 returning id into v_id;

 insert into public.audit_logs(
  user_id,user_name,user_role,action,entity_type,entity_id,old_value,new_value
 ) values(
  v_actor.auth_user_id,v_actor.full_name,'SCHOOL_ADMIN',
  case when p_active then 'SCHOOL_SUBJECT_ACTIVATED' else 'SCHOOL_SUBJECT_DEACTIVATED' end,
  'school_subject_offering',v_id::text,v_old,
  jsonb_build_object(
   'school_id',p_school_id,
   'academic_year_id',p_academic_year_id,
   'system_subject_id',p_system_subject_id,
   'active',p_active,
   'reason',trim(p_reason)
  )
 );
 return v_id;
end
$$;

revoke all on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) to authenticated;
