begin;

-- Admission number counters are internal to the SECURITY DEFINER conversion
-- RPC. They must never be exposed directly through the Data API.
alter table public.school_admission_sequences enable row level security;
revoke all on public.school_admission_sequences from public, anon, authenticated;

comment on table public.school_admission_sequences is
  'Private per-school admission counters, accessible only through authorized conversion.';

commit;
