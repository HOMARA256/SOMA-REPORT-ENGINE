import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync("supabase/migrations/20261008180000_s4_s6_completion_and_graduation.sql", "utf8");
const completionPage = readFileSync("apps/web/src/features/learners/CycleCompletionPage.tsx", "utf8");
const admissionPage = readFileSync("apps/web/src/features/learners/S5AdmissionPage.tsx", "utf8");
const profilePage = readFileSync("apps/web/src/features/learners/PersistentLearnerProfilePage.tsx", "utf8");
const routes = readFileSync("apps/web/src/App.tsx", "utf8");
test("cycle completion is tenant-scoped, admin-only, date-bounded and non-destructive", () => {
    assert.match(sql, /public\.is_school_admin_for\(p_school_id\)/);
    assert.match(sql, /c\.programme='O_LEVEL' and c\.level=4/);
    assert.match(sql, /c\.programme='A_LEVEL' and c\.level=6/);
    assert.match(sql, /effective_to=v_year\.ends_on/);
    assert.match(sql, /learner_cycle_completions/);
    assert.match(sql, /learner_progression_decisions/);
    assert.match(sql, /internal_end_of_year_exam_required=false/);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.(learners|learner_class_enrolments|learner_subject_enrolments|learner_progression_decisions)/i);
});
test("graduation is a second decision and is restricted to completed S6", () => {
    const graduationFunction = sql.slice(sql.indexOf("create or replace function public.approve_school_learner_graduation"), sql.indexOf("create or replace function public.get_school_learner_completion_status"));
    assert.match(graduationFunction, /v_completion\.completion_type<>'COMPLETED_A_LEVEL'/);
    assert.match(graduationFunction, /v_completion\.lifecycle_status<>'COMPLETED'/);
    assert.match(graduationFunction, /status='GRADUATED',completion_status='GRADUATED'/);
    assert.doesNotMatch(graduationFunction, /COMPLETED_O_LEVEL/);
});
test("completed O-Level learner admission to S5 is a new A-Level enrolment, not promotion", () => {
    assert.match(sql, /public\.admit_completed_o_level_learner_to_s5/);
    assert.match(sql, /programme='A_LEVEL' and level=5 and status='ACTIVE'/);
    assert.match(sql, /S5_MUST_BE_A_SEPARATE_SUBSEQUENT_ACADEMIC_ADMISSION/);
    assert.match(sql, /LEARNER_ADMITTED_TO_S5/);
    assert.match(admissionPage, /Separate A-Level admission/i);
    assert.match(admissionPage, /A-Level combination/);
    assert.match(routes, /learners\/:learnerId\/admit-a-level/);
    assert.match(profilePage, /Start A-Level admission/);
});
test("the screens explain S4/S6 completion and do not collect national exam data", () => {
    assert.match(completionPage, /Confirm O-Level Completion/);
    assert.match(completionPage, /Confirm A-Level Completion/);
    assert.match(completionPage, /Approve Graduation/);
    assert.match(completionPage, /does not create an internal end-of-year exam or report/i);
    assert.match(completionPage, /No national-examination data is requested or stored/);
    assert.doesNotMatch(`${completionPage}\n${admissionPage}`, /UCE|UACE|candidate number|national exam result/i);
});
test("completion is available only for active S4 and S6 enrolments in the selected tenant and year", () => {
    assert.match(sql, /e\.school_id=p_school_id and e\.academic_year_id=p_academic_year_id/);
    assert.match(sql, /e\.status='ACTIVE' and e\.effective_to is null/);
    assert.match(sql, /\(\(c\.programme='O_LEVEL' and c\.level=4\) or \(c\.programme='A_LEVEL' and c\.level=6\)\)/);
});
test("completion closes active subject selections at year end without deleting them", () => {
    assert.match(sql, /update public\.learner_subject_enrolments set status='COMPLETED',effective_to=v_year\.ends_on/);
    assert.match(sql, /update public\.learner_combination_enrolments set status='COMPLETED',effective_to=v_year\.ends_on/);
    assert.doesNotMatch(sql, /delete\s+from\s+public\.(learner_subject_enrolments|learner_combination_enrolments)/i);
});
test("S6 completion ends its A-Level assignment to remove the learner from future marks lists", () => {
    assert.match(sql, /if v_completion_type='COMPLETED_A_LEVEL' then\s+update public\.a_level_learner_assignments\s+set status='ENDED',ends_on=v_year\.ends_on/i);
});
test("completion does not delete identity, assessment history, documents, or audit data", () => {
    assert.doesNotMatch(sql, /delete\s+from\s+public\.(learners|learner_class_enrolments|learner_subject_enrolments|a_level_paper_marks|audit_logs)/i);
    assert.match(completionPage, /continuous-assessment records, documents, enrolment history and audit history/i);
});
test("only authorised school administrators may confirm completion or graduation", () => {
    assert.match(completionPage, /currentUser\.role === "SCHOOL_ADMIN"/);
    assert.match(sql, /if not public\.is_school_admin_for\(p_school_id\) then raise exception 'SCHOOL_ADMIN_REQUIRED'; end if;/);
});
test("completion and admission functions are callable through authenticated RPCs, not direct table writes", () => {
    assert.match(sql, /revoke all on public\.learner_cycle_completions,public\.learner_progression_decisions from public,anon,authenticated/);
    assert.match(sql, /grant execute on function public\.get_school_cycle_completion_register/);
});
test("completed O-Level status survives a later separate S5 admission", () => {
    const admissionFunction = sql.slice(sql.indexOf("create or replace function public.admit_completed_o_level_learner_to_s5"));
    assert.match(admissionFunction, /update public\.learners set status='ACTIVE',updated_at=now\(\),updated_by=v_actor/);
    assert.doesNotMatch(admissionFunction, /completion_status\s*=/);
    assert.match(profilePage, /Completed O-Level Cycle/);
});
test("completion status is persisted in the database and loaded again for the learner profile", () => {
    assert.match(sql, /add column if not exists completion_status text not null default 'NONE'/);
    assert.match(sql, /get_school_learner_completion_status/);
    assert.match(profilePage, /get_school_learner_completion_status/);
});
test("completion controls and S5 admission remain tenant-scoped after refresh and a new login", () => {
    assert.match(sql, /foreign key \(learner_id,school_id\)\s+references public\.learners\(id,school_id\)/i);
    assert.match(sql, /public\.is_active_school_member\(p_school_id\)/);
    assert.match(sql, /where school_id=p_school_id and learner_id=p_learner_id/);
});
test("S4/S6 transfer or withdrawal is a separate dated decision and does not mark completion", () => {
    assert.match(sql, /record_school_learner_cycle_exit/);
    assert.match(sql, /p_exit_type is null or p_exit_type not in \('TRANSFERRED_OUT','WITHDRAWN','LEFT_SCHOOL'\)/);
    assert.match(sql, /CYCLE_EXIT_DATE_OUTSIDE_ACTIVE_ENROLMENT/);
    assert.match(sql, /LEARNER_CYCLE_EXIT_RECORDED/);
    assert.match(completionPage, /Record transfer or withdrawal/);
    assert.match(completionPage, /Open learner history/);
});
