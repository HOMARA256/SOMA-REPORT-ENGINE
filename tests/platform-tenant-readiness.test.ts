import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261008150000_platform_tenant_readiness.sql", import.meta.url), "utf8");
const workspace = await readFile(new URL("../apps/web/src/features/platform/PlatformWorkspace.tsx", import.meta.url), "utf8");
const healthPage = await readFile(new URL("../apps/web/src/features/platform/PlatformHealthPage.tsx", import.meta.url), "utf8");

test("tenant readiness is restricted to active platform administrators", () => {
  assert.match(migration, /pa\.auth_user_id = auth\.uid\(\) and pa\.is_active = true/);
  assert.match(migration, /revoke all on function public\.get_platform_tenant_readiness\(uuid\) from public, anon/);
  assert.match(migration, /grant execute on function public\.get_platform_tenant_readiness\(uuid\) to authenticated/);
});

test("readiness relations remain inside the same school tenant", () => {
  assert.match(migration, /ob\.school_id = s\.id/);
  assert.match(migration, /profile\.school_id = s\.id/);
  assert.match(migration, /i\.school_id = s\.id/);
  assert.match(migration, /membership\.school_id = s\.id/);
  assert.match(migration, /join public\.users app_user on app_user\.id = membership\.user_id/);
  assert.match(migration, /not app_user\.is_active then 'USER_INACTIVE'/);
  assert.match(migration, /year_record\.school_id = s\.id/);
  assert.match(migration, /term_record\.school_id = s\.id/);
  assert.match(migration, /offering\.school_id = s\.id/);
  assert.match(migration, /subscription\.school_id = s\.id/);
});

test("readiness checks admin, subscription, selected term and required subjects without returning PII", () => {
  for (const issue of ["SCHOOL_ADMIN_NOT_ACTIVE", "SUBSCRIPTION_MISSING", "SELECTED_TERM_MISSING", "SELECTED_TERM_NOT_OPEN", "COMPULSORY_O_LEVEL_SUBJECTS_INCOMPLETE"]) {
    assert.ok(migration.includes(issue));
  }
  assert.doesNotMatch(migration, /invitation\.email|invitation\.full_name|learner_name/i);
  assert.match(migration, /required_o_level_expected/);
  assert.match(migration, /required_o_level_linked/);
});

test("Platform Health loads and displays tenant readiness independently of coordination", () => {
  assert.match(workspace, /get_platform_tenant_readiness/);
  assert.match(healthPage, /loadAllTenantReadiness/);
  assert.match(healthPage, /New-school onboarding readiness/);
  assert.match(healthPage, /setupIssues/);
});
