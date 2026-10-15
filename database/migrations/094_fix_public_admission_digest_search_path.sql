begin;

-- Public admission RPCs hash application access tokens with pgcrypto. The
-- extension is installed outside their original restricted search_path on
-- Supabase, so explicitly include its schema without exposing new privileges.
alter function public.start_public_admission_application(uuid,smallint,jsonb,jsonb)
  set search_path = public, auth, extensions, pg_temp;
alter function public.save_public_admission_draft(text,text,smallint,jsonb,jsonb)
  set search_path = public, auth, extensions, pg_temp;
alter function public.record_public_admission_document(text,text,text,text,text,text,bigint)
  set search_path = public, auth, extensions, pg_temp;
alter function public.submit_public_admission_application(text,text)
  set search_path = public, auth, extensions, pg_temp;
alter function public.get_public_admission_application_status(text,text)
  set search_path = public, auth, extensions, pg_temp;
alter function public.withdraw_public_admission_application(text,text)
  set search_path = public, auth, extensions, pg_temp;

notify pgrst, 'reload schema';
commit;
