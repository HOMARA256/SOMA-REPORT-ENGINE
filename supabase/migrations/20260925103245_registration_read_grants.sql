-- RLS remains authoritative; authenticated clients need SELECT grants for connected school pages.
grant select on public.school_academic_profiles,public.school_billing_schedules to authenticated;

;
