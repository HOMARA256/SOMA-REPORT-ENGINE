-- Use only after the 20261009160000 CLI connection dropped after SQL commit.
-- The full object and final-statement checks prevent marking an incomplete
-- migration as applied. This one-time repair also applies migration 085.
begin;

do $$
begin
  if (select count(*) from pg_class where relnamespace = 'public'::regnamespace
      and relname in ('admission_openings','admission_applications','admission_application_documents',
        'learner_guardians','admission_applicant_notifications','school_admission_sequences',
        'school_admission_officer_role_history','identity_cards','document_library_items')) <> 9
    or (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
      and proname in ('can_manage_admissions','can_view_school_document','get_public_admission_openings',
        'start_public_admission_application','save_public_admission_draft','record_public_admission_document',
        'submit_public_admission_application','get_public_admission_application_status',
        'withdraw_public_admission_application','get_school_admissions_workspace',
        'set_school_admissions_officer','save_school_admission_opening','review_school_admission_application',
        'verify_school_admission_document','admit_school_applicant_as_learner','get_school_id_card_register',
        'issue_school_identity_cards','set_school_identity_card_status','verify_school_identity_card',
        'get_school_document_library','save_school_document_library_item',
        'archive_school_document_library_item')) <> 22
    or (select count(*) from pg_policies where
      (schemaname = 'public' and tablename in ('admission_openings','admission_applications',
        'admission_application_documents','learner_guardians','admission_applicant_notifications',
        'school_admission_officer_role_history','identity_cards','document_library_items'))
      or (schemaname = 'storage' and tablename = 'objects' and
        (policyname like 'school_admission_documents_%' or policyname like 'school_document_library_%'))) <> 14
    or (select count(*) from storage.buckets where id in
      ('school-admission-documents','school-document-library') and public = false) <> 2
    or to_regprocedure('public.admit_school_applicant_as_learner(uuid,uuid,uuid,uuid,date,uuid[],uuid[],uuid,uuid)') is null
    or obj_description('public.document_library_items'::regclass) <>
      'Private school documents with role-aware metadata and Storage access.'
    or not has_function_privilege('anon',
      'public.start_public_admission_application(uuid,smallint,jsonb,jsonb)','EXECUTE')
  then
    raise exception 'Admissions migration is incomplete; history was not changed';
  end if;
end;
$$;

alter table public.school_admission_sequences enable row level security;
revoke all on public.school_admission_sequences from public, anon, authenticated;
comment on table public.school_admission_sequences is
  'Private per-school admission counters, accessible only through authorized conversion.';

insert into supabase_migrations.schema_migrations(version,name)
values ('20261009160000','online_admissions_digital_ids_document_library')
on conflict(version) do nothing;
insert into supabase_migrations.schema_migrations(version,name)
values ('20261009170000','lock_school_admission_sequences')
on conflict(version) do nothing;

commit;
