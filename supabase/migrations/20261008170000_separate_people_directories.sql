begin;

-- Enrich the selected-school learner register with actual active subject
-- selections so the separate Learners page can search/filter those records.
create or replace function public.get_school_learner_register(p_school_id uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_temp
as $$
 select jsonb_build_object(
  'academicYears',coalesce((
    select jsonb_agg(jsonb_build_object('id',ay.id,'name',ay.name,'status',ay.status) order by ay.starts_on desc)
    from public.academic_years ay where ay.school_id=p_school_id
  ),'[]'::jsonb),
  'classes',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',c.id,'academicYearId',c.academic_year_id,'name',c.class_name,
      'programme',c.programme,'level',c.level,'status',c.status,
      'streams',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name,'status',s.status) order by s.stream_name),'[]'::jsonb)
        from public.class_streams s where s.class_id=c.id and s.school_id=c.school_id)
    ) order by c.level,c.class_name)
    from public.academic_classes c where c.school_id=p_school_id
  ),'[]'::jsonb),
  'learners',coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',l.id,'admissionNumber',l.admission_number,'firstName',l.first_name,
      'otherName',l.other_name,'lastName',l.last_name,'gender',l.gender,
      'sensitiveFieldsVisible',public.is_school_admin_for(p_school_id) or public.is_active_platform_admin(),
      'historyVisible',public.is_school_admin_for(p_school_id) or public.is_active_platform_admin(),
      'dateOfBirth',case when public.is_school_admin_for(p_school_id) or public.is_active_platform_admin() then l.date_of_birth else null end,
      'status',l.status,
      'guardianName',case when public.is_school_admin_for(p_school_id) or public.is_active_platform_admin() then l.guardian_name else null end,
      'guardianPhone',case when public.is_school_admin_for(p_school_id) or public.is_active_platform_admin() then l.guardian_phone else null end,
      'enrolment',case when e.id is null then null else jsonb_build_object(
        'id',e.id,'academicYearId',e.academic_year_id,'classId',e.class_id,
        'className',c.class_name,'programme',c.programme,'streamId',e.stream_id,
        'streamName',s.stream_name,'status',e.status,'effectiveFrom',e.effective_from
      ) end,
      'activeSubjects',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',co.id,'name',coalesce(so.display_name_override,ss.subject_name,so.school_subject_code,'Unnamed subject'),
        'code',coalesce(so.school_subject_code,ss.subject_code)
      ) order by coalesce(so.display_name_override,ss.subject_name,so.school_subject_code)),'[]'::jsonb)
        from public.learner_subject_enrolments lse
        join public.class_subject_offerings co on co.id=lse.class_subject_offering_id and co.school_id=lse.school_id
        join public.school_subject_offerings so on so.id=co.school_subject_offering_id and so.school_id=co.school_id
        left join public.system_subjects ss on ss.id=so.system_subject_id
        where lse.school_id=l.school_id and lse.learner_id=l.id and lse.enrolment_id=e.id and lse.status='ACTIVE'
      ),
      'history',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',h.id,'academicYearId',h.academic_year_id,'classId',h.class_id,
        'programme',hc.programme,'className',hc.class_name,'streamName',hs.stream_name,
        'status',h.status,'effectiveFrom',h.effective_from,'effectiveTo',h.effective_to
      ) order by h.effective_from desc),'[]'::jsonb)
        from public.learner_class_enrolments h
        join public.academic_classes hc on hc.id=h.class_id and hc.school_id=h.school_id
        left join public.class_streams hs on hs.id=h.stream_id and hs.school_id=h.school_id
        where h.learner_id=l.id and h.school_id=l.school_id
          and (public.is_school_admin_for(p_school_id) or public.is_active_platform_admin())
      )
    ) order by l.last_name,l.first_name)
    from public.learners l
    left join lateral (
      select * from public.learner_class_enrolments x
      where x.learner_id=l.id and x.school_id=l.school_id and x.status='ACTIVE' and x.effective_to is null
      order by x.effective_from desc limit 1
    ) e on true
    left join public.academic_classes c on c.id=e.class_id and c.school_id=e.school_id
    left join public.class_streams s on s.id=e.stream_id and s.school_id=e.school_id
    where l.school_id=p_school_id
      and (
        public.is_school_admin_for(p_school_id)
        or public.is_active_platform_admin()
        or exists (
          select 1
          from public.teacher_allocations ta
          join public.class_subject_offerings assigned_offering
            on assigned_offering.id=ta.class_subject_offering_id
            and assigned_offering.school_id=ta.school_id
          join public.school_memberships teacher_membership
            on teacher_membership.school_id=ta.school_id
            and teacher_membership.user_id=ta.teacher_id
            and teacher_membership.status='ACTIVE'
          join public.roles teacher_role
            on teacher_role.id=teacher_membership.role_id and teacher_role.code='TEACHER'
          where ta.school_id=p_school_id
            and ta.teacher_id=public.current_app_user_id()
            and ta.status='ACTIVE'
            and ta.academic_year_id=e.academic_year_id
            and assigned_offering.class_id=e.class_id
            and (ta.stream_id is null or ta.stream_id=e.stream_id)
        )
      )
  ),'[]'::jsonb)
 ) where public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
