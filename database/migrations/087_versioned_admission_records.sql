begin;

create table if not exists public.school_admission_record_versions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  admission_application_id uuid not null,
  learner_id uuid not null,
  document_id uuid not null unique references public.document_library_items(id) on delete restrict,
  version_number integer not null check(version_number > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (admission_application_id,school_id)
    references public.admission_applications(id,school_id) on delete restrict,
  foreign key (learner_id,school_id)
    references public.learners(id,school_id) on delete restrict,
  unique (school_id,admission_application_id,version_number)
);
create index if not exists school_admission_record_versions_lookup_idx
  on public.school_admission_record_versions(school_id,admission_application_id,version_number desc);
alter table public.school_admission_record_versions enable row level security;
drop policy if exists school_admission_record_versions_read on public.school_admission_record_versions;
create policy school_admission_record_versions_read on public.school_admission_record_versions
  for select to authenticated using (public.can_manage_admissions(school_id));
revoke all on public.school_admission_record_versions from public,anon,authenticated;
grant select on public.school_admission_record_versions to authenticated;

create or replace function public.can_view_school_admission_record_path(p_path text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from public.school_admission_record_versions v
    join public.document_library_items d on d.id=v.document_id and d.school_id=v.school_id
    where d.storage_path=p_path and d.category='LEARNER_ADMISSION'
      and public.can_manage_admissions(v.school_id)
  );
$$;
revoke all on function public.can_view_school_admission_record_path(text) from public,anon;
grant execute on function public.can_view_school_admission_record_path(text) to authenticated;

drop policy if exists school_admission_record_archive_read on storage.objects;
create policy school_admission_record_archive_read on storage.objects
  for select to authenticated using (
    bucket_id='school-document-library'
    and public.can_view_school_admission_record_path(name)
  );

create or replace function public.get_school_admission_records(p_school_id uuid,p_application_id uuid)
returns jsonb language plpgsql stable security definer
set search_path=public,auth,pg_temp as $$
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
    'id',v.id,'version',v.version_number,'documentId',v.document_id,
    'storagePath',d.storage_path,'fileName',d.file_name,
    'createdAt',v.created_at,'createdBy',u.full_name
  ) order by v.version_number desc)
    from public.school_admission_record_versions v
    join public.document_library_items d on d.id=v.document_id and d.school_id=v.school_id
    join public.users u on u.id=v.created_by
    where v.school_id=p_school_id and v.admission_application_id=p_application_id), '[]'::jsonb);
end;
$$;

create or replace function public.register_school_admission_record(
  p_school_id uuid,p_application_id uuid,p_document_id uuid
)
returns jsonb language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_app public.admission_applications%rowtype; v_document public.document_library_items%rowtype;
  v_version integer; v_id uuid; v_actor uuid;
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  select * into v_app from public.admission_applications
  where id=p_application_id and school_id=p_school_id for update;
  if v_app.id is null or v_app.status<>'CONVERTED_TO_LEARNER' or v_app.converted_learner_id is null then
    raise exception 'CONFIRMED_ADMISSION_REQUIRED';
  end if;
  select * into v_document from public.document_library_items
  where id=p_document_id and school_id=p_school_id and status='ACTIVE';
  if v_document.id is null or v_document.category<>'LEARNER_ADMISSION'
    or v_document.linked_entity_type<>'LEARNER'
    or v_document.linked_entity_id<>v_app.converted_learner_id
    or v_document.mime_type<>'application/pdf' then
    raise exception 'ADMISSION_RECORD_DOCUMENT_INVALID';
  end if;
  select id,version_number into v_id,v_version from public.school_admission_record_versions
  where document_id=p_document_id and school_id=p_school_id and admission_application_id=p_application_id;
  if v_id is not null then return jsonb_build_object('id',v_id,'version',v_version); end if;
  select coalesce(max(version_number),0)+1 into v_version
  from public.school_admission_record_versions
  where school_id=p_school_id and admission_application_id=p_application_id;
  v_actor:=public.current_app_user_id();
  insert into public.school_admission_record_versions(
    school_id,admission_application_id,learner_id,document_id,version_number,created_by
  ) values(p_school_id,p_application_id,v_app.converted_learner_id,p_document_id,v_version,v_actor)
  returning id into v_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'ADMISSION_RECORD_GENERATED','school_admission_record',v_id::text,
    jsonb_build_object('application_id',p_application_id,'document_id',p_document_id,'version',v_version)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id
  where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
  return jsonb_build_object('id',v_id,'version',v_version);
end;
$$;

create or replace function public.record_school_admission_record_download(
  p_school_id uuid,p_record_id uuid
)
returns void language plpgsql security definer
set search_path=public,auth,pg_temp as $$
declare v_record public.school_admission_record_versions%rowtype; v_actor uuid;
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  select * into v_record from public.school_admission_record_versions
  where id=p_record_id and school_id=p_school_id;
  if v_record.id is null then raise exception 'ADMISSION_RECORD_NOT_FOUND'; end if;
  v_actor:=public.current_app_user_id();
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'ADMISSION_RECORD_DOWNLOADED','school_admission_record',v_record.id::text,
    jsonb_build_object('application_id',v_record.admission_application_id,'version',v_record.version_number)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id
  where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
end;
$$;

revoke all on function public.get_school_admission_records(uuid,uuid),
  public.register_school_admission_record(uuid,uuid,uuid),
  public.record_school_admission_record_download(uuid,uuid) from public,anon;
grant execute on function public.get_school_admission_records(uuid,uuid),
  public.register_school_admission_record(uuid,uuid,uuid),
  public.record_school_admission_record_download(uuid,uuid) to authenticated;

commit;
