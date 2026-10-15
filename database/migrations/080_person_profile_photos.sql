begin;

-- Profile photos are optional, school-scoped for learners, and private by
-- default. User portraits belong to the authenticated identity; learner
-- portraits belong to one school learner record.
alter table public.users add column if not exists profile_photo_path text;
alter table public.platform_admins add column if not exists profile_photo_path text;
alter table public.learners add column if not exists profile_photo_path text;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_user_profile_photo(p_auth_user_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select p_auth_user_id = auth.uid()
    or public.is_active_platform_admin()
    or exists (
      select 1
      from public.users target_user
      join public.school_memberships membership on membership.user_id = target_user.id
      where target_user.auth_user_id = p_auth_user_id
        and public.is_school_admin_for(membership.school_id)
    );
$$;

create or replace function public.can_view_learner_profile_photo(p_school_id uuid, p_learner_id uuid)
returns boolean
language sql stable security definer
set search_path = public, auth, pg_temp
as $$
  select public.is_active_platform_admin()
    or public.is_school_admin_for(p_school_id)
    or exists (
      select 1
      from public.learners learner
      join public.learner_class_enrolments enrolment
        on enrolment.learner_id = learner.id and enrolment.school_id = learner.school_id
      join public.teacher_allocations allocation
        on allocation.school_id = enrolment.school_id
        and allocation.academic_year_id = enrolment.academic_year_id
      join public.class_subject_offerings offering
        on offering.id = allocation.class_subject_offering_id
        and offering.school_id = allocation.school_id
        and offering.class_id = enrolment.class_id
        and (offering.stream_id is null or offering.stream_id = enrolment.stream_id)
        and (allocation.stream_id is null or allocation.stream_id = enrolment.stream_id)
      join public.school_memberships teacher_membership
        on teacher_membership.school_id = allocation.school_id
        and teacher_membership.user_id = allocation.teacher_id
        and teacher_membership.status = 'ACTIVE'
      join public.roles teacher_role
        on teacher_role.id = teacher_membership.role_id and teacher_role.code = 'TEACHER'
      where learner.id = p_learner_id and learner.school_id = p_school_id
        and enrolment.status = 'ACTIVE' and enrolment.effective_to is null
        and allocation.teacher_id = public.current_app_user_id()
        and allocation.status = 'ACTIVE'
    );
$$;

revoke all on function public.can_view_user_profile_photo(uuid) from public, anon;
revoke all on function public.can_view_learner_profile_photo(uuid, uuid) from public, anon;
grant execute on function public.can_view_user_profile_photo(uuid) to authenticated;
grant execute on function public.can_view_learner_profile_photo(uuid, uuid) to authenticated;

create or replace function public.set_my_profile_photo_path(p_photo_path text)
returns text
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_saved_path text;
begin
  if v_auth_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_photo_path is not null and p_photo_path !~ (
    '^users/' || v_auth_user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ) then raise exception 'PROFILE_PHOTO_PATH_INVALID'; end if;

  update public.platform_admins
    set profile_photo_path = p_photo_path, updated_at = now()
    where auth_user_id = v_auth_user_id and is_active
    returning profile_photo_path into v_saved_path;
  if found then return v_saved_path; end if;

  update public.users
    set profile_photo_path = p_photo_path, updated_at = now()
    where auth_user_id = v_auth_user_id and is_active and account_status = 'ACTIVE'
    returning profile_photo_path into v_saved_path;
  if not found then raise exception 'ACTIVE_PROFILE_REQUIRED'; end if;
  return v_saved_path;
end;
$$;

create or replace function public.set_school_learner_profile_photo_path(
  p_school_id uuid, p_learner_id uuid, p_photo_path text
)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_saved_id uuid;
begin
  if not public.is_school_admin_for(p_school_id) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  if p_photo_path is not null and p_photo_path !~ (
    '^schools/' || p_school_id::text || '/learners/' || p_learner_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ) then raise exception 'LEARNER_PHOTO_PATH_INVALID'; end if;
  update public.learners set profile_photo_path = p_photo_path, updated_at = now()
  where id = p_learner_id and school_id = p_school_id returning id into v_saved_id;
  if not found then raise exception 'LEARNER_NOT_FOUND'; end if;
  return v_saved_id;
end;
$$;

revoke all on function public.set_my_profile_photo_path(text) from public, anon;
revoke all on function public.set_school_learner_profile_photo_path(uuid, uuid, text) from public, anon;
grant execute on function public.set_my_profile_photo_path(text) to authenticated;
grant execute on function public.set_school_learner_profile_photo_path(uuid, uuid, text) to authenticated;

drop policy if exists "profile photos read authorized person" on storage.objects;
create policy "profile photos read authorized person" on storage.objects
for select to authenticated using (
  bucket_id = 'profile-photos'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case
    when (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_view_user_profile_photo(((storage.foldername(name))[2])::uuid)
    when (storage.foldername(name))[1] = 'schools'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'learners'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_view_learner_profile_photo(((storage.foldername(name))[2])::uuid, ((storage.foldername(name))[4])::uuid)
    else false
  end
);

drop policy if exists "profile owners and school admins upload photos" on storage.objects;
create policy "profile owners and school admins upload photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'profile-photos'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case
    when (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then auth.uid() = ((storage.foldername(name))[2])::uuid
    when (storage.foldername(name))[1] = 'schools'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'learners'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
    else false
  end
);

drop policy if exists "profile owners and school admins update photos" on storage.objects;
create policy "profile owners and school admins update photos" on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-photos'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case
    when (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then auth.uid() = ((storage.foldername(name))[2])::uuid
    when (storage.foldername(name))[1] = 'schools'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'learners'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
    else false
  end
)
with check (
  bucket_id = 'profile-photos'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case
    when (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then auth.uid() = ((storage.foldername(name))[2])::uuid
    when (storage.foldername(name))[1] = 'schools'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'learners'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
    else false
  end
);

drop policy if exists "profile owners and school admins delete photos" on storage.objects;
create policy "profile owners and school admins delete photos" on storage.objects
for delete to authenticated using (
  bucket_id = 'profile-photos'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and case
    when (storage.foldername(name))[1] = 'users'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then auth.uid() = ((storage.foldername(name))[2])::uuid
    when (storage.foldername(name))[1] = 'schools'
      and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (storage.foldername(name))[3] = 'learners'
      and (storage.foldername(name))[4] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[2])::uuid)
    else false
  end
);

comment on column public.users.profile_photo_path is 'Private profile photo path in the profile-photos bucket. Optional; never a public URL.';
comment on column public.platform_admins.profile_photo_path is 'Private profile photo path in the profile-photos bucket. Optional; never a public URL.';
comment on column public.learners.profile_photo_path is 'Private school-scoped profile photo path in the profile-photos bucket. Optional; never a public URL.';

-- Keep the persistent school staff directory tenant-scoped while exposing
-- only the private object path (the client must request an authorised signed URL).
create or replace function public.get_school_teacher_directory(p_school_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  if p_school_id is null or not (
    public.is_school_admin_for(p_school_id) or public.is_active_platform_admin()
  ) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', app_user.id, 'name', app_user.full_name, 'email', app_user.email,
      'department', app_user.department, 'accountStatus', app_user.account_status,
      'membershipStatus', membership.status, 'authLinked', app_user.auth_user_id is not null,
      'profilePhotoPath', app_user.profile_photo_path,
      'eligible', app_user.is_active and app_user.account_status = 'ACTIVE'
        and app_user.auth_user_id is not null and membership.status = 'ACTIVE'
        and exists (select 1 from public.roles r where r.id = membership.role_id and r.code = 'TEACHER'),
      'allocationCount', (select count(*) from public.teacher_allocations a
        where a.school_id = p_school_id and a.teacher_id = app_user.id and a.status = 'ACTIVE'),
      'hasActiveAllocation', exists (select 1 from public.teacher_allocations a
        where a.school_id = p_school_id and a.teacher_id = app_user.id and a.status = 'ACTIVE')
    ) order by app_user.full_name)
    from public.school_memberships membership
    join public.users app_user on app_user.id = membership.user_id
    join public.roles role_record on role_record.id = membership.role_id
    where membership.school_id = p_school_id and role_record.code = 'TEACHER'
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_school_teacher_directory(uuid) from public, anon;
grant execute on function public.get_school_teacher_directory(uuid) to authenticated;

