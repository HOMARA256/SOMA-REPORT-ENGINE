begin;

-- School-level Headteacher authorisation is distinct from a teacher's ID-holder signature.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('school-authorized-signatures','school-authorized-signatures',false,1048576,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.school_headteacher_signatures (
  school_id uuid primary key references public.schools(id) on delete restrict,
  headteacher_name text not null check(length(trim(headteacher_name)) between 3 and 160),
  signature_path text not null unique,
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
alter table public.school_headteacher_signatures enable row level security;
revoke all on public.school_headteacher_signatures from public,anon,authenticated;

create table if not exists public.school_headteacher_signature_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  old_name text, new_name text,
  old_path text, new_path text,
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
alter table public.school_headteacher_signature_events enable row level security;
revoke all on public.school_headteacher_signature_events from public,anon,authenticated;

drop policy if exists "school members read headteacher signatures" on storage.objects;
create policy "school members read headteacher signatures" on storage.objects
for select to authenticated using (
  bucket_id='school-authorized-signatures'
  and (storage.foldername(name))[1]='schools'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3]='headteacher'
  and public.is_active_school_member(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "school admins upload headteacher signatures" on storage.objects;
create policy "school admins upload headteacher signatures" on storage.objects
for insert to authenticated with check (
  bucket_id='school-authorized-signatures'
  and (storage.foldername(name))[1]='schools'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3]='headteacher'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
  and public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
);

create or replace function public.set_school_headteacher_signature(p_school_id uuid,p_name text,p_signature_path text)
returns jsonb language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_previous public.school_headteacher_signatures%rowtype; v_name text:=trim(coalesce(p_name,''));
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if length(v_name) not between 3 and 160 then raise exception 'HEADTEACHER_NAME_INVALID'; end if;
  if p_signature_path is null or p_signature_path !~* (
    '^schools/'||p_school_id::text||'/headteacher/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
  ) then raise exception 'HEADTEACHER_SIGNATURE_PATH_INVALID'; end if;
  if not exists(select 1 from storage.objects where bucket_id='school-authorized-signatures' and name=p_signature_path)
    then raise exception 'HEADTEACHER_SIGNATURE_FILE_NOT_FOUND'; end if;
  select * into v_previous from public.school_headteacher_signatures where school_id=p_school_id for update;
  if v_previous.signature_path is not distinct from p_signature_path and v_previous.headteacher_name is not distinct from v_name then
    return jsonb_build_object('name',v_name,'signaturePath',p_signature_path);
  end if;
  insert into public.school_headteacher_signatures(school_id,headteacher_name,signature_path,updated_by)
    values(p_school_id,v_name,p_signature_path,public.current_app_user_id())
    on conflict(school_id) do update set headteacher_name=excluded.headteacher_name,signature_path=excluded.signature_path,
      updated_by=excluded.updated_by,updated_at=now();
  insert into public.school_headteacher_signature_events(school_id,old_name,new_name,old_path,new_path,changed_by)
    values(p_school_id,v_previous.headteacher_name,v_name,v_previous.signature_path,p_signature_path,public.current_app_user_id());
  return jsonb_build_object('name',v_name,'signaturePath',p_signature_path);
end;
$$;
revoke all on function public.set_school_headteacher_signature(uuid,text,text) from public,anon;
grant execute on function public.set_school_headteacher_signature(uuid,text,text) to authenticated;

create or replace function public.get_school_headteacher_signature(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select case when public.is_active_school_member(p_school_id) then
    (select jsonb_build_object('name',headteacher_name,'signaturePath',signature_path)
      from public.school_headteacher_signatures where school_id=p_school_id)
  else null end;
$$;
revoke all on function public.get_school_headteacher_signature(uuid) from public,anon;
grant execute on function public.get_school_headteacher_signature(uuid) to authenticated;

alter table public.identity_cards
  add column if not exists printed_headteacher_name text,
  add column if not exists printed_headteacher_signature_path text;
create or replace function public.capture_school_identity_card_headteacher_signature()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  select headteacher_name,signature_path into new.printed_headteacher_name,new.printed_headteacher_signature_path
    from public.school_headteacher_signatures where school_id=new.school_id;
  return new;
end;
$$;
drop trigger if exists capture_school_identity_card_headteacher_signature_before_insert on public.identity_cards;
create trigger capture_school_identity_card_headteacher_signature_before_insert
before insert on public.identity_cards for each row execute function public.capture_school_identity_card_headteacher_signature();

create or replace function public.get_school_identity_card_print_snapshot(p_school_id uuid,p_card_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth,pg_temp as $$
declare v_card public.identity_cards%rowtype;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  select * into v_card from public.identity_cards where id=p_card_id and school_id=p_school_id;
  if v_card.id is null then raise exception 'SCHOOL_ID_CARD_NOT_FOUND'; end if;
  return jsonb_build_object(
    'schoolName',v_card.printed_school_name,'schoolLogo',v_card.printed_school_logo,
    'fullName',v_card.printed_person_name,'identifier',v_card.printed_identifier,
    'role',v_card.printed_role,'department',v_card.printed_department,
    'photoPath',v_card.printed_photo_path,'signaturePath',v_card.printed_signature_path,
    'headteacherName',v_card.printed_headteacher_name,'headteacherSignaturePath',v_card.printed_headteacher_signature_path,
    'className',(select class_name from public.academic_classes where id=v_card.printed_class_id and school_id=p_school_id),
    'streamName',(select stream_name from public.class_streams where id=v_card.printed_stream_id and school_id=p_school_id),
    'academicYear',(select name from public.academic_years where id=v_card.printed_academic_year_id and school_id=p_school_id),
    'needsReissue',coalesce((public.verify_school_identity_card(v_card.secure_verification_token)->>'cardStatus')='REISSUE_REQUIRED',false)
  );
end;
$$;
revoke all on function public.get_school_identity_card_print_snapshot(uuid,uuid) from public,anon;
grant execute on function public.get_school_identity_card_print_snapshot(uuid,uuid) to authenticated;

commit;
