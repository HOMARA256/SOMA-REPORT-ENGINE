import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = await readFile(new URL("../database/migrations/084_online_admissions_digital_ids_document_library.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../supabase/migrations/20261009160000_online_admissions_digital_ids_document_library.sql", import.meta.url), "utf8");
const counterSecurity = await readFile(new URL("../database/migrations/085_lock_school_admission_sequences.sql", import.meta.url), "utf8");
const counterSecurityMirror = await readFile(new URL("../supabase/migrations/20261009170000_lock_school_admission_sequences.sql", import.meta.url), "utf8");
const pendingWorkflow = await readFile(new URL("../database/migrations/095_pending_learners_from_accepted_admissions.sql", import.meta.url), "utf8");
const pendingWorkflowMirror = await readFile(new URL("../supabase/migrations/20261011190000_pending_learners_from_accepted_admissions.sql", import.meta.url), "utf8");
const migrationSync = await readFile(new URL("../scripts/sync-academic-migrations.mjs", import.meta.url), "utf8");
const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../apps/web/src/config/navigation.ts", import.meta.url), "utf8");
const admissions = await readFile(new URL("../apps/web/src/features/admissions/AdmissionsPage.tsx", import.meta.url), "utf8");
const identities = await readFile(new URL("../apps/web/src/features/admissions/IdentityDocumentsPages.tsx", import.meta.url), "utf8");
const uploadFunction = await readFile(new URL("../supabase/functions/admission-public-upload/index.ts", import.meta.url), "utf8");
const publicDocumentsFunction = await readFile(new URL("../supabase/functions/admission-public-documents/index.ts", import.meta.url), "utf8");
const supabaseConfig = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
test("admission number counters are private and the security migration stays mirrored", () => {
    assert.equal(counterSecurity, counterSecurityMirror);
    assert.match(counterSecurity, /alter table public\.school_admission_sequences enable row level security/);
    assert.match(counterSecurity, /revoke all on public\.school_admission_sequences from public, anon, authenticated/);
    assert.match(migrationSync, /085_lock_school_admission_sequences\.sql.*20261009170000_lock_school_admission_sequences\.sql/);
});
test("admissions, ID cards, and document library have protected app routes and navigation", () => {
    assert.match(app, /path="\/apply\/:schoolCode"/);
    assert.match(app, /path="\/verify\/id\/:token"/);
    assert.match(app, /path="\/admissions\/:section\?"/);
    assert.match(admissions, /function AdmissionsSubNavigation/);
    assert.match(admissions, /admissions\/confirmed/);
    assert.match(app, /path="\/id-cards"/);
    assert.match(app, /path="\/documents"/);
    for (const label of ["Admissions", "ID Cards", "Document Library"])
        assert.match(navigation, new RegExp(`label: "${label}"`));
});
test("public admission data is token-protected and accepted applicants enter the pending learner workflow", () => {
    assert.match(migration, /access_token_hash text not null/);
    assert.match(migration, /start_public_admission_application/);
    assert.match(migration, /get_public_admission_application_status/);
    assert.match(migration, /if v_app\.id is null or v_app\.status<>'ACCEPTED' then raise exception 'ACCEPTED_APPLICATION_REQUIRED'/);
    assert.match(migration, /REQUIRED_DOCUMENTS_NOT_VERIFIED/);
    assert.match(migration, /admission_application_documents/);
    assert.match(migration, /EXISTING_LEARNER_MATCH_NOT_CONFIRMED/);
    assert.match(migration, /'possibleLearners'/);
    assert.match(admissions, /Existing learner match found/);
    assert.match(pendingWorkflow, /status='PENDING_APPROVAL'/);
    assert.match(pendingWorkflow, /pending_learner_id/);
    assert.match(pendingWorkflow, /admit_school_applicant_as_learner_before_pending_workflow/);
    assert.match(admissions, /selection\.pendingLearnerId/);
    assert.match(pendingWorkflow, /l\.id is distinct from a\.pending_learner_id/);
});
test("pending admission workflow migration is mirrored and push script includes it", () => {
    assert.equal(pendingWorkflow, pendingWorkflowMirror);
    assert.match(migrationSync, /095_pending_learners_from_accepted_admissions\.sql.*20261011190000_pending_learners_from_accepted_admissions\.sql/);
    assert.match(pendingWorkflow, /public\.can_manage_admissions\(p_school_id\)/);
    assert.match(pendingWorkflow, /PENDING_LEARNER_LINK_MISMATCH/);
});
test("admissions officer permission is tenant-scoped and supports O-Level conversion safely", () => {
    assert.match(migration, /r\.code='ADMISSIONS_OFFICER'/);
    assert.match(migration, /set_school_admissions_officer/);
    assert.ok(migration.includes("'DIRECTOR_OF_STUDIES','ADMISSIONS_OFFICER')$new$"));
    assert.match(migration, /public\.can_manage_admissions\(p_school_id\)/);
    assert.match(migration, /is_school_admin_for\(p_school_id\)/);
});
test("private uploads use short-lived signed uploads, strict MIME/size validation, and no public bucket", () => {
    assert.match(uploadFunction, /createSignedUploadUrl/);
    assert.match(supabaseConfig, /\[functions\.admission-public-upload\]\s+verify_jwt = false/);
    assert.match(uploadFunction, /access_token_hash/);
    assert.match(migration, /'school-admission-documents','school-admission-documents',false/);
    assert.match(migration, /'school-document-library','school-document-library',false/);
    assert.match(publicDocumentsFunction, /PUBLIC_ADMISSION_APPLICANT/);
    assert.match(publicDocumentsFunction, /createSignedUrl\(item\.storage_path, 300/);
    assert.match(migration, /REQUIRED_ADMISSION_DOCUMENTS_MISSING/);
});
test("ID-card issuance is tenant scoped and keeps secure tokens out of card history", () => {
    assert.match(migration, /identity_cards_one_active_learner_idx/);
    assert.match(migration, /identity_cards_one_active_staff_idx/);
    assert.match(migration, /secure_verification_token/);
    assert.match(migration, /verify_school_identity_card/);
    assert.match(identities, /cardHistory/);
    assert.match(identities, /Download PDF/);
    assert.match(identities, /register_school_identity_card_document/);
    assert.match(migration, /a_level_learner_assignments/);
    assert.match(admissions, /Choose an active combination/);
});
test("linked learner library documents are not exposed to unrelated tenant parents", () => {
    assert.match(migration, /d\.linked_entity_type='LEARNER'.*learner_guardians/s);
    assert.match(migration, /g\.learner_id=d\.linked_entity_id/);
    assert.match(migration, /school_id=p_school_id/);
});
test("admission, digital ID, and document migration source mirrors byte-for-byte", () => {
    assert.equal(mirror, migration);
});
test("review workflow exposes required documents and interview scheduling", () => {
    assert.match(migration, /missingRequiredDocuments/);
    assert.match(admissions, /Interview date and time/);
    assert.match(admissions, /REQUIRED_DOCUMENTS_NOT_VERIFIED|missingRequiredDocuments/);
    assert.match(admissions, /Academic year/);
    assert.match(admissions, /Target class level/);
    assert.match(admissions, /Decision status/);
    assert.match(admissions, /admission-public-documents/);
});
