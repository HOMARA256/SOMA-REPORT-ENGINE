import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../apps/web/src/index.css", import.meta.url), "utf8");
const learners = await readFile(new URL("../apps/web/src/features/learners/LearnersPage.tsx", import.meta.url), "utf8");
const staff = await readFile(new URL("../apps/web/src/features/staff/staffUsersPage.tsx", import.meta.url), "utf8");
const marks = await readFile(new URL("../apps/web/src/features/marks/MarksEntryPage.tsx", import.meta.url), "utf8");
const learnerProfile = await readFile(new URL("../apps/web/src/features/learners/LearnerProfilePage.tsx", import.meta.url), "utf8");

test("ordinary application tables receive column labels for CSS card reflow", () => {
  assert.match(app, /ResponsiveTableLabels/);
  assert.match(app, /\.table-wrapper > table/);
  assert.match(app, /new MutationObserver\(labelTables\)/);
  assert.match(app, /cell\.dataset\.label = label/);
  assert.match(css, /content:attr\(data-label\)/);
  assert.match(css, /48rem/);
  assert.match(css, /\.data-table \{ min-width:0; table-layout:auto; \}/);
  assert.match(css, /\.platform-school-table \{ width:100%; min-width:0; \}/);
  assert.match(css, /\.responsive-grid \{ display:grid; grid-template-columns:repeat\(auto-fit/);
  assert.match(learners, /responsive-grid/);
  assert.match(staff, /className="data-table responsive-table"/);
});

test("mobile record cards do not replace score comparison tables", () => {
  assert.match(css, /table-wrapper>table:not\(\.marks-grid-table\):not\(\.marksheet-table\)/);
  assert.match(css, /\.marks-grid-wrapper.*overflow:auto/s);
  assert.match(css, /marks-grid-table th:nth-child\(2\).*position:sticky/s);
  assert.match(css, /marksheet-table th:nth-child\(2\).*position:sticky/s);
  assert.match(css, /marks-grid-table th \{ position:sticky; top:0/);
});

test("icons use the shared Lucide treatment and do not repeat as row/heading decoration", () => {
  assert.match(css, /\.app-icon \{ width:1\.125rem; height:1\.125rem/);
  assert.match(css, /\.lucide \{[^}]*stroke-width:2/);
  assert.match(css, /\.panel-heading \.panel-title-group>\.panel-icon \{ display:none; \}/);
  assert.match(css, /\.assessment-name-cell>\.assessment-icon \{ display:none; \}/);
  assert.doesNotMatch(learnerProfile, /Edit3/);
  assert.match(marks, /aria-label=\{changed \? "Save this learner's marks" : "Marks saved"\}/);
});
