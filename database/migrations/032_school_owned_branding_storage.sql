-- School-owned public branding assets. Upload/delete remains tenant restricted.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('school-branding','school-branding',true,2097152,array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "school members upload own branding" on storage.objects
for insert to authenticated with check(
  bucket_id='school-branding' and exists(
    select 1 from public.school_memberships membership
    join public.users app_user on app_user.id=membership.user_id
    join public.roles role on role.id=membership.role_id
    where app_user.auth_user_id=auth.uid() and membership.status='ACTIVE'
      and role.code='SCHOOL_ADMIN' and membership.school_id::text=(storage.foldername(name))[1]
  )
);
create policy "school admins update own branding" on storage.objects
for update to authenticated using(
  bucket_id='school-branding' and exists(
    select 1 from public.school_memberships membership join public.users app_user on app_user.id=membership.user_id
    join public.roles role on role.id=membership.role_id
    where app_user.auth_user_id=auth.uid() and membership.status='ACTIVE' and role.code='SCHOOL_ADMIN'
      and membership.school_id::text=(storage.foldername(name))[1]
  )
) with check(
  bucket_id='school-branding' and exists(
    select 1 from public.school_memberships membership join public.users app_user on app_user.id=membership.user_id
    join public.roles role on role.id=membership.role_id
    where app_user.auth_user_id=auth.uid() and membership.status='ACTIVE' and role.code='SCHOOL_ADMIN'
      and membership.school_id::text=(storage.foldername(name))[1]
  )
);
create policy "school admins delete own branding" on storage.objects
for delete to authenticated using(
  bucket_id='school-branding' and exists(
    select 1 from public.school_memberships membership join public.users app_user on app_user.id=membership.user_id
    join public.roles role on role.id=membership.role_id
    where app_user.auth_user_id=auth.uid() and membership.status='ACTIVE' and role.code='SCHOOL_ADMIN'
      and membership.school_id::text=(storage.foldername(name))[1]
  )
);
