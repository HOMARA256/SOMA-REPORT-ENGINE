-- Connect persistent classes to school subjects activated from the platform catalogue.
create or replace function public.offer_subject_to_class(p_class_id uuid,p_school_subject_offering_id uuid,p_is_compulsory boolean default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes; v_subject public.school_subject_offerings; v_actor uuid; v_id uuid; v_compulsory boolean;
begin
 select * into v_class from public.academic_classes where id=p_class_id;
 if v_class.id is null or not public.is_school_admin_for(v_class.school_id) then raise exception 'Class unavailable or School Administrator permission required'; end if;
 select * into v_subject from public.school_subject_offerings where id=p_school_subject_offering_id and school_id=v_class.school_id and academic_year_id=v_class.academic_year_id and status='ACTIVE';
 if v_subject.id is null then raise exception 'Only an active subject offering for this school and academic year can be assigned'; end if;
 if v_subject.programme<>v_class.programme then raise exception 'Subject programme does not match the class programme'; end if;
 v_actor:=public.current_app_user_id();
 select coalesce(p_is_compulsory,ss.is_compulsory,true) into v_compulsory from public.system_subjects ss where ss.id=v_subject.system_subject_id;
 v_compulsory:=coalesce(v_compulsory,p_is_compulsory,true);
 insert into public.class_subject_offerings(school_id,school_subject_offering_id,academic_year_id,class_id,is_compulsory,status,created_by,updated_by)
 values(v_class.school_id,v_subject.id,v_class.academic_year_id,v_class.id,v_compulsory,'ACTIVE',v_actor,v_actor)
 on conflict on constraint class_subject_scope_key do update set status='ACTIVE',is_compulsory=excluded.is_compulsory,updated_at=now(),updated_by=v_actor
 returning id into v_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value) values(v_actor::text,'SCHOOL_ADMIN','CLASS_SUBJECT_OFFERED','class_subject_offering',v_id::text,jsonb_build_object('class_id',v_class.id,'school_subject_offering_id',v_subject.id));
 return v_id;
end $$;
revoke all on function public.offer_subject_to_class(uuid,uuid,boolean) from public,anon;
grant execute on function public.offer_subject_to_class(uuid,uuid,boolean) to authenticated;
