import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const navigation = await readFile(new URL("../apps/web/src/config/navigation.ts", import.meta.url), "utf8");
const learnersPage = await readFile(new URL("../apps/web/src/features/learners/LearnersPage.tsx", import.meta.url), "utf8");
const learnerProfile = await readFile(new URL("../apps/web/src/features/learners/PersistentLearnerProfilePage.tsx", import.meta.url), "utf8");
const staffPage = await readFile(new URL("../apps/web/src/features/staff/staffUsersPage.tsx", import.meta.url), "utf8");
const staffDirectorySource = await readFile(new URL("../apps/web/src/features/staff/schoolTeacherDirectory.ts", import.meta.url), "utf8");
const profileSettings = await readFile(new URL("../apps/web/src/features/settings/SchoolProfilePage.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20261008170000_separate_people_directories.sql", import.meta.url), "utf8");
const migrationMirror = await readFile(new URL("../database/migrations/075_separate_people_directories.sql", import.meta.url), "utf8");
test("Learners and Staff have distinct canonical pages and permission entries", () => {
    assert.match(app, /path="\/learners"\s+element=\{<LearnersPage \/>\}/);
    assert.match(app, /path="\/staff"\s+element=\{<StaffUsersPage \/>\}/);
    assert.match(navigation, /label: "Learners",\s+path: "\/learners"/);
    assert.match(navigation, /label: "Staff",\s+path: "\/staff",\s+icon: UserCog,\s+permission: "users\.manage"/);
});
test("learner directory supports tenant class filters, year, stream, gender and subject selection", () => {
    for (const label of ["Academic year", "Class level", "Class", "Stream", "Status", "Gender", "Subject"]) {
        assert.match(learnersPage, new RegExp(`label="${label}"`));
    }
    assert.match(learnersPage, /Search name or admission number/);
    assert.match(learnersPage, /guardianPhone/);
});
test("learner changes are admin-only, audited and constrained to the selected school", () => {
    assert.match(learnerProfile, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
    assert.match(migration, /if not public\.is_school_admin_for\(p_school_id\) then raise exception 'SCHOOL_ADMIN_REQUIRED'/);
    assert.match(migration, /where id=p_learner_id and school_id=p_school_id for update/);
    assert.match(migration, /LEARNER_PROFILE_UPDATED/);
    assert.match(migration, /ta\.school_id=p_school_id/);
    assert.match(migration, /ta\.teacher_id=public\.current_app_user_id\(\)/);
    assert.match(migration, /guardian_contact_present/);
});
test("Staff directory reads only persisted school Teacher memberships", () => {
    assert.match(staffPage, /fetchSchoolTeacherDirectory\(school\.schoolId\)/);
    assert.match(staffDirectorySource, /rpc\("get_school_teacher_directory", \{ p_school_id: schoolId \}\)/);
    assert.match(staffDirectorySource, /Array\.isArray\(data\)/);
    assert.match(staffPage, /set_school_teacher_access/);
    assert.doesNotMatch(staffPage, /Add review profile|Session-only/);
    assert.match(staffPage, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
});
test("school badge preview is decoded locally instead of fetching a CSP-blocked data URL", () => {
    assert.match(profileSettings, /window\.atob\(encoded\[2\]\)/);
    assert.doesNotMatch(profileSettings, /fetch\(dataUrl\)/);
    assert.match(profileSettings, /badge upload failed: \$\{detail\}/i);
});
test("people-directory migration matches the deployment mirror", () => {
    assert.equal(migrationMirror, migration);
});
