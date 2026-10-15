import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = "supabase/migrations/20261013130000_teacher_recovery_dashboard_scope.sql";
const migration = await readFile(migrationPath, "utf8");
const edge = await readFile("supabase/functions/request-school-teacher-password-reset/index.ts", "utf8");
const staff = await readFile("apps/web/src/features/staff/staffUsersPage.tsx", "utf8");
const dashboard = await readFile("apps/web/src/features/dashboard/Dashboard.tsx", "utf8");
const resetPage = await readFile("apps/web/src/features/auth/ResetPasswordPage.tsx", "utf8");
const aLevel = await readFile("apps/web/src/features/marks/ALevelMarksEntryPage.tsx", "utf8");

test("school-initiated password reset resolves teacher IDs server-side and verifies school-admin authority", () => {
  assert.match(migration, /p_teacher_user_id uuid/);
  assert.match(migration, /where u\.id=p_teacher_user_id[\s\S]*?m\.status='ACTIVE'[\s\S]*?r\.code='TEACHER'/);
  assert.match(migration, /r\.code='SCHOOL_ADMIN'/);
  assert.match(edge, /teacherUserId\?: string/);
  assert.doesNotMatch(edge, /teacherAuthUserId/);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]*?interval '60 seconds'[\s\S]*?interval '1 hour'/);
  assert.match(migration, /revoke all on function public\.prepare_school_teacher_password_recovery[\s\S]*?from public,anon,authenticated/);
});

test("recovery stores delivery outcomes without password or raw recovery-link data and audits completion", () => {
  assert.match(migration, /delivery_status in \('PENDING','SENT','DELIVERY_FAILED','RATE_LIMITED'\)/);
  assert.match(migration, /TEACHER_PASSWORD_RECOVERY_COMPLETED/);
  assert.match(migration, /get_my_teacher_password_recovery_context/);
  assert.match(migration, /delivered_at>now\(\)-interval '1 hour'/);
  assert.doesNotMatch(migration, /password_hash|recovery_token|action_link/i);
  assert.match(edge, /generateLink\([\s\S]*type: "recovery"/);
  assert.match(edge, /return sent[\s\S]*respond\(\{ sent: true \}\)/);
  assert.doesNotMatch(edge, /respond\(\{[^}]*actionLink/i);
  assert.match(resetPage, /signOut\(\{ scope: "global" \}\)/);
});

test("teacher dashboard uses only allocated school-term work and exposes no administrative dashboard hooks", () => {
  const teacherPart = dashboard.slice(dashboard.indexOf("function TeacherDashboard"), dashboard.indexOf("function SchoolDashboard"));
  assert.match(dashboard, /if \(currentUser\.role === "TEACHER"\) return <TeacherDashboard \/>/);
  assert.match(teacherPart, /usePersistentMarks\(\)/);
  assert.match(teacherPart, /useUnreadMessageCount\(supabase, school\.schoolId\)/);
  assert.doesNotMatch(teacherPart, /usePersistentLearners|usePersistentClassSetup|usePersistentModeration|fetchSchoolTeacherDirectory/);
  assert.match(migration, /v_role<>'TEACHER' or exists\([\s\S]*?ta\.teacher_id=v_actor/);
  assert.match(migration, /get_authorized_a_level_marks_roster[\s\S]*?ta\.teacher_id=v_actor/);
  assert.match(aLevel, /get_authorized_a_level_marks_roster/);
});

test("both migration mirrors are byte-identical and migration sync includes the new recovery scope", async () => {
  const [databaseCopy, sync] = await Promise.all([
    readFile("database/migrations/098_teacher_recovery_dashboard_scope.sql"),
    readFile("scripts/sync-academic-migrations.mjs", "utf8"),
  ]);
  assert.deepEqual(databaseCopy, await readFile(migrationPath));
  assert.match(sync, /098_teacher_recovery_dashboard_scope\.sql/);
});

test("staff reset confirmation explains global-account effects and preserves the school membership", () => {
  assert.match(staff, /Send teacher password-reset email\?/);
  assert.match(staff, /one global sign-in account/);
  assert.match(staff, /This school’s membership, other school memberships, allocations, and academic records are unchanged/);
  assert.match(staff, /request-school-teacher-password-reset/);
});
