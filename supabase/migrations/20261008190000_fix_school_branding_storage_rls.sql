begin;

-- Storage policy subqueries into tenant tables can be hidden by those tables'
-- own RLS policies. Reuse the established SECURITY DEFINER school-admin guard
-- while still binding the object path to exactly one school tenant.
drop policy if exists "school members upload own branding" on storage.objects;
drop policy if exists "school admins update own branding" on storage.objects;
drop policy if exists "school admins delete own branding" on storage.objects;

create policy "school admins upload own branding" on storage.objects
for insert to authenticated with check (
  bucket_id = 'school-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy "school admins update own branding" on storage.objects
for update to authenticated
using (
  bucket_id = 'school-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[1])::uuid)
    else false
  end
)
with check (
  bucket_id = 'school-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[1])::uuid)
    else false
  end
);

create policy "school admins delete own branding" on storage.objects
for delete to authenticated using (
  bucket_id = 'school-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[1])::uuid)
    else false
  end
);

commit;
