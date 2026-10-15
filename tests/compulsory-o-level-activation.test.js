import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = new URL("../database/migrations/064_activate_compulsory_o_level_subjects.sql", import.meta.url);
const mirror = new URL("../supabase/migrations/20261005120000_activate_compulsory_o_level_subjects.sql", import.meta.url);
const activationFix = new URL("../database/migrations/065_fix_subject_activation_actor_and_required_offerings.sql", import.meta.url);
const activationFixMirror = new URL("../supabase/migrations/20261005130000_fix_subject_activation_actor_and_required_offerings.sql", import.meta.url);
test("required O-Level subjects are protected, repaired and prepared for new classes", async () => {
    const sql = await readFile(migration, "utf8");
    assert.match(sql, /r\.requirement='CORE'/);
    assert.match(sql, /NCDC_REQUIRED_SUBJECT_CANNOT_BE_DEACTIVATED/);
    assert.match(sql, /c\.programme='O_LEVEL' and c\.status='ACTIVE'/);
    assert.match(sql, /ay\.status='ACTIVE'/);
    assert.match(sql, /ss\.subject_level,null::timestamptz,\s+null::uuid,now\(\),false/);
    assert.match(sql, /create or replace function public\.create_o_level_curriculum_class/);
    assert.match(sql, /perform public\.sync_o_level_class_curriculum\(v_id\)/);
    assert.match(sql, /'RELIGION_OPTION'/);
    assert.match(sql, /Learners still choose CRE or IRE/);
});
test("compulsory subject migration mirror is identical", async () => {
    assert.deepEqual(await readFile(mirror), await readFile(migration));
});
test("subject activation audits the Auth ID while school offerings keep the app-user ID", async () => {
    const sql = await readFile(activationFix, "utf8");
    assert.match(sql, /activated_by,activated_at,is_demo_data/);
    assert.match(sql, /case when p_active then v_actor\.id else null end/);
    assert.match(sql, /insert into public\.audit_logs\(user_id,user_name,user_role/);
    assert.match(sql, /values\(v_actor\.auth_user_id,v_actor\.full_name/);
    assert.doesNotMatch(sql, /values\(v_actor\.id,v_actor\.full_name/);
    assert.match(sql, /r\.requirement='CORE'/);
    assert.match(sql, /status='ACTIVE'::public\.offering_status/);
    assert.match(sql, /ss\.subject_level,null::timestamptz,\s+null::uuid,now\(\),false/);
});
test("subject activation fix migration mirror is identical", async () => {
    assert.deepEqual(await readFile(activationFixMirror), await readFile(activationFix));
});
