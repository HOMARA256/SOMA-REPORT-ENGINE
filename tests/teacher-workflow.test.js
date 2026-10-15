import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const page = await readFile(new URL("../apps/web/src/features/staff/TeacherAllocationsPage.tsx", import.meta.url), "utf8");
const staff = await readFile(new URL("../apps/web/src/features/staff/staffUsersPage.tsx", import.meta.url), "utf8");
const securityMigration = await readFile(new URL("../supabase/migrations/20261008120000_teacher_allocation_lifecycle_security.sql", import.meta.url), "utf8");
const allocationMigration = await readFile(new URL("../supabase/migrations/20261008110000_teacher_multi_subject_allocation.sql", import.meta.url), "utf8");
const mirroredSecurityMigration = await readFile(new URL("../database/migrations/074_teacher_allocation_lifecycle_security.sql", import.meta.url), "utf8");
const mirroredAllocationMigration = await readFile(new URL("../database/migrations/073_teacher_multi_subject_allocation.sql", import.meta.url), "utf8");
test("allocation actions are school-admin-only in the UI and RPC layer", () => {
    assert.match(page, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
    assert.match(securityMigration, /if p_school_id is null or not \(\s*public\.is_school_admin_for\(p_school_id\)/);
    assert.match(allocationMigration, /public\.is_school_admin_for\(v_offering\.school_id\)/);
    assert.match(securityMigration, /public\.is_school_admin_for\(v_allocation\.school_id\)/);
});
test("allocation lifecycle retains history and logs end, edit, and membership changes", () => {
    assert.match(page, /rpc\("end_teacher_allocation"/);
    assert.match(page, /rpc\("edit_teacher_allocation_dates"/);
    assert.match(page, /Restore teacher/);
    assert.match(securityMigration, /drop constraint if exists teacher_allocation_scope_key/i);
    assert.match(securityMigration, /where status = 'ACTIVE'/);
    assert.match(securityMigration, /TEACHER_ALLOCATION_ENDED/);
    assert.match(securityMigration, /TEACHER_ALLOCATION_DATES_EDITED/);
    assert.match(securityMigration, /TEACHER_DEACTIVATED/);
    assert.match(securityMigration, /ended_allocation_ids/);
});
test("allocation register supports filters, CSV/PDF export, grouped selection, and coverage", () => {
    for (const filter of ["filterClass", "filterSubject", "filterTeacher", "filterRole", "filterStatus"]) {
        assert.match(page, new RegExp(filter));
    }
    assert.match(page, /Export CSV/);
    assert.match(page, /Print \/ Save PDF/);
    assert.match(page, /Select all for class/);
    assert.match(page, /Coverage by class and stream/);
    assert.match(page, /Unallocated class subjects/);
    assert.match(page, /Timetable conflicts<\/span><strong>Not checked/);
});
test("teacher directory explains eligibility and can suspend or reactivate school membership", () => {
    assert.match(staff, /function eligibility/);
    assert.match(staff, /Suspend access/);
    assert.match(staff, /Reactivate membership/);
    assert.match(staff, /rpc\("set_school_teacher_access"/);
    assert.match(securityMigration, /set_school_teacher_access/);
});
test("membership status idempotency condition uses a valid PL/pgSQL boolean expression", () => {
    assert.match(securityMigration, /if \(p_active and v_membership\.status = 'ACTIVE'\)\s+or \(not p_active and v_membership\.status = 'INACTIVE'\) then/);
});
test("teacher workflow migration mirrors remain byte-identical", () => {
    assert.equal(mirroredAllocationMigration, allocationMigration);
    assert.equal(mirroredSecurityMigration, securityMigration);
});
