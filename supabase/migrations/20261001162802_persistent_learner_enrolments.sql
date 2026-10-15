begin;
alter table public.learners add column if not exists gender text;
alter table public.learners add column if not exists date_of_birth date;
alter table public.learners add column if not exists photo_url text;
alter table public.learners add column if not exists guardian_name text;
alter table public.learners add column if not exists guardian_phone text;
alter table public.learners add column if not exists created_by uuid references public.users(id);
alter table public.learners add column if not exists updated_by uuid references public.users(id);
alter table public.learner_class_enrolments add column if not exists updated_at timestamptz not null default now();
alter table public.learner_class_enrolments add column if not exists created_by uuid references public.users(id);
alter table public.learner_class_enrolments add column if not exists updated_by uuid references public.users(id);
create unique index if not exists learner_active_year_uq on public.learner_class_enrolments(learner_id,academic_year_id) where status='ACTIVE' and effective_to is null;
alter table public.learner_class_enrolments drop constraint if exists learner_class_scope_key;
alter table public.learner_class_enrolments drop constraint if exists learner_class_history_date_uq;
alter table public.learner_class_enrolments add constraint learner_class_history_date_uq unique(learner_id,academic_year_id,effective_from);

create or replace function public.create_learner_with_enrolment(p_school_id uuid,p_academic_year_id uuid,p_class_id uuid,p_stream_id uuid,p_admission_number text,p_first_name text,p_other_name text,p_last_name text,p_gender text,p_date_of_birth date,p_admission_date date,p_guardian_name text default null,p_guardian_phone text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid; v_class public.academic_classes; v_learner_id uuid; v_enrolment_id uuid;
begin
 if not public.is_school_admin_for(p_school_id) then raise exception 'School Administrator permission required'; end if;
 select * into v_class from public.academic_classes where id=p_class_id and school_id=p_school_id and academic_year_id=p_academic_year_id and status='ACTIVE';
 if v_class.id is null then raise exception 'Select an active class in this school and academic year'; end if;
 if p_stream_id is not null and not exists(select 1 from public.class_streams where id=p_stream_id and class_id=p_class_id and school_id=p_school_id and academic_year_id=p_academic_year_id and status='ACTIVE') then raise exception 'Stream does not belong to the selected class'; end if;
 if exists(select 1 from public.class_streams where class_id=p_class_id and status='ACTIVE') and p_stream_id is null then raise exception 'Select a stream for this class'; end if;
 v_actor:=public.current_app_user_id();
 insert into public.learners(school_id,admission_number,first_name,other_name,last_name,gender,date_of_birth,guardian_name,guardian_phone,status,created_by,updated_by)
 values(p_school_id,trim(p_admission_number),trim(p_first_name),nullif(trim(p_other_name),''),trim(p_last_name),p_gender,p_date_of_birth,nullif(trim(p_guardian_name),''),nullif(trim(p_guardian_phone),''),'ACTIVE',v_actor,v_actor) returning id into v_learner_id;
 insert into public.learner_class_enrolments(school_id,learner_id,academic_year_id,class_id,stream_id,status,effective_from,created_by,updated_by)
 values(p_school_id,v_learner_id,p_academic_year_id,p_class_id,p_stream_id,'ACTIVE',p_admission_date,v_actor,v_actor) returning id into v_enrolment_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value) values(v_actor::text,'SCHOOL_ADMIN','LEARNER_ENROLLED','learner_enrolment',v_enrolment_id::text,jsonb_build_object('learner_id',v_learner_id,'class_id',p_class_id,'stream_id',p_stream_id,'academic_year_id',p_academic_year_id));
 return v_learner_id;
end $$;

