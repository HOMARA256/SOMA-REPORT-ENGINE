import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const migration = await readFile("supabase/migrations/20261014100000_teacher_invitation_admin_activation.sql", "utf8");
const reactivationMigration = await readFile("supabase/migrations/20261014110000_school_admin_teacher_reactivation.sql", "utf8");
const statesMigration = await readFile("supabase/migrations/20261014120000_teacher_invitation_states_and_decline.sql", "utf8");
const membershipMigration = await readFile("supabase/migrations/20261014130000_persistent_teacher_membership_lifecycle.sql", "utf8");
const membershipFoundation = await readFile("supabase/migrations/202609240002_identity_and_academic_foundation.sql", "utf8");
const acceptPage = await readFile("apps/web/src/features/auth/TeacherInvitationAcceptPage.tsx", "utf8");
const staffPage = await readFile("apps/web/src/features/staff/staffUsersPage.tsx", "utf8");
const dashboardSource = await readFile("apps/web/src/features/dashboard/Dashboard.tsx", "utf8");
const activationFunction = await readFile("supabase/functions/activate-school-teacher-invitation/index.ts", "utf8");
const invitationFunction = await readFile("supabase/functions/invite-school-teacher/index.ts", "utf8");
test("teacher consent records acceptance without activating a school membership", () => {
    const acceptFunction = migration.slice(migration.indexOf("create or replace function public.accept_school_teacher_invitation"), migration.indexOf("create or replace function public.activate_school_teacher_invitation"));
    assert.match(acceptFunction, /set status='ACCEPTED',accepted_user_id=v_user\.id,accepted_at=now\(\)/);
    assert.doesNotMatch(acceptFunction, /insert into public\.school_memberships|insert into public\.teacher_allocations/);
    assert.match(acceptPage, /Accept school invitation/);
    assert.match(acceptPage, /School Administrator activates only this school membership/);
});
test("only an authenticated school admin can activate accepted teacher access", () => {
    const activateFunction = migration.slice(migration.indexOf("create or replace function public.activate_school_teacher_invitation"), migration.indexOf("create or replace function public.get_my_school_teacher_invitation"));
    assert.match(activateFunction, /not public\.is_school_admin_for\(v_invitation\.school_id\)/);
    assert.match(activateFunction, /v_invitation\.status<>'ACCEPTED'/);
    assert.match(activateFunction, /insert into public\.school_memberships/);
    assert.match(activateFunction, /insert into public\.teacher_allocations/);
    assert.match(activateFunction, /SCHOOL_TEACHER_INVITATION_ACTIVATED/);
    assert.match(staffPage, /item\.status === "ACCEPTED" && !item\.activated/);
    assert.match(staffPage, /activate-school-teacher-invitation/);
});
test("new accounts receive a secure password setup email after activation, while existing accounts keep their password", () => {
    assert.match(activationFunction, /if \(!activation\.passwordSetupRequired\)/);
    assert.match(activationFunction, /generateLink\([\s\S]*type: "recovery"/);
    assert.match(activationFunction, /Set your password/);
    assert.match(activationFunction, /reset-password\/school/);
    assert.match(acceptPage, /Continue to sign in/);
    assert.match(invitationFunction, /Accept teacher invitation/);
});
test("re-inviting an existing teacher uses the saved school invitation instead of inserting a duplicate", () => {
    assert.match(staffPage, /An invitation for \$\{normalizedInviteEmail\} already exists/);
    assert.match(staffPage, /Use Resend in Teacher invitations/);
    assert.match(staffPage, /previousInvitation\?\.status === "ACCEPTED"/);
    assert.match(invitationFunction, /school_teacher_invitation_one_open_per_email/);
    assert.match(invitationFunction, /TEACHER_INVITATION_ALREADY_OPEN/);
});
test("teacher acceptance shows actionable database failures instead of a misleading generic error", () => {
    assert.match(acceptPage, /TEACHER_ACCOUNT_COLLISION/);
    assert.match(acceptPage, /TEACHER_ALREADY_MEMBER/);
    assert.match(acceptPage, /PGRST202/);
    assert.match(acceptPage, /database code \$\{code\}/);
});
test("teacher invitation creation identifies missing database schema and role setup", () => {
    assert.match(invitationFunction, /INVITATION_DATABASE_NOT_READY/);
    assert.match(invitationFunction, /TEACHER_ROLE_NOT_CONFIGURED/);
    assert.match(staffPage, /teacher-invitation database functions or schema are not available yet/);
    assert.match(staffPage, /database code \$\{data\.diagnosticCode\}/);
});
test("School Admin activation never unlocks a global account and invitation screen reflects authoritative status", () => {
    assert.doesNotMatch(reactivationMigration, /update public\.users set is_active=true,account_status='ACTIVE'/);
    assert.match(reactivationMigration, /TEACHER_ACCOUNT_GLOBAL_RESTRICTED/);
    assert.doesNotMatch(statesMigration, /update public\.users set is_active=true/);
    assert.match(statesMigration, /'accountStatus',coalesce\(v_user\.account_status/);
    assert.match(statesMigration, /'membershipStatus',coalesce\(v_membership\.status/);
    assert.match(statesMigration, /'acceptanceAllowed',v_blocked_reason is null/);
    assert.match(acceptPage, /context\.acceptanceAllowed === false/);
    assert.match(acceptPage, /GLOBAL_ACCOUNT_RESTRICTED/);
    assert.match(acceptPage, /School membership suspended/);
    assert.match(activationFunction, /TEACHER_ACCOUNT_GLOBAL_RESTRICTED/);
    assert.match(staffPage, /TEACHER_ACCOUNT_GLOBAL_RESTRICTED/);
});
test("School Admin can decline a teacher's acceptance with a recorded reason and school-scoped authority", () => {
    assert.match(statesMigration, /create or replace function public\.decline_school_teacher_invitation/);
    assert.match(statesMigration, /not public\.is_school_admin_for\(v_invitation\.school_id\)/);
    assert.match(statesMigration, /decline_reason=trim\(p_reason\)/);
    assert.match(statesMigration, /SCHOOL_TEACHER_INVITATION_DECLINED/);
    assert.match(staffPage, /decline_school_teacher_invitation/);
    assert.match(staffPage, /Reason for decline/);
    assert.match(staffPage, /GLOBAL ACCOUNT RESTRICTED/);
});
test("teacher membership persists independently of terms and allocations", () => {
    assert.match(membershipFoundation, /add constraint school_memberships_school_user_key unique \(school_id, user_id\)/i);
    assert.match(membershipMigration, /SUSPENDED means temporary access stop; INACTIVE means\s+-- removed from this school/i);
    assert.match(membershipMigration, /where school_id = p_school_id and teacher_id = p_teacher_id and status = 'ACTIVE'/i);
    assert.doesNotMatch(membershipMigration, /update public\.school_memberships[\s\S]{0,300}term_id|update public\.school_memberships[\s\S]{0,300}academic_year_id/i);
    assert.match(membershipMigration, /not public\.is_school_admin_for\(p_school_id\)/);
    assert.match(membershipMigration, /SCHOOL_TEACHER_MEMBERSHIP_REMOVED/);
    assert.match(membershipMigration, /SCHOOL_TEACHER_MEMBERSHIP_RESTORED/);
    assert.match(membershipMigration, /guard_invitation_existing_teacher_membership/);
    assert.match(membershipMigration, /current_setting\('app\.teacher_membership_action', true\)/);
    assert.match(dashboardSource, /No teaching allocations for this term yet/);
    assert.match(dashboardSource, /Your school membership remains active/);
    assert.match(staffPage, /Remove from school/);
    assert.match(staffPage, /Restore membership/);
    assert.match(staffPage, /manage_school_teacher_membership/);
});
