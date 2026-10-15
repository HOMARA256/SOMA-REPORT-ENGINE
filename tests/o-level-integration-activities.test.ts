import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("legacy A1/A2 scores remain intact while any number of activities feed guarded O-Level reports", async () => {
  const [database, deployed, extension, extensionMirror, entry, report] = await Promise.all([
    read("../database/migrations/115_o_level_integration_activity_marks.sql"),
    read("../supabase/migrations/20261015110000_o_level_integration_activity_marks.sql"),
    read("../database/migrations/116_o_level_dynamic_activities_report_policy.sql"),
    read("../supabase/migrations/20261015120000_o_level_dynamic_activities_report_policy.sql"),
    read("../apps/web/src/features/marks/MarksEntryPage.tsx"),
    read("../apps/web/src/features/reports/ConnectedOLevelReportPage.tsx"),
  ]);
  assert.equal(database, deployed);
  assert.equal(extension, extensionMirror);
  assert.match(database, /activity_number smallint not null check \(activity_number in \(1,2\)\)/);
  assert.match(database, /constraint o_level_activity_unique unique \(term_id,class_subject_offering_id,learner_id,activity_number\)/);
  assert.match(database, /public\.save_academic_mark_record\(p_term_id,p_class_subject_offering_id,p_learner_id/);
  assert.match(database, /round\(p_raw_mark\*0\.8,2\)/);
  assert.match(database, /v_aoi:=round\(\(public\.o_level_three_point_v1/);
  assert.match(extension, /drop constraint o_level_integration_activity_marks_activity_number_check/);
  assert.match(extension, /create table public\.o_level_integration_activities/);
  assert.match(extension, /create function public\.get_o_level_activity_selection/);
  assert.match(extension, /limit v_policy\.reflected_aoi_count/);
  assert.match(extension, /create function public\.assert_o_level_offering_assessment_complete/);
  assert.match(extension, /Only this School Administrator can change report-card settings/);
  assert.match(entry, /Activities of Integration \(\{activities\.length\}\)/);
  assert.match(entry, /End-of-term exam/);
  assert.match(entry, /Create activity/);
  assert.match(report, /DRAFT · NOT FOR ISSUE/);
  assert.match(report, /approved piecewise 3-point conversion/);
  assert.match(report, /Activities selected for this draft/);
  assert.match(report, /policy\?\.showClassPosition &&/);
});
