begin;

drop policy if exists school_admission_documents_staff_insert on storage.objects;
create policy school_admission_documents_staff_insert on storage.objects
  for insert to authenticated with check(
    bucket_id='school-admission-documents'
    and (storage.foldername(name))[1]='schools'
    and (storage.foldername(name))[3]='admissions'
    and (storage.foldername(name))[5]='documents'
    and exists(select 1 from public.admission_applications a
      where a.school_id=((storage.foldername(name))[2])::uuid
        and a.id=((storage.foldername(name))[4])::uuid
        and public.can_manage_admissions(a.school_id))
  );
drop policy if exists school_admission_documents_unregistered_delete on storage.objects;
create policy school_admission_documents_unregistered_delete on storage.objects
  for delete to authenticated using(
    bucket_id='school-admission-documents'
    and (storage.foldername(name))[1]='schools'
    and (storage.foldername(name))[3]='admissions'
    and exists(select 1 from public.admission_applications a
      where a.school_id=((storage.foldername(name))[2])::uuid
        and a.id=((storage.foldername(name))[4])::uuid
        and public.can_manage_admissions(a.school_id))
    and not exists(select 1 from public.admission_application_documents d where d.storage_path=name)
  );

create or replace function public.record_school_admission_document(
  p_school_id uuid,p_application_id uuid,p_document_type text,p_storage_path text,
  p_file_name text,p_mime_type text,p_file_size bigint
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_actor uuid;
begin
  if not public.can_manage_admissions(p_school_id) then raise exception 'ADMISSIONS_PERMISSION_REQUIRED'; end if;
  if not exists(select 1 from public.admission_applications
    where id=p_application_id and school_id=p_school_id and status not in ('WITHDRAWN','REJECTED','EXPIRED'))
    then raise exception 'ADMISSION_APPLICATION_NOT_AVAILABLE'; end if;
  if nullif(trim(p_document_type),'') is null or length(p_document_type)>80
    or nullif(trim(p_file_name),'') is null or length(p_file_name)>255
    or p_file_size not between 1 and 10485760
    or p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp','text/plain',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    then raise exception 'ADMISSION_DOCUMENT_FIELDS_INVALID'; end if;
  if p_storage_path !~ ('^schools/'||p_school_id::text||'/admissions/'||p_application_id::text||'/documents/[0-9a-f-]{36}$')
    then raise exception 'ADMISSION_DOCUMENT_PATH_INVALID'; end if;
  insert into public.admission_application_documents(
    school_id,admission_application_id,document_type,storage_path,file_name,mime_type,file_size)
  values(p_school_id,p_application_id,trim(p_document_type),p_storage_path,trim(p_file_name),p_mime_type,p_file_size)
  returning id into v_id;
  v_actor:=public.current_app_user_id();
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'SCHOOL_ADMISSION_DOCUMENT_UPLOADED','admission_application_document',v_id::text,
    jsonb_build_object('application_id',p_application_id,'document_type',p_document_type)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
  return v_id;
end;
$$;
revoke all on function public.record_school_admission_document(uuid,uuid,text,text,text,text,bigint) from public,anon;
grant execute on function public.record_school_admission_document(uuid,uuid,text,text,text,text,bigint) to authenticated;

create or replace function public.audit_school_admission_document_review()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor uuid;
begin
  if new.status is distinct from old.status then
    v_actor:=public.current_app_user_id();
    insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
    select v_actor,u.full_name,r.code,'SCHOOL_ADMISSION_DOCUMENT_STATUS_CHANGED',
      'admission_application_document',new.id::text,
      jsonb_build_object('application_id',new.admission_application_id,'from',old.status,'to',new.status)
    from public.users u join public.school_memberships m on m.user_id=u.id
    join public.roles r on r.id=m.role_id
    where u.id=v_actor and m.school_id=new.school_id and m.status='ACTIVE' limit 1;
  end if;
  return new;
end;
$$;
drop trigger if exists audit_school_admission_document_review_after_update on public.admission_application_documents;
create trigger audit_school_admission_document_review_after_update
after update of status on public.admission_application_documents for each row
execute function public.audit_school_admission_document_review();

commit;
