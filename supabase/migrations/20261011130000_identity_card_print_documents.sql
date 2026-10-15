begin;

-- A retry with the same request key returns the original batch, never another set of cards.
create table if not exists public.school_identity_card_issue_requests (
  school_id uuid not null references public.schools(id) on delete restrict,
  request_key uuid not null,
  request_payload jsonb not null,
  result jsonb,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(school_id,request_key)
);
alter table public.school_identity_card_issue_requests enable row level security;
revoke all on public.school_identity_card_issue_requests from public,anon,authenticated;

create or replace function public.issue_school_identity_cards_once(
  p_school_id uuid,p_person_type text,p_person_ids uuid[],p_expiry_date date,p_request_key uuid
)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_payload jsonb; v_saved public.school_identity_card_issue_requests%rowtype; v_result jsonb;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if p_request_key is null or cardinality(coalesce(p_person_ids,'{}'))=0 then raise exception 'ID_CARD_REQUEST_KEY_REQUIRED'; end if;
  v_payload:=jsonb_build_object('type',p_person_type,'personIds',(select jsonb_agg(person_id order by person_id)
    from (select distinct unnest(p_person_ids) as person_id) people),'expiryDate',p_expiry_date);
  insert into public.school_identity_card_issue_requests(school_id,request_key,request_payload,created_by)
  values(p_school_id,p_request_key,v_payload,public.current_app_user_id()) on conflict do nothing;
  select * into v_saved from public.school_identity_card_issue_requests
  where school_id=p_school_id and request_key=p_request_key for update;
  if v_saved.request_payload<>v_payload then raise exception 'ID_CARD_REQUEST_KEY_REUSED'; end if;
  if v_saved.result is not null then return v_saved.result; end if;
  v_result:=public.issue_school_identity_cards(p_school_id,p_person_type,
    array(select distinct unnest(p_person_ids)),p_expiry_date);
  update public.school_identity_card_issue_requests set result=v_result
    where school_id=p_school_id and request_key=p_request_key;
  return v_result;
end;
$$;
revoke all on function public.issue_school_identity_cards(uuid,text,uuid[],date) from public,anon,authenticated;
revoke all on function public.issue_school_identity_cards_once(uuid,text,uuid[],date,uuid) from public,anon;
grant execute on function public.issue_school_identity_cards_once(uuid,text,uuid[],date,uuid) to authenticated;

create table if not exists public.school_identity_card_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  card_id uuid not null unique,
  document_id uuid not null unique references public.document_library_items(id) on delete restrict,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (card_id,school_id) references public.identity_cards(id,school_id) on delete restrict
);
create index if not exists school_identity_card_documents_school_idx on public.school_identity_card_documents(school_id,created_at desc);
create or replace function public.prevent_registered_identity_card_document_changes()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.school_identity_card_documents where document_id=old.id) then
    raise exception 'REGISTERED_CARD_PRINT_DOCUMENT_IMMUTABLE';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists registered_identity_card_document_immutable on public.document_library_items;
create trigger registered_identity_card_document_immutable
before update or delete on public.document_library_items for each row
execute function public.prevent_registered_identity_card_document_changes();
alter table public.school_identity_card_documents enable row level security;
drop policy if exists school_identity_card_documents_read on public.school_identity_card_documents;
create policy school_identity_card_documents_read on public.school_identity_card_documents
  for select to authenticated using (public.is_school_admin_for(school_id));
revoke all on public.school_identity_card_documents from public,anon,authenticated;
grant select on public.school_identity_card_documents to authenticated;

