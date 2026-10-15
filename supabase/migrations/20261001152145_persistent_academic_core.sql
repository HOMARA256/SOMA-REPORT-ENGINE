-- Persistent Academic Core: integrity, audit ownership and connected class setup.
alter table public.academic_classes add column if not exists class_teacher_user_id uuid references public.users(id);
alter table public.academic_classes add column if not exists created_by uuid references public.users(id);
alter table public.academic_classes add column if not exists updated_by uuid references public.users(id);
alter table public.academic_classes add column if not exists capacity integer check(capacity is null or capacity>0);
alter table public.class_streams add column if not exists academic_year_id uuid references public.academic_years(id);
alter table public.class_streams add column if not exists capacity integer check(capacity is null or capacity>0);
alter table public.class_streams add column if not exists updated_at timestamptz not null default now();
alter table public.class_streams add column if not exists created_by uuid references public.users(id);
alter table public.class_streams add column if not exists updated_by uuid references public.users(id);
alter table public.class_subject_offerings add column if not exists term_id uuid references public.terms(id);
alter table public.class_subject_offerings add column if not exists created_by uuid references public.users(id);
alter table public.class_subject_offerings add column if not exists updated_by uuid references public.users(id);
alter table public.school_subject_offerings add column if not exists activated_by uuid references public.users(id);
alter table public.school_subject_offerings add column if not exists activated_at timestamptz;
alter table public.teacher_allocations add column if not exists allocation_role text not null default 'PRIMARY_SUBJECT_TEACHER';
alter table public.teacher_allocations add column if not exists effective_from date not null default current_date;
alter table public.teacher_allocations add column if not exists effective_to date;
alter table public.teacher_allocations add column if not exists created_by uuid references public.users(id);

create unique index if not exists academic_classes_school_year_name_uq on public.academic_classes(school_id,academic_year_id,lower(class_name));
create unique index if not exists class_streams_class_name_uq on public.class_streams(class_id,lower(stream_name));
create unique index if not exists learner_active_year_uq on public.learner_class_enrolments(learner_id,academic_year_id) where status='ACTIVE' and effective_to is null;
create unique index if not exists school_subject_active_uq on public.school_subject_offerings(school_id,academic_year_id,system_subject_id) where status='ACTIVE';
create unique index if not exists primary_teacher_allocation_uq on public.teacher_allocations(school_id,term_id,class_subject_offering_id,coalesce(stream_id,'00000000-0000-0000-0000-000000000000'::uuid)) where status='ACTIVE' and allocation_role='PRIMARY_SUBJECT_TEACHER';

create or replace function public.create_academic_class(p_school_id uuid,p_academic_year_id uuid,p_programme text,p_level integer,p_class_name text,p_status text,p_capacity integer default null,p_class_teacher_user_id uuid default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_id uuid;
begin
 v_actor:=public.current_app_user_id();
 if not public.is_school_admin_for(p_school_id) then raise exception 'School Administrator permission required'; end if;
 if not exists(select 1 from public.academic_years where id=p_academic_year_id and school_id=p_school_id) then raise exception 'Academic year is outside this school'; end if;
 if p_class_teacher_user_id is not null and not exists(select 1 from public.school_memberships where school_id=p_school_id and user_id=p_class_teacher_user_id and status='ACTIVE') then raise exception 'Class teacher must be an active member of this school'; end if;
 insert into public.academic_classes(school_id,academic_year_id,programme,class_name,level,status,capacity,class_teacher_user_id,created_by,updated_by)
 values(p_school_id,p_academic_year_id,p_programme::public.subject_programme,trim(p_class_name),p_level,p_status::public.offering_status,p_capacity,p_class_teacher_user_id,v_actor,v_actor) returning id into v_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value) values(v_actor::text,'SCHOOL_ADMIN','ACADEMIC_CLASS_CREATED','academic_class',v_id::text,jsonb_build_object('school_id',p_school_id,'academic_year_id',p_academic_year_id,'class_name',trim(p_class_name)));
 return v_id;
end $$;

create or replace function public.create_class_stream(p_class_id uuid,p_stream_name text,p_capacity integer default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_class public.academic_classes; v_actor uuid; v_id uuid;
begin
 select * into v_class from public.academic_classes where id=p_class_id;
 if v_class.id is null or not public.is_school_admin_for(v_class.school_id) then raise exception 'Class unavailable'; end if;
 v_actor:=public.current_app_user_id();
 insert into public.class_streams(school_id,class_id,academic_year_id,stream_name,status,capacity,created_by,updated_by) values(v_class.school_id,v_class.id,v_class.academic_year_id,trim(p_stream_name),'ACTIVE',p_capacity,v_actor,v_actor) returning id into v_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value) values(v_actor::text,'SCHOOL_ADMIN','CLASS_STREAM_CREATED','class_stream',v_id::text,jsonb_build_object('class_id',p_class_id,'stream_name',trim(p_stream_name)));
 return v_id;
end $$;

create or replace function public.get_school_class_setup(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
select jsonb_build_object(
 'academicYears',coalesce((select jsonb_agg(to_jsonb(y) order by y.starts_on desc) from public.academic_years y where y.school_id=p_school_id),'[]'::jsonb),
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'academicYearId',c.academic_year_id,'name',c.class_name,'programme',c.programme,'level',c.level,'status',c.status,'capacity',c.capacity,'classTeacherUserId',c.class_teacher_user_id,'streams',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name,'status',s.status,'capacity',s.capacity) order by s.stream_name),'[]'::jsonb) from public.class_streams s where s.class_id=c.id),'learnerCount',(select count(*) from public.learner_class_enrolments e where e.class_id=c.id and e.status='ACTIVE' and e.effective_to is null),'subjects',(select coalesce(jsonb_agg(distinct jsonb_build_object('id',so.id,'code',coalesce(so.school_subject_code,ss.subject_code),'name',coalesce(so.display_name_override,ss.subject_name),'compulsory',ss.is_compulsory,'status',so.status)),'[]'::jsonb) from public.class_subject_offerings co join public.school_subject_offerings so on so.id=co.school_subject_offering_id left join public.system_subjects ss on ss.id=so.system_subject_id where co.class_id=c.id and co.status='ACTIVE')) order by c.level,c.class_name) from public.academic_classes c where c.school_id=p_school_id),'[]'::jsonb),
 'activatedSubjects',coalesce((select jsonb_agg(jsonb_build_object('id',so.id,'academicYearId',so.academic_year_id,'code',coalesce(so.school_subject_code,ss.subject_code),'name',coalesce(so.display_name_override,ss.subject_name),'programme',so.programme,'compulsory',ss.is_compulsory,'paperCount',(select count(*) from public.system_subject_papers sp where sp.system_subject_id=ss.id and sp.is_active)) order by ss.subject_name) from public.school_subject_offerings so join public.system_subjects ss on ss.id=so.system_subject_id where so.school_id=p_school_id and so.status='ACTIVE'),'[]'::jsonb),
 'staff',coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',u.full_name,'role',r.code) order by u.full_name) from public.school_memberships m join public.users u on u.id=m.user_id join public.roles r on r.id=m.role_id where m.school_id=p_school_id and m.status='ACTIVE'),'[]'::jsonb)
) where public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
$$;

revoke all on function public.create_academic_class(uuid,uuid,text,integer,text,text,integer,uuid),public.create_class_stream(uuid,text,integer),public.get_school_class_setup(uuid) from public,anon;
grant execute on function public.create_academic_class(uuid,uuid,text,integer,text,text,integer,uuid),public.create_class_stream(uuid,text,integer),public.get_school_class_setup(uuid) to authenticated;

;