$$;

revoke all on function public.get_school_learner_register(uuid) from public,anon;
grant execute on function public.get_school_learner_register(uuid) to authenticated;

-- Update only the selected tenant's learner profile; no direct cross-tenant
-- table write is exposed to the client.
create or replace function public.update_school_learner_profile(
  p_school_id uuid,
  p_learner_id uuid,
  p_first_name text,
  p_other_name text,
  p_last_name text,
  p_gender text,
  p_date_of_birth date,
  p_guardian_name text,
  p_guardian_phone text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_learner public.learners%rowtype;
  v_actor uuid;
  v_actor_name text;
begin
  if p_school_id is null or p_learner_id is null
    or nullif(trim(coalesce(p_first_name,'')), '') is null
    or nullif(trim(coalesce(p_last_name,'')), '') is null then
    raise exception 'LEARNER_PROFILE_FIELDS_REQUIRED';
  end if;
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_learner from public.learners
    where id=p_learner_id and school_id=p_school_id for update;
  if v_learner.id is null then raise exception 'LEARNER_NOT_FOUND_IN_SCHOOL'; end if;
  v_actor:=public.current_app_user_id();
  select full_name into v_actor_name from public.users where id=v_actor;
  update public.learners set
    first_name=trim(p_first_name),
    other_name=nullif(trim(coalesce(p_other_name,'')),''),
    last_name=trim(p_last_name),
    gender=nullif(trim(coalesce(p_gender,'')),''),
    date_of_birth=p_date_of_birth,
    guardian_name=nullif(trim(coalesce(p_guardian_name,'')),''),
    guardian_phone=nullif(trim(coalesce(p_guardian_phone,'')),''),
    updated_by=v_actor,updated_at=now()
  where id=v_learner.id and school_id=p_school_id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
  values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','LEARNER_PROFILE_UPDATED','learner',v_learner.id::text,
    jsonb_build_object('first_name',v_learner.first_name,'other_name',v_learner.other_name,'last_name',v_learner.last_name,'gender',v_learner.gender,'date_of_birth',v_learner.date_of_birth,'guardian_contact_present',v_learner.guardian_phone is not null),
    jsonb_build_object('first_name',trim(p_first_name),'other_name',nullif(trim(coalesce(p_other_name,'')),''),'last_name',trim(p_last_name),'gender',nullif(trim(coalesce(p_gender,'')),''),'date_of_birth',p_date_of_birth,'guardian_contact_present',nullif(trim(coalesce(p_guardian_phone,'')),'') is not null)
  );
  return v_learner.id;
end;
$$;

revoke all on function public.update_school_learner_profile(uuid,uuid,text,text,text,text,date,text,text) from public,anon;
grant execute on function public.update_school_learner_profile(uuid,uuid,text,text,text,text,date,text,text) to authenticated;

commit;
