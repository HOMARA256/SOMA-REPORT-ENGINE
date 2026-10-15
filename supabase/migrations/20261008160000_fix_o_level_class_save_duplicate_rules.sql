-- Fix class creation failing with "ON CONFLICT DO UPDATE command cannot affect
-- row a second time". The prior insert read required rules for every level,
-- so the same school/year/subject offering appeared repeatedly in one INSERT.
-- Limit the seed to the selected active rule set and class level, and retain a
-- DISTINCT ON guard so duplicate curriculum rows can never break tenant setup.
create or replace function public.create_o_level_curriculum_class(
  p_school_id uuid,
  p_academic_year_id uuid,
  p_term_id uuid,
  p_level integer,
  p_class_name text,
  p_capacity integer,
  p_class_teacher_user_id uuid,
  p_stream_names text[],
  p_elective_offering_ids uuid[],
  p_activate boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_stream text;
  v_actor uuid;
  v_rule_set_id uuid;
begin
  if not public.is_school_admin_for(p_school_id) then
    raise exception 'School Administrator permission required';
  end if;
  if p_level not between 1 and 4 then
    raise exception 'Senior 1 to Senior 4 required';
  end if;
  if p_term_id is null or not exists (
    select 1 from public.terms t
    where t.id = p_term_id and t.school_id = p_school_id
      and t.academic_year_id = p_academic_year_id
  ) then
    raise exception 'Select a term in this school and academic year';
  end if;
  if not exists (
    select 1 from public.academic_years ay
    where ay.id = p_academic_year_id and ay.school_id = p_school_id
  ) then
    raise exception 'Select an academic year in this school';
  end if;
  if p_activate and cardinality(coalesce(p_stream_names, '{}'::text[])) = 0 then
    raise exception 'Add a stream before activating the class';
  end if;

  select rs.id into v_rule_set_id
  from public.o_level_curriculum_rule_sets rs
  where rs.status = 'ACTIVE'
  order by rs.activated_at desc nulls last, rs.created_at desc
  limit 1;
  if v_rule_set_id is null then
    raise exception 'No active O-Level curriculum rule set is configured';
  end if;

  v_actor := public.current_app_user_id();

  insert into public.school_subject_offerings as existing_offering (
    school_id, academic_year_id, system_subject_id, programme,
    school_subject_code, subject_source, status, subject_level, retired_at,
    activated_by, activated_at, is_demo_data
  )
  select distinct on (ss.id)
    p_school_id, p_academic_year_id, ss.id, ss.programme,
    ss.subject_code, 'SYSTEM_CATALOGUE', 'ACTIVE'::public.offering_status,
    ss.subject_level, null, v_actor, now(), false
  from public.o_level_curriculum_subject_rules r
  join public.system_subjects ss on ss.id = r.system_subject_id
    and ss.is_active and ss.programme = 'O_LEVEL'
  where r.rule_set_id = v_rule_set_id
    and r.class_level = p_level
    and r.is_active
    and r.requirement in ('CORE', 'RELIGION_OPTION')
  order by ss.id, r.id
  on conflict (school_id, academic_year_id, system_subject_id) do update
  set status = 'ACTIVE'::public.offering_status,
      retired_at = null,
      activated_by = coalesce(existing_offering.activated_by, excluded.activated_by),
      activated_at = coalesce(existing_offering.activated_at, now()),
      updated_at = now();

  v_id := public.create_academic_class(
    p_school_id, p_academic_year_id, 'O_LEVEL', p_level, p_class_name,
    'DRAFT', p_capacity, p_class_teacher_user_id
  );
  update public.academic_classes
  set o_level_rule_set_id = v_rule_set_id
  where id = v_id and school_id = p_school_id;

  perform public.sync_o_level_class_curriculum(v_id);
  foreach v_stream in array coalesce(p_stream_names, '{}'::text[]) loop
    if nullif(trim(v_stream), '') is null then
      raise exception 'Stream names cannot be blank';
    end if;
    perform public.create_class_stream(v_id, v_stream, null);
  end loop;
  if cardinality(coalesce(p_elective_offering_ids, '{}'::uuid[])) > 0 then
    perform public.set_o_level_class_electives(v_id, p_elective_offering_ids);
  end if;
  if p_activate then
    perform public.finalize_o_level_class(v_id);
  end if;
  return v_id;
end;
$$;

revoke all on function public.create_o_level_curriculum_class(uuid, uuid, uuid, integer, text, integer, uuid, text[], uuid[], boolean) from public, anon;
grant execute on function public.create_o_level_curriculum_class(uuid, uuid, uuid, integer, text, integer, uuid, text[], uuid[], boolean) to authenticated;
comment on function public.create_o_level_curriculum_class(uuid, uuid, uuid, integer, text, integer, uuid, text[], uuid[], boolean) is
  'Creates an O-Level class using only the selected tenant academic year, term, curriculum rule set, and level.';
notify pgrst, 'reload schema';
