import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261008190000_fix_school_branding_storage_rls.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../database/migrations/077_fix_school_branding_storage_rls.sql", import.meta.url), "utf8");
const selectPolicyMigration = await readFile(new URL("../supabase/migrations/20261009110000_school_branding_storage_select_policy.sql", import.meta.url), "utf8");
const selectPolicyMirror = await readFile(new URL("../database/migrations/079_school_branding_storage_select_policy.sql", import.meta.url), "utf8");
const profile = await readFile(new URL("../apps/web/src/features/settings/SchoolProfilePage.tsx", import.meta.url), "utf8");

test("school badge storage writes and deletes use tenant-scoped school-admin authorization", () => {
  assert.match(migration, /for insert to authenticated with check/i);
  assert.match(migration, /for update to authenticated\s+using/i);
  assert.match(migration, /with check\s*\(/i);
  assert.match(migration, /for delete to authenticated using/i);
  assert.equal((migration.match(/public\.is_school_admin_for\(/g) ?? []).length, 4);
  assert.match(migration, /storage\.foldername\(name\).*\[1\]/s);
  assert.match(migration, /bucket_id = 'school-branding'/);
  assert.match(migration, /else false/);
});

test("badge upload gives an actionable explanation when Storage RLS rejects an admin", () => {
  assert.match(profile, /row-level security/i);
  assert.match(profile, /current session is an active administrator for the selected school/i);
  assert.match(profile, /verify the school-scoped Storage policies/i);
  assert.doesNotMatch(profile, /deploy the pending school-branding storage policy repair/i);
});

test("branding policy migration is byte-equivalent to its deployment mirror", () => {
  assert.equal(mirror, migration);
});

test("badge upload has tenant-scoped SELECT access for Storage metadata and upserts", () => {
  assert.match(selectPolicyMigration, /for select to authenticated using/i);
  assert.match(selectPolicyMigration, /bucket_id = 'school-branding'/);
  assert.match(selectPolicyMigration, /public\.is_school_admin_for\(/);
  assert.match(selectPolicyMigration, /storage\.foldername\(name\).*\[1\]/s);
  assert.match(selectPolicyMigration, /else false/);
  assert.equal(selectPolicyMirror, selectPolicyMigration);
});
