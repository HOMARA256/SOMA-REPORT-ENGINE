begin;

-- ID-holder signatures are separate from report-authorisation signatures.
-- Objects stay private; only an active school administrator may attach one
-- to an active Teacher membership in that school.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('teacher-id-signatures','teacher-id-signatures',false,1048576,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table if not exists public.school_teacher_id_signatures (
  school_id uuid not null references public.schools(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  signature_path text not null,
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key(school_id,teacher_id),
  unique(signature_path)
);
alter table public.school_teacher_id_signatures enable row level security;
revoke all on public.school_teacher_id_signatures from public,anon,authenticated;

create table if not exists public.school_teacher_id_signature_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  teacher_id uuid not null references public.users(id) on delete restrict,
  old_path text,
  new_path text,
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default now()
);
alter table public.school_teacher_id_signature_events enable row level security;
revoke all on public.school_teacher_id_signature_events from public,anon,authenticated;

create or replace function public.is_school_teacher_id_signature_target(p_school_id uuid,p_teacher_id uuid)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select public.is_school_admin_for(p_school_id) and exists (
    select 1 from public.users u
    join public.school_memberships m on m.user_id=u.id and m.school_id=p_school_id and m.status='ACTIVE'
    join public.roles r on r.id=m.role_id and r.code='TEACHER'
    where u.id=p_teacher_id and u.is_active and u.account_status='ACTIVE'
  );
$$;
revoke all on function public.is_school_teacher_id_signature_target(uuid,uuid) from public,anon;
grant execute on function public.is_school_teacher_id_signature_target(uuid,uuid) to authenticated;

drop policy if exists "school admin reads teacher id signatures" on storage.objects;
create policy "school admin reads teacher id signatures" on storage.objects
for select to authenticated using (
  bucket_id='teacher-id-signatures'
  and (storage.foldername(name))[1]='schools'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3]='teachers'
  and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
);
drop policy if exists "school admin uploads teacher id signatures" on storage.objects;
create policy "school admin uploads teacher id signatures" on storage.objects
for insert to authenticated with check (
  bucket_id='teacher-id-signatures'
  and (storage.foldername(name))[1]='schools'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (storage.foldername(name))[3]='teachers'
  and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
  and public.is_school_teacher_id_signature_target(((storage.foldername(name))[2])::uuid,((storage.foldername(name))[4])::uuid)
);

create or replace function public.set_school_teacher_id_signature(p_school_id uuid,p_teacher_id uuid,p_signature_path text)
returns text language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_old_path text; v_actor uuid;
begin
  if not public.is_school_teacher_id_signature_target(p_school_id,p_teacher_id) then raise exception 'SCHOOL_TEACHER_ID_SIGNATURE_FORBIDDEN'; end if;
  if p_signature_path is not null and p_signature_path !~* (
    '^schools/'||p_school_id::text||'/teachers/'||p_teacher_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
  ) then raise exception 'TEACHER_ID_SIGNATURE_PATH_INVALID'; end if;
  if p_signature_path is not null and not exists (
    select 1 from storage.objects where bucket_id='teacher-id-signatures' and name=p_signature_path
  ) then raise exception 'TEACHER_ID_SIGNATURE_FILE_NOT_FOUND'; end if;
  v_actor:=public.current_app_user_id();
  select signature_path into v_old_path from public.school_teacher_id_signatures
    where school_id=p_school_id and teacher_id=p_teacher_id for update;
  if v_old_path is not distinct from p_signature_path then return p_signature_path; end if;
  if p_signature_path is null then
    delete from public.school_teacher_id_signatures where school_id=p_school_id and teacher_id=p_teacher_id;
  else
    insert into public.school_teacher_id_signatures(school_id,teacher_id,signature_path,updated_by)
    values(p_school_id,p_teacher_id,p_signature_path)
    on conflict(school_id,teacher_id) do update set signature_path=excluded.signature_path,updated_by=excluded.updated_by,updated_at=now();
  end if;
  insert into public.school_teacher_id_signature_events(school_id,teacher_id,old_path,new_path,changed_by)
    values(p_school_id,p_teacher_id,v_old_path,p_signature_path,v_actor);
  return p_signature_path;
end;
$$;
revoke all on function public.set_school_teacher_id_signature(uuid,uuid,text) from public,anon;
grant execute on function public.set_school_teacher_id_signature(uuid,uuid,text) to authenticated;

create or replace function public.get_school_teacher_id_signatures(p_school_id uuid)
returns jsonb language sql stable security definer set search_path=public,auth,pg_temp as $$
  select case when public.is_school_admin_for(p_school_id) then
    coalesce((select jsonb_agg(jsonb_build_object('teacherId',s.teacher_id,'signaturePath',s.signature_path))
      from public.school_teacher_id_signatures s where s.school_id=p_school_id),'[]'::jsonb)
  else '[]'::jsonb end;
$$;
revoke all on function public.get_school_teacher_id_signatures(uuid) from public,anon;
grant execute on function public.get_school_teacher_id_signatures(uuid) to authenticated;

alter table public.identity_cards add column if not exists printed_signature_path text;
create or replace function public.capture_school_identity_card_teacher_signature()
returns trigger language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if new.person_type='STAFF' then
    select signature_path into new.printed_signature_path from public.school_teacher_id_signatures
      where school_id=new.school_id and teacher_id=new.staff_id;
  end if;
  return new;
end;
$$;
drop trigger if exists capture_school_identity_card_teacher_signature_before_insert on public.identity_cards;
create trigger capture_school_identity_card_teacher_signature_before_insert
before insert on public.identity_cards for each row execute function public.capture_school_identity_card_teacher_signature();

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
