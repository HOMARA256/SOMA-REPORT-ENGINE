-- A1 and A2 are independent, early-entered O-Level activities. Raw inputs are
-- percentages; the existing 20/80 mark record remains the review authority.
create table public.o_level_integration_activity_marks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  class_subject_offering_id uuid not null,
  learner_id uuid not null,
  activity_number smallint not null check (activity_number in (1,2)),
  raw_mark numeric(5,2),
  mark_status text not null check (mark_status in ('MISSING','PRESENT','ABSENT','EXEMPT')),
  entered_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint o_level_activity_offering_fk foreign key (class_subject_offering_id,school_id) references public.class_subject_offerings(id,school_id) on delete restrict,
  constraint o_level_activity_learner_fk foreign key (learner_id,school_id) references public.learners(id,school_id) on delete restrict,
  constraint o_level_activity_raw_range check (raw_mark is null or raw_mark between 0 and 100),
  constraint o_level_activity_value check ((mark_status='PRESENT' and raw_mark is not null) or (mark_status<>'PRESENT' and raw_mark is null)),
  constraint o_level_activity_unique unique (term_id,class_subject_offering_id,learner_id,activity_number)
);
create index o_level_activity_school_term_idx on public.o_level_integration_activity_marks(school_id,term_id);
alter table public.o_level_integration_activity_marks enable row level security;
create policy o_level_activity_member_read on public.o_level_integration_activity_marks for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.o_level_integration_activity_marks from anon;
revoke insert,update,delete,truncate,references,trigger on public.o_level_integration_activity_marks from authenticated;

alter table public.academic_mark_records add column exam_raw_mark numeric(5,2) check (exam_raw_mark is null or exam_raw_mark between 0 and 100);

-- Same approved, versioned piecewise conversion as gradingConfiguration.ts.
-- Keep these points in sync; do not substitute the reference PDF's linear rule.
create function public.o_level_three_point_v1(p_percentage numeric)
returns numeric language plpgsql immutable set search_path=public,pg_temp as $$
declare v_lower record; v_upper record;
begin
  if p_percentage is null or p_percentage < 0 or p_percentage > 100 then return null; end if;
  select x.pct,x.score into v_lower from (values
    (0::numeric,1::numeric),(49,1.4),(50,1.5),(59,1.8),(60,1.9),
    (64,2.1),(69,2.3),(70,2.4),(74,2.6),(79,2.7),
    (80,2.7),(83,2.8),(89,2.9),(100,3)
  ) x(pct,score) where x.pct <= p_percentage order by x.pct desc limit 1;
  if v_lower.pct=p_percentage then return v_lower.score; end if;
  select x.pct,x.score into v_upper from (values
    (0::numeric,1::numeric),(49,1.4),(50,1.5),(59,1.8),(60,1.9),
    (64,2.1),(69,2.3),(70,2.4),(74,2.6),(79,2.7),
    (80,2.7),(83,2.8),(89,2.9),(100,3)
  ) x(pct,score) where x.pct > p_percentage order by x.pct limit 1;
  return v_lower.score + (p_percentage-v_lower.pct)*(v_upper.score-v_lower.score)/(v_upper.pct-v_lower.pct);
end $$;
revoke all on function public.o_level_three_point_v1(numeric) from public,anon;
grant execute on function public.o_level_three_point_v1(numeric) to authenticated;

create function public.save_o_level_activity_mark(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
  p_activity_number smallint,p_raw_mark numeric,p_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_term public.terms; v_offering public.class_subject_offerings; v_actor uuid;
  v_first public.o_level_integration_activity_marks; v_second public.o_level_integration_activity_marks;
  v_existing public.academic_mark_records; v_aoi numeric; v_status text; v_id uuid;
begin
  if p_activity_number not in (1,2) or p_activity_number is null then raise exception 'Activity must be A1 or A2'; end if;
  p_status:=upper(coalesce(p_status,''));
  if p_status not in ('MISSING','PRESENT','ABSENT','EXEMPT') then raise exception 'Unsupported activity state'; end if;
  if (p_status='PRESENT' and (p_raw_mark is null or p_raw_mark<0 or p_raw_mark>100))
     or (p_status<>'PRESENT' and p_raw_mark is not null) then raise exception 'Present activity marks must be out of 100; other states have no mark'; end if;
  if p_raw_mark is not null then p_raw_mark:=round(p_raw_mark,2); end if;
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_class_subject_offering_id;
  if v_term.id is null or v_offering.id is null or v_offering.school_id<>v_term.school_id or v_offering.academic_year_id<>v_term.academic_year_id
     or not exists(select 1 from public.academic_classes c where c.id=v_offering.class_id and c.programme='O_LEVEL') then
    raise exception 'A valid O-Level term and subject offering are required';
  end if;
  v_actor:=public.current_app_user_id();
  if v_actor is null then raise exception 'Sign in is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_term_id::text||':'||p_class_subject_offering_id::text||':'||p_learner_id::text,0));
  select * into v_existing from public.academic_mark_records where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id and learner_id=p_learner_id;
  insert into public.o_level_integration_activity_marks(school_id,academic_year_id,term_id,class_subject_offering_id,learner_id,activity_number,raw_mark,mark_status,entered_by)
  values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_subject_offering_id,p_learner_id,p_activity_number,p_raw_mark,p_status,v_actor)
  on conflict(term_id,class_subject_offering_id,learner_id,activity_number) do update
    set raw_mark=excluded.raw_mark,mark_status=excluded.mark_status,entered_by=excluded.entered_by,updated_at=now();
  select * into v_first from public.o_level_integration_activity_marks where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id and learner_id=p_learner_id and activity_number=1;
  select * into v_second from public.o_level_integration_activity_marks where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id and learner_id=p_learner_id and activity_number=2;
  if v_first.mark_status='PRESENT' and v_second.mark_status='PRESENT' then
    v_status:='PRESENT';
    v_aoi:=round((public.o_level_three_point_v1(v_first.raw_mark)+public.o_level_three_point_v1(v_second.raw_mark))*20/6,2);
  elsif v_first.mark_status='ABSENT' or v_second.mark_status='ABSENT' then v_status:='ABSENT';
  elsif v_first.mark_status='EXEMPT' or v_second.mark_status='EXEMPT' then v_status:='EXEMPT';
  else v_status:='MISSING'; end if;
  -- Authoritative RPC enforces learner selection, teacher allocation, submission
  -- and class-result locks. Failure rolls this activity insert back as well.
  v_id:=public.save_academic_mark_record(p_term_id,p_class_subject_offering_id,p_learner_id,
    v_aoi,v_status,v_existing.exam_mark,coalesce(v_existing.exam_status,'MISSING'));
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,'SCHOOL_MEMBER','O_LEVEL_ACTIVITY_SAVED','o_level_integration_activity_mark',v_id::text,
      jsonb_build_object('activity',p_activity_number,'raw_mark',p_raw_mark,'status',p_status,'formative_mark',v_aoi));
  return v_id;
