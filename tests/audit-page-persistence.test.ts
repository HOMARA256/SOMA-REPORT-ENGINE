import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../apps/web/src/features/audit/AuditPage.tsx", import.meta.url), "utf8");

test("school Audit reads persisted tenant-scoped events rather than browser review-session arrays", () => {
  assert.match(page, /from\("report_audit_events"\)/);
  assert.match(page, /from\("import_export_audit_events"\)/);
  assert.match(page, /from\("approval_audit_events"\)/);
  assert.equal((page.match(/\.eq\("school_id", school\.schoolId\)/g) ?? []).length, 3);
  assert.doesNotMatch(page, /useAcademicWorkspace|useSchoolSettings|useImportExportWorkspace|auditEvents/);
});

test("school Audit exposes loading, failure, retry and honest persisted-empty states", () => {
  assert.match(page, /Audit history unavailable/);
  assert.match(page, /Loading audit history/);
  assert.match(page, /Refresh audit history/);
  assert.match(page, /No persisted events for this school yet/);
});
