-- Academic periods are deliberately created as drafts until their dates are
-- reviewed. Provide the missing explicit operation to activate a term, and
-- activate its draft academic year as part of the same transaction.
create or replace function public.activate_school_academic_term(
  p_school_id uuid,
  p_term_id uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid;
  v_term public.terms%rowtype;
  v_year public.academic_years%rowtype;
  v_current_term text;
begin
  if p_school_id is null or p_term_id is null
    or nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'ACADEMIC_TERM_ACTIVATION_FIELDS_REQUIRED';
  end if;

  v_actor := public.current_app_user_id();
  if v_actor is null or not exists (
    select 1
    from public.school_memberships m
    join public.roles r on r.id = m.role_id
    join public.role_permissions rp on rp.role_id = r.id
    join public.permissions p on p.id = rp.permission_id
    where m.school_id = p_school_id and m.user_id = v_actor
      and m.status = 'ACTIVE' and p.code = 'academics.manage'
  ) then
    raise exception 'ACADEMIC_MANAGEMENT_PERMISSION_REQUIRED';
  end if;

  select * into v_term
  from public.terms
  where id = p_term_id and school_id = p_school_id
  for update;
  if v_term.id is null then raise exception 'SCHOOL_TERM_NOT_FOUND'; end if;
  if v_term.lifecycle_status <> 'DRAFT' then raise exception 'ONLY_DRAFT_TERMS_CAN_BE_OPENED'; end if;

  select * into v_year
  from public.academic_years
  where id = v_term.academic_year_id and school_id = p_school_id
  for update;
  if v_year.id is null then raise exception 'SCHOOL_ACADEMIC_YEAR_NOT_FOUND'; end if;
  if v_term.starts_on < v_year.starts_on or v_term.ends_on > v_year.ends_on then
    raise exception 'TERM_DATES_OUTSIDE_ACADEMIC_YEAR';
  end if;

  if exists (
    select 1 from public.terms other_term
    where other_term.school_id = p_school_id
      and other_term.academic_year_id = v_year.id
      and other_term.id <> v_term.id
      and other_term.lifecycle_status in ('OPEN','MARKS_OPEN','REVIEW')
  ) then
    raise exception 'ANOTHER_TERM_IS_STILL_OPEN';
  end if;

  if v_year.status = 'DRAFT' then
    if exists (
      select 1 from public.academic_years other_year
      where other_year.school_id = p_school_id
        and other_year.id <> v_year.id and other_year.status = 'ACTIVE'
    ) then
      raise exception 'CLOSE_CURRENT_ACADEMIC_YEAR_FIRST';
    end if;
    update public.academic_years set status = 'ACTIVE', updated_at = now()
    where id = v_year.id and school_id = p_school_id;
  elsif v_year.status <> 'ACTIVE' then
    raise exception 'ACADEMIC_YEAR_IS_NOT_OPEN';
  end if;

  update public.terms
  set lifecycle_status = 'MARKS_OPEN', updated_at = now()
  where id = v_term.id and school_id = p_school_id;

  v_current_term := case v_term.term_number
    when 1 then 'TERM_I' when 2 then 'TERM_II' else 'TERM_III' end;
  update public.school_academic_profiles
  set current_academic_year = case
        when v_year.name ~ '^[0-9]{4}$' then v_year.name::integer
        else current_academic_year end,
      current_term = v_current_term,
      updated_at = now()
  where school_id = p_school_id;

  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_USER','ACADEMIC_TERM_ACTIVATED','term',v_term.id::text,
    jsonb_build_object('school_id',p_school_id,'academic_year_id',v_year.id,
      'from_status','DRAFT','to_status','MARKS_OPEN','reason',btrim(p_reason)));

  return v_term.id;
end
$$;

revoke all on function public.activate_school_academic_term(uuid,uuid,text) from public, anon;
grant execute on function public.activate_school_academic_term(uuid,uuid,text) to authenticated;
