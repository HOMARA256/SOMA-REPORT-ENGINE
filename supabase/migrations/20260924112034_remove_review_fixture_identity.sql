update public.schools
set school_code = 'SCHOOL-PENDING',
    official_name = 'School profile not configured',
    short_name = 'School profile pending',
    address = null,
    school_type = 'Not configured',
    updated_at = now()
where school_code = 'OSS-DEMO';;
