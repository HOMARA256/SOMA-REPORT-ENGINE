-- Extend the existing O-Level marks register. Migration 115's A1/A2 scores
-- remain intact; they acquire explicit legacy definitions with unknown dates.
alter table public.o_level_integration_activity_marks
  drop constraint o_level_integration_activity_marks_activity_number_check;
alter table public.o_level_integration_activity_marks
  alter column activity_number type integer;
alter table public.o_level_integration_activity_marks
  add constraint o_level_activity_positive_number check (activity_number > 0);

create table public.o_level_integration_activities (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  term_id uuid not null references public.terms(id) on delete restrict,
  class_subject_offering_id uuid not null,
  activity_number integer not null check (activity_number > 0),
  title text not null check (length(trim(title)) between 3 and 160),
  activity_date date,
  maximum_mark numeric(8,2) not null check (maximum_mark > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint o_level_integration_activities_offering_fk foreign key (class_subject_offering_id,school_id) references public.class_subject_offerings(id,school_id) on delete restrict,
  constraint o_level_integration_activities_scope_uq unique (term_id,class_subject_offering_id,activity_number),
  constraint o_level_integration_activities_id_scope_uq unique (id,school_id,term_id,class_subject_offering_id)
);
create index o_level_integration_activities_school_year_idx on public.o_level_integration_activities(school_id,academic_year_id,term_id);
alter table public.o_level_integration_activities enable row level security;
create policy o_level_integration_activities_member_read on public.o_level_integration_activities
  for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.o_level_integration_activities from anon;
revoke insert,update,delete,truncate,references,trigger on public.o_level_integration_activities from authenticated;
grant select on public.o_level_integration_activities to authenticated;

insert into public.o_level_integration_activities
  (school_id,academic_year_id,term_id,class_subject_offering_id,activity_number,title,activity_date,maximum_mark,created_by)
select m.school_id,m.academic_year_id,m.term_id,m.class_subject_offering_id,m.activity_number,
  'Legacy Activity '||m.activity_number||' (title/date not recorded)',null,100,m.entered_by
from (select distinct on (term_id,class_subject_offering_id,activity_number) *
      from public.o_level_integration_activity_marks
      order by term_id,class_subject_offering_id,activity_number,created_at,id) m
on conflict (term_id,class_subject_offering_id,activity_number) do nothing;

alter table public.o_level_integration_activity_marks
  add column activity_id uuid,
  add column earned_mark numeric(8,2);
update public.o_level_integration_activity_marks m
  set activity_id=a.id,earned_mark=m.raw_mark
from public.o_level_integration_activities a
where a.term_id=m.term_id and a.class_subject_offering_id=m.class_subject_offering_id
  and a.activity_number=m.activity_number;
alter table public.o_level_integration_activity_marks
  alter column activity_id set not null;
alter table public.o_level_integration_activity_marks
  add constraint o_level_activity_definition_fk
  foreign key (activity_id,school_id,term_id,class_subject_offering_id)
  references public.o_level_integration_activities(id,school_id,term_id,class_subject_offering_id) on delete restrict;
alter table public.o_level_integration_activity_marks
  add constraint o_level_activity_earned_mark_range check (earned_mark is null or earned_mark >= 0);
alter table public.o_level_integration_activity_marks
  add constraint o_level_activity_earned_mark_state check ((mark_status='PRESENT' and earned_mark is not null) or (mark_status<>'PRESENT' and earned_mark is null));
grant select on public.o_level_integration_activity_marks to authenticated;

create table public.o_level_integration_activity_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  activity_id uuid not null references public.o_level_integration_activities(id) on delete restrict,
  learner_id uuid references public.learners(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null check (action in ('CREATED','SCORE_SAVED')),
  before_value jsonb,
  after_value jsonb not null,
  created_at timestamptz not null default now()
);
create index o_level_activity_events_school_idx on public.o_level_integration_activity_events(school_id,created_at desc);
alter table public.o_level_integration_activity_events enable row level security;
create policy o_level_activity_events_member_read on public.o_level_integration_activity_events
  for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.o_level_integration_activity_events from anon;
revoke insert,update,delete,truncate,references,trigger on public.o_level_integration_activity_events from authenticated;
grant select on public.o_level_integration_activity_events to authenticated;

-- The existing school/programme settings row remains the authority. Child
-- versions scope O-Level policy to an academic year and report-card type.
create table public.report_card_setting_versions (
  id uuid primary key default gen_random_uuid(),
  report_card_settings_id uuid not null references public.report_card_settings(id) on delete restrict,
  school_id uuid not null references public.schools(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  report_card_type text not null check (report_card_type in ('END_OF_TERM','MID_TERM')),
  version integer not null check (version > 0),
  reflected_aoi_count integer not null check (reflected_aoi_count > 0),
  selection_rule text not null check (selection_rule='LATEST_COMPLETED'),
  show_class_position boolean not null,
  changed_by uuid not null references public.users(id) on delete restrict,
  change_reason text not null check (length(trim(change_reason)) between 5 and 500),
  created_at timestamptz not null default now(),
  constraint report_card_setting_version_scope_uq unique (report_card_settings_id,academic_year_id,report_card_type,version)
);
create index report_card_setting_versions_current_idx on public.report_card_setting_versions(school_id,academic_year_id,report_card_type,version desc);
alter table public.report_card_setting_versions enable row level security;
create policy report_card_setting_versions_member_read on public.report_card_setting_versions
  for select to authenticated using (public.is_active_school_member(school_id));
revoke all on public.report_card_setting_versions from anon;
revoke insert,update,delete,truncate,references,trigger on public.report_card_setting_versions from authenticated;
grant select on public.report_card_setting_versions to authenticated;

create function public.prevent_report_card_setting_version_changes()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception 'Report-card setting versions are immutable; create a new version';
end $$;
create trigger report_card_setting_versions_immutable before update or delete on public.report_card_setting_versions
  for each row execute function public.prevent_report_card_setting_version_changes();

alter table public.report_snapshots
  add column report_card_setting_version_id uuid references public.report_card_setting_versions(id) on delete restrict,
  add column report_card_setting_snapshot jsonb;
alter table public.report_snapshots
  add constraint report_card_setting_snapshot_object check (report_card_setting_snapshot is null or jsonb_typeof(report_card_setting_snapshot)='object');

create function public.get_o_level_report_policy(p_school_id uuid,p_academic_year_id uuid,p_report_card_type text default 'END_OF_TERM')
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_row public.report_card_setting_versions; v_parent public.report_card_settings;
begin
  if not public.is_active_school_member(p_school_id) then raise exception 'Active school membership is required'; end if;
  if not exists(select 1 from public.academic_years y where y.id=p_academic_year_id and y.school_id=p_school_id) then
    raise exception 'Academic year is unavailable for this school'; end if;
  if p_report_card_type not in ('END_OF_TERM','MID_TERM') then raise exception 'Unsupported report-card type'; end if;
  select * into v_parent from public.report_card_settings where school_id=p_school_id and programme='O_LEVEL';
  select * into v_row from public.report_card_setting_versions
    where report_card_settings_id=v_parent.id and academic_year_id=p_academic_year_id and report_card_type=p_report_card_type
    order by version desc limit 1;
  if v_row.id is null then return jsonb_build_object('configured',false,'schoolId',p_school_id,'academicYearId',p_academic_year_id,'reportCardType',p_report_card_type); end if;
  return jsonb_build_object('configured',true,'id',v_row.id,'version',v_row.version,'schoolId',v_row.school_id,
    'academicYearId',v_row.academic_year_id,'reportCardType',v_row.report_card_type,
    'reflectedAoiCount',v_row.reflected_aoi_count,'selectionRule',v_row.selection_rule,
    'showClassPosition',v_row.show_class_position,'changedAt',v_row.created_at,'changeReason',v_row.change_reason);
end $$;

create function public.save_o_level_report_policy(
  p_school_id uuid,p_academic_year_id uuid,p_report_card_type text,
  p_reflected_aoi_count integer,p_selection_rule text,p_show_class_position boolean,p_reason text
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.current_app_user_id(); v_role text; v_parent public.report_card_settings;
  v_previous public.report_card_setting_versions; v_new public.report_card_setting_versions;
begin
  if v_actor is null or not public.is_active_school_member(p_school_id) then raise exception 'Active school membership is required'; end if;
  select r.code into v_role from public.school_memberships m join public.roles r on r.id=m.role_id
    where m.school_id=p_school_id and m.user_id=v_actor and m.status='ACTIVE' limit 1;
  if v_role is distinct from 'SCHOOL_ADMIN' then raise exception 'Only this School Administrator can change report-card settings'; end if;
  if not exists(select 1 from public.academic_years y where y.id=p_academic_year_id and y.school_id=p_school_id) then
    raise exception 'Academic year does not belong to this school'; end if;
  if p_report_card_type not in ('END_OF_TERM','MID_TERM') or p_selection_rule<>'LATEST_COMPLETED'
    or p_reflected_aoi_count is null or p_reflected_aoi_count<1 or p_show_class_position is null
    or length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Valid report-card settings and an audit reason are required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_school_id::text||':'||p_academic_year_id::text||':'||p_report_card_type,0));
  insert into public.report_card_settings(school_id,programme,settings,updated_by)
    values(p_school_id,'O_LEVEL','{}'::jsonb,v_actor)
    on conflict (school_id,programme) do nothing;
  select * into v_parent from public.report_card_settings where school_id=p_school_id and programme='O_LEVEL';
  select * into v_previous from public.report_card_setting_versions
    where report_card_settings_id=v_parent.id and academic_year_id=p_academic_year_id and report_card_type=p_report_card_type
    order by version desc limit 1;
  if v_previous.id is not null and v_previous.reflected_aoi_count=p_reflected_aoi_count
     and v_previous.selection_rule=p_selection_rule and v_previous.show_class_position=p_show_class_position then
    return public.get_o_level_report_policy(p_school_id,p_academic_year_id,p_report_card_type);
  end if;
  insert into public.report_card_setting_versions(report_card_settings_id,school_id,academic_year_id,report_card_type,
    version,reflected_aoi_count,selection_rule,show_class_position,changed_by,change_reason)
    values(v_parent.id,p_school_id,p_academic_year_id,p_report_card_type,coalesce(v_previous.version,0)+1,
      p_reflected_aoi_count,p_selection_rule,p_show_class_position,v_actor,trim(p_reason)) returning * into v_new;
  insert into public.audit_logs(user_name,user_role,action,entity_type,entity_id,old_value,new_value)
    values(v_actor::text,v_role,'O_LEVEL_REPORT_POLICY_VERSIONED','report_card_setting_version',v_new.id::text,
      case when v_previous.id is null then null else to_jsonb(v_previous) end,to_jsonb(v_new));
  return public.get_o_level_report_policy(p_school_id,p_academic_year_id,p_report_card_type);
end $$;

revoke all on function public.get_o_level_report_policy(uuid,uuid,text),public.save_o_level_report_policy(uuid,uuid,text,integer,text,boolean,text) from public,anon;
grant execute on function public.get_o_level_report_policy(uuid,uuid,text),public.save_o_level_report_policy(uuid,uuid,text,integer,text,boolean,text) to authenticated;

-- An activity belongs to one existing subject offering; learner scores stay in
-- o_level_integration_activity_marks, the register introduced in migration 115.
create function public.create_o_level_integration_activity(
  p_term_id uuid,p_class_subject_offering_id uuid,p_title text,p_activity_date date,p_maximum_mark numeric
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.current_app_user_id(); v_term public.terms; v_offering public.class_subject_offerings;
  v_activity public.o_level_integration_activities; v_next_number integer;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_class_subject_offering_id and status='ACTIVE';
  if v_actor is null or v_term.id is null or v_offering.id is null or v_offering.school_id<>v_term.school_id
     or v_offering.academic_year_id<>v_term.academic_year_id
     or not exists(select 1 from public.academic_classes c where c.id=v_offering.class_id and c.programme='O_LEVEL')
     or not public.is_active_school_member(v_term.school_id) then raise exception 'Active O-Level term, school membership and offering are required'; end if;
  if not exists(select 1 from public.teacher_allocations ta where ta.term_id=p_term_id
     and ta.class_subject_offering_id=p_class_subject_offering_id and ta.teacher_id=v_actor and ta.status='ACTIVE'
     and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then
    raise exception 'Only an actively allocated teacher may create an activity for this subject'; end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 160 or p_activity_date is null
     or p_maximum_mark is null or p_maximum_mark<=0 or p_maximum_mark>10000 then
    raise exception 'Enter a title, activity date and positive maximum mark'; end if;
  if exists(select 1 from public.academic_result_scopes s where s.term_id=p_term_id and s.class_id=v_offering.class_id)
     or exists(select 1 from public.academic_mark_submissions s where s.term_id=p_term_id
       and s.class_subject_offering_id=p_class_subject_offering_id and s.status in ('HOD_REVIEW','READY','MODERATED')) then
    raise exception 'Activity creation is locked while marks are submitted, moderated or class results are locked'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_term_id::text||':'||p_class_subject_offering_id::text,0));
  select coalesce(max(activity_number),0)+1 into v_next_number from public.o_level_integration_activities
    where term_id=p_term_id and class_subject_offering_id=p_class_subject_offering_id;
  insert into public.o_level_integration_activities(school_id,academic_year_id,term_id,class_subject_offering_id,
    activity_number,title,activity_date,maximum_mark,created_by)
    values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_subject_offering_id,v_next_number,
      trim(p_title),p_activity_date,round(p_maximum_mark,2),v_actor) returning * into v_activity;
  insert into public.o_level_integration_activity_events(school_id,activity_id,actor_user_id,action,after_value)
    values(v_term.school_id,v_activity.id,v_actor,'CREATED',to_jsonb(v_activity));
  return v_activity.id;
