import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../apps/web/src/features/results/ResultsAnalysisPage.tsx", import.meta.url), "utf8");

test("Results & Analysis reads the persistent class register and saved term marks", () => {
  assert.match(page, /usePersistentClassSetup\(\)/);
  assert.match(page, /usePersistentMarks\(\)/);
  assert.match(page, /academicYearId === school\.academicYearId/);
  assert.match(page, /item\.classId === activeClassId/);
  assert.match(page, /learner\.aoiMark/);
  assert.match(page, /learner\.examMark/);
  assert.doesNotMatch(page, /useAcademicWorkspace\(|workspace\.getMarks/);
});

test("Results & Analysis distinguishes loading and fetch failures from valid empty data", () => {
  assert.match(page, /Results data could not be loaded/);
  assert.match(page, /Retry data fetch/);
  assert.match(page, /Loading saved results/);
  assert.match(page, /No O-Level classes configured for this academic year/);
  assert.match(page, /No subject offerings found for/);
});
