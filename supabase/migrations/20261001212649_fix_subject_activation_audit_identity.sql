-- Keep school subject activation tenant-scoped and write the authenticated
-- profile identity expected by audit_logs.user_id.
create or replace function public.set_school_catalogue_subject_status(
 p_school_id uuid,
 p_academic_year_id uuid,
 p_system_subject_id uuid,
 p_active boolean,
 p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
 v_subject public.system_subjects%rowtype;
 v_actor public.users%rowtype;
 v_id uuid;
 v_old jsonb;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'REASON_REQUIRED'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
 select * into v_actor from public.users where auth_user_id=auth.uid() and is_active=true;
 if v_actor.id is null or v_actor.auth_user_id is null then raise exception 'ACTIVE_USER_PROFILE_REQUIRED'; end if;
 select * into v_subject from public.system_subjects where id=p_system_subject_id and is_active;
 if v_subject.id is null then raise exception 'CATALOGUE_SUBJECT_NOT_AVAILABLE'; end if;
 if not p_active and v_subject.is_compulsory then raise exception 'COMPULSORY_SUBJECT_CANNOT_BE_DEACTIVATED'; end if;
 select to_jsonb(o) into v_old from public.school_subject_offerings o where school_id=p_school_id and academic_year_id=p_academic_year_id and system_subject_id=p_system_subject_id;
 insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level,retired_at,activated_by,activated_at,is_demo_data)
 values(p_school_id,p_academic_year_id,p_system_subject_id,v_subject.programme,v_subject.subject_code,'SYSTEM_CATALOGUE',case when p_active then 'ACTIVE' else 'INACTIVE' end,v_subject.subject_level,case when p_active then null else now() end,case when p_active then v_actor.id else null end,case when p_active then now() else null end,false)
 on conflict(school_id,academic_year_id,system_subject_id) do update set status=excluded.status,retired_at=excluded.retired_at,activated_by=excluded.activated_by,activated_at=excluded.activated_at,is_demo_data=false,updated_at=now()
 returning id into v_id;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,old_value,new_value)
 values(v_actor.auth_user_id,v_actor.full_name,'SCHOOL_ADMIN',case when p_active then 'SCHOOL_SUBJECT_ACTIVATED' else 'SCHOOL_SUBJECT_DEACTIVATED' end,'school_subject_offering',v_id::text,v_old,jsonb_build_object('school_id',p_school_id,'academic_year_id',p_academic_year_id,'system_subject_id',p_system_subject_id,'active',p_active,'reason',trim(p_reason)));
 return v_id;
end
$$;
revoke all on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) to authenticated;

;