end $$;

create function public.save_o_level_exam_raw_mark(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,p_raw_mark numeric,p_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.academic_mark_records; v_actor uuid; v_id uuid;
begin
  p_status:=upper(coalesce(p_status,''));
  if p_status not in ('MISSING','PRESENT','ABSENT','EXEMPT') then raise exception 'Unsupported examination state'; end if;
  if (p_status='PRESENT' and (p_raw_mark is null or p_raw_mark<0 or p_raw_mark>100))
     or (p_status<>'PRESENT' and p_raw_mark is not null) then raise exception 'Present examination marks must be out of 100; other states have no mark'; end if;
  if p_raw_mark is not null then p_raw_mark:=round(p_raw_mark,2); end if;
  if not exists(select 1 from public.class_subject_offerings co join public.academic_classes c on c.id=co.class_id where co.id=p_class_subject_offering_id and c.programme='O_LEVEL') then
    raise exception 'An O-Level subject offering is required'; end if;
  v_actor:=public.current_app_user_id();
  if v_actor is null then raise exception 'Sign in is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_term_id::text||':'||p_class_subject_offering_id::text||':'||p_learner_id::text,0));
  select * into v_existing from public.academic_mark_records where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id and learner_id=p_learner_id;
  v_id:=public.save_academic_mark_record(p_term_id,p_class_subject_offering_id,p_learner_id,
    v_existing.aoi_mark,coalesce(v_existing.aoi_status,'MISSING'),
    case when p_status='PRESENT' then round(p_raw_mark*0.8,2) else null end,p_status);
  update public.academic_mark_records set exam_raw_mark=p_raw_mark where id=v_id;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,new_value)
    values(v_actor::text,'SCHOOL_MEMBER','O_LEVEL_EXAM_RAW_SAVED','academic_mark_record',v_id::text,
      jsonb_build_object('raw_mark',p_raw_mark,'status',p_status));
  return v_id;
end $$;

alter function public.get_marks_entry_workspace(uuid) rename to get_marks_entry_workspace_before_o_level_activities;
revoke all on function public.get_marks_entry_workspace_before_o_level_activities(uuid) from public,anon,authenticated;
create function public.get_marks_entry_workspace(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_payload jsonb; v_offerings jsonb;
begin
  v_payload:=public.get_marks_entry_workspace_before_o_level_activities(p_term_id);
  select coalesce(jsonb_agg(
    case when offering->>'programme'='O_LEVEL' then
      jsonb_set(offering,'{learners}',coalesce((
        select jsonb_agg(learner || jsonb_build_object(
          'activity1Raw',a1.raw_mark,'activity1Status',coalesce(a1.mark_status,'MISSING'),
          'activity2Raw',a2.raw_mark,'activity2Status',coalesce(a2.mark_status,'MISSING'),
          'examRaw',mr.exam_raw_mark
        ) order by learner_order)
        from jsonb_array_elements(offering->'learners') with ordinality as l(learner,learner_order)
        left join public.o_level_integration_activity_marks a1 on a1.term_id=p_term_id and a1.class_subject_offering_id=(offering->>'id')::uuid and a1.learner_id=(learner->>'id')::uuid and a1.activity_number=1
        left join public.o_level_integration_activity_marks a2 on a2.term_id=p_term_id and a2.class_subject_offering_id=(offering->>'id')::uuid and a2.learner_id=(learner->>'id')::uuid and a2.activity_number=2
        left join public.academic_mark_records mr on mr.term_id=p_term_id and mr.class_subject_offering_id=(offering->>'id')::uuid and mr.learner_id=(learner->>'id')::uuid
      ),'[]'::jsonb))
    else offering end order by offering_order),'[]'::jsonb) into v_offerings
  from jsonb_array_elements(v_payload->'offerings') with ordinality as o(offering,offering_order);
  return jsonb_set(v_payload,'{offerings}',v_offerings);
end $$;
revoke all on function public.get_marks_entry_workspace(uuid),public.save_o_level_activity_mark(uuid,uuid,uuid,smallint,numeric,text),public.save_o_level_exam_raw_mark(uuid,uuid,uuid,numeric,text) from public,anon;
grant execute on function public.get_marks_entry_workspace(uuid),public.save_o_level_activity_mark(uuid,uuid,uuid,smallint,numeric,text),public.save_o_level_exam_raw_mark(uuid,uuid,uuid,numeric,text) to authenticated;
notify pgrst,'reload schema';
