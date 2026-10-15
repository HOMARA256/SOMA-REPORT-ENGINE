import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20261006100000_persistent_platform_feature_overrides.sql", "utf8");
const mirror = readFileSync("database/migrations/069_persistent_platform_feature_overrides.sql", "utf8");
const workspace = readFileSync("apps/web/src/features/platform/PlatformWorkspace.tsx", "utf8");
const pages = readFileSync("apps/web/src/features/platform/PlatformPages.tsx", "utf8");

test("feature migration preserves the existing schema and has an identical mirror", () => {
  assert.equal(mirror, migration);
  assert.match(migration, /on conflict \(key\) do nothing/i);
  assert.match(migration, /public\.school_feature_overrides/);
  assert.match(migration, /drop policy if exists school_overrides_admin_manage/);
  assert.doesNotMatch(migration, /delete from public\.school_feature_overrides/i);
});

test("feature write requires a platform administrator and audits the change", () => {
  assert.match(migration, /where auth_user_id = auth\.uid\(\) and is_active/i);
  assert.match(migration, /for update/);
  assert.match(migration, /FEATURE_OVERRIDE_REASON_REQUIRED/);
  assert.match(migration, /insert into public\.platform_audit_logs/);
  assert.match(migration, /'changed', false/);
  assert.match(migration, /grant execute on function public\.set_platform_school_feature_override.*to authenticated/is);
});

test("platform feature controls call the persistent RPC and fail closed if unavailable", () => {
  assert.match(workspace, /rpc\("get_platform_feature_directory"/);
  assert.match(workspace, /featureConnectionAvailable: false/);
  assert.match(workspace, /rpc\("set_platform_school_feature_override"/);
  assert.match(pages, /Live feature settings are unavailable/);
  assert.match(pages, /Override saved, but the refreshed value could not be verified/);
  assert.doesNotMatch(workspace, /toggleFeature/);
});

test("a browser-only payment confirmation can no longer present itself as persistent", () => {
  assert.doesNotMatch(workspace, /confirmPayment/);
  assert.doesNotMatch(pages, /confirmLabel="Confirm Payment"/);
  assert.match(pages, /No payment can be confirmed from this screen/);
});
