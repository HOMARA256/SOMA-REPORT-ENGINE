import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = await readFile(new URL("../supabase/migrations/20261008160000_fix_o_level_class_save_duplicate_rules.sql", import.meta.url), "utf8");
const form = await readFile(new URL("../apps/web/src/features/classes/NcdcClassForm.tsx", import.meta.url), "utf8");
const healthPage = await readFile(new URL("../apps/web/src/features/platform/PlatformHealthPage.tsx", import.meta.url), "utf8");
test("class creation seeds subjects only from this level and the one active rule set", () => {
    assert.match(migration, /where rs\.status = 'ACTIVE'/);
    assert.match(migration, /r\.rule_set_id = v_rule_set_id/);
    assert.match(migration, /r\.class_level = p_level/);
    assert.match(migration, /select distinct on \(ss\.id\)/);
    assert.match(migration, /p_school_id, p_academic_year_id, ss\.id/);
});
test("class creation explicitly pins the curriculum version before required-subject sync", () => {
    assert.match(migration, /where id = v_id and school_id = p_school_id/);
    assert.match(migration, /perform public\.sync_o_level_class_curriculum\(v_id\)/);
    assert.match(migration, /ay\.id = p_academic_year_id and ay\.school_id = p_school_id/);
    assert.match(migration, /grant execute on function public\.create_o_level_curriculum_class[\s\S]*to authenticated/);
    assert.match(form, /rpc\("create_o_level_curriculum_class"/);
});
test("Platform Health uses a styled, accessible Open school action", () => {
    assert.match(healthPage, /className="secondary-button platform-open-school-button"/);
    assert.match(healthPage, /<span>Open school<\/span>/);
    assert.match(healthPage, /ArrowUpRight size=\{16\} aria-hidden="true"/);
});
