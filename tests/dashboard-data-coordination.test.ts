import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../apps/web/src/features/dashboard/Dashboard.tsx", import.meta.url), "utf8");
const staffSource = await readFile(new URL("../apps/web/src/features/staff/schoolTeacherDirectory.ts", import.meta.url), "utf8");
const primitive = await readFile(new URL("../apps/web/src/components/dashboard/DashboardPrimitives.tsx", import.meta.url), "utf8");

test("school dashboard derives totals from the same persistent school sources as feature pages", () => {
  assert.match(dashboard, /usePersistentLearners\(\)/);
  assert.match(dashboard, /usePersistentClassSetup\(\)/);
  assert.match(dashboard, /usePersistentMarks\(\)/);
  assert.match(dashboard, /usePersistentModeration\(/);
  assert.match(dashboard, /fetchSchoolTeacherDirectory\(school\.schoolId\)/);
  assert.match(dashboard, /learner\.enrolment\.academicYearId === school\.academicYearId/);
  assert.match(dashboard, /subject\.academicYearId === school\.academicYearId/);
  assert.match(dashboard, /refreshOnFocus/);
  assert.doesNotMatch(dashboard, /useAcademicWorkspace|staffAcademicSummary|teacherData/);
});

test("staff source is authorized by the school-scoped directory RPC, not direct browser table totals", () => {
  assert.match(staffSource, /rpc\("get_school_teacher_directory", \{ p_school_id: schoolId \}\)/);
  assert.match(staffSource, /Array\.isArray\(data\)/);
  assert.doesNotMatch(staffSource, /from\("users"\)|from\("school_memberships"\)/);
});

test("dashboard metrics distinguish loading, empty, forbidden, and failed data with retry", () => {
  assert.match(primitive, /"ready" \| "loading" \| "empty" \| "error" \| "forbidden"/);
  assert.match(primitive, /currentState === "error" && onRetry/);
  assert.match(primitive, /Could not load/);
});
