import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("SOMA REPORT ENGINE appears in entry, account, navigation, and export surfaces", () => {
  for (const path of [
    "apps/web/index.html",
    "apps/web/src/features/auth/LoginPage.tsx",
    "apps/web/src/features/auth/ResetPasswordPage.tsx",
    "apps/web/src/features/platform/PlatformShell.tsx",
    "apps/web/src/components/layout/Sidebar.tsx",
    "apps/web/src/features/importExport/excelWorkbooks.ts",
  ]) assert.match(read(path), /SOMA REPORT ENGINE/, path);
  assert.doesNotMatch(read("apps/web/index.html"), /ourschool-favicon|<title>OURSCHOOL<\/title>/i);
  assert.match(read("apps/web/public/soma-report-engine-logo.svg"), /SOMA/);
  assert.match(read("apps/web/public/soma-report-engine-logo.svg"), /REPORT ENGINE/);
});

test("rebrand migration preserves durable plan codes and historical billing", () => {
  const migration = read("supabase/migrations/20261008100000_soma_report_engine_brand.sql");
  assert.equal(migration, read("database/migrations/072_soma_report_engine_brand.sql"));
  assert.match(migration, /update public\.subscription_plans/);
  assert.match(migration, /'plan','SOMA REPORT ENGINE Termly'/);
  assert.doesNotMatch(migration, /update public\.subscription_periods/i);
  assert.match(read("apps/web/src/features/platform/PlatformWorkspace.tsx"), /code: "OURSCHOOL_TERMLY_V2"/);
});
