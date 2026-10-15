-- Aggregate-only onboarding readiness across tenants. Every relationship is
-- joined through the same school_id; no invitee names, emails, or learner data
-- are returned.
create or replace function public.get_platform_tenant_readiness(p_school_id uuid default null)
returns table (
  school_id uuid,
  school_name text,
  school_code text,
  lifecycle_status text,
  onboarding_status text,
  latest_invitation_status text,
  school_admin_membership_status text,
  academic_year_name text,
  academic_year_status text,
  selected_term_name text,
  selected_term_status text,
  has_subscription boolean,
  required_o_level_expected bigint,
  required_o_level_linked bigint,
  ready_for_school_work boolean,
  setup_issues text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.platform_admins pa
    where pa.auth_user_id = auth.uid() and pa.is_active = true
  ) then
    raise exception 'NOT_AUTHORISED';
  end if;

  if p_school_id is not null and not exists(select 1 from public.schools s where s.id = p_school_id) then
    raise exception 'SCHOOL_NOT_FOUND';
  end if;

  return query
  with tenant_facts as (
    select
      s.id as tenant_id,
      s.official_name::text as tenant_name,
      s.school_code::text as tenant_code,
      s.lifecycle_status::text as tenant_lifecycle,
      ob.status::text as onboarding,
      invitation.status::text as invite_status,
      admin_membership.status::text as admin_membership,
      profile.current_academic_year::text as selected_year,
      year_record.status::text as year_status,
      term_record.name::text as selected_term,
      term_record.lifecycle_status::text as term_status,
      exists (
        select 1 from public.school_subscriptions subscription
        where subscription.school_id = s.id
          and subscription.status in ('TRIAL','ACTIVE','PAYMENT_DUE','SUSPENDED')
      ) as subscription_exists,
      case when coalesce(profile.academic_levels, s.school_level) in ('UCE_ONLY','BOTH') then
        (select count(*) from public.system_subjects subject
          where subject.programme = 'O_LEVEL' and subject.is_official
            and subject.is_compulsory and subject.is_active)
        else 0::bigint end as expected_required_subjects,
      case when year_record.id is not null and coalesce(profile.academic_levels, s.school_level) in ('UCE_ONLY','BOTH') then
        (select count(*) from public.school_subject_offerings offering
          join public.system_subjects subject on subject.id = offering.system_subject_id
          where offering.school_id = s.id
            and offering.academic_year_id = year_record.id
            and offering.status = 'ACTIVE'
            and subject.programme = 'O_LEVEL' and subject.is_official
            and subject.is_compulsory and subject.is_active)
        else 0::bigint end as linked_required_subjects
    from public.schools s
    left join public.school_onboarding_states ob on ob.school_id = s.id
    left join public.school_academic_profiles profile on profile.school_id = s.id
    left join lateral (
      select i.status from public.school_admin_invitations i
      where i.school_id = s.id order by i.created_at desc, i.id desc limit 1
    ) invitation on true
    left join lateral (
      select case
        when membership.status = 'ACTIVE' and not app_user.is_active then 'USER_INACTIVE'
        else membership.status::text
      end as status
      from public.school_memberships membership
      join public.roles r on r.id = membership.role_id and r.code = 'SCHOOL_ADMIN'
      join public.users app_user on app_user.id = membership.user_id
      where membership.school_id = s.id
      order by case membership.status when 'ACTIVE' then 0 when 'INACTIVE' then 1 else 2 end
      limit 1
    ) admin_membership on true
    left join public.academic_years year_record
      on year_record.school_id = s.id and year_record.name = profile.current_academic_year::text
    left join public.terms term_record
      on term_record.school_id = s.id
      and term_record.academic_year_id = year_record.id
      and term_record.term_number = case profile.current_term when 'TERM_I' then 1 when 'TERM_II' then 2 when 'TERM_III' then 3 end
    where p_school_id is null or s.id = p_school_id
  ), readiness as (
    select facts.*,
      array_remove(array[
        case when facts.onboarding is null then 'ONBOARDING_STATE_MISSING' end,
        case when facts.admin_membership is null then 'SCHOOL_ADMIN_MEMBERSHIP_MISSING' end,
        case when facts.admin_membership is not null and facts.admin_membership <> 'ACTIVE' then 'SCHOOL_ADMIN_NOT_ACTIVE' end,
        case when facts.onboarding is not null and facts.onboarding not in ('READY','ACTIVE') then 'ONBOARDING_NOT_READY' end,
        case when facts.subscription_exists is false then 'SUBSCRIPTION_MISSING' end,
        case when facts.selected_year is null then 'ACADEMIC_PROFILE_MISSING' end,
        case when facts.year_status is null then 'SELECTED_ACADEMIC_YEAR_MISSING' end,
        case when facts.year_status is not null and facts.year_status <> 'ACTIVE' then 'SELECTED_ACADEMIC_YEAR_NOT_ACTIVE' end,
        case when facts.selected_term is null then 'SELECTED_TERM_MISSING' end,
        case when facts.term_status is not null and facts.term_status not in ('OPEN','MARKS_OPEN','REVIEW') then 'SELECTED_TERM_NOT_OPEN' end,
        case when facts.linked_required_subjects < facts.expected_required_subjects then 'COMPULSORY_O_LEVEL_SUBJECTS_INCOMPLETE' end
      ], null)::text[] as issues
    from tenant_facts facts
  )
  select readiness.tenant_id, readiness.tenant_name, readiness.tenant_code,
    readiness.tenant_lifecycle, readiness.onboarding, readiness.invite_status,
    readiness.admin_membership, readiness.selected_year, readiness.year_status,
    readiness.selected_term, readiness.term_status, readiness.subscription_exists,
    readiness.expected_required_subjects, readiness.linked_required_subjects,
    cardinality(readiness.issues) = 0, readiness.issues
  from readiness
  order by readiness.tenant_name;
end;
$$;

revoke all on function public.get_platform_tenant_readiness(uuid) from public, anon;
grant execute on function public.get_platform_tenant_readiness(uuid) to authenticated;
comment on function public.get_platform_tenant_readiness(uuid) is
  'Platform-admin-only aggregate onboarding readiness. All tenant links are school-scoped; returns no personal data.';
notify pgrst, 'reload schema';
