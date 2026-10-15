import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Headteacher authorization is school-controlled and separate from the ID holder signature", async () => {
  const [database, mirror, settings, card, pdf, reports, workspace] = await Promise.all([
    read("../database/migrations/114_school_headteacher_signature.sql"),
    read("../supabase/migrations/20261015100000_school_headteacher_signature.sql"),
    read("../apps/web/src/features/settings/HeadteacherSignatureSettings.tsx"),
    read("../apps/web/src/features/admissions/IdentityDocumentsPages.tsx"),
    read("../apps/web/src/features/admissions/identityCardPdf.ts"),
    read("../apps/web/src/features/reports/ReportCardsPage.tsx"),
    read("../apps/web/src/features/academicSetup/AcademicWorkspace.tsx"),
  ]);
  assert.equal(database, mirror);
  assert.match(database, /'school-authorized-signatures',false,1048576/);
  assert.match(database, /public\.is_school_admin_for\(p_school_id\)/);
  assert.match(database, /capture_school_identity_card_headteacher_signature_before_insert/);
  assert.match(database, /printed_headteacher_signature_path/);
  assert.match(settings, /I confirm this is the Headteacher’s authorized signature/);
  assert.match(card, /HOLDER'S SIGNATURE/);
  assert.match(card, /HEADTEACHER’S AUTHORIZED SIGNATURE/);
  assert.match(pdf, /headteacherSignature\.scaleToFit/);
  assert.match(reports, /useHeadteacherSignature/);
  assert.match(workspace, /authorizedHeadteacher\?\.signatureUrl/);
});
