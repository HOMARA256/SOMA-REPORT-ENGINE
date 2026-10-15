-- Populate the existing platform school directory with tenant-scoped live
-- usage and billing data. Access remains limited to active platform admins.
create or replace function public.get_platform_school_directory()
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_platform_administrator() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.official_name,
    'code', s.school_code,
    'location', coalesce(a.formatted_address, a.address_line, s.district, 'Uganda'),
    'contact', coalesce(s.email, ''),
    'phone', coalesce(s.telephone, ''),
    'email', coalesce(s.email, ''),
    'programmes', case coalesce(ap.academic_levels, s.school_level, 'UCE_ONLY')
      when 'BOTH' then jsonb_build_array('O-Level', 'A-Level')
      when 'UACE_ONLY' then jsonb_build_array('A-Level')
      else jsonb_build_array('O-Level') end,
    'registeredAt', to_char(s.created_at, 'DD Mon YYYY'),
    'activationDate', to_char(s.created_at, 'YYYY-MM-DD'),
    'accountStatus', case
      when s.lifecycle_status = 'SUSPENDED' then 'SUSPENDED'
      when s.lifecycle_status = 'ARCHIVED' then 'ARCHIVED'
      when s.lifecycle_status in ('DRAFT', 'INVITATION_SENT', 'INVITATION_EXPIRED', 'INVITATION_REVOKED', 'SCHOOL_ADMIN_ACTIVATED', 'SETUP_IN_PROGRESS', 'PENDING_PLATFORM_APPROVAL') then 'PENDING'
      when su.status = 'TRIAL' then 'TRIAL'
      when su.status = 'PAYMENT_DUE' then 'PAYMENT_DUE'
      when not s.is_active then 'PAYMENT_DUE'
      else 'ACTIVE' end,
    'plan', coalesce((select plan.name from public.subscription_plans plan where plan.id = su.plan_id), 'Unassigned'),
    'subscriptionStatus', coalesce(su.status, 'PAYMENT_DUE'),
    'subscriptionStart', coalesce(su.starts_on::text, ''),
    'subscriptionExpiry', coalesce(su.expires_on::text, ''),
    'gracePeriodDays', coalesce(su.grace_period_days, 0),
    'onboardingStatus', coalesce(os.status, 'REGISTERED'),
    'currentAcademicYear', coalesce(ap.current_academic_year, extract(year from current_date)::integer),
    'currentTerm', case coalesce(ap.current_term, 'TERM_I') when 'TERM_II' then 'Term II' when 'TERM_III' then 'Term III' else 'Term I' end,
    'admin', jsonb_build_object(
      'name', coalesce(i.full_name, 'Not assigned'), 'email', coalesce(i.email, ''),
      'telephone', coalesce(i.telephone, ''),
      'status', case when i.status = 'ACCEPTED' then 'ACTIVE' else 'INVITED' end,
      'invitation', coalesce(i.status, 'PENDING'), 'invitationSentAt', i.sent_at,
      'acceptedAt', i.accepted_at, 'lastLogin', 'Never', 'mfa', coalesce(i.requires_mfa, false)),
    'lastActivity', to_char(s.updated_at, 'DD Mon YYYY HH24:MI'),
    'storageUsedGb', 0,
    'storageLimitGb', 10,
    'health', 'HEALTHY',
    'usage', jsonb_build_object(
      'users', (select count(distinct m.user_id)::integer from public.school_memberships m join public.users u on u.id = m.user_id where m.school_id = s.id and m.status = 'ACTIVE' and u.is_active and u.account_status = 'ACTIVE'),
      'learners', (select count(*)::integer from public.learners l where l.school_id = s.id and l.status = 'ACTIVE'),
      'staff', (select count(distinct m.user_id)::integer from public.school_memberships m join public.users u on u.id = m.user_id join public.roles r on r.id = m.role_id where m.school_id = s.id and m.status = 'ACTIVE' and u.is_active and u.account_status = 'ACTIVE' and r.code not in ('LEARNER', 'PARENT_GUARDIAN', 'PLATFORM_ADMIN')),
      'classes', (select count(*)::integer from public.academic_classes c where c.school_id = s.id),
      'reports', (select count(*)::integer from public.report_snapshots rs where rs.school_id = s.id),
      'imports', (select count(*)::integer from public.system_jobs j where j.school_id = s.id and j.job_type ilike '%IMPORT%'),
      'exports', (select count(*)::integer from public.system_jobs j where j.school_id = s.id and j.job_type ilike '%EXPORT%'),
      'supportRequests', (select count(*)::integer from public.school_platform_conversations c where c.school_id = s.id and c.status in ('OPEN', 'AWAITING_PLATFORM', 'AWAITING_SCHOOL'))),
    'features', jsonb_build_object(
      'academic', jsonb_build_object('label', 'Academic Management', 'plan', true, 'override', 'DEFAULT'),
      'reports', jsonb_build_object('label', 'Report Cards', 'plan', true, 'override', 'DEFAULT'),
      'imports', jsonb_build_object('label', 'Import / Export', 'plan', true, 'override', 'DEFAULT')),
    'payments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'reference', p.reference, 'date', coalesce(p.paid_at, p.created_at)::date::text,
      'amount', p.amount_minor, 'currency', p.currency, 'method', p.method,
      'transactionReference', coalesce(p.transaction_reference, ''), 'status', p.status,
      'academicYear', coalesce(p.academic_year, extract(year from coalesce(p.paid_at, p.created_at))::integer),
      'term', case coalesce(p.academic_term, 'TERM_I') when 'TERM_II' then 'Term II' when 'TERM_III' then 'Term III' else 'Term I' end
    ) order by p.created_at desc) from public.subscription_payments p where p.school_id = s.id), '[]'::jsonb),
    'billingPeriods', coalesce((select jsonb_agg(jsonb_build_object(
      'id', sp.id, 'academicYear', sp.academic_year,
      'term', case sp.academic_term when 'TERM_II' then 'Term II' when 'TERM_III' then 'Term III' else 'Term I' end,
      'planCode', pl.code, 'amount', sp.amount_snapshot, 'currency', sp.currency,
      'billingPeriod', sp.billing_period, 'startDate', sp.starts_on, 'dueDate', sp.due_on,
      'endDate', sp.ends_on, 'status', sp.status,
      'amountPaid', coalesce((select sum(pay.amount_minor) from public.subscription_payments pay where pay.subscription_period_id = sp.id and pay.status = 'CONFIRMED'), 0),
      'paymentDate', (select max(pay.paid_at)::date from public.subscription_payments pay where pay.subscription_period_id = sp.id and pay.status = 'CONFIRMED'),
      'transactionReference', (select (array_agg(pay.transaction_reference order by pay.confirmed_at desc nulls last))[1] from public.subscription_payments pay where pay.subscription_period_id = sp.id and pay.status = 'CONFIRMED')
    ) order by sp.academic_year desc, sp.academic_term) from public.subscription_periods sp join public.subscription_plans pl on pl.id = sp.plan_id where sp.school_id = s.id), '[]'::jsonb)
  ) order by s.created_at desc), '[]'::jsonb)
  into result
  from public.schools s
  left join lateral (select * from public.school_addresses x where x.school_id = s.id order by x.created_at desc limit 1) a on true
  left join lateral (select * from public.school_admin_invitations x where x.school_id = s.id order by x.created_at desc limit 1) i on true
  left join lateral (select * from public.school_subscriptions x where x.school_id = s.id order by x.created_at desc limit 1) su on true
  left join public.school_academic_profiles ap on ap.school_id = s.id
  left join public.school_onboarding_states os on os.school_id = s.id;

  return result;
end;
$$;

revoke all on function public.get_platform_school_directory() from public, anon;
grant execute on function public.get_platform_school_directory() to authenticated, service_role;

create or replace function public.get_platform_recent_activity(p_limit integer default 20)
returns jsonb
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  if not public.is_platform_administrator() then
    raise exception 'PLATFORM_ADMIN_REQUIRED';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', event.id,
    'schoolId', coalesce(event.school_id::text, ''),
    'action', event.action,
    'detail', coalesce(nullif(event.reason, ''), event.target_type || coalesce(' · ' || event.target_id, '')),
    'timestamp', event.created_at
  ) order by event.created_at desc), '[]'::jsonb)
  into result
  from (
    select log.id, log.school_id, log.action, log.target_type, log.target_id, log.reason, log.created_at
    from public.platform_audit_logs log
    order by log.created_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) event;

  return result;
end;
$$;

revoke all on function public.get_platform_recent_activity(integer) from public, anon;
grant execute on function public.get_platform_recent_activity(integer) to authenticated, service_role;
notify pgrst, 'reload schema';
