import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const curriculumPath = new URL("../database/migrations/054_ncdc_o_level_curriculum.sql", import.meta.url);
const supabasePath = new URL("../supabase/migrations/20261002140000_ncdc_o_level_curriculum.sql", import.meta.url);
const hotfixPath = new URL("../database/migrations/055_o_level_workspace_rpc_hotfix.sql", import.meta.url);
const hotfixSupabasePath = new URL("../supabase/migrations/20261003120000_o_level_workspace_rpc_hotfix.sql", import.meta.url);
const selectionPath = new URL("../database/migrations/067_o_level_subject_selection_rules.sql", import.meta.url);
const selectionSupabasePath = new URL("../supabase/migrations/20261005150000_o_level_subject_selection_rules.sql", import.meta.url);
const learnerSubjectsPath = new URL("../apps/web/src/features/learners/LearnerSubjectsPage.tsx", import.meta.url);
const healthPath = new URL("../apps/web/src/features/academicSetup/AcademicSetupHealthPage.tsx", import.meta.url);
test("NCDC required catalogue codes are seeded at each compulsory level", async () => {
    const sql = await readFile(curriculumPath, "utf8");
    const s1s2 = ["112", "456", "241", "273", "535", "553", "545", "555", "845", "336"];
    const s3s4 = ["112", "456", "241", "273", "535", "553", "545"];
    for (const level of [1, 2]) {
        for (const code of s1s2)
            assert.match(sql, new RegExp(`\\(${level},'${code}','CORE'`));
        for (const code of ["223", "225"])
            assert.match(sql, new RegExp(`\\(${level},'${code}','RELIGION_OPTION'`));
    }
    for (const level of [3, 4])
        for (const code of s3s4)
            assert.match(sql, new RegExp(`\\(${level},'${code}','CORE'`));
    assert.match(sql, /NCDC O-Level curriculum cannot be activated; required catalogue entries are missing/);
});
test("learner elective limits and compulsory counts are validated in SQL", async () => {
    const sql = await readFile(curriculumPath, "utf8");
    assert.match(sql, /v_required_expected:=case when v_class\.level<=2 then 10 when v_sne then 5 else 7 end/);
    assert.match(sql, /v_elective_count<1 or v_elective_count>\(case when v_class\.level<=2 then 1 else 2 end\)/);
    assert.match(sql, /requiredCount',case when v_class\.level<=2 then 11 when v_sne then 5 else 7 end/);
});
test("marks roster and mark saves follow each learner's active O-Level subject selections", async () => {
    const sql = await readFile(curriculumPath, "utf8");
    assert.match(sql, /alter function public\.get_marks_entry_workspace\(uuid\) rename to get_marks_entry_workspace_core/);
    assert.match(sql, /ls\.class_subject_offering_id=\(offering->>'id'\)::uuid/);
    assert.match(sql, /ls\.learner_id=\(learner->>'id'\)::uuid and ls\.status='ACTIVE'/);
    assert.match(sql, /e\.status='ACTIVE' and e\.effective_to is null/);
    assert.match(sql, /Learner has not selected this O-Level subject/);
    assert.match(sql, /Allocate a primary teacher before entering O-Level marks/);
});
test("O-Level status RPC casts status values to the enum and exposes scoped setup health", async () => {
    const sql = await readFile(hotfixPath, "utf8");
    assert.match(sql, /\(case when p_active then 'ACTIVE' else 'INACTIVE' end\)::public\.offering_status/);
    assert.match(sql, /create or replace function public\.get_o_level_setup_health\(p_school_id uuid\)/);
    assert.match(sql, /Required O-Level subject is not active/);
    assert.match(sql, /grant execute on function public\.get_o_level_setup_health\(uuid\) to authenticated/);
});
test("database and Supabase migration copies stay byte-identical", async () => {
    const [source, deployed, hotfix, hotfixDeployed, selection, selectionDeployed] = await Promise.all([readFile(curriculumPath), readFile(supabasePath), readFile(hotfixPath), readFile(hotfixSupabasePath), readFile(selectionPath), readFile(selectionSupabasePath)]);
    const hash = (data) => createHash("sha256").update(data).digest("hex");
    assert.equal(hash(deployed), hash(source));
    assert.equal(hash(hotfixDeployed), hash(hotfix));
    assert.equal(hash(selectionDeployed), hash(selection));
});
test("O-Level subject selection is versioned, stream-aware, history-preserving, and diagnosed", async () => {
    const sql = await readFile(selectionPath, "utf8");
    assert.match(sql, /academic_year_id uuid references public\.academic_years\(id\)/);
    assert.match(sql, /where status='ACTIVE' and academic_year_id is null/);
    assert.match(sql, /where status='ACTIVE' and academic_year_id is not null/);
    assert.match(sql, /order by \(academic_year_id=p_academic_year_id\) desc nulls last/);
    assert.match(sql, /co\.stream_id is null or co\.stream_id=v_enrolment\.stream_id/);
    assert.match(sql, /SUBJECT_CHANGE_REASON_REQUIRED_FOR_EXISTING_ASSESSMENTS_OR_MARKS/);
    assert.match(sql, /set status='DROPPED'/);
    assert.match(sql, /create or replace function public\.get_o_level_subject_selection_health\(p_school_id uuid\)/);
    assert.match(sql, /O_LEVEL_LEARNER_RELIGION_CHOICE_MISSING/);
    assert.match(sql, /'schoolOfferingId',so\.id,'systemSubjectId',ss\.id/);
    assert.match(sql, /'schoolActive',so\.status='ACTIVE','classOffered'/);
});
test("learner subject UI explains selection context and confirms history-affecting changes", async () => {
    const [page, health] = await Promise.all([readFile(learnerSubjectsPath, "utf8"), readFile(healthPath, "utf8")]);
    assert.match(page, /curriculumVersion/);
    assert.match(page, /availabilityReason/);
    assert.match(page, /p_change_reason/);
    assert.match(page, /ConfirmDialog/);
    assert.match(page, /existing assessment, mark, or report history/);
    assert.match(page, /set_school_catalogue_subject_status/);
    assert.match(page, /offer_subject_to_class/);
    assert.match(page, /Activate & offer/);
    assert.match(health, /get_o_level_subject_selection_health/);
});
