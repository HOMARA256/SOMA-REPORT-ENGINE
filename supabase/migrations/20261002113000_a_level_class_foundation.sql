-- Prepare the minimum persistent A-Level class structure without duplicating
-- or replacing school-owned configuration.
create or replace function public.ensure_a_level_class_foundation(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_default_stream_name text default 'A'
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_actor uuid;
  v_class_id uuid;
  v_level integer;
  v_class_name text;
  v_stream_name text:=nullif(trim(p_default_stream_name),'');
  v_classes_created integer:=0;
  v_streams_created integer:=0;
  v_subjects_connected integer:=0;
  v_connected integer;
begin
  if not public.is_school_admin_for(p_school_id) then
    raise exception 'School Administrator permission required';
  end if;

  if not exists(
    select 1 from public.academic_years
    where id=p_academic_year_id and school_id=p_school_id
  ) then
    raise exception 'Academic year is outside this school';
  end if;

  if v_stream_name is null then
    raise exception 'Default stream name is required';
  end if;

  if not exists(
    select 1 from public.school_subject_offerings
    where school_id=p_school_id
      and academic_year_id=p_academic_year_id
      and programme='A_LEVEL'
      and status='ACTIVE'
  ) then
    raise exception 'Activate at least one A-Level subject for this academic year first';
  end if;

  v_actor:=public.current_app_user_id();

  foreach v_level in array array[5,6]
  loop
    v_class_name:=format('Senior %s',v_level);

    select id into v_class_id
    from public.academic_classes
    where school_id=p_school_id
      and academic_year_id=p_academic_year_id
      and programme='A_LEVEL'
      and level=v_level
      and status<>'ARCHIVED'
    order by case when status='ACTIVE' then 0 else 1 end,created_at
    limit 1;

    if v_class_id is null then
      insert into public.academic_classes(
        school_id,academic_year_id,programme,class_name,level,status,created_by,updated_by
      ) values(
        p_school_id,p_academic_year_id,'A_LEVEL',v_class_name,v_level,'ACTIVE',v_actor,v_actor
      ) returning id into v_class_id;
      v_classes_created:=v_classes_created+1;
    else
      update public.academic_classes
      set status='ACTIVE',updated_at=now(),updated_by=v_actor
      where id=v_class_id and status<>'ACTIVE';
    end if;

    if not exists(
      select 1 from public.class_streams
      where class_id=v_class_id and status='ACTIVE'
    ) then
      insert into public.class_streams(
        school_id,class_id,academic_year_id,stream_name,status,created_by,updated_by
      ) values(
        p_school_id,v_class_id,p_academic_year_id,v_stream_name,'ACTIVE',v_actor,v_actor
      ) on conflict (class_id,stream_name) do update
        set status='ACTIVE',updated_at=now(),updated_by=v_actor;
      v_streams_created:=v_streams_created+1;
    end if;

    with connected as (
      insert into public.class_subject_offerings(
        school_id,school_subject_offering_id,academic_year_id,class_id,
        is_compulsory,status,created_by,updated_by
      )
      select
        p_school_id,so.id,p_academic_year_id,v_class_id,
        coalesce(ss.is_compulsory,false),'ACTIVE',v_actor,v_actor
      from public.school_subject_offerings so
      left join public.system_subjects ss on ss.id=so.system_subject_id
      where so.school_id=p_school_id
        and so.academic_year_id=p_academic_year_id
        and so.programme='A_LEVEL'
        and so.status='ACTIVE'
      on conflict on constraint class_subject_scope_key do update
        set status='ACTIVE',updated_at=now(),updated_by=v_actor
      returning id
    ) select count(*) into v_connected from connected;

    v_subjects_connected:=v_subjects_connected+coalesce(v_connected,0);
  end loop;

  insert into public.audit_logs(
    user_name,user_role,action,entity_type,entity_id,new_value
  ) values(
    coalesce(v_actor::text,auth.uid()::text),'SCHOOL_ADMIN',
    'A_LEVEL_CLASS_FOUNDATION_PREPARED','academic_year',p_academic_year_id::text,
    jsonb_build_object(
      'school_id',p_school_id,
      'levels',jsonb_build_array(5,6),
      'default_stream',v_stream_name,
      'classes_created',v_classes_created,
      'streams_created',v_streams_created,
      'subject_connections_processed',v_subjects_connected
    )
  );

  return jsonb_build_object(
    'classesCreated',v_classes_created,
    'streamsCreated',v_streams_created,
    'subjectConnectionsProcessed',v_subjects_connected
  );
end
$$;

revoke all on function public.ensure_a_level_class_foundation(uuid,uuid,text) from public,anon;
grant execute on function public.ensure_a_level_class_foundation(uuid,uuid,text) to authenticated;