end $$;

create function public.get_o_level_activity_selection(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,p_setting_version_id uuid default null,
  p_report_card_type text default 'END_OF_TERM'
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_term public.terms; v_offering public.class_subject_offerings; v_policy public.report_card_setting_versions;
  v_selected jsonb; v_all jsonb; v_count integer; v_contribution numeric;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_class_subject_offering_id;
  if v_term.id is null or v_offering.id is null or v_offering.school_id<>v_term.school_id
     or v_offering.academic_year_id<>v_term.academic_year_id
     or (coalesce(auth.role(),'')<>'service_role' and not public.is_active_school_member(v_term.school_id))
     or not exists(select 1 from public.learners l where l.id=p_learner_id and l.school_id=v_term.school_id) then
    raise exception 'Activity selection is unavailable in this school context'; end if;
  if p_setting_version_id is not null then
    select * into v_policy from public.report_card_setting_versions where id=p_setting_version_id
      and school_id=v_term.school_id and academic_year_id=v_term.academic_year_id and report_card_type=p_report_card_type;
  else
    select * into v_policy from public.report_card_setting_versions where school_id=v_term.school_id
      and academic_year_id=v_term.academic_year_id and report_card_type=p_report_card_type
      order by version desc limit 1;
  end if;
  if v_policy.id is null then return jsonb_build_object('state','POLICY_NOT_CONFIGURED','required',null,'completed',0,
    'selected','[]'::jsonb,'recorded','[]'::jsonb,'contribution',null); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'number',a.activity_number,'title',a.title,'date',a.activity_date,
    'maximum',a.maximum_mark,'score',m.earned_mark,'rawPercentage',m.raw_mark,'status',coalesce(m.mark_status,'MISSING'))
    order by a.activity_date desc nulls last,a.activity_number desc),'[]'::jsonb) into v_all
  from public.o_level_integration_activities a left join public.o_level_integration_activity_marks m
    on m.activity_id=a.id and m.learner_id=p_learner_id
  where a.term_id=p_term_id and a.class_subject_offering_id=p_class_subject_offering_id;
  select count(*),coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.activity_number,'title',q.title,
    'date',q.activity_date,'maximum',q.maximum_mark,'score',q.earned_mark,
    'rawPercentage',q.raw_mark,'threePoint',public.o_level_three_point_v1(q.raw_mark))
    order by q.activity_date desc nulls last,q.activity_number desc),'[]'::jsonb),
    round(avg(public.o_level_three_point_v1(q.raw_mark))*20/3,2)
    into v_count,v_selected,v_contribution
  from (select a.id,a.activity_number,a.title,a.activity_date,a.maximum_mark,m.earned_mark,m.raw_mark
        from public.o_level_integration_activities a join public.o_level_integration_activity_marks m
          on m.activity_id=a.id and m.learner_id=p_learner_id and m.mark_status='PRESENT'
        where a.term_id=p_term_id and a.class_subject_offering_id=p_class_subject_offering_id
        order by a.activity_date desc nulls last,a.activity_number desc,a.id desc
        limit v_policy.reflected_aoi_count) q;
  return jsonb_build_object('state',case when v_count=v_policy.reflected_aoi_count then 'COMPLETE' else 'INCOMPLETE' end,
    'required',v_policy.reflected_aoi_count,'completed',v_count,'selectionRule',v_policy.selection_rule,
    'settingVersionId',v_policy.id,'settingVersion',v_policy.version,'selected',v_selected,'recorded',v_all,
    'contribution',case when v_count=v_policy.reflected_aoi_count then v_contribution else null end);
