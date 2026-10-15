-- Restore the single-offering RPC contract first. Some remote environments
-- applied later migrations while this function was absent from their schema
-- cache/catalogue. This definition preserves its established validation,
-- replacement history, idempotency, and audit behavior.
create or replace function public.assign_teacher_to_offering(
  p_class_subject_offering_id uuid,
  p_term_id uuid,
  p_teacher_id uuid,
  p_allocation_role text,
  p_reason text,
  p_effective_from date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering public.class_subject_offerings%rowtype;
  v_term public.terms%rowtype;
  v_actor uuid;
  v_id uuid;
  v_existing public.teacher_allocations%rowtype;
  v_previous_teacher_id uuid;
begin
  select * into v_offering
  from public.class_subject_offerings
  where id = p_class_subject_offering_id and status = 'ACTIVE';
  if v_offering.id is null or not public.is_school_admin_for(v_offering.school_id) then
    raise exception 'Active class subject offering unavailable';
  end if;

  select * into v_term
  from public.terms
  where id = p_term_id and school_id = v_offering.school_id
    and academic_year_id = v_offering.academic_year_id;
  if v_term.id is null then raise exception 'Term does not belong to the offering academic year'; end if;
  if p_allocation_role not in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER','SUBJECT_MODERATOR') then
    raise exception 'Unsupported allocation role';
  end if;
  if p_effective_from is null then raise exception 'Allocation start date is required'; end if;
  if not exists (
    select 1 from public.school_memberships m
    join public.roles r on r.id = m.role_id
    join public.users u on u.id = m.user_id
    where m.school_id = v_offering.school_id and m.user_id = p_teacher_id
      and m.status = 'ACTIVE' and u.is_active and r.code = 'TEACHER'
  ) then raise exception 'Teacher must be an active school member with the Teacher system role'; end if;

  v_actor := public.current_app_user_id();
  select teacher_id into v_previous_teacher_id
  from public.teacher_allocations
  where school_id = v_offering.school_id and term_id = p_term_id
    and class_subject_offering_id = v_offering.id
    and stream_id is not distinct from v_offering.stream_id
    and status = 'ACTIVE' and allocation_role = 'PRIMARY_SUBJECT_TEACHER'
  for update;
  if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER'
    and v_previous_teacher_id is not null and v_previous_teacher_id <> p_teacher_id
    and nullif(trim(p_reason), '') is null then
    raise exception 'Provide a reason when replacing the current primary teacher';
  end if;

  select * into v_existing
  from public.teacher_allocations
  where term_id = p_term_id and teacher_id = p_teacher_id
    and class_subject_offering_id = v_offering.id
    and stream_id is not distinct from v_offering.stream_id
  for update;
  if found then
    if v_existing.status = 'ACTIVE' then
      if v_existing.allocation_role = p_allocation_role then return v_existing.id; end if;
      raise exception 'Teacher already has an active allocation for this offering under a different role';
    end if;
    if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER' then
      update public.teacher_allocations
      set status = 'INACTIVE', effective_to = p_effective_from - 1, updated_at = now()
      where school_id = v_offering.school_id and term_id = p_term_id
        and class_subject_offering_id = v_offering.id
        and stream_id is not distinct from v_offering.stream_id
        and status = 'ACTIVE' and allocation_role = 'PRIMARY_SUBJECT_TEACHER';
    end if;
    update public.teacher_allocations
    set status = 'ACTIVE', allocation_role = p_allocation_role,
        effective_from = p_effective_from, effective_to = null, updated_at = now()
    where id = v_existing.id returning id into v_id;
  else
    if p_allocation_role = 'PRIMARY_SUBJECT_TEACHER' then
      update public.teacher_allocations
      set status = 'INACTIVE', effective_to = p_effective_from - 1, updated_at = now()
      where school_id = v_offering.school_id and term_id = p_term_id
        and class_subject_offering_id = v_offering.id
        and stream_id is not distinct from v_offering.stream_id
        and status = 'ACTIVE' and allocation_role = 'PRIMARY_SUBJECT_TEACHER';
    end if;
    insert into public.teacher_allocations(
      school_id, academic_year_id, term_id, teacher_id,
      class_subject_offering_id, stream_id, status, allocation_role,
      effective_from, created_by
    ) values (
      v_offering.school_id, v_offering.academic_year_id, p_term_id, p_teacher_id,
      v_offering.id, v_offering.stream_id, 'ACTIVE', p_allocation_role,
      p_effective_from, v_actor
    ) on conflict do nothing returning id into v_id;
    if v_id is null then
      select id into v_id from public.teacher_allocations
      where term_id = p_term_id and teacher_id = p_teacher_id
        and class_subject_offering_id = v_offering.id
        and stream_id is not distinct from v_offering.stream_id
        and status = 'ACTIVE' and allocation_role = p_allocation_role;
      if v_id is null then raise exception 'Allocation changed concurrently; reload and try again'; end if;
      return v_id;
    end if;
  end if;

  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
  values(v_actor::text,'SCHOOL_ADMIN','TEACHER_ALLOCATED','teacher_allocation',v_id::text,
    jsonb_build_object('term_id',p_term_id,'offering_id',v_offering.id,
      'teacher_id',p_teacher_id,'allocation_role',p_allocation_role,'effective_from',p_effective_from,
      'replaced_teacher_id',v_previous_teacher_id,'reason',nullif(trim(p_reason),'')));
  return v_id;
end;
$$;

revoke all on function public.assign_teacher_to_offering(uuid,uuid,uuid,text,text,date) from public, anon;
grant execute on function public.assign_teacher_to_offering(uuid,uuid,uuid,text,text,date) to authenticated;

-- Save several teacher-to-offering assignments as one transaction.
-- Each selected offering uses the same policy checks and audit behavior above.
create or replace function public.assign_teacher_to_offerings(
  p_class_subject_offering_ids uuid[],
  p_term_id uuid,
  p_teacher_id uuid,
  p_allocation_role text,
  p_reason text,
  p_effective_from date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_offering_id uuid;
  v_allocation_id uuid;
  v_results jsonb := '[]'::jsonb;
begin
  if p_class_subject_offering_ids is null
    or cardinality(p_class_subject_offering_ids) = 0
    or cardinality(p_class_subject_offering_ids) > 100 then
    raise exception 'Select between 1 and 100 class subject offerings';
  end if;

  if p_term_id is null or p_teacher_id is null or p_allocation_role is null or p_effective_from is null then
    raise exception 'Term, teacher, role, and effective date are required';
  end if;

  for v_offering_id in
    select distinct selected_id
    from unnest(p_class_subject_offering_ids) as selected(selected_id)
    where selected_id is not null
    order by selected_id
  loop
    v_allocation_id := public.assign_teacher_to_offering(
      p_class_subject_offering_id => v_offering_id,
      p_term_id => p_term_id,
      p_teacher_id => p_teacher_id,
      p_allocation_role => p_allocation_role,
      p_reason => p_reason,
      p_effective_from => p_effective_from
    );
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'offeringId', v_offering_id,
      'allocationId', v_allocation_id
    ));
  end loop;

  if jsonb_array_length(v_results) = 0 then
    raise exception 'Select at least one valid class subject offering';
  end if;

  return jsonb_build_object(
    'count', jsonb_array_length(v_results),
    'allocations', v_results
  );
end;
$$;

revoke all on function public.assign_teacher_to_offerings(uuid[],uuid,uuid,text,text,date) from public, anon;
grant execute on function public.assign_teacher_to_offerings(uuid[],uuid,uuid,text,text,date) to authenticated;
notify pgrst, 'reload schema';
