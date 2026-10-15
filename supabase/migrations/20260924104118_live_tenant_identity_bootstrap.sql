-- OURSCHOOL Stage 17
-- Connect the first confirmed Supabase Auth identities to platform and school roles.

do $$
declare
  platform_auth_id uuid;
  school_auth_id uuid;
  school_record_id uuid;
  platform_user_id uuid;
  school_user_id uuid;
  school_admin_role_id uuid;
  academic_year_record_id uuid;
  plan_record_id uuid;
begin
  select id into platform_auth_id
  from auth.users
  where lower(email) = 'omarawilliam83@gmail.com';

  select id into school_auth_id
  from auth.users
  where lower(email) = 'omarawilling@gmail.com';

  if platform_auth_id is null then
    raise exception 'Confirmed Auth account omarawilliam83@gmail.com is required';
  end if;

  if school_auth_id is null then
    raise exception 'Confirmed Auth account omarawilling@gmail.com is required';
  end if;

  insert into public.schools (
    school_code,
    official_name,
    short_name,
    email,
    address,
    country,
    school_level,
    school_type,
    is_active
  ) values (
    'OSS-DEMO',
    'OURSCHOOL Demonstration Secondary School',
    'OURSCHOOL Demonstration',
    'omarawilling@gmail.com',
    'Kampala, Uganda',
    'Uganda',
    'Secondary',
    'O-Level and A-Level',
    true
  )
  on conflict (school_code) do update set
    official_name = excluded.official_name,
    short_name = excluded.short_name,
    email = excluded.email,
    is_active = true,
    updated_at = now()
  returning id into school_record_id;

  insert into public.users (email, full_name, auth_user_id, is_active)
  values ('omarawilliam83@gmail.com', 'Omara William', platform_auth_id, true)
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    is_active = true,
    updated_at = now()
  returning id into platform_user_id;

  insert into public.users (email, full_name, auth_user_id, is_active)
  values ('omarawilling@gmail.com', 'Omara William', school_auth_id, true)
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = excluded.full_name,
    is_active = true,
    updated_at = now()
  returning id into school_user_id;

  insert into public.platform_admins (
    auth_user_id,
    full_name,
    email,
    mfa_required,
    is_active
  ) values (
    platform_auth_id,
    'Omara William',
    'omarawilliam83@gmail.com',
    false,
    true
  )
  on conflict (auth_user_id) do update set
    full_name = excluded.full_name,
    email = excluded.email,
    is_active = true,
    updated_at = now();

  select id into school_admin_role_id
  from public.roles
  where code = 'SCHOOL_ADMIN';

  insert into public.school_memberships (school_id, user_id, role_id, status)
  values (school_record_id, school_user_id, school_admin_role_id, 'ACTIVE')
  on conflict (school_id, user_id) do update set
    role_id = excluded.role_id,
    status = 'ACTIVE',
    updated_at = now();

  insert into public.academic_years (
    school_id,
    name,
    starts_on,
    ends_on,
    status
  ) values (
    school_record_id,
    '2026',
    date '2026-01-01',
    date '2026-12-31',
    'ACTIVE'
  )
  on conflict (school_id, name) do update set
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = 'ACTIVE',
    updated_at = now()
  returning id into academic_year_record_id;

  insert into public.terms (
    school_id,
    academic_year_id,
    term_number,
    name,
    starts_on,
    ends_on,
    lifecycle_status
  ) values
    (school_record_id, academic_year_record_id, 1, 'Term I', date '2026-02-01', date '2026-05-03', 'CLOSED'),
    (school_record_id, academic_year_record_id, 2, 'Term II', date '2026-05-25', date '2026-08-30', 'MARKS_OPEN'),
    (school_record_id, academic_year_record_id, 3, 'Term III', date '2026-09-14', date '2026-12-05', 'DRAFT')
  on conflict (school_id, academic_year_id, term_number) do update set
    name = excluded.name,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    lifecycle_status = excluded.lifecycle_status,
    updated_at = now();

  insert into public.subscription_plans (
    code,
    name,
    price_minor,
    currency,
    billing_period_months,
    storage_limit_bytes,
    learner_limit,
    user_limit,
    entitlements,
    status
  ) values (
    'OURSCHOOL_TERMLY',
    'OURSCHOOL Termly Subscription',
    45000000,
    'UGX',
    4,
    5368709120,
    null,
    null,
    '{"o_level": true, "a_level": true, "report_cards": true, "imports": true}'::jsonb,
    'ACTIVE'
  )
  on conflict (code) do update set
    name = excluded.name,
    price_minor = excluded.price_minor,
    status = 'ACTIVE',
    updated_at = now()
  returning id into plan_record_id;

  if not exists (
    select 1
    from public.school_subscriptions
    where school_id = school_record_id
      and status in ('TRIAL', 'ACTIVE', 'PAYMENT_DUE', 'SUSPENDED')
  ) then
    insert into public.school_subscriptions (
      school_id,
      plan_id,
      status,
      starts_on,
      expires_on,
      grace_period_days,
      renewal_status
    ) values (
      school_record_id,
      plan_record_id,
      'ACTIVE',
      date '2026-05-25',
      date '2026-08-30',
      14,
      'MANUAL'
    );
  end if;
end;
$$;

create policy "platform administrators can view their own profile"
on public.platform_admins for select to authenticated
using (auth_user_id = auth.uid() and is_active);

create policy "platform administrators can view schools"
on public.schools for select to authenticated
using (
  exists (
    select 1
    from public.platform_admins administrator
    where administrator.auth_user_id = auth.uid()
      and administrator.is_active
  )
);


;