end $$;

create function public.save_o_level_activity_score(
  p_activity_id uuid,p_learner_id uuid,p_score numeric,p_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_actor uuid:=public.current_app_user_id(); v_activity public.o_level_integration_activities;
  v_existing public.o_level_integration_activity_marks; v_mark public.academic_mark_records;
  v_selection jsonb; v_raw numeric; v_id uuid;
begin
  select * into v_activity from public.o_level_integration_activities where id=p_activity_id;
  if v_actor is null or v_activity.id is null or not public.is_active_school_member(v_activity.school_id) then
    raise exception 'Activity is unavailable in the active school'; end if;
  if not exists(select 1 from public.teacher_allocations ta where ta.term_id=v_activity.term_id
     and ta.class_subject_offering_id=v_activity.class_subject_offering_id and ta.teacher_id=v_actor and ta.status='ACTIVE'
     and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then
    raise exception 'Only an actively allocated teacher may enter this activity score'; end if;
  p_status:=upper(coalesce(p_status,''));
  if p_status not in ('MISSING','PRESENT','ABSENT','EXEMPT') then raise exception 'Unsupported activity state'; end if;
  if (p_status='PRESENT' and (p_score is null or p_score<0 or p_score>v_activity.maximum_mark))
     or (p_status<>'PRESENT' and p_score is not null) then
    raise exception 'Present score must be between zero and the activity maximum; other states have no score'; end if;
  if p_score is not null then p_score:=round(p_score,2); v_raw:=round(p_score/v_activity.maximum_mark*100,2); end if;
  perform pg_advisory_xact_lock(hashtextextended(v_activity.term_id::text||':'||v_activity.class_subject_offering_id::text||':'||p_learner_id::text,0));
  select * into v_existing from public.o_level_integration_activity_marks where activity_id=p_activity_id and learner_id=p_learner_id;
  select * into v_mark from public.academic_mark_records where term_id=v_activity.term_id
    and class_subject_offering_id=v_activity.class_subject_offering_id and learner_id=p_learner_id;
  insert into public.o_level_integration_activity_marks(school_id,academic_year_id,term_id,class_subject_offering_id,
    learner_id,activity_number,activity_id,earned_mark,raw_mark,mark_status,entered_by)
    values(v_activity.school_id,v_activity.academic_year_id,v_activity.term_id,v_activity.class_subject_offering_id,
      p_learner_id,v_activity.activity_number,v_activity.id,p_score,v_raw,p_status,v_actor)
    on conflict(term_id,class_subject_offering_id,learner_id,activity_number) do update
      set activity_id=excluded.activity_id,earned_mark=excluded.earned_mark,raw_mark=excluded.raw_mark,
          mark_status=excluded.mark_status,entered_by=excluded.entered_by,updated_at=now();
  v_selection:=public.get_o_level_activity_selection(v_activity.term_id,v_activity.class_subject_offering_id,p_learner_id);
  v_id:=public.save_academic_mark_record(v_activity.term_id,v_activity.class_subject_offering_id,p_learner_id,
    case when v_selection->>'state'='COMPLETE' then (v_selection->>'contribution')::numeric else null end,
    case when v_selection->>'state'='COMPLETE' then 'PRESENT' else 'MISSING' end,
    v_mark.exam_mark,coalesce(v_mark.exam_status,'MISSING'));
  insert into public.o_level_integration_activity_events(school_id,activity_id,learner_id,actor_user_id,action,before_value,after_value)
    values(v_activity.school_id,p_activity_id,p_learner_id,v_actor,'SCORE_SAVED',
      case when v_existing.id is null then null else to_jsonb(v_existing) end,
      jsonb_build_object('score',p_score,'maximum',v_activity.maximum_mark,'rawPercentage',v_raw,'status',p_status,
        'selectionState',v_selection->>'state','markRecordId',v_id));
  return v_id;
end $$;

-- Preserve compatibility with the A1/A2 API until all deployed web clients
-- use activity IDs. Its former hard-coded arithmetic is no longer authoritative.
create or replace function public.save_o_level_activity_mark(
  p_term_id uuid,p_class_subject_offering_id uuid,p_learner_id uuid,
  p_activity_number smallint,p_raw_mark numeric,p_status text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_activity public.o_level_integration_activities; v_term public.terms; v_actor uuid:=public.current_app_user_id();
begin
  if p_activity_number not in (1,2) then raise exception 'The legacy entry accepts only A1 or A2'; end if;
  select * into v_activity from public.o_level_integration_activities where term_id=p_term_id
    and class_subject_offering_id=p_class_subject_offering_id and activity_number=p_activity_number;
  if v_activity.id is null then
    select * into v_term from public.terms where id=p_term_id;
    if v_term.id is null or v_actor is null or not exists(select 1 from public.class_subject_offerings co
      join public.academic_classes c on c.id=co.class_id where co.id=p_class_subject_offering_id
      and co.school_id=v_term.school_id and co.academic_year_id=v_term.academic_year_id and c.programme='O_LEVEL')
      or not exists(select 1 from public.teacher_allocations ta where ta.term_id=p_term_id
        and ta.class_subject_offering_id=p_class_subject_offering_id and ta.teacher_id=v_actor and ta.status='ACTIVE'
        and ta.allocation_role in ('PRIMARY_SUBJECT_TEACHER','CO_TEACHER')) then
      raise exception 'Only an actively allocated O-Level teacher may record an activity'; end if;
    insert into public.o_level_integration_activities(school_id,academic_year_id,term_id,class_subject_offering_id,
      activity_number,title,activity_date,maximum_mark,created_by)
      values(v_term.school_id,v_term.academic_year_id,p_term_id,p_class_subject_offering_id,p_activity_number,
        'Legacy Activity '||p_activity_number||' (title/date not recorded)',null,100,v_actor)
      on conflict(term_id,class_subject_offering_id,activity_number) do nothing;
    select * into v_activity from public.o_level_integration_activities where term_id=p_term_id
      and class_subject_offering_id=p_class_subject_offering_id and activity_number=p_activity_number;
  end if;
  return public.save_o_level_activity_score(v_activity.id,p_learner_id,p_raw_mark,p_status);
end $$;

revoke all on function public.create_o_level_integration_activity(uuid,uuid,text,date,numeric),
  public.get_o_level_activity_selection(uuid,uuid,uuid,uuid,text),
  public.save_o_level_activity_score(uuid,uuid,numeric,text) from public,anon;
grant execute on function public.create_o_level_integration_activity(uuid,uuid,text,date,numeric),
  public.get_o_level_activity_selection(uuid,uuid,uuid,uuid,text),
  public.save_o_level_activity_score(uuid,uuid,numeric,text) to authenticated;

-- Keep get_marks_entry_workspace as the single marks roster. Add dynamic
-- definitions and each learner's existing activity scores to its JSON shape.
alter function public.get_marks_entry_workspace(uuid) rename to get_marks_entry_workspace_before_dynamic_activities;
revoke all on function public.get_marks_entry_workspace_before_dynamic_activities(uuid) from public,anon,authenticated;
create function public.get_marks_entry_workspace(p_term_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_payload jsonb; v_offerings jsonb;
begin
  v_payload:=public.get_marks_entry_workspace_before_dynamic_activities(p_term_id);
  select coalesce(jsonb_agg(
    case when offering->>'programme'='O_LEVEL' then
      jsonb_set(jsonb_set(offering,'{activities}',coalesce((
        select jsonb_agg(jsonb_build_object('id',a.id,'number',a.activity_number,'title',a.title,
          'date',a.activity_date,'maximum',a.maximum_mark,'createdBy',a.created_by)
          order by a.activity_date desc nulls last,a.activity_number desc)
        from public.o_level_integration_activities a where a.term_id=p_term_id
          and a.class_subject_offering_id=(offering->>'id')::uuid),'[]'::jsonb)),
        '{learners}',coalesce((
        select jsonb_agg(learner || jsonb_build_object(
          'activityMarks',coalesce((select jsonb_agg(jsonb_build_object('activityId',m.activity_id,
            'score',m.earned_mark,'rawPercentage',m.raw_mark,'status',m.mark_status,
            'enteredBy',m.entered_by,'updatedAt',m.updated_at) order by m.activity_number)
            from public.o_level_integration_activity_marks m where m.term_id=p_term_id
              and m.class_subject_offering_id=(offering->>'id')::uuid
              and m.learner_id=(learner->>'id')::uuid),'[]'::jsonb),
          'aoiSelection',public.get_o_level_activity_selection(p_term_id,(offering->>'id')::uuid,(learner->>'id')::uuid)
        ) order by learner_order)
        from jsonb_array_elements(offering->'learners') with ordinality as l(learner,learner_order)
        ),'[]'::jsonb))
    else offering end order by offering_order),'[]'::jsonb) into v_offerings
  from jsonb_array_elements(v_payload->'offerings') with ordinality as o(offering,offering_order);
  return jsonb_set(v_payload,'{offerings}',v_offerings);
end $$;
revoke all on function public.get_marks_entry_workspace(uuid) from public,anon;
grant execute on function public.get_marks_entry_workspace(uuid) to authenticated;

-- Existing moderation and result-lock operations must fail closed if a newer
-- policy selects a different set of activities from the persisted /20 mark.
create function public.assert_o_level_offering_assessment_complete(p_term_id uuid,p_offering_id uuid)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_term public.terms; v_offering public.class_subject_offerings; v_learner record;
  v_selection jsonb; v_mark public.academic_mark_records; v_count integer:=0;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_offering from public.class_subject_offerings where id=p_offering_id;
  if v_term.id is null or v_offering.id is null or v_term.school_id<>v_offering.school_id
    or not public.is_active_school_member(v_term.school_id) then raise exception 'Offering is unavailable in the active school'; end if;
  if not exists(select 1 from public.academic_classes c where c.id=v_offering.class_id and c.programme='O_LEVEL') then return; end if;
  for v_learner in select distinct ls.learner_id from public.learner_subject_enrolments ls
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    join public.learners l on l.id=ls.learner_id and l.school_id=ls.school_id
    where ls.class_subject_offering_id=p_offering_id and ls.school_id=v_term.school_id
      and ls.status='ACTIVE' and e.status='ACTIVE' and e.effective_to is null
      and e.academic_year_id=v_term.academic_year_id and l.status='ACTIVE'
  loop
    v_count:=v_count+1;
    v_selection:=public.get_o_level_activity_selection(p_term_id,p_offering_id,v_learner.learner_id);
    select * into v_mark from public.academic_mark_records where term_id=p_term_id
      and class_subject_offering_id=p_offering_id and learner_id=v_learner.learner_id;
    if v_selection->>'state'<>'COMPLETE' or v_mark.id is null or v_mark.aoi_status<>'PRESENT'
      or v_mark.aoi_mark is null or v_mark.exam_status<>'PRESENT' or v_mark.exam_mark is null
      or abs(v_mark.aoi_mark-(v_selection->>'contribution')::numeric)>0.01 then
      raise exception 'O-Level assessment is incomplete or out of sync for learner %. Refresh the selected activities and marks before review',v_learner.learner_id;
    end if;
  end loop;
  if v_count=0 then raise exception 'No active learner subject enrolments are available for this O-Level offering'; end if;
end $$;
revoke all on function public.assert_o_level_offering_assessment_complete(uuid,uuid) from public,anon,authenticated;

alter function public.submit_academic_mark_offering(uuid,uuid,text) rename to submit_academic_mark_offering_before_dynamic_activities;
revoke all on function public.submit_academic_mark_offering_before_dynamic_activities(uuid,uuid,text) from public,anon,authenticated;
create function public.submit_academic_mark_offering(p_term_id uuid,p_class_subject_offering_id uuid,p_note text default 'Submitted for academic review')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.assert_o_level_offering_assessment_complete(p_term_id,p_class_subject_offering_id);
  return public.submit_academic_mark_offering_before_dynamic_activities(p_term_id,p_class_subject_offering_id,p_note);
end $$;
revoke all on function public.submit_academic_mark_offering(uuid,uuid,text) from public,anon;
grant execute on function public.submit_academic_mark_offering(uuid,uuid,text) to authenticated;

alter function public.review_academic_mark_submission(uuid,text,text) rename to review_academic_mark_submission_before_dynamic_activities;
revoke all on function public.review_academic_mark_submission_before_dynamic_activities(uuid,text,text) from public,anon,authenticated;
create function public.review_academic_mark_submission(p_submission_id uuid,p_decision text,p_note text)
returns public.academic_mark_submissions language plpgsql security definer set search_path=public,pg_temp as $$
declare v_row public.academic_mark_submissions;
begin
  if upper(trim(coalesce(p_decision,''))) in ('READY','MODERATED') then
    select * into v_row from public.academic_mark_submissions where id=p_submission_id;
    if v_row.id is null then raise exception 'Mark submission is unavailable'; end if;
    perform public.assert_o_level_offering_assessment_complete(v_row.term_id,v_row.class_subject_offering_id);
  end if;
  return public.review_academic_mark_submission_before_dynamic_activities(p_submission_id,p_decision,p_note);
end $$;
revoke all on function public.review_academic_mark_submission(uuid,text,text) from public,anon;
grant execute on function public.review_academic_mark_submission(uuid,text,text) to authenticated;

alter function public.lock_academic_class_results(uuid,uuid,text) rename to lock_academic_class_results_before_dynamic_activities;
revoke all on function public.lock_academic_class_results_before_dynamic_activities(uuid,uuid,text) from public,anon,authenticated;
create function public.lock_academic_class_results(p_term_id uuid,p_class_id uuid,p_note text default 'Class results locked after moderation')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_offering record;
begin
  for v_offering in select distinct co.id from public.class_subject_offerings co
    join public.learner_subject_enrolments ls on ls.class_subject_offering_id=co.id and ls.school_id=co.school_id
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    where co.class_id=p_class_id and e.class_id=p_class_id and e.status='ACTIVE' and e.effective_to is null
      and ls.status='ACTIVE' and co.academic_year_id=(select t.academic_year_id from public.terms t where t.id=p_term_id)
  loop
    perform public.assert_o_level_offering_assessment_complete(p_term_id,v_offering.id);
  end loop;
  return public.lock_academic_class_results_before_dynamic_activities(p_term_id,p_class_id,p_note);
end $$;
revoke all on function public.lock_academic_class_results(uuid,uuid,text) from public,anon;
grant execute on function public.lock_academic_class_results(uuid,uuid,text) to authenticated;

-- Competition rank: same active class and stream, approved class scope only;
-- every comparator must have all selected subjects complete and approved.
-- Incomplete learners are excluded and counted, never assigned a rank.
create function public.get_o_level_class_position(
  p_term_id uuid,p_class_id uuid,p_learner_id uuid,p_report_card_type text default 'END_OF_TERM'
) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_term public.terms; v_class public.academic_classes; v_policy public.report_card_setting_versions;
  v_stream uuid; v_peer record; v_subject record; v_selection jsonb; v_score numeric;
  v_subjects integer; v_valid integer; v_average numeric; v_target numeric;
  v_completed integer:=0; v_excluded integer:=0; v_above integer:=0; v_tied integer:=0;
begin
  select * into v_term from public.terms where id=p_term_id;
  select * into v_class from public.academic_classes where id=p_class_id;
  if v_term.id is null or v_class.id is null or v_class.school_id<>v_term.school_id
     or v_class.academic_year_id<>v_term.academic_year_id or v_class.programme<>'O_LEVEL'
     or (coalesce(auth.role(),'')<>'service_role' and not public.is_active_school_member(v_term.school_id)) then raise exception 'Class position is unavailable in this school context'; end if;
  select e.stream_id into v_stream from public.learner_class_enrolments e
    where e.learner_id=p_learner_id and e.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id
      and e.class_id=p_class_id and e.status='ACTIVE' and e.effective_to is null limit 1;
  if not found then raise exception 'Learner is not active in this class'; end if;
  select * into v_policy from public.report_card_setting_versions where school_id=v_term.school_id
    and academic_year_id=v_term.academic_year_id and report_card_type=p_report_card_type
    order by version desc limit 1;
  if v_policy.id is null then return jsonb_build_object('state','POLICY_NOT_CONFIGURED'); end if;
  if not v_policy.show_class_position then return jsonb_build_object('state','HIDDEN'); end if;
  if not exists(select 1 from public.academic_result_scopes s where s.term_id=p_term_id and s.class_id=p_class_id and s.status='APPROVED') then
    return jsonb_build_object('state','UNAPPROVED'); end if;
  for v_peer in select distinct e.learner_id from public.learner_class_enrolments e
    join public.learners l on l.id=e.learner_id and l.school_id=e.school_id
    where e.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id
      and e.stream_id is not distinct from v_stream and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE'
  loop
    v_subjects:=0; v_valid:=0; v_average:=0;
    for v_subject in select co.id,mr.aoi_mark,mr.aoi_status,mr.exam_mark,mr.exam_status,mr.workflow_status
      from public.learner_subject_enrolments ls
      join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
      join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
      left join public.academic_mark_records mr on mr.term_id=p_term_id and mr.class_subject_offering_id=co.id and mr.learner_id=v_peer.learner_id
      where ls.learner_id=v_peer.learner_id and ls.status='ACTIVE' and e.status='ACTIVE' and e.effective_to is null
        and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id and co.status='ACTIVE'
        and co.academic_year_id=v_term.academic_year_id
    loop
      v_subjects:=v_subjects+1;
      v_selection:=public.get_o_level_activity_selection(p_term_id,v_subject.id,v_peer.learner_id,v_policy.id,p_report_card_type);
      if v_selection->>'state'='COMPLETE' and v_subject.aoi_status='PRESENT' and v_subject.exam_status='PRESENT'
         and v_subject.workflow_status in ('APPROVED','PUBLISHED')
         and abs(v_subject.aoi_mark-(v_selection->>'contribution')::numeric)<=0.01 then
        v_valid:=v_valid+1;
        v_average:=v_average+v_subject.aoi_mark+v_subject.exam_mark;
      end if;
    end loop;
    if v_subjects=0 or v_valid<>v_subjects then
      v_excluded:=v_excluded+1;
      if v_peer.learner_id=p_learner_id then v_target:=null; end if;
    else
      v_completed:=v_completed+1;
      v_average:=round(v_average/v_subjects,2);
      if v_peer.learner_id=p_learner_id then v_target:=v_average; end if;
    end if;
  end loop;
  if v_target is null then return jsonb_build_object('state','INCOMPLETE','comparisonGroup','CLASS_AND_STREAM',
    'eligibleLearners',v_completed,'excludedLearners',v_excluded); end if;
  for v_peer in select distinct e.learner_id from public.learner_class_enrolments e
    join public.learners l on l.id=e.learner_id and l.school_id=e.school_id
    where e.school_id=v_term.school_id and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id
      and e.stream_id is not distinct from v_stream and e.status='ACTIVE' and e.effective_to is null and l.status='ACTIVE'
  loop
    v_subjects:=0; v_valid:=0; v_average:=0;
    for v_subject in select co.id,mr.aoi_mark,mr.aoi_status,mr.exam_mark,mr.exam_status,mr.workflow_status
      from public.learner_subject_enrolments ls
      join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
      join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
      left join public.academic_mark_records mr on mr.term_id=p_term_id and mr.class_subject_offering_id=co.id and mr.learner_id=v_peer.learner_id
      where ls.learner_id=v_peer.learner_id and ls.status='ACTIVE' and e.status='ACTIVE' and e.effective_to is null
        and e.academic_year_id=v_term.academic_year_id and e.class_id=p_class_id and co.status='ACTIVE'
        and co.academic_year_id=v_term.academic_year_id
    loop
      v_subjects:=v_subjects+1;
      v_selection:=public.get_o_level_activity_selection(p_term_id,v_subject.id,v_peer.learner_id,v_policy.id,p_report_card_type);
      if v_selection->>'state'='COMPLETE' and v_subject.aoi_status='PRESENT' and v_subject.exam_status='PRESENT'
         and v_subject.workflow_status in ('APPROVED','PUBLISHED')
         and abs(v_subject.aoi_mark-(v_selection->>'contribution')::numeric)<=0.01 then
        v_valid:=v_valid+1; v_average:=v_average+v_subject.aoi_mark+v_subject.exam_mark;
      end if;
    end loop;
    if v_subjects>0 and v_valid=v_subjects then
      v_average:=round(v_average/v_subjects,2);
      if v_average>v_target then v_above:=v_above+1; end if;
      if v_average=v_target then v_tied:=v_tied+1; end if;
    end if;
  end loop;
  return jsonb_build_object('state','READY','position',v_above+1,'outOf',v_completed,'tiedCount',v_tied,
    'excludedLearners',v_excluded,'comparisonGroup','CLASS_AND_STREAM','tieRule','COMPETITION',
    'settingVersionId',v_policy.id,'average',v_target);
end $$;
revoke all on function public.get_o_level_class_position(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.get_o_level_class_position(uuid,uuid,uuid,text) to authenticated;

-- Freeze the policy identity with future immutable snapshots. This does not
-- retrofit or rewrite already issued reports.
create function public.stamp_o_level_report_policy()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_policy public.report_card_setting_versions; v_type text; v_offering record;
  v_selection jsonb; v_evidence jsonb:='{}'::jsonb; v_marks public.academic_mark_records; v_position jsonb;
begin
  if new.report_template_key not like 'O_LEVEL%' then return new; end if;
  if tg_op='UPDATE' and old.status='PUBLISHED' then raise exception 'Issued O-Level reports are immutable'; end if;
  v_type:=case when new.report_template_key like '%MID%' then 'MID_TERM' else 'END_OF_TERM' end;
  if not exists(select 1 from public.academic_classes c where c.id=new.class_id and c.school_id=new.school_id
       and c.academic_year_id=new.academic_year_id and c.programme='O_LEVEL')
    or not exists(select 1 from public.terms t where t.id=new.term_id and t.school_id=new.school_id
       and t.academic_year_id=new.academic_year_id)
    or not exists(select 1 from public.learners l where l.id=new.learner_id and l.school_id=new.school_id) then
    raise exception 'O-Level snapshot school, year, term, class and learner must share one scope';
  end if;
  if new.report_card_setting_version_id is null then
    if tg_op='UPDATE' then raise exception 'Legacy O-Level snapshot requires authorised regeneration under a versioned policy'; end if;
    select * into v_policy from public.report_card_setting_versions where school_id=new.school_id
      and academic_year_id=new.academic_year_id and report_card_type=v_type order by version desc limit 1;
  else
    select * into v_policy from public.report_card_setting_versions where id=new.report_card_setting_version_id
      and school_id=new.school_id and academic_year_id=new.academic_year_id and report_card_type=v_type;
  end if;
  if v_policy.id is null then raise exception 'A versioned school report-card policy is required before preparing an O-Level snapshot'; end if;
  if tg_op='UPDATE' and old.report_card_setting_version_id is distinct from v_policy.id then
    raise exception 'Snapshot settings are immutable; regenerate through the approval workflow'; end if;
  new.report_card_setting_version_id:=v_policy.id;
  if tg_op='UPDATE' then
    if new.report_card_setting_snapshot is distinct from old.report_card_setting_snapshot
      or new.snapshot_data->'oLevelActivityEvidence' is distinct from old.snapshot_data->'oLevelActivityEvidence' then
      raise exception 'Approved report policy and selected activities are immutable'; end if;
    return new;
  end if;
  for v_offering in select distinct co.id from public.learner_subject_enrolments ls
    join public.learner_class_enrolments e on e.id=ls.enrolment_id and e.school_id=ls.school_id
    join public.class_subject_offerings co on co.id=ls.class_subject_offering_id and co.school_id=ls.school_id
    where ls.learner_id=new.learner_id and ls.school_id=new.school_id and ls.status='ACTIVE'
      and e.class_id=new.class_id and e.academic_year_id=new.academic_year_id and e.status='ACTIVE'
      and e.effective_to is null and co.status='ACTIVE'
  loop
    v_selection:=public.get_o_level_activity_selection(new.term_id,v_offering.id,new.learner_id,v_policy.id,v_type);
    select * into v_marks from public.academic_mark_records where term_id=new.term_id
      and class_subject_offering_id=v_offering.id and learner_id=new.learner_id;
    if v_selection->>'state'<>'COMPLETE' or v_marks.id is null or v_marks.aoi_status<>'PRESENT'
      or v_marks.exam_status<>'PRESENT' or v_marks.workflow_status not in ('APPROVED','PUBLISHED')
      or abs(v_marks.aoi_mark-(v_selection->>'contribution')::numeric)>0.01 then
      raise exception 'O-Level report snapshot is blocked by incomplete or unapproved activity results for subject %',v_offering.id;
    end if;
    v_evidence:=v_evidence||jsonb_build_object(v_offering.id::text,v_selection);
  end loop;
  if v_evidence='{}'::jsonb then raise exception 'O-Level report snapshot has no approved learner subjects'; end if;
  if v_policy.show_class_position then
    v_position:=public.get_o_level_class_position(new.term_id,new.class_id,new.learner_id,v_type);
    if v_position->>'state'<>'READY' then raise exception 'Class position cannot be issued until class results are approved and complete'; end if;
    new.snapshot_data:=new.snapshot_data||jsonb_build_object('oLevelClassPosition',v_position);
  else
    new.snapshot_data:=new.snapshot_data-'oLevelClassPosition';
  end if;
  new.snapshot_data:=new.snapshot_data||jsonb_build_object('oLevelActivityEvidence',v_evidence);
  new.report_card_setting_snapshot:=jsonb_build_object('version',v_policy.version,'reflectedAoiCount',v_policy.reflected_aoi_count,
    'selectionRule',v_policy.selection_rule,'showClassPosition',v_policy.show_class_position,
    'reportCardType',v_policy.report_card_type);
  return new;
end $$;
create trigger report_snapshots_o_level_policy_before_insert_update
  before insert or update of status on public.report_snapshots
  for each row execute function public.stamp_o_level_report_policy();

notify pgrst,'reload schema';
