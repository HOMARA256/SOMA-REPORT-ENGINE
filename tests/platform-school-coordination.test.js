import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = new URL("../database/migrations/066_platform_school_coordination_health.sql", import.meta.url);
const mirror = new URL("../supabase/migrations/20261005140000_platform_school_coordination_health.sql", import.meta.url);
test("platform school coordination is platform-admin-only and aggregate-only", async () => {
    const sql = await readFile(migration, "utf8");
    assert.match(sql, /get_platform_school_coordination\(p_school_id uuid\)/);
    assert.match(sql, /where auth_user_id = auth\.uid\(\) and is_active = true/);
    assert.match(sql, /where id = p_school_id/);
    assert.match(sql, /'academicYears', v_years/);
    assert.match(sql, /'integrity', v_integrity/);
    assert.match(sql, /'markRecords', \(select count\(\*\) from public\.academic_mark_records mr where mr\.school_id = v_school\.id and mr\.academic_year_id = y\.id\)/);
    assert.match(sql, /'aLevelCombinations'/);
    assert.match(sql, /'aLevelPaperMarks'/);
    assert.match(sql, /'reportSnapshots'/);
    assert.match(sql, /if p_school_id is null then[\s\S]*get_platform_school_coordination\(s\.id\)/);
    assert.match(sql, /'markRecordMismatches'/);
    assert.match(sql, /'aLevelAssignmentMismatches'/);
    assert.match(sql, /'reportSnapshotMismatches'/);
    assert.match(sql, /'classSubjectLinkMismatches'/);
    assert.match(sql, /revoke all on function public\.get_platform_school_coordination\(uuid\) from public, anon/);
    assert.match(sql, /grant execute on function public\.get_platform_school_coordination\(uuid\) to authenticated/);
    assert.doesNotMatch(sql, /first_name|last_name|admission_number|aoi_mark|exam_mark|email/);
});
test("coordination migration is synchronized to the Supabase CLI directory", async () => {
    assert.deepEqual(await readFile(mirror), await readFile(migration));
});
