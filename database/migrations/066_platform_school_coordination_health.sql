-- Read-only, aggregate-only Platform Control Centre view of academic tenant
-- coordination. This intentionally returns no learner, mark, or staff PII.
create or replace function public.get_platform_school_coordination(p_school_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_school public.schools%rowtype;
  v_years jsonb;
  v_integrity jsonb;
begin
  if not exists (
    select 1 from public.platform_admins
    where auth_user_id = auth.uid() and is_active = true
  ) then
    raise exception 'NOT_AUTHORISED';
  end if;

  if p_school_id is null then
    select coalesce(jsonb_agg(public.get_platform_school_coordination(s.id) order by s.official_name), '[]'::jsonb)
      into v_years from public.schools s;
    return v_years;
  end if;

  select * into v_school from public.schools where id = p_school_id;
  if not found then raise exception 'SCHOOL_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', y.id,
    'name', y.name,
    'status', y.status,
    'classes', (select count(*) from public.academic_classes c where c.school_id = v_school.id and c.academic_year_id = y.id),
    'activeClasses', (select count(*) from public.academic_classes c where c.school_id = v_school.id and c.academic_year_id = y.id and c.status = 'ACTIVE'),
    'learners', (select count(distinct e.learner_id) from public.learner_class_enrolments e where e.school_id = v_school.id and e.academic_year_id = y.id and e.status = 'ACTIVE' and e.effective_to is null),
    'subjectOfferings', (select count(*) from public.school_subject_offerings so where so.school_id = v_school.id and so.academic_year_id = y.id and so.status = 'ACTIVE'),
    'classSubjectLinks', (select count(*) from public.class_subject_offerings co where co.school_id = v_school.id and co.academic_year_id = y.id and co.status = 'ACTIVE'),
    'learnerSubjectSelections', (select count(*) from public.learner_subject_enrolments ls join public.learner_class_enrolments e on e.id = ls.enrolment_id and e.school_id = ls.school_id where ls.school_id = v_school.id and e.academic_year_id = y.id and ls.status = 'ACTIVE'),
    'oLevelCombinations', (select count(*) from public.subject_combinations c where c.school_id = v_school.id and c.academic_year_id = y.id and c.status = 'ACTIVE'),
    'aLevelCombinations', (select count(*) from public.a_level_combinations c where c.school_id = v_school.id and c.academic_year_id = y.id and c.status = 'ACTIVE'),
    'aLevelAssignments', (select count(*) from public.a_level_learner_assignments aa join public.academic_classes c on c.id = aa.class_id and c.school_id = aa.school_id where aa.school_id = v_school.id and c.academic_year_id = y.id and aa.status = 'ACTIVE'),
    'teacherAllocations', (select count(*) from public.teacher_allocations ta where ta.school_id = v_school.id and ta.academic_year_id = y.id and ta.status = 'ACTIVE'),
    'assessments', (select count(*) from public.academic_assessments a where a.school_id = v_school.id and a.academic_year_id = y.id),
    'markRecords', (select count(*) from public.academic_mark_records mr where mr.school_id = v_school.id and mr.academic_year_id = y.id),
    'aLevelPaperMarks', (select count(*) from public.a_level_paper_marks pm join public.terms t on t.id = pm.academic_term_id and t.school_id = pm.school_id where pm.school_id = v_school.id and t.academic_year_id = y.id),
    'markSubmissions', (select count(*) from public.academic_mark_submissions ms where ms.school_id = v_school.id and ms.academic_year_id = y.id),
    'lockedOrApprovedClasses', (select count(*) from public.academic_result_scopes rs where rs.school_id = v_school.id and rs.academic_year_id = y.id),
    'reportSnapshots', (select count(*) from public.report_snapshots rs where rs.school_id = v_school.id and rs.academic_year_id = y.id),
    'reportJobs', (select count(*) from public.report_generation_jobs rj where rj.school_id = v_school.id and rj.academic_year_id = y.id)
  ) order by y.starts_on desc), '[]'::jsonb)
  into v_years
  from public.academic_years y where y.school_id = v_school.id;

  select jsonb_build_object(
    'classesOutsideSchoolYear', (select count(*) from public.academic_classes c left join public.academic_years y on y.id = c.academic_year_id and y.school_id = c.school_id where c.school_id = v_school.id and y.id is null),
    'offeringsOutsideSchoolYear', (select count(*) from public.school_subject_offerings so left join public.academic_years y on y.id = so.academic_year_id and y.school_id = so.school_id where so.school_id = v_school.id and y.id is null),
    'classSubjectLinkMismatches', (select count(*) from public.class_subject_offerings co left join public.academic_classes c on c.id = co.class_id and c.school_id = co.school_id and c.academic_year_id = co.academic_year_id left join public.school_subject_offerings so on so.id = co.school_subject_offering_id and so.school_id = co.school_id and so.academic_year_id = co.academic_year_id where co.school_id = v_school.id and (c.id is null or so.id is null)),
    'oLevelCombinationMismatches', (select count(*) from public.combination_subjects cs left join public.subject_combinations c on c.id = cs.combination_id and c.school_id = cs.school_id left join public.school_subject_offerings so on so.id = cs.school_subject_offering_id and so.school_id = cs.school_id where cs.school_id = v_school.id and (c.id is null or so.id is null or c.academic_year_id <> so.academic_year_id)),
    'oLevelLearnerCombinationMismatches', (select count(*) from public.learner_combination_enrolments le left join public.learner_class_enrolments e on e.id = le.enrolment_id and e.school_id = le.school_id left join public.subject_combinations c on c.id = le.combination_id and c.school_id = le.school_id where le.school_id = v_school.id and (e.id is null or c.id is null or e.academic_year_id <> c.academic_year_id)),
    'aLevelCombinationMismatches', (select count(*) from public.a_level_combination_subjects cs left join public.a_level_combinations c on c.id = cs.combination_id left join public.school_subject_offerings so on so.id = cs.school_subject_offering_id where (c.school_id = v_school.id or so.school_id = v_school.id) and (c.id is null or so.id is null or c.school_id <> so.school_id or c.academic_year_id <> so.academic_year_id)),
    'teacherAllocationMismatches', (select count(*) from public.teacher_allocations ta left join public.terms t on t.id = ta.term_id and t.school_id = ta.school_id and t.academic_year_id = ta.academic_year_id where ta.school_id = v_school.id and (t.id is null or not exists(select 1 from public.class_subject_offerings co where co.id = ta.class_subject_offering_id and co.school_id = ta.school_id and co.academic_year_id = ta.academic_year_id) or not exists(select 1 from public.school_memberships m join public.users u on u.id = m.user_id where m.school_id = ta.school_id and m.user_id = ta.teacher_id and m.status = 'ACTIVE' and u.is_active))),
    'enrolmentMismatches', (select count(*) from public.learner_class_enrolments e left join public.academic_classes c on c.id = e.class_id and c.school_id = e.school_id and c.academic_year_id = e.academic_year_id left join public.learners l on l.id = e.learner_id and l.school_id = e.school_id where e.school_id = v_school.id and (c.id is null or l.id is null)),
    'learnerSubjectSelectionMismatches', (select count(*) from public.learner_subject_enrolments ls left join public.learner_class_enrolments e on e.id = ls.enrolment_id and e.school_id = ls.school_id and e.learner_id = ls.learner_id left join public.class_subject_offerings co on co.id = ls.class_subject_offering_id and co.school_id = ls.school_id left join public.academic_classes c on c.id = co.class_id and c.school_id = co.school_id where ls.school_id = v_school.id and (e.id is null or co.id is null or c.id is null or e.class_id <> co.class_id)),
    'aLevelAssignmentMismatches', (select count(*) from public.a_level_learner_assignments aa left join public.academic_classes c on c.id = aa.class_id and c.school_id = aa.school_id left join public.a_level_combinations ac on ac.id = aa.combination_id and ac.school_id = aa.school_id left join public.learners l on l.id = aa.learner_id and l.school_id = aa.school_id where aa.school_id = v_school.id and (c.id is null or ac.id is null or l.id is null or c.programme <> 'A_LEVEL' or ac.academic_year_id <> c.academic_year_id)),
    'markRecordMismatches', (select count(*) from public.academic_mark_records mr left join public.terms t on t.id = mr.term_id and t.school_id = mr.school_id and t.academic_year_id = mr.academic_year_id left join public.class_subject_offerings co on co.id = mr.class_subject_offering_id and co.school_id = mr.school_id and co.academic_year_id = mr.academic_year_id left join public.learners l on l.id = mr.learner_id and l.school_id = mr.school_id where mr.school_id = v_school.id and (t.id is null or co.id is null or l.id is null)),
    'aLevelMarkMismatches', (select count(*) from public.a_level_paper_marks pm left join public.terms t on t.id = pm.academic_term_id and t.school_id = pm.school_id left join public.a_level_learner_assignments aa on aa.id = pm.learner_assignment_id and aa.school_id = pm.school_id left join public.school_subject_offerings so on so.id = pm.school_subject_offering_id and so.school_id = pm.school_id left join public.system_subject_papers sp on sp.id = pm.system_subject_paper_id where pm.school_id = v_school.id and (t.id is null or aa.id is null or so.id is null or sp.id is null or not exists(select 1 from public.a_level_combination_subjects acs where acs.combination_id = aa.combination_id and acs.school_subject_offering_id = so.id) or not exists(select 1 from public.system_subject_papers p join public.school_subject_offerings o on o.system_subject_id = p.system_subject_id where p.id = pm.system_subject_paper_id and o.id = pm.school_subject_offering_id))),
    'markSubmissionMismatches', (select count(*) from public.academic_mark_submissions ms left join public.terms t on t.id = ms.term_id and t.school_id = ms.school_id and t.academic_year_id = ms.academic_year_id left join public.class_subject_offerings co on co.id = ms.class_subject_offering_id and co.school_id = ms.school_id and co.academic_year_id = ms.academic_year_id where ms.school_id = v_school.id and (t.id is null or co.id is null)),
    'resultScopeMismatches', (select count(*) from public.academic_result_scopes rs left join public.terms t on t.id = rs.term_id and t.school_id = rs.school_id and t.academic_year_id = rs.academic_year_id left join public.academic_classes c on c.id = rs.class_id and c.school_id = rs.school_id and c.academic_year_id = rs.academic_year_id where rs.school_id = v_school.id and (t.id is null or c.id is null)),
    'reportSnapshotMismatches', (select count(*) from public.report_snapshots rs left join public.terms t on t.id = rs.term_id and t.school_id = rs.school_id and t.academic_year_id = rs.academic_year_id left join public.learners l on l.id = rs.learner_id and l.school_id = rs.school_id where rs.school_id = v_school.id and (t.id is null or l.id is null))
  ) into v_integrity;

  return jsonb_build_object(
    'schoolId', v_school.id,
    'schoolName', v_school.official_name,
    'schoolCode', v_school.school_code,
    'checkedAt', now(),
    'database', 'CONNECTED',
    'activeMemberships', (select count(*) from public.school_memberships m join public.users u on u.id = m.user_id where m.school_id = v_school.id and m.status = 'ACTIVE' and u.is_active),
    'activeStaffMemberships', (select count(*) from public.school_memberships m join public.users u on u.id = m.user_id join public.roles r on r.id = m.role_id where m.school_id = v_school.id and m.status = 'ACTIVE' and u.is_active and r.code not in ('LEARNER','PARENT_GUARDIAN')),
    'integrity', v_integrity,
    'academicYears', v_years
  );
end;
$$;

revoke all on function public.get_platform_school_coordination(uuid) from public, anon;
grant execute on function public.get_platform_school_coordination(uuid) to authenticated;
notify pgrst, 'reload schema';