create or replace function public.register_school_identity_card_document(p_school_id uuid,p_card_id uuid,p_document_id uuid)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_card public.identity_cards%rowtype; v_document public.document_library_items%rowtype;
  v_existing public.school_identity_card_documents%rowtype; v_id uuid; v_actor uuid;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_card from public.identity_cards where id=p_card_id and school_id=p_school_id for update;
  if v_card.id is null or v_card.snapshot_captured_at is null then raise exception 'CARD_PRINT_SNAPSHOT_REQUIRED'; end if;
  select * into v_existing from public.school_identity_card_documents where card_id=p_card_id;
  if v_existing.id is not null then
    if v_existing.document_id<>p_document_id then raise exception 'CARD_PRINT_DOCUMENT_ALREADY_REGISTERED'; end if;
    return jsonb_build_object('id',v_existing.id,'documentId',v_existing.document_id);
  end if;
  select * into v_document from public.document_library_items where id=p_document_id and school_id=p_school_id;
  if v_document.id is null or v_document.status<>'ACTIVE' or v_document.category<>'INTERNAL_ADMINISTRATION'
    or v_document.linked_entity_type<>v_card.person_type
    or v_document.linked_entity_id is distinct from coalesce(v_card.learner_id,v_card.staff_id)
    or v_document.mime_type<>'application/pdf' then raise exception 'CARD_PRINT_DOCUMENT_INVALID'; end if;
  v_actor:=public.current_app_user_id();
  insert into public.school_identity_card_documents(school_id,card_id,document_id,created_by)
  values(p_school_id,p_card_id,p_document_id,v_actor) returning id into v_id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'IDENTITY_CARD_PRINT_PDF_REGISTERED','identity_card',p_card_id::text,
    jsonb_build_object('document_id',p_document_id)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
  return jsonb_build_object('id',v_id,'documentId',p_document_id);
end;
$$;

create or replace function public.get_school_identity_card_document(p_school_id uuid,p_card_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return (select jsonb_build_object('id',cd.id,'documentId',d.id,'storagePath',d.storage_path,
    'fileName',d.file_name,'createdAt',cd.created_at,'personType',c.person_type)
    from public.school_identity_card_documents cd
    join public.identity_cards c on c.id=cd.card_id and c.school_id=cd.school_id
    join public.document_library_items d on d.id=cd.document_id and d.school_id=cd.school_id
    where cd.card_id=p_card_id and cd.school_id=p_school_id);
end;
$$;

create or replace function public.record_school_identity_card_download(p_school_id uuid,p_card_id uuid)
returns void language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_actor uuid;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if not exists(select 1 from public.school_identity_card_documents where school_id=p_school_id and card_id=p_card_id)
    then raise exception 'CARD_PRINT_DOCUMENT_NOT_FOUND'; end if;
  v_actor:=public.current_app_user_id();
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'IDENTITY_CARD_PRINT_PDF_DOWNLOADED','identity_card',p_card_id::text,
    jsonb_build_object('card_id',p_card_id)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
end;
$$;

create or replace function public.is_registered_identity_card_document_path(p_path text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.school_identity_card_documents cd
    join public.document_library_items d on d.id=cd.document_id and d.school_id=cd.school_id
    where d.storage_path=p_path);
$$;
revoke all on function public.is_registered_identity_card_document_path(text) from public,anon;
grant execute on function public.is_registered_identity_card_document_path(text) to authenticated;

create or replace function public.can_view_school_identity_card_document_path(p_path text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(select 1 from public.school_identity_card_documents cd
    join public.document_library_items d on d.id=cd.document_id and d.school_id=cd.school_id
    where d.storage_path=p_path and public.is_school_admin_for(cd.school_id));
$$;
revoke all on function public.can_view_school_identity_card_document_path(text) from public,anon;
grant execute on function public.can_view_school_identity_card_document_path(text) to authenticated;
drop policy if exists school_identity_card_document_archive_read on storage.objects;
create policy school_identity_card_document_archive_read on storage.objects
  for select to authenticated using(bucket_id='school-document-library'
    and public.can_view_school_identity_card_document_path(name));
drop policy if exists school_identity_card_document_immutable_update on storage.objects;
create policy school_identity_card_document_immutable_update on storage.objects as restrictive
  for update to authenticated using(not public.is_registered_identity_card_document_path(name))
  with check(not public.is_registered_identity_card_document_path(name));
drop policy if exists school_identity_card_document_immutable_delete on storage.objects;
create policy school_identity_card_document_immutable_delete on storage.objects as restrictive
  for delete to authenticated using(not public.is_registered_identity_card_document_path(name));

revoke all on function public.register_school_identity_card_document(uuid,uuid,uuid),
  public.get_school_identity_card_document(uuid,uuid),public.record_school_identity_card_download(uuid,uuid)
  from public,anon;
grant execute on function public.register_school_identity_card_document(uuid,uuid,uuid),
  public.get_school_identity_card_document(uuid,uuid),public.record_school_identity_card_download(uuid,uuid)
  to authenticated;

commit;
