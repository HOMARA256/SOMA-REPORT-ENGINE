-- Connected platform tenant directory. The payload contains operational
-- metadata only and never exposes marks, credentials or private academic data.
create or replace function public.get_platform_school_directory()
returns jsonb
language plpgsql stable security definer
set search_path=public,pg_temp
as $$
declare result jsonb;
begin
  if not public.is_platform_administrator() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',s.id,'name',s.official_name,'code',s.school_code,
    'location',coalesce(a.formatted_address,a.address_line,s.district,'Uganda'),
    'contact',coalesce(s.email,''),'phone',coalesce(s.telephone,''),'email',coalesce(s.email,''),
    'programmes',case coalesce(ap.academic_levels,s.school_level,'UCE_ONLY') when 'BOTH' then jsonb_build_array('O-Level','A-Level') when 'UACE_ONLY' then jsonb_build_array('A-Level') else jsonb_build_array('O-Level') end,
    'registeredAt',to_char(s.created_at,'DD Mon YYYY'),'activationDate',to_char(s.created_at,'YYYY-MM-DD'),
    'accountStatus',case when s.is_active then 'ACTIVE' when su.status='TRIAL' then 'TRIAL' else 'PAYMENT_DUE' end,
    'plan','OURSCHOOL Termly','subscriptionStatus',coalesce(su.status,'PAYMENT_DUE'),
    'subscriptionStart',coalesce(su.starts_on,current_date)::text,'subscriptionExpiry',coalesce(su.expires_on,current_date)::text,
    'gracePeriodDays',coalesce(su.grace_period_days,0),'onboardingStatus',coalesce(os.status,'REGISTERED'),
    'currentAcademicYear',coalesce(ap.current_academic_year,extract(year from current_date)::integer),
    'currentTerm',case coalesce(ap.current_term,'TERM_I') when 'TERM_II' then 'Term II' when 'TERM_III' then 'Term III' else 'Term I' end,
    'admin',jsonb_build_object('name',coalesce(i.full_name,'Not assigned'),'email',coalesce(i.email,''),'telephone',coalesce(i.telephone,''),
      'status',case when i.status='ACCEPTED' then 'ACTIVE' else 'INVITED' end,'invitation',coalesce(i.status,'PENDING'),
      'invitationSentAt',i.sent_at,'acceptedAt',i.accepted_at,'lastLogin','Never','mfa',coalesce(i.requires_mfa,false)),
    'lastActivity',to_char(s.updated_at,'DD Mon YYYY HH24:MI'),'storageUsedGb',0,'storageLimitGb',10,'health','HEALTHY',
    'usage',jsonb_build_object('users',0,'learners',0,'staff',0,'classes',0,'reports',0,'imports',0,'exports',0),
    'features',jsonb_build_object(
      'academic',jsonb_build_object('label','Academic Management','plan',true,'override','DEFAULT'),
      'reports',jsonb_build_object('label','Report Cards','plan',true,'override','DEFAULT'),
      'imports',jsonb_build_object('label','Import / Export','plan',true,'override','DEFAULT')),
    'payments','[]'::jsonb,'billingPeriods','[]'::jsonb
  ) order by s.created_at desc),'[]'::jsonb) into result
  from public.schools s
  left join lateral (select * from public.school_addresses x where x.school_id=s.id order by x.created_at desc limit 1) a on true
  left join lateral (select * from public.school_admin_invitations x where x.school_id=s.id order by x.created_at desc limit 1) i on true
  left join lateral (select * from public.school_subscriptions x where x.school_id=s.id order by x.created_at desc limit 1) su on true
  left join public.school_academic_profiles ap on ap.school_id=s.id
  left join public.school_onboarding_states os on os.school_id=s.id;
  return result;
end $$;

revoke all on function public.get_platform_school_directory() from public,anon;
grant execute on function public.get_platform_school_directory() to authenticated,service_role;
