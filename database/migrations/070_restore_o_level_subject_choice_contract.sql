-- Restore the learner-subject reader contract on databases whose migration history
-- reports 20261005150000 as applied but still serves the earlier RPC definition.
-- No selections, marks, or class offerings are changed by this migration.
alter table public.o_level_curriculum_rule_sets
  add column if not exists curriculum_version text not null default '2026.1';

create or replace function public.get_o_level_learner_subject_choices(p_enrolment_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_enrolment public.learner_class_enrolments;v_class public.academic_classes;v_sne boolean;v_rules public.o_level_curriculum_rule_sets%rowtype;
begin
  select * into v_enrolment from public.learner_class_enrolments where id=p_enrolment_id;
  if v_enrolment.id is null or v_enrolment.status<>'ACTIVE' or v_enrolment.effective_to is not null or not public.is_active_school_member(v_enrolment.school_id) then raise exception 'Learner enrolment unavailable'; end if;
  select * into v_class from public.academic_classes where id=v_enrolment.class_id and school_id=v_enrolment.school_id;
  if v_class.id is null or v_class.programme<>'O_LEVEL' then raise exception 'O-Level learner required'; end if;
  select * into v_rules from public.o_level_curriculum_rule_sets where id=v_class.o_level_rule_set_id;
  if v_rules.id is null then raise exception 'CLASS_CURRICULUM_NOT_CONFIGURED'; end if;
  select exists(select 1 from public.o_level_curriculum_exceptions x where x.learner_id=v_enrolment.learner_id and x.academic_year_id=v_enrolment.academic_year_id and x.exception_code='GENERAL_SCIENCE_REPLACEMENT' and x.is_active) into v_sne;
  return jsonb_build_object(
    'classLevel',v_class.level,'className',v_class.class_name,'streamName',(select stream_name from public.class_streams where id=v_enrolment.stream_id),
    'academicYearId',v_enrolment.academic_year_id,'academicYearName',(select name from public.academic_years where id=v_enrolment.academic_year_id),
    'curriculumVersion',v_rules.curriculum_version,'learnerId',v_enrolment.learner_id,'enrolmentId',v_enrolment.id,
    'requiredCount',case when v_class.level<=2 then 11 when v_sne then 5 else 7 end,'sneReplacement',v_sne,
    'electiveMin',case when v_class.level<=2 then v_rules.elective_min_s1_s2 else v_rules.elective_min_s3_s4 end,
    'electiveMax',case when v_class.level<=2 then v_rules.elective_max_s1_s2 else v_rules.elective_max_s3_s4 end,
    'subjects',coalesce((select jsonb_agg(jsonb_build_object(
      'offeringId',co.id,'schoolOfferingId',so.id,'systemSubjectId',ss.id,
      'schoolActive',so.status='ACTIVE','classOffered',co.id is not null and co.status='ACTIVE',
      'code',coalesce(so.school_subject_code,ss.subject_code),'name',coalesce(so.display_name_override,ss.subject_name),
      'requirement',r.requirement,'category',r.elective_category,
      'available',co.id is not null and co.status='ACTIVE' and so.status='ACTIVE' and ss.is_active,
      'availabilityReason',case
        when not ss.is_active then 'This subject is inactive in the platform catalogue.'
        when so.id is null then 'This subject is not active for this school year.'
        when so.status<>'ACTIVE' then 'This subject is inactive for this school year.'
        when co.id is null and exists(select 1 from public.class_subject_offerings other_co where other_co.class_id=v_class.id and other_co.school_subject_offering_id=so.id and other_co.stream_id is not null and other_co.stream_id<>v_enrolment.stream_id) then 'This subject is offered to a different stream.'
        when co.id is null then 'This subject has not been offered to this class or stream.'
        when co.status<>'ACTIVE' then 'This class offering is inactive.'
        else null end,
      'selected',ls.id is not null,'selectionType',ls.selection_type,
      'hasHistory',exists(select 1 from public.academic_mark_records mr where mr.learner_id=v_enrolment.learner_id and mr.class_subject_offering_id=co.id)
        or exists(select 1 from public.assessment_subject_papers asp join public.academic_assessments aa on aa.id=asp.assessment_id
          where asp.school_subject_offering_id=so.id and aa.school_id=v_enrolment.school_id and aa.academic_year_id=v_enrolment.academic_year_id)
        or exists(select 1 from public.report_snapshots rs join public.report_subject_results rr on rr.report_snapshot_id=rs.id where rs.learner_id=v_enrolment.learner_id and rs.academic_year_id=v_enrolment.academic_year_id and rr.subject_id=ss.id)
    ) order by case r.requirement when 'CORE' then 0 when 'SNE_REPLACEMENT' then 0 when 'RELIGION_OPTION' then 1 else 2 end,ss.subject_name)
    from public.o_level_curriculum_subject_rules r join public.system_subjects ss on ss.id=r.system_subject_id
    left join lateral (select candidate.* from public.school_subject_offerings candidate
      where candidate.school_id=v_enrolment.school_id and candidate.academic_year_id=v_enrolment.academic_year_id and candidate.system_subject_id=ss.id
      order by (candidate.status='ACTIVE') desc,candidate.updated_at desc limit 1) so on true
    left join lateral (select candidate.* from public.class_subject_offerings candidate
      where candidate.class_id=v_class.id and candidate.school_id=v_enrolment.school_id and candidate.academic_year_id=v_enrolment.academic_year_id
        and candidate.school_subject_offering_id=so.id and (candidate.stream_id is null or candidate.stream_id=v_enrolment.stream_id)
      order by (candidate.stream_id=v_enrolment.stream_id) desc nulls last,(candidate.status='ACTIVE') desc limit 1) co on true
    left join public.learner_subject_enrolments ls on ls.enrolment_id=v_enrolment.id and ls.class_subject_offering_id=co.id and ls.status='ACTIVE'
    where r.rule_set_id=v_class.o_level_rule_set_id and r.class_level=v_class.level and r.requirement in ('CORE','SNE_REPLACEMENT','RELIGION_OPTION','ELECTIVE')
      and ((r.requirement<>'SNE_REPLACEMENT' and r.is_active) or (r.requirement='SNE_REPLACEMENT' and r.is_active and v_sne))
      and not (v_sne and r.requirement='CORE' and ss.subject_code in ('535','553','545'))),'[]'::jsonb)
  );
end $$;

revoke all on function public.get_o_level_learner_subject_choices(uuid) from public, anon;
grant execute on function public.get_o_level_learner_subject_choices(uuid) to authenticated;
notify pgrst, 'reload schema';
