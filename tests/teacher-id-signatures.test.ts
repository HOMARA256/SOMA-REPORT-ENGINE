import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("teacher ID signatures are private, school-scoped, and frozen on newly issued cards", async () => {
  const [database, supabase, page, pdf] = await Promise.all([
    read("../database/migrations/113_teacher_id_signatures.sql"),
    read("../supabase/migrations/20261015090000_teacher_id_signatures.sql"),
    read("../apps/web/src/features/admissions/IdentityDocumentsPages.tsx"),
    read("../apps/web/src/features/admissions/identityCardPdf.ts"),
  ]);
  assert.equal(database, supabase);
  assert.match(database, /'teacher-id-signatures',false,1048576/);
  assert.match(database, /is_school_teacher_id_signature_target/);
  assert.match(database, /for select to authenticated/);
  assert.match(database, /for insert to authenticated/);
  assert.match(database, /printed_signature_path/);
  assert.match(database, /capture_school_identity_card_teacher_signature_before_insert/);
  assert.match(page, /I confirm this teacher authorised use of their signature/);
  assert.match(page, /set_school_teacher_id_signature/);
  assert.match(pdf, /signature\.scaleToFit/);
});
