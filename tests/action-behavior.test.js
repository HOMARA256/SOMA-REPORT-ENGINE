import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isWorkspaceSectionActive } from "../apps/web/src/features/academicSetup/workspaceNavigation.ts";
test("O-Level workspace navigation selects exactly one section for nested routes", () => {
    const sectionPaths = ["/school/o-level", "/school/o-level/classes", "/school/o-level/learners", "/school/o-level/marks"];
    const routePaths = ["/school/o-level", "/school/o-level/classes", "/school/o-level/learners", "/school/o-level/marks/entry"];
    for (const pathname of routePaths) {
        const active = sectionPaths.filter((path) => isWorkspaceSectionActive(pathname, path));
        assert.equal(active.length, 1, `${pathname} must select one matching section`);
    }
    assert.equal(isWorkspaceSectionActive("/school/o-level/learners", "/school/o-level"), false);
    assert.equal(isWorkspaceSectionActive("/school/o-level/learners", "/school/o-level/learners"), true);
});
const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
test("teacher replacement requires an audited reason and allocation retries reuse existing rows", async () => {
    const sql = await read("database/migrations/058_idempotent_teacher_allocations.sql");
    assert.match(sql, /drop function if exists public\.assign_teacher_to_offering\(uuid,uuid,uuid,text,date\)/);
    assert.match(sql, /p_reason text/);
    assert.match(sql, /Provide a reason when replacing the current primary teacher/);
    assert.match(sql, /v_existing\.allocation_role = p_allocation_role then return v_existing\.id/);
    assert.match(sql, /'replaced_teacher_id',v_previous_teacher_id,'reason',nullif\(trim\(p_reason\),''\)/);
    assert.match(sql, /grant execute on function public\.assign_teacher_to_offering\(uuid,uuid,uuid,text,text,date\) to authenticated/);
});
test("academic assessments are persisted, scoped, validated, and audited", async () => {
    const sql = await read("database/migrations/059_persistent_academic_assessments.sql");
    assert.match(sql, /create or replace function public\.get_school_academic_assessments\(p_school_id uuid\)/);
    assert.match(sql, /create or replace function public\.save_school_academic_assessment/);
    assert.match(sql, /r\.code in \('SCHOOL_ADMIN', 'DIRECTOR_OF_STUDIES'\)/);
    assert.match(sql, /assessment is unavailable, locked, or outside the selected academic context/i);
    assert.match(sql, /'ASSESSMENT_CREATED' else 'ASSESSMENT_UPDATED'/);
    assert.match(sql, /grant execute on function public\.save_school_academic_assessment/);
});
test("subject activation audit uses the Auth ID and keeps the profile ID for the offering", async () => {
    const sql = await read("database/migrations/065_fix_subject_activation_actor_and_required_offerings.sql");
    assert.match(sql, /where auth_user_id=auth\.uid\(\) and is_active=true/);
    assert.match(sql, /case when p_active then v_actor\.id else null end/);
    assert.match(sql, /values\(v_actor\.auth_user_id,v_actor\.full_name,'SCHOOL_ADMIN'/);
    assert.match(sql, /notify pgrst,'reload schema'/);
});
test("subject activation failure dismisses the dialog and shows a safe explanation", async () => {
    const page = await read("apps/web/src/features/subjects/SchoolSubjectSettingsPage.tsx");
    assert.match(page, /catch\(saveError\)[\s\S]*setStatusRequest\(null\);setReason\(""\);/);
    assert.match(page, /audit_logs_user_id_fkey[\s\S]*no subject status changed/i);
});
test("learner subject choices for every O-Level class level stay persistent and failures release the UI", async () => {
    const [learnerChoices, curriculumSql] = await Promise.all([
        read("apps/web/src/features/learners/LearnerSubjectsPage.tsx"),
        read("database/migrations/054_ncdc_o_level_curriculum.sql"),
    ]);
    assert.match(learnerChoices, /set_o_level_learner_subject_choices/);
    assert.match(learnerChoices, /finally \{ setBusy\(false\); \}/);
    assert.match(learnerChoices, /S3 and S4 learners may each select up to two offered electives/);
    assert.match(curriculumSql, /v_class\.level<=2 then 1 else 2 end/);
    assert.match(curriculumSql, /learner_subject_enrolments\(school_id,learner_id,enrolment_id,class_subject_offering_id,status,effective_from,selection_type\)/);
});
test("marks submission and moderation persist transitions, enforce scope and lock submitted marks", async () => {
    const [sql, entryPage, moderationPage, marksHook, moderationHook] = await Promise.all([
        read("database/migrations/062_persistent_mark_submission_moderation.sql"),
        read("apps/web/src/features/marks/MarksEntryPage.tsx"),
        read("apps/web/src/features/marks/ModerationPage.tsx"),
        read("apps/web/src/features/marks/PersistentMarks.ts"),
        read("apps/web/src/features/marks/PersistentModeration.ts"),
    ]);
    assert.match(sql, /create table if not exists public\.academic_mark_submissions/);
    assert.match(sql, /create table if not exists public\.academic_mark_submission_events/);
    assert.match(sql, /create or replace function public\.submit_academic_mark_offering/);
    assert.match(sql, /on conflict\(term_id,class_subject_offering_id\) do nothing/);
    assert.match(sql, /Cannot submit an offering with no eligible learners/);
    assert.match(sql, /learner mark records are incomplete/);
    assert.match(sql, /create or replace function public\.review_academic_mark_submission/);
    assert.match(sql, /Separation of duties prevents self-review/);
    assert.match(sql, /Invalid moderation transition/);
    assert.match(sql, /Marks are locked while submitted or moderated/);
    assert.match(sql, /academic_mark_submission_events\(submission_id,school_id,actor_user_id,actor_role,action,from_status,to_status,note\)/);
    assert.match(marksHook, /submit_academic_mark_offering/);
    assert.match(entryPage, /submissionLocked\s*\|\|\s*!marks\.workspace\.canEnter/);
    assert.match(moderationHook, /get_academic_mark_moderation_queue/);
    assert.match(moderationHook, /review_academic_mark_submission/);
    assert.doesNotMatch(moderationPage, /reviewBatch\(/);
});
test("class result locks require complete moderated learner subjects and approvals are durable and separated", async () => {
    const sql = await read("database/migrations/063_persistent_result_locks_and_approvals.sql");
    assert.match(sql, /create table if not exists public\.academic_result_scopes/);
    assert.match(sql, /create table if not exists public\.academic_result_scope_events/);
    assert.match(sql, /s\.status<>'MODERATED'/);
    assert.match(sql, /mr\.aoi_status='MISSING' or mr\.exam_status='MISSING'/);
    assert.match(sql, /v_actor<>v_scope\.locked_by|v_actor=v_scope\.locked_by/);
    assert.match(sql, /Class results are locked; an authorised result-reopen workflow is required/);
    assert.match(sql, /grant execute on function public\.get_academic_result_scopes/);
});
test("Approval Centre reads and confirms persistent class result RPCs instead of session-only locks", async () => {
    const page = await read("apps/web/src/features/approvals/ApprovalsPage.tsx");
    const service = await read("apps/web/src/features/approvals/PersistentResultScopes.ts");
    assert.match(page, /usePersistentResultScopes\(\)/);
    assert.match(page, /resultScopes\.lock\(offering\.classId, lockNote\)/);
    assert.match(page, /resultScopes\.approve\(resultScope\.id, approvalNote\)/);
    assert.doesNotMatch(page, /workspace\.lockClassResults|workspace\.approveClassResults|setTimeout\(/);
    assert.match(service, /get_academic_result_scopes/);
    assert.match(service, /lock_academic_class_results/);
    assert.match(service, /approve_academic_class_results/);
    assert.match(service, /typeof result\.data !== "string"/);
    assert.match(service, /refreshed\.scopes\.find\(\(scope\) => scope\.id === result\.data && scope\.classId === classId\)/);
    assert.match(service, /scope\.id === scopeId && scope\.status === "APPROVED"/);
});
test("Report Cards reflects the persistent Supabase class approval and does not present session state as a saved lock", async () => {
    const page = await read("apps/web/src/features/reports/ReportCardsPage.tsx");
    assert.match(page, /usePersistentResultScopes\(\)/);
    assert.match(page, /scope\.termId === workspace\.termId && scope\.classId === activeClass\?\.id/);
    assert.match(page, /persistentScope\?\.status === "APPROVED"/);
    assert.match(page, /Persistent report snapshot and publication steps are separate/);
    assert.match(page, /!sessionLock \|\| !sessionApproval/);
});
test("Vite prefers TSX source over duplicate JavaScript mirrors", async () => {
    for (const path of ["apps/web/vite.config.js", "apps/web/vite.config.ts"]) {
        const config = await read(path);
        const extensions = config.match(/extensions:\s*\[([^\]]+)\]/)?.[1] ?? "";
        assert.ok(extensions.indexOf(".tsx") >= 0 && extensions.indexOf(".tsx") < extensions.indexOf(".js"), `${path} must resolve .tsx before .js`);
    }
});
test("A-Level combination creation does not misreport saved records when draft cleanup fails", async () => {
    const page = await read("apps/web/src/features/alevel/ALevelCombinationFormPage.tsx");
    assert.match(page, /await academicRpc\("save_a_level_combination"/);
    assert.match(page, /The combination was saved successfully, but its old draft could not be cleared/);
    assert.match(page, /if \(combinationSaved\) return/);
});
test("school-context refresh invalidates stale tenant academic loads", async () => {
    const context = await read("apps/web/src/features/context/SchoolContext.tsx");
    const classes = await read("apps/web/src/features/classes/PersistentClassSetup.ts");
    const marks = await read("apps/web/src/features/marks/PersistentMarks.ts");
    const teachers = await read("apps/web/src/features/staff/TeacherAllocationsPage.tsx");
    const assessments = await read("apps/web/src/features/assessments/AssessmentsPage.tsx");
    const alevel = await read("apps/web/src/features/alevel/useLiveAcademics.tsx");
    const subjects = await read("apps/web/src/features/subjects/SchoolSubjectSettingsPage.tsx");
    assert.match(context, /refreshVersion = useRef\(0\)/);
    assert.match(context, /if \(!isCurrent\(\)\) return;/);
    assert.match(context, /setSchoolId\(""\); setAcademicYearId\(""\); setTermId\(""\)/);
    for (const source of [classes, marks, teachers, assessments]) {
        assert.match(source, /useRef\(0\)/);
        assert.match(source, /if \(!isCurrent\(\)\)/);
        assert.match(source, /if \(context\.loading\)/);
    }
    assert.match(alevel, /requestVersion = useRef\(0\)/);
    assert.match(alevel, /if\(!isCurrent\(\)\)return/);
    assert.match(subjects, /loadVersion=useRef\(0\)/);
    assert.match(subjects, /if\(!isCurrent\(\)\)return false/);
    assert.match(subjects, /setStatusRequest\(null\);setReason\(""\);void load\(\)/);
    assert.match(classes, /loading: loading \|\| context\.loading/);
    assert.match(marks, /loading: loading \|\| context\.loading/);
});
test("school badge uploads stay scoped to the selected tenant and never fall back to system branding", async () => {
    const [page, context, sidebar, endpoint] = await Promise.all([
        read("apps/web/src/features/settings/SchoolProfilePage.tsx"),
        read("apps/web/src/features/context/SchoolContext.tsx"),
        read("apps/web/src/components/layout/Sidebar.tsx"),
        read("supabase/functions/update-school-branding/index.ts"),
    ]);
    assert.match(page, /const schoolId=schoolContext\.schoolId/);
    assert.match(page, /body:\{schoolId,logoPath\}/);
    assert.match(page, /await schoolContext\.refresh\(\)/);
    assert.match(context, /school\.logo_url\s*\|\|\s*profile\.logo_url/);
    assert.match(sidebar, /school\.schoolLogo\?\s*<img/);
    assert.match(sidebar, /<Building2/);
    assert.doesNotMatch(sidebar, /soma-report-engine-logo\.png/);
    assert.match(endpoint, /\.eq\("school_id",schoolId\)\.eq\("status","ACTIVE"\)/);
    assert.match(endpoint, /role\?\.code!=="SCHOOL_ADMIN"/);
    assert.match(endpoint, /school_profiles"\)\.update\(\{logo_url:logoUrl/);
});
test("global back navigation is available in both portals and has safe deep-link fallbacks", async () => {
    const [backButton, schoolTopbar, platformShell] = await Promise.all([
        read("apps/web/src/components/layout/BackNavigationButton.tsx"),
        read("apps/web/src/components/layout/Topbar.tsx"),
        read("apps/web/src/features/platform/PlatformShell.tsx"),
    ]);
    assert.match(schoolTopbar, /<BackNavigationButton\s*\/>/);
    assert.match(platformShell, /<BackNavigationButton\s*\/>/);
    assert.match(backButton, /useNavigationType\(\)/);
    assert.match(backButton, /navigate\(-1\)/);
    assert.match(backButton, /navigate\(fallback, \{ replace: true \}\)/);
    assert.match(backButton, /\/platform\/schools"/);
    assert.match(backButton, /\/school\/o-level\/learners"/);
    assert.match(backButton, /aria-label="Go back"/);
    assert.match(backButton, /disabled=\{disabled\}/);
});
test("client actions await results and distinguish persistence from refresh", async () => {
    const [allocationPage, assessmentPage, learnerHook, classHook, marksHook] = await Promise.all([
        read("apps/web/src/features/staff/TeacherAllocationsPage.tsx"),
        read("apps/web/src/features/assessments/AssessmentsPage.tsx"),
        read("apps/web/src/features/learners/PersistentLearners.ts"),
        read("apps/web/src/features/classes/PersistentClassSetup.ts"),
        read("apps/web/src/features/marks/PersistentMarks.ts"),
    ]);
    assert.match(allocationPage, /Replace primary teacher/);
    assert.match(allocationPage, /p_reason: reason\.trim\(\) \|\| null/);
    assert.match(assessmentPage, /save_school_academic_assessment/);
    assert.match(assessmentPage, /Do not save it again/);
    assert.match(learnerHook, /create_learner_with_enrolment/);
    assert.match(learnerHook, /Do not submit again/);
    assert.match(classHook, /subject offering\(s\) were saved, then Supabase rejected another/);
    assert.match(marksHook, /Marks were saved to Supabase, but the roster could not refresh/);
});
test("shared delete and media actions await backend completion without simulated success timers", async () => {
    const [deletion, media] = await Promise.all([
        read("apps/web/src/components/DeleteRecordButton.tsx"),
        read("apps/web/src/components/common/MediaAssetEditor.tsx"),
    ]);
    assert.match(deletion, /await onDelete\(\)/);
    assert.match(deletion, /No success was recorded/);
    assert.doesNotMatch(deletion, /setTimeout/);
    assert.match(media, /await onSave\(preview\)/);
    assert.match(media, /await onRemove\(\)/);
    assert.doesNotMatch(media, /setTimeout/);
});
test("new academic migrations have identical deployment mirrors", async () => {
    const pairs = [
        ["database/migrations/058_idempotent_teacher_allocations.sql", "supabase/migrations/20261004140000_idempotent_teacher_allocations.sql"],
        ["database/migrations/059_persistent_academic_assessments.sql", "supabase/migrations/20261004160000_persistent_academic_assessments.sql"],
        ["database/migrations/061_fix_school_subject_activation_profile_audit_fk.sql", "supabase/migrations/20261004170000_fix_school_subject_activation_profile_audit_fk.sql"],
        ["database/migrations/062_persistent_mark_submission_moderation.sql", "supabase/migrations/20261005100000_persistent_mark_submission_moderation.sql"],
        ["database/migrations/075_separate_people_directories.sql", "supabase/migrations/20261008170000_separate_people_directories.sql"],
    ];
    const digest = (contents) => createHash("sha256").update(contents).digest("hex");
    for (const [sourcePath, mirrorPath] of pairs) {
        const [source, mirror] = await Promise.all([readFile(new URL(sourcePath, root)), readFile(new URL(mirrorPath, root))]);
        assert.equal(digest(mirror), digest(source), `${sourcePath} mirror differs`);
    }
});
