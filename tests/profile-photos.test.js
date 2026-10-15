import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = await readFile(new URL("../supabase/migrations/20261009120000_person_profile_photos.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../database/migrations/080_person_profile_photos.sql", import.meta.url), "utf8");
const editor = await readFile(new URL("../apps/web/src/features/profile/ProfilePhotoEditor.tsx", import.meta.url), "utf8");
const photoStorage = await readFile(new URL("../apps/web/src/features/profile/profilePhotoStorage.ts", import.meta.url), "utf8");
const userProfile = await readFile(new URL("../apps/web/src/features/profile/UserProfilePage.tsx", import.meta.url), "utf8");
const learnerProfile = await readFile(new URL("../apps/web/src/features/learners/PersistentLearnerProfilePage.tsx", import.meta.url), "utf8");
const teacherProfile = await readFile(new URL("../apps/web/src/features/staff/TeacherProfilePage.tsx", import.meta.url), "utf8");
const learnersPage = await readFile(new URL("../apps/web/src/features/learners/LearnersPage.tsx", import.meta.url), "utf8");
const staffPage = await readFile(new URL("../apps/web/src/features/staff/staffUsersPage.tsx", import.meta.url), "utf8");
test("profile photos are optional and use an initials fallback", () => {
    assert.match(editor, /initials/);
    assert.match(editor, /Without a photo, initials are shown/);
    assert.match(editor, /2 MB/);
});
test("staff and administrator photos are owned by their authenticated identity", () => {
    assert.match(photoStorage, /users\/\$\{data\.user\.id\}/);
    assert.match(migration, /auth\.uid\(\) = \(\(storage\.foldername\(name\)\)\[2\]\)::uuid/);
    assert.match(userProfile, /saveMyProfilePhoto/);
    assert.match(teacherProfile, /canEditOwnPhoto/);
});
test("learner photos are restricted to the selected school and school administrators", () => {
    assert.match(photoStorage, /schools\/\$\{schoolId\}\/learners\/\$\{learnerId\}/);
    assert.match(migration, /if not public\.is_school_admin_for\(p_school_id\) then raise exception 'SCHOOL_ADMIN_REQUIRED'/);
    assert.match(migration, /where id = p_learner_id and school_id = p_school_id/);
    assert.match(migration, /offering\.id = allocation\.class_subject_offering_id/);
    assert.doesNotMatch(migration, /allocation\.class_id/);
    assert.match(migration, /teacher_membership\.status = 'ACTIVE'/);
    assert.match(learnerProfile, /currentUser\.role === "SCHOOL_ADMIN" && currentUser\.permissions\.includes\("users\.manage"\)/);
    assert.match(learnerProfile, /saveLearnerProfilePhoto/);
});
test("profile photo bucket is private, size-limited, and API migration mirrors match", () => {
    assert.match(migration, /values \('profile-photos', 'profile-photos', false, 2097152/);
    assert.match(migration, /create policy "profile photos read authorized person"/);
    assert.match(migration, /create policy "profile owners and school admins upload photos"/);
    assert.equal(mirror, migration);
});
test("persistent staff and learner registers use the shared avatar fallback", () => {
    assert.match(learnersPage, /ProfilePhotoAvatar/);
    assert.match(learnersPage, /path=\{learner\.profilePhotoPath\}/);
    assert.match(staffPage, /ProfilePhotoAvatar/);
    assert.match(staffPage, /path=\{item\.profilePhotoPath\}/);
});
