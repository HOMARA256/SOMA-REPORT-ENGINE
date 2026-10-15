import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const messageCentre = await readFile("apps/web/src/features/notifications/NotificationCenterPages.tsx", "utf8");
const reviewFunction = await readFile("supabase/functions/review-teacher-account-lock/index.ts", "utf8");
const deployScript = await readFile("scripts/deploy-teacher-account-access-review.ps1", "utf8");

test("school teacher account review opens with an editable drafted reason", () => {
  assert.match(messageCentre, /teacherAccountReviewDraft=/);
  assert.match(messageCentre, /setBody\(current=>current\.trim\(\)\?current:teacherAccountReviewDraft\)/);
  assert.match(messageCentre, /Draft reason for Platform Support \(edit before sending\)/);
  assert.match(messageCentre, /create_school_teacher_account_access_review/);
});

test("Platform Admin lock review verifies authority, audits, and clears both auth and profile restriction", () => {
  assert.match(reviewFunction, /platform_admins.*is_active/);
  assert.match(reviewFunction, /platform_audit_logs/);
  assert.match(reviewFunction, /staffSupport/);
  assert.match(reviewFunction, /invited_email\.trim\(\)\.toLowerCase\(\) === invitedEmail/);
  assert.match(reviewFunction, /category: "TEACHER_ACCOUNT_ACCESS"/);
  assert.match(reviewFunction, /auth\.admin\.updateUserById\(profile\.auth_user_id, \{ ban_duration: "none" \}\)/);
  assert.match(reviewFunction, /account_status: "ACTIVE"/);
  assert.match(reviewFunction, /membershipChanged: false, invitationAccepted: false/);
});

test("Platform Admin lock review has a scoped, confirmation-gated deployment script", () => {
  assert.match(deployScript, /\$functionName = 'review-teacher-account-lock'/);
  assert.match(deployScript, /Type DEPLOY to deploy only/);
  assert.match(deployScript, /No database migration is required/);
  assert.doesNotMatch(messageCentre, /ALREADY_ACTIVE[^;]*setError/);
  assert.match(messageCentre, /Retry the button to finish notifying the school/);
  assert.match(messageCentre, /school has been notified; the teacher can refresh the invitation/);
  assert.match(messageCentre, /Find teacher & review lock/);
  assert.match(messageCentre, /Enter the exact email address used for the school invitation/);
  assert.match(messageCentre, /teacherAccountReviewError/);
  assert.match(messageCentre, /TEACHER_ACCOUNT_NOT_LINKED/);
  assert.match(messageCentre, /MULTIPLE_TEACHER_INVITATIONS_MATCH/);
  assert.match(messageCentre, /PLATFORM_LOCK_NOT_PRESENT/);
  assert.match(messageCentre, /ONBOARDING_PENDING/);
  assert.match(reviewFunction, /teacherAccountReviewDecision/);
});