create or replace function public.transfer_learner_enrolment(p_learner_id uuid,p_class_id uuid,p_stream_id uuid,p_effective_from date,p_reason text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_learner public.learners; v_class public.academic_classes; v_old public.learner_class_enrolments; v_actor uuid; v_id uuid;
begin
 select * into v_learner from public.learners where id=p_learner_id;
 if v_learner.id is null or not public.is_school_admin_for(v_learner.school_id) then raise exception 'Learner unavailable'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'A transfer reason is required'; end if;
 select * into v_old from public.learner_class_enrolments where learner_id=p_learner_id and status='ACTIVE' and effective_to is null order by effective_from desc limit 1 for update;
 if v_old.id is null then raise exception 'Learner has no active enrolment'; end if;
 select * into v_class from public.academic_classes where id=p_class_id and school_id=v_learner.school_id and academic_year_id=v_old.academic_year_id and status='ACTIVE';
 if v_class.id is null then raise exception 'Destination class is outside the active enrolment year'; end if;
 if p_stream_id is not null and not exists(select 1 from public.class_streams where id=p_stream_id and class_id=p_class_id and school_id=v_learner.school_id and academic_year_id=v_old.academic_year_id and status='ACTIVE') then raise exception 'Destination stream does not belong to the selected class'; end if;
 if exists(select 1 from public.class_streams where class_id=p_class_id and status='ACTIVE') and p_stream_id is null then raise exception 'Select a destination stream'; end if;
 if p_effective_from<v_old.effective_from then raise exception 'Transfer date cannot precede the current enrolment'; end if;
 v_actor:=public.current_app_user_id();
 update public.learner_class_enrolments set status='TRANSFERRED',effective_to=greatest(effective_from,p_effective_from-1),updated_at=now(),updated_by=v_actor where id=v_old.id;
 insert into public.learner_class_enrolments(school_id,learner_id,academic_year_id,class_id,stream_id,status,effective_from,created_by,updated_by)
 values(v_learner.school_id,v_learner.id,v_old.academic_year_id,v_class.id,p_stream_id,'ACTIVE',p_effective_from,v_actor,v_actor) returning id into v_id;
 insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value) values(v_actor::text,'SCHOOL_ADMIN','LEARNER_TRANSFERRED','learner_enrolment',v_id::text,jsonb_build_object('enrolment_id',v_old.id,'class_id',v_old.class_id,'stream_id',v_old.stream_id),jsonb_build_object('class_id',v_class.id,'stream_id',p_stream_id,'effective_from',p_effective_from,'reason',trim(p_reason)));
 return v_id;
end $$;

create or replace function public.get_school_learner_register(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object(
  'academicYears',coalesce((select jsonb_agg(jsonb_build_object('id',ay.id,'name',ay.name,'status',ay.status) order by ay.starts_on desc) from public.academic_years ay where ay.school_id=p_school_id),'[]'::jsonb),
  'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'academicYearId',c.academic_year_id,'name',c.class_name,'programme',c.programme,'level',c.level,'status',c.status,'streams',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.stream_name,'status',s.status) order by s.stream_name),'[]'::jsonb) from public.class_streams s where s.class_id=c.id)) order by c.level,c.class_name) from public.academic_classes c where c.school_id=p_school_id),'[]'::jsonb),
  'learners',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'admissionNumber',l.admission_number,'firstName',l.first_name,'otherName',l.other_name,'lastName',l.last_name,'gender',l.gender,'dateOfBirth',l.date_of_birth,'status',l.status,'guardianName',l.guardian_name,'guardianPhone',l.guardian_phone,'enrolment',case when e.id is null then null else jsonb_build_object('id',e.id,'academicYearId',e.academic_year_id,'classId',e.class_id,'className',c.class_name,'programme',c.programme,'streamId',e.stream_id,'streamName',s.stream_name,'status',e.status,'effectiveFrom',e.effective_from) end,'history',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'className',hc.class_name,'streamName',hs.stream_name,'status',h.status,'effectiveFrom',h.effective_from,'effectiveTo',h.effective_to) order by h.effective_from desc),'[]'::jsonb) from public.learner_class_enrolments h join public.academic_classes hc on hc.id=h.class_id left join public.class_streams hs on hs.id=h.stream_id where h.learner_id=l.id)) order by l.last_name,l.first_name) from public.learners l left join lateral(select * from public.learner_class_enrolments x where x.learner_id=l.id and x.status='ACTIVE' and x.effective_to is null order by x.effective_from desc limit 1)e on true left join public.academic_classes c on c.id=e.class_id left join public.class_streams s on s.id=e.stream_id where l.school_id=p_school_id),'[]'::jsonb)
 ) where public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
$$;
revoke all on function public.create_learner_with_enrolment(uuid,uuid,uuid,uuid,text,text,text,text,text,date,date,text,text),public.transfer_learner_enrolment(uuid,uuid,uuid,date,text),public.get_school_learner_register(uuid) from public,anon;
grant execute on function public.create_learner_with_enrolment(uuid,uuid,uuid,uuid,text,text,text,text,text,date,date,text,text),public.transfer_learner_enrolment(uuid,uuid,uuid,date,text),public.get_school_learner_register(uuid) to authenticated;
commit;;
