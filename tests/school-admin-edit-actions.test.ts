import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const classPage = await readFile(new URL("../apps/web/src/features/classes/ClassDetailPage.tsx", import.meta.url), "utf8");
const learnerProfile = await readFile(new URL("../apps/web/src/features/learners/LearnerProfilePage.tsx", import.meta.url), "utf8");
const learnerEditor = await readFile(new URL("../apps/web/src/features/learners/EditLearnerPage.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../apps/web/src/features/academicSetup/AcademicWorkspace.tsx", import.meta.url), "utf8");
const allocations = await readFile(new URL("../apps/web/src/features/staff/TeacherAllocationsPage.tsx", import.meta.url), "utf8");

test("class edit, stream and subject mutation actions are School Admin-only", () => {
  assert.match(classPage, /currentUser\.role==="SCHOOL_ADMIN"&&currentUser\.permissions\.includes\("users\.manage"\)/);
  assert.match(classPage, /record\.programme==="O_LEVEL"&&canManageClass&&<div className="class-detail-edit-actions"/);
  assert.match(classPage, /record\.programme!=="O_LEVEL"&&canManageClass&&<form/);
  assert.match(classPage, /canManageClass&&setup\.activatedSubjects\.some/);
});

test("learner editing, deletion and media mutation require School Admin access", () => {
  assert.match(learnerProfile, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
  assert.match(learnerProfile, /canManageLearners && <div className="session-row-actions"/);
  assert.match(learnerProfile, /canManageLearners && <MediaAssetEditor/);
  assert.match(learnerEditor, /if \(!canManageLearners\)/);
  assert.match(workspace, /function updateLearner[\s\S]*?currentUser\.role !== "SCHOOL_ADMIN"/);
  assert.match(workspace, /function deleteLearner[\s\S]*?currentUser\.role !== "SCHOOL_ADMIN"/);
});

test("allocation actions already require School Admin role and users.manage", () => {
  assert.match(allocations, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
  assert.match(allocations, /\{canManage && <>/);
});
