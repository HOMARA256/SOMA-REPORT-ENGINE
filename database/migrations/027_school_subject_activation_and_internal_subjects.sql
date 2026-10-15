-- Tenant-scoped school subject activation and school-owned internal subjects.

alter table public.system_subjects
  add column if not exists catalogue_owner varchar(80) not null default 'OURSCHOOL',
  add column if not exists catalogue_version varchar(120) not null default 'National Subject Catalogue 2026',
  add column if not exists default_activation boolean not null default false,
  add column if not exists school_selectable boolean not null default true;
update public.system_subjects set default_activation=is_compulsory,school_selectable=not is_compulsory where is_official;

create table if not exists public.school_subject_papers(
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id) on delete restrict,
  school_subject_offering_id uuid not null, paper_code varchar(50), paper_name varchar(180) not null,
  paper_type varchar(60) not null, status public.offering_status not null default 'ACTIVE',
  created_by uuid not null references public.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(school_subject_offering_id,school_id) references public.school_subject_offerings(id,school_id) on delete restrict,
  unique(school_subject_offering_id,paper_code,paper_type)
);
alter table public.school_subject_papers enable row level security;
create policy "school members read internal papers" on public.school_subject_papers for select to authenticated using(public.is_active_school_member(school_id));
revoke all privileges on public.school_subject_papers from anon;
revoke insert,update,delete,truncate,references,trigger on public.school_subject_papers from authenticated;

create or replace function public.is_school_admin_for(target_school_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
 select exists(select 1 from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id
 where m.school_id=target_school_id and m.status='ACTIVE' and u.auth_user_id=auth.uid() and u.is_active and r.code='SCHOOL_ADMIN');
$$;
revoke all on function public.is_school_admin_for(uuid) from public,anon;
grant execute on function public.is_school_admin_for(uuid) to authenticated;

create or replace function public.set_school_catalogue_subject_status(p_school_id uuid,p_academic_year_id uuid,p_system_subject_id uuid,p_active boolean,p_reason text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_subject public.system_subjects%rowtype; v_id uuid; v_old jsonb;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'REASON_REQUIRED'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
 select * into v_subject from public.system_subjects where id=p_system_subject_id and is_active;
 if v_subject.id is null then raise exception 'CATALOGUE_SUBJECT_NOT_AVAILABLE'; end if;
 if not p_active and v_subject.is_compulsory then raise exception 'COMPULSORY_SUBJECT_CANNOT_BE_DEACTIVATED'; end if;
 select to_jsonb(o) into v_old from public.school_subject_offerings o where school_id=p_school_id and academic_year_id=p_academic_year_id and system_subject_id=p_system_subject_id;
 insert into public.school_subject_offerings(school_id,academic_year_id,system_subject_id,programme,school_subject_code,subject_source,status,subject_level,retired_at)
 values(p_school_id,p_academic_year_id,p_system_subject_id,v_subject.programme,v_subject.subject_code,'SYSTEM_CATALOGUE',case when p_active then 'ACTIVE' else 'INACTIVE' end,v_subject.subject_level,case when p_active then null else now() end)
 on conflict(school_id,academic_year_id,system_subject_id) do update set status=excluded.status,retired_at=excluded.retired_at,updated_at=now()
 returning id into v_id;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,old_value,new_value)
 select u.id,u.full_name,'SCHOOL_ADMIN',case when p_active then 'SCHOOL_SUBJECT_ACTIVATED' else 'SCHOOL_SUBJECT_DEACTIVATED' end,'school_subject_offering',v_id::text,v_old,
 jsonb_build_object('school_id',p_school_id,'system_subject_id',p_system_subject_id,'active',p_active,'reason',trim(p_reason)) from public.users u where u.auth_user_id=auth.uid();
 return v_id;
end $$;
revoke all on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) from public,anon;
grant execute on function public.set_school_catalogue_subject_status(uuid,uuid,uuid,boolean,text) to authenticated;

create or replace function public.create_school_internal_subject(p_school_id uuid,p_academic_year_id uuid,p_programme public.subject_programme,p_code text,p_name text,p_learning_area text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'ACADEMIC_YEAR_NOT_OWNED'; end if;
 if nullif(trim(p_name),'') is null then raise exception 'SUBJECT_NAME_REQUIRED'; end if;
 insert into public.school_subject_offerings(school_id,academic_year_id,programme,school_subject_code,display_name_override,subject_source,status,subject_level)
 values(p_school_id,p_academic_year_id,p_programme,nullif(upper(trim(p_code)),''),trim(p_name),'SCHOOL_DEFINED','ACTIVE',case when p_programme='O_LEVEL' then 'ORDINARY' else 'OTHER' end)
 returning id into v_id;
 insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
 select u.id,u.full_name,'SCHOOL_ADMIN','SCHOOL_INTERNAL_SUBJECT_CREATED','school_subject_offering',v_id::text,
 jsonb_build_object('school_id',p_school_id,'name',trim(p_name),'learning_area',trim(p_learning_area),'catalogue_owner',(select official_name from public.schools where id=p_school_id)) from public.users u where u.auth_user_id=auth.uid();
 return v_id;
end $$;
revoke all on function public.create_school_internal_subject(uuid,uuid,public.subject_programme,text,text,text) from public,anon;
grant execute on function public.create_school_internal_subject(uuid,uuid,public.subject_programme,text,text,text) to authenticated;

