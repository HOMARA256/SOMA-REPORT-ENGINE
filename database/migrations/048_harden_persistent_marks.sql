-- Keep marks behind the authorised RPC boundary and cover new foreign keys.
revoke select on public.academic_mark_records from authenticated;
create index if not exists academic_mark_records_year_idx on public.academic_mark_records(academic_year_id);
create index if not exists academic_mark_records_entered_by_idx on public.academic_mark_records(entered_by);
create index if not exists academic_mark_records_offering_school_idx on public.academic_mark_records(class_subject_offering_id,school_id);
create index if not exists academic_mark_records_learner_school_idx on public.academic_mark_records(learner_id,school_id);
