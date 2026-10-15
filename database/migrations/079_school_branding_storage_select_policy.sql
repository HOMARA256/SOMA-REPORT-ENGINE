begin;

-- Storage upload returns the inserted object row. Supabase also requires
-- SELECT permission when an upload overwrites an object with upsert=true.
-- Keep that metadata access private to active administrators of the school
-- encoded in the object's first path segment.
drop policy if exists "school admins read own branding metadata" on storage.objects;
create policy "school admins read own branding metadata" on storage.objects
for select to authenticated using (
  bucket_id = 'school-branding'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.is_school_admin_for(((storage.foldername(name))[1])::uuid)
    else false
  end
);

commit;
