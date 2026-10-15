import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261014230000_platform_operational_observability.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../database/migrations/112_platform_operational_observability.sql", import.meta.url), "utf8");
const worker = await readFile(new URL("../apps/api/src/worker.mjs", import.meta.url), "utf8");
const statusPanel = await readFile(new URL("../apps/web/src/features/platform/PlatformOperationalStatus.tsx", import.meta.url), "utf8");
const platformPages = await readFile(new URL("../apps/web/src/features/platform/PlatformPages.tsx", import.meta.url), "utf8");

test("operational evidence is platform-only and exposes aggregate counts rather than recipients", () => {
  assert.equal(migration, mirror);
  assert.match(migration, /if not public\.is_active_platform_admin\(\) then/);
  assert.match(migration, /revoke all on public\.platform_worker_heartbeats from public, anon, authenticated/);
  assert.match(migration, /teacher_password_recovery_requests/);
  assert.match(migration, /notification_deliveries/);
  assert.doesNotMatch(migration, /'recipient'|'invited_email'|'teacher_auth_user_id'/);
});

test("worker reports its one connected notification retry job without claiming placeholder jobs executed", () => {
  assert.match(worker, /capability: "HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES"/);
  assert.match(worker, /platform_worker_heartbeats\?on_conflict=worker_name/);
  assert.match(worker, /deliver_school_teacher_message_notices/);
  assert.match(worker, /executedJobs: \["school_teacher_message_notifications"\]/);
  assert.doesNotMatch(worker, /provider_dispatch_ready/);
});

test("platform status screens show monitoring limits instead of fabricated health and backup figures", () => {
  assert.match(statusPanel, /get_platform_operational_status/);
  assert.match(statusPanel, /A provider-accepted send is not proof/);
  assert.match(statusPanel, /does not yet execute the listed background jobs/);
  assert.match(platformPages, /Backup verification not connected/);
  assert.match(platformPages, /MFA enrollment","Not monitored"/);
  assert.doesNotMatch(platformPages, /Latest platform backup","23 Sep 2026/);
  assert.doesNotMatch(platformPages, /Failed platform logins","0"/);
  assert.doesNotMatch(platformPages, /Profile \/ media","0\.2 GB"/);
});