-- Add paths to the existing learner register without duplicating its complex
-- assignment/history visibility rules. The renamed base remains inaccessible
-- to API roles; this wrapper only enriches the already-authorised result.
alter function public.get_school_learner_register(uuid) rename to get_school_learner_register_without_photo;
revoke all on function public.get_school_learner_register_without_photo(uuid) from public, anon, authenticated;
create or replace function public.get_school_learner_register(p_school_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  v_register jsonb;
  v_learners jsonb;
begin
  if p_school_id is null or not (
    public.is_active_school_member(p_school_id) or public.is_active_platform_admin()
  ) then raise exception 'ACTIVE_SCHOOL_MEMBERSHIP_REQUIRED'; end if;
  v_register := public.get_school_learner_register_without_photo(p_school_id);
  select coalesce(jsonb_agg(item.value || jsonb_build_object('profilePhotoPath', learner.profile_photo_path)
    order by item.ordinality), '[]'::jsonb)
  into v_learners
  from jsonb_array_elements(coalesce(v_register->'learners', '[]'::jsonb)) with ordinality as item(value, ordinality)
  join public.learners learner on learner.id = (item.value->>'id')::uuid and learner.school_id = p_school_id;
  return jsonb_set(v_register, '{learners}', coalesce(v_learners, '[]'::jsonb), true);
end;
$$;
revoke all on function public.get_school_learner_register(uuid) from public, anon;
grant execute on function public.get_school_learner_register(uuid) to authenticated;

commit;
