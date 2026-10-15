alter table public.academic_assessments
  add column if not exists component_count integer not null default 1 check (component_count between 1 and 20),
  add column if not exists maximum_mark numeric(7,2) not null default 100 check (maximum_mark > 0 and maximum_mark <= 10000);

create or replace function public.get_school_academic_assessments(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_active_school_member(p_school_id) or public.is_active_platform_admin()) then
    raise exception 'Active school membership required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'programme', a.programme,
      'termId', a.term_id, 'term', t.name,
      'academicYearId', a.academic_year_id, 'academicYear', y.name,
      'componentCount', a.component_count, 'maximumMark', a.maximum_mark,
      'status', a.status, 'locked', a.locked_at is not null,
      'createdAt', a.created_at, 'updatedAt', a.updated_at
    ) order by y.starts_on desc, t.starts_on desc, a.name)
    from public.academic_assessments a
    join public.terms t on t.id = a.term_id and t.school_id = a.school_id
    join public.academic_years y on y.id = a.academic_year_id and y.school_id = a.school_id
    where a.school_id = p_school_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_school_academic_assessment(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_assessment_id uuid,
  p_name text,
  p_programme public.subject_programme,
  p_component_count integer,
  p_maximum_mark numeric,
  p_status public.offering_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_app_user uuid;
  v_role text;
  v_id uuid;
  v_name text := nullif(trim(p_name), '');
begin
  if v_actor is null then raise exception 'Sign in is required'; end if;
  select u.id, r.code into v_app_user, v_role
  from public.users u
  join public.school_memberships m on m.user_id = u.id and m.school_id = p_school_id and m.status = 'ACTIVE'
  join public.roles r on r.id = m.role_id
  where u.auth_user_id = v_actor and u.is_active
    and r.code in ('SCHOOL_ADMIN', 'DIRECTOR_OF_STUDIES')
  order by case r.code when 'SCHOOL_ADMIN' then 0 else 1 end
  limit 1;
  if v_app_user is null then raise exception 'School Administrator or Director of Studies permission required'; end if;
  if v_name is null or length(v_name) > 180 then raise exception 'Assessment name is required and must be 180 characters or fewer'; end if;
  if p_component_count is null or p_component_count < 1 or p_component_count > 20 then raise exception 'Component count must be between 1 and 20'; end if;
  if p_maximum_mark is null or p_maximum_mark <= 0 or p_maximum_mark > 10000 then raise exception 'Maximum mark must be greater than 0 and no more than 10000'; end if;
  if p_status not in ('DRAFT', 'ACTIVE', 'INACTIVE') then raise exception 'Unsupported assessment status'; end if;
  if not exists (
    select 1 from public.terms t
    where t.id = p_term_id and t.school_id = p_school_id and t.academic_year_id = p_academic_year_id
  ) then raise exception 'The selected term does not belong to this school and academic year'; end if;

  if p_assessment_id is null then
    insert into public.academic_assessments(school_id, academic_year_id, term_id, name, programme, status, created_by)
    values(p_school_id, p_academic_year_id, p_term_id, v_name, p_programme, p_status, v_actor)
    returning id into v_id;
  else
    update public.academic_assessments
    set name = v_name, programme = p_programme, status = p_status,
        component_count = p_component_count, maximum_mark = p_maximum_mark, updated_at = now()
    where id = p_assessment_id and school_id = p_school_id
      and academic_year_id = p_academic_year_id and term_id = p_term_id
      and locked_at is null
    returning id into v_id;
    if v_id is null then raise exception 'Assessment is unavailable, locked, or outside the selected academic context'; end if;
  end if;

  if p_assessment_id is null then
    update public.academic_assessments
    set component_count = p_component_count, maximum_mark = p_maximum_mark
    where id = v_id;
  end if;
  insert into public.audit_logs(user_name, user_role, action, entity_type, entity_id, new_value)
  values(v_actor::text, v_role, case when p_assessment_id is null then 'ASSESSMENT_CREATED' else 'ASSESSMENT_UPDATED' end,
    'academic_assessment', v_id::text, jsonb_build_object(
      'school_id', p_school_id, 'academic_year_id', p_academic_year_id, 'term_id', p_term_id,
      'name', v_name, 'programme', p_programme, 'component_count', p_component_count,
      'maximum_mark', p_maximum_mark, 'status', p_status
    ));
  return v_id;
exception when unique_violation then
  raise exception 'An assessment with this name already exists in the selected programme and term';
end;
$$;

revoke all on function public.get_school_academic_assessments(uuid) from public, anon;
revoke all on function public.save_school_academic_assessment(uuid,uuid,uuid,uuid,text,public.subject_programme,integer,numeric,public.offering_status) from public, anon;
grant execute on function public.get_school_academic_assessments(uuid) to authenticated;
grant execute on function public.save_school_academic_assessment(uuid,uuid,uuid,uuid,text,public.subject_programme,integer,numeric,public.offering_status) to authenticated;
notify pgrst, 'reload schema';
