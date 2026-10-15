import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("report preview and print use the school badge without replacing the draft notice", async () => {
  const page = await readFile(new URL("../apps/web/src/features/reports/ReportCardsPage.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/web/src/index.css", import.meta.url), "utf8");
  assert.match(page, /snapshot\?\.schoolBadge \|\| schoolContext\.schoolLogo/);
  const workspace = await readFile(new URL("../apps/web/src/features/academicSetup/AcademicWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /schoolBadge: schoolContext\.schoolLogo/);
  assert.match(page, /className="report-badge-watermark" aria-hidden="true"/);
  assert.match(page, /DRAFT · NOT FOR ISSUE/);
  assert.match(css, /\.report-badge-watermark img \{[^}]*opacity:\.075/);
  assert.match(css, /\.report-badge-watermark img \{[^}]*print-color-adjust:exact/);
  assert.match(css, /\.report-paper > \*:not\(\.report-watermark\):not\(\.report-badge-watermark\)/);
});
