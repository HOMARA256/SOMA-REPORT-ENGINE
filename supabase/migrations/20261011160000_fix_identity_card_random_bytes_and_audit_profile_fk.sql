begin;

-- Pgcrypto may live in Supabase's extensions schema, outside older function
-- search paths. Include both supported extension locations for secure tokens.
alter function public.issue_school_identity_cards(uuid,text,uuid[],date)
  set search_path = public, auth, extensions, pg_temp;
alter function public.start_public_admission_application(uuid,smallint,jsonb,jsonb)
  set search_path = public, auth, extensions, pg_temp;
alter function public.save_public_admission_draft(text,text,smallint,jsonb,jsonb)
  set search_path = public, auth, extensions, pg_temp;
alter function public.save_school_admission_draft(uuid,uuid,uuid,smallint,jsonb,jsonb)
  set search_path = public, auth, extensions, pg_temp;

-- Older RPCs pass public.users.id to audit_logs.user_id, while that column
-- references user_profiles.id (the Auth identity). Normalize app-user IDs at
-- the audit boundary; retain events with a NULL actor only when no linked
-- profile exists, rather than aborting the tenant operation on the FK.
create or replace function public.normalize_audit_log_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid;
begin
  if new.user_id is null or exists (
    select 1 from public.user_profiles profile where profile.id::text = new.user_id::text
  ) then
    return new;
  end if;

  select app_user.auth_user_id into v_auth_user_id
  from public.users app_user
  where app_user.id::text = new.user_id::text;

  if v_auth_user_id is null or not exists (
    select 1 from public.user_profiles profile
    where profile.id::text = v_auth_user_id::text
  ) then
    new.user_id := null;
  else
    new.user_id := v_auth_user_id::text;
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_normalize_profile_identity on public.audit_logs;
create trigger audit_logs_normalize_profile_identity
before insert or update of user_id on public.audit_logs
for each row execute function public.normalize_audit_log_profile_identity();

revoke all on function public.normalize_audit_log_profile_identity() from public, anon, authenticated;
notify pgrst, 'reload schema';

commit;
