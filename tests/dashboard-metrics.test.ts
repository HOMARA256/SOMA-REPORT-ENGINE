import assert from "node:assert/strict";
import test from "node:test";
import { summarizeMarkOfferings } from "../apps/web/src/features/dashboard/dashboardMetrics.ts";

test("dashboard mark completion uses saved current-term states and separates entered from resolved", () => {
  const summary = summarizeMarkOfferings([{
    className: "Senior 1",
    subjectName: "Mathematics",
    learners: [
      { aoiMark: 14, aoiStatus: "PRESENT", examMark: null, examStatus: "MISSING" },
      { aoiMark: null, aoiStatus: "ABSENT", examMark: 61, examStatus: "PRESENT" },
    ],
  }]);

  assert.equal(summary.total, 4);
  assert.equal(summary.recorded, 2);
  assert.equal(summary.resolved, 3);
  assert.equal(summary.missing, 1);
  assert.equal(summary.completionPercent, 75);
  assert.deepEqual(summary.classes[0], { name: "Senior 1", recorded: 2, total: 4, resolved: 3, progress: 75 });
  assert.deepEqual(summary.subjects[0], { name: "Mathematics", recorded: 2, total: 4, resolved: 3, progress: 75 });
});

test("an empty term remains empty instead of implying completed marks", () => {
  assert.deepEqual(summarizeMarkOfferings([]), {
    total: 0, recorded: 0, resolved: 0, missing: 0, completionPercent: 0, classes: [], subjects: [],
  });
});
