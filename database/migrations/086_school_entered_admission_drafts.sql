begin;

alter table public.admission_applications
  add column if not exists entry_channel text not null default 'PUBLIC',
  add column if not exists entered_by uuid references public.users(id) on delete set null;

alter table public.admission_applications
  drop constraint if exists admission_applications_entry_channel_check;
alter table public.admission_applications
  add constraint admission_applications_entry_channel_check
  check (entry_channel in ('PUBLIC', 'SCHOOL_ADMIN'));

create index if not exists admission_applications_school_drafts_idx
  on public.admission_applications(school_id, updated_at desc)
  where entry_channel = 'SCHOOL_ADMIN' and status = 'DRAFT';

create or replace function public.get_school_admission_drafts(p_school_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, auth, pg_temp as $$
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'reference', a.application_reference,
      'openingId', a.admission_opening_id, 'classLevel', a.intended_class_level,
      'learner', a.learner_details, 'guardian', a.guardian_details,
      'updatedAt', a.updated_at, 'enteredBy', a.entered_by
    ) order by a.updated_at desc)
    from public.admission_applications a
    where a.school_id = p_school_id and a.entry_channel = 'SCHOOL_ADMIN' and a.status = 'DRAFT'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.save_school_admission_draft(
  p_school_id uuid, p_application_id uuid, p_opening_id uuid,
  p_class_level smallint, p_learner_details jsonb, p_guardian_details jsonb
)
returns jsonb language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare
  v_opening public.admission_openings%rowtype;
  v_id uuid;
  v_reference text;
  v_actor uuid;
  v_updated_at timestamptz;
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  select * into v_opening from public.admission_openings
  where id = p_opening_id and school_id = p_school_id and status in ('DRAFT', 'OPEN');
  if v_opening.id is null or p_class_level is null or not p_class_level = any(v_opening.target_class_levels) then
    raise exception 'ADMISSION_OPENING_OR_LEVEL_INVALID';
  end if;
  if jsonb_typeof(p_learner_details) <> 'object' or jsonb_typeof(p_guardian_details) <> 'object'
    or length(p_learner_details::text) > 12000 or length(p_guardian_details::text) > 12000 then
    raise exception 'ADMISSION_DRAFT_DETAILS_INVALID';
  end if;
  v_actor := public.current_app_user_id();
  if p_application_id is null then
    v_reference := 'ADM-' || upper(encode(gen_random_bytes(10), 'hex'));
    insert into public.admission_applications(
      school_id, admission_opening_id, application_reference, access_token_hash,
      intended_class_level, learner_details, guardian_details, entry_channel, entered_by
    ) values (
      p_school_id, p_opening_id, v_reference,
      encode(digest(gen_random_bytes(32), 'sha256'), 'hex'),
      p_class_level, p_learner_details, p_guardian_details, 'SCHOOL_ADMIN', v_actor
    ) returning id, updated_at into v_id, v_updated_at;
  else
    update public.admission_applications set
      admission_opening_id = p_opening_id, intended_class_level = p_class_level,
      learner_details = p_learner_details, guardian_details = p_guardian_details,
      updated_at = now()
    where id = p_application_id and school_id = p_school_id
      and entry_channel = 'SCHOOL_ADMIN' and status = 'DRAFT'
    returning id, application_reference, updated_at into v_id, v_reference, v_updated_at;
    if v_id is null then raise exception 'SCHOOL_ADMISSION_DRAFT_NOT_FOUND'; end if;
  end if;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'SCHOOL_ADMISSION_DRAFT_SAVED','admission_application',v_id::text,
    jsonb_build_object('opening_id',p_opening_id,'class_level',p_class_level)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id
  where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
  return jsonb_build_object('id',v_id,'reference',v_reference,'updatedAt',v_updated_at);
end;
$$;

create or replace function public.confirm_school_admission_draft(p_school_id uuid,p_application_id uuid)
returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare v_app public.admission_applications%rowtype; v_actor uuid;
begin
  if not public.can_manage_admissions(p_school_id) then
    raise exception 'ADMISSIONS_PERMISSION_REQUIRED';
  end if;
  select * into v_app from public.admission_applications
  where id=p_application_id and school_id=p_school_id and entry_channel='SCHOOL_ADMIN' for update;
  if v_app.id is null then raise exception 'SCHOOL_ADMISSION_DRAFT_NOT_FOUND'; end if;
  if v_app.status='ACCEPTED' then return v_app.id; end if;
  if v_app.status<>'DRAFT' then raise exception 'SCHOOL_ADMISSION_DRAFT_NOT_EDITABLE'; end if;
  if nullif(trim(v_app.learner_details->>'firstName'),'') is null
    or nullif(trim(v_app.learner_details->>'lastName'),'') is null
    or nullif(trim(v_app.learner_details->>'dateOfBirth'),'') is null
    or nullif(trim(v_app.learner_details->>'gender'),'') is null
    or nullif(trim(v_app.guardian_details->>'fullName'),'') is null
    or nullif(trim(v_app.guardian_details->>'phone'),'') is null then
    raise exception 'ADMISSION_REQUIRED_FIELDS_MISSING';
  end if;
  if (v_app.learner_details->>'dateOfBirth')::date >= current_date then
    raise exception 'ADMISSION_DATE_OF_BIRTH_INVALID';
  end if;
  if nullif(trim(v_app.learner_details->>'admissionDate'),'') is null
    or (v_app.learner_details->>'admissionDate')::date > current_date then
    raise exception 'ADMISSION_DATE_INVALID';
  end if;
  v_actor:=public.current_app_user_id();
  update public.admission_applications set status='ACCEPTED',submitted_at=now(),
    reviewed_by=v_actor,updated_at=now() where id=v_app.id;
  insert into public.audit_logs(user_id,user_name,user_role,action,entity_type,entity_id,new_value)
  select v_actor,u.full_name,r.code,'SCHOOL_ADMISSION_DRAFT_CONFIRMED','admission_application',v_app.id::text,
    jsonb_build_object('reference',v_app.application_reference)
  from public.users u join public.school_memberships m on m.user_id=u.id
  join public.roles r on r.id=m.role_id
  where u.id=v_actor and m.school_id=p_school_id and m.status='ACTIVE' limit 1;
  return v_app.id;
end;
$$;

revoke all on function public.get_school_admission_drafts(uuid),
  public.save_school_admission_draft(uuid,uuid,uuid,smallint,jsonb,jsonb),
  public.confirm_school_admission_draft(uuid,uuid) from public,anon;
grant execute on function public.get_school_admission_drafts(uuid),
  public.save_school_admission_draft(uuid,uuid,uuid,smallint,jsonb,jsonb),
  public.confirm_school_admission_draft(uuid,uuid) to authenticated;

commit;
