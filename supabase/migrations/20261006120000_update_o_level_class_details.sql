-- Edit safe O-Level class identity fields without changing its year, level,
-- status, streams, learner enrolments, or curriculum connections.
create or replace function public.update_o_level_class_details(
 p_class_id uuid,
 p_class_name text,
 p_capacity integer,
 p_class_teacher_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_class public.academic_classes%rowtype;
 v_actor uuid;
 v_actor_name text;
 v_name text;
 v_before jsonb;
 v_after jsonb;
begin
 select * into v_class from public.academic_classes where id=p_class_id for update;
 if v_class.id is null or v_class.programme<>'O_LEVEL' or not public.is_school_admin_for(v_class.school_id) then
  raise exception 'School Administrator and O-Level class required';
 end if;

 v_actor:=public.current_app_user_id();
 if v_actor is null then raise exception 'Active school account required'; end if;
 select full_name into v_actor_name from public.users where id=v_actor;

 v_name:=nullif(trim(p_class_name),'');
 if v_name is null or length(v_name)>100 then raise exception 'Enter a class name of 1 to 100 characters'; end if;
 if p_capacity is not null and p_capacity<1 then raise exception 'Capacity must be greater than zero'; end if;
 if exists(
  select 1 from public.academic_classes other
  where other.school_id=v_class.school_id and other.academic_year_id=v_class.academic_year_id
   and other.id<>v_class.id and lower(other.class_name)=lower(v_name)
 ) then raise exception 'Another class in this academic year already has this name'; end if;
 if p_class_teacher_user_id is not null and not exists(
  select 1 from public.school_memberships m
  join public.roles r on r.id=m.role_id
  where m.school_id=v_class.school_id and m.user_id=p_class_teacher_user_id
   and m.status='ACTIVE'
   and r.code in ('TEACHER','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','SCHOOL_ADMIN')
 ) then raise exception 'Class teacher must be an active teaching or school administrator account in this school'; end if;

 v_before:=jsonb_build_object('class_name',v_class.class_name,'capacity',v_class.capacity,
  'class_teacher_user_id',v_class.class_teacher_user_id);
 update public.academic_classes
 set class_name=v_name,capacity=p_capacity,class_teacher_user_id=p_class_teacher_user_id,
  updated_by=v_actor,updated_at=now()
 where id=v_class.id
 returning * into v_class;
 v_after:=jsonb_build_object('class_name',v_class.class_name,'capacity',v_class.capacity,
  'class_teacher_user_id',v_class.class_teacher_user_id);

 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
 values(coalesce(v_actor_name,v_actor::text),'SCHOOL_ADMIN','O_LEVEL_CLASS_DETAILS_UPDATED',
  'academic_class',v_class.id::text,v_before,
  v_after||jsonb_build_object('school_id',v_class.school_id,'academic_year_id',v_class.academic_year_id));

 return jsonb_build_object('id',v_class.id,'name',v_class.class_name,
  'capacity',v_class.capacity,'classTeacherUserId',v_class.class_teacher_user_id);
end
$$;

revoke all on function public.update_o_level_class_details(uuid,text,integer,uuid) from public,anon;
grant execute on function public.update_o_level_class_details(uuid,text,integer,uuid) to authenticated;

notify pgrst,'reload schema';
