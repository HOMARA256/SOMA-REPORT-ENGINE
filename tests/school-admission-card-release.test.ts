import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const [drafts, draftsMirror, records, recordsMirror, cards, cardsMirror, cardDocuments, cardDocumentsMirror, admissionDocuments, admissionDocumentsMirror, form, panel, pdf, cardPage, cardPdf, adminDocuments, css, sync] = await Promise.all([
  read("../database/migrations/086_school_entered_admission_drafts.sql"),
  read("../supabase/migrations/20261011100000_school_entered_admission_drafts.sql"),
  read("../database/migrations/087_versioned_admission_records.sql"),
  read("../supabase/migrations/20261011110000_versioned_admission_records.sql"),
  read("../database/migrations/088_identity_card_print_snapshots.sql"),
  read("../supabase/migrations/20261011120000_identity_card_print_snapshots.sql"),
  read("../database/migrations/089_identity_card_print_documents.sql"),
  read("../supabase/migrations/20261011130000_identity_card_print_documents.sql"),
  read("../database/migrations/090_school_admission_document_uploads.sql"),
  read("../supabase/migrations/20261011140000_school_admission_document_uploads.sql"),
  read("../apps/web/src/features/admissions/SchoolAdmissionForm.tsx"),
  read("../apps/web/src/features/admissions/AdmissionRecordPanel.tsx"),
  read("../apps/web/src/features/admissions/admissionRecordPdf.ts"),
  read("../apps/web/src/features/admissions/IdentityDocumentsPages.tsx"),
  read("../apps/web/src/features/admissions/identityCardPdf.ts"),
  read("../apps/web/src/features/admissions/SchoolAdmissionDocuments.tsx"),
  read("../apps/web/src/index.css"),
  read("../scripts/sync-academic-migrations.mjs"),
]);

test("forward-only tenant-scoped migrations are mirrored and synced", () => {
  assert.equal(drafts, draftsMirror);
  assert.equal(records, recordsMirror);
  assert.equal(cards, cardsMirror);
  assert.equal(cardDocuments, cardDocumentsMirror);
  assert.equal(admissionDocuments, admissionDocumentsMirror);
  for (const number of ["086", "087", "088", "089", "090"]) assert.match(sync, new RegExp(`${number}_[^"\\n]+\\.sql`));
});

test("school-entered drafts stay in applications and cannot create enrolments", () => {
  assert.match(drafts, /public\.can_manage_admissions\(p_school_id\)/);
  assert.match(drafts, /entry_channel = 'SCHOOL_ADMIN'/);
  assert.match(drafts, /status = 'DRAFT'/);
  assert.doesNotMatch(drafts, /insert into public\.learners/);
  assert.doesNotMatch(drafts, /insert into public\.learner_class_enrolments/);
  assert.match(form, /Resume a school draft/);
  assert.match(form, /confirm_school_admission_draft/);
  assert.match(form, /Last saved/);
});

test("admission records use protected version metadata and a real A4 PDF", () => {
  assert.match(records, /unique \(school_id,admission_application_id,version_number\)/);
  assert.match(records, /public\.can_manage_admissions\(p_school_id\)/);
  assert.match(records, /ADMISSION_RECORD_DOWNLOADED/);
  assert.match(records, /can_view_school_admission_record_path/);
  assert.match(panel, /school-document-library/);
  assert.match(panel, /register_school_admission_record/);
  assert.match(panel, /record_school_admission_record_download/);
  assert.match(pdf, /PDFDocument\.create\(\)/);
  assert.match(pdf, /pageHeight = 841\.89/);
  assert.match(pdf, /Authorized signature/);
});

test("student and staff cards have distinct previews and genuine verification QR codes", () => {
  assert.match(cards, /printed_role/);
  assert.match(cards, /printed_academic_year_id/);
  assert.match(cards, /REISSUE_REQUIRED/);
  assert.match(cards, /school_id=new\.school_id/);
  assert.match(cardPage, /QRCode\.toDataURL/);
  assert.match(cardPage, /verify\/id\//);
  assert.match(cardPage, /id-card--staff/);
  assert.match(cardPage, /id-card--student/);
  assert.match(css, /identity-print-grid--preview/);
  assert.match(cardDocuments, /school_identity_card_document_immutable_update/);
  assert.match(cardDocuments, /CARD_PRINT_DOCUMENT_ALREADY_REGISTERED/);
  assert.match(cardDocuments, /IDENTITY_CARD_PRINT_PDF_DOWNLOADED/);
  assert.match(cardPdf, /85\.6 \* 72 \/ 25\.4/);
  assert.match(cardPdf, /QRCode\.toDataURL/);
  assert.match(cardPage, /register_school_identity_card_document/);
  assert.match(cardDocuments, /issue_school_identity_cards_once/);
  assert.match(admissionDocuments, /record_school_admission_document/);
  assert.match(adminDocuments, /verify_school_admission_document/);
});

test("staff ID numbers are saved securely and the print view contains only explicitly selected cards", async () => {
  const staffNumberMigration = await read("../database/migrations/093_school_admin_staff_number_for_identity_cards.sql");
  const staffNumberMirror = await read("../supabase/migrations/20261011170000_school_admin_staff_number_for_identity_cards.sql");
  assert.equal(staffNumberMigration, staffNumberMirror);
  assert.match(staffNumberMigration, /is_school_admin_for\(p_school_id\)/);
  assert.match(staffNumberMigration, /STAFF_NUMBER_NOT_UNIQUE_IN_SCHOOL/);
  assert.match(cardPage, /set_school_identity_card_staff_number/);
  assert.match(cardPage, /Preview selected active cards/);
  assert.match(cardPage, /selectedPeople\.map/);
  assert.match(cardPage, /Print \{printCards\.length\} selected ID/);
  assert.match(css, /body \* \{ visibility:hidden!important; \}/);
  assert.match(css, /\.identity-page > :not\(\.identity-print-grid\) \{ display:none!important; \}/);
});

test("public student application RPCs can resolve pgcrypto digest across all token workflows", async () => {
  const digestMigration = await read("../database/migrations/094_fix_public_admission_digest_search_path.sql");
  const digestMirror = await read("../supabase/migrations/20261011180000_fix_public_admission_digest_search_path.sql");
  assert.equal(digestMigration, digestMirror);
  for (const fn of ["start_public_admission_application", "save_public_admission_draft", "record_public_admission_document", "submit_public_admission_application", "get_public_admission_application_status", "withdraw_public_admission_application"]) {
    assert.match(digestMigration, new RegExp(`alter function public\\.${fn}\\([\\s\\S]*?set search_path = public, auth, extensions, pg_temp`));
  }
  assert.match(digestMigration, /notify pgrst, 'reload schema'/);
});
