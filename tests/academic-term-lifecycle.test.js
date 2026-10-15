import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const activation = await readFile(new URL("../supabase/migrations/20261008140000_activate_school_academic_term.sql", import.meta.url), "utf8");
const setupPage = await readFile(new URL("../apps/web/src/features/academicSetup/AcademicSetupPage.tsx", import.meta.url), "utf8");
const periodCreation = await readFile(new URL("../supabase/migrations/20261001183532_school_academic_period_management.sql", import.meta.url), "utf8");
test("new terms remain drafts until their dates are explicitly confirmed", () => {
    assert.match(periodCreation, /lifecycle_status\) values\(p_school_id,p_parent_year,p_number,btrim\(p_name\),p_starts_on,p_ends_on,'DRAFT'\)/);
    assert.match(setupPage, /Confirm that the term dates are correct/);
});
test("term activation is authorized and scoped to the caller's school", () => {
    assert.match(activation, /m\.school_id = p_school_id and m\.user_id = v_actor/);
    assert.match(activation, /p\.code = 'academics\.manage'/);
    assert.match(activation, /where id = p_term_id and school_id = p_school_id/);
    assert.match(activation, /where id = v_term\.academic_year_id and school_id = p_school_id/);
});
test("opening a draft term activates its draft year and synchronizes the school current period", () => {
    assert.match(activation, /set status = 'ACTIVE'[\s\S]*?where id = v_year\.id and school_id = p_school_id/);
    assert.match(activation, /set lifecycle_status = 'MARKS_OPEN'/);
    assert.match(activation, /set current_academic_year =[\s\S]*?current_term = v_current_term/);
    assert.match(activation, /ACADEMIC_TERM_ACTIVATED/);
});
test("academic setup exposes the guarded Open for marks action only to academic managers", () => {
    assert.match(setupPage, /currentUser\.permissions\.includes\("academics\.manage"\)/);
    assert.match(setupPage, /term\.status==="DRAFT"&&canManageAcademics/);
    assert.match(setupPage, /activate_school_academic_term/);
});
