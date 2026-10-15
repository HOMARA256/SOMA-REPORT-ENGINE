import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { teacherAccountReviewDecision } from "../supabase/functions/review-teacher-account-lock/accountReviewDecision.ts";

const migration = await readFile("supabase/migrations/20261014210000_distinguish_teacher_onboarding_from_platform_lock.sql", "utf8");
const reviewFunction = await readFile("supabase/functions/review-teacher-account-lock/index.ts", "utf8");

test("only explicit global lock/suspension or an Auth ban is presented as a platform restriction", () => {
  assert.match(migration, /v_global_lock := coalesce\(v_user\.account_status in \('LOCKED','SUSPENDED'\),false\)\s+or coalesce\(v_identity\.banned_until>now\(\),false\)/);
  assert.match(migration, /'globalSecurityRestricted',v_global_lock/);
  assert.match(migration, /'globalSecurityRestricted',coalesce\(u\.account_status in \('LOCKED','SUSPENDED'\) or u\.banned_until>now\(\),false\)/);
  assert.doesNotMatch(migration, /pg_get_functiondef|v_repaired := replace/);
  assert.match(reviewFunction, /teacherAccountReviewDecision\(profile\.account_status, profile\.is_active, authStillBanned\)/);
});

test("Platform Admin can restore an inactive ACTIVE profile while INVITED onboarding is left to the teacher", () => {
  assert.equal(teacherAccountReviewDecision("ACTIVE", false, false), "REACTIVATE");
  assert.equal(teacherAccountReviewDecision("LOCKED", false, false), "REACTIVATE");
  assert.equal(teacherAccountReviewDecision("SUSPENDED", false, false), "REACTIVATE");
  assert.equal(teacherAccountReviewDecision("ACTIVE", true, true), "REACTIVATE");
  assert.equal(teacherAccountReviewDecision("INVITED", false, false), "ONBOARDING_PENDING");
  assert.equal(teacherAccountReviewDecision("DISABLED", false, false), "ONBOARDING_PENDING");
  assert.equal(teacherAccountReviewDecision("ACTIVE", true, false), "ALREADY_ACTIVE");
  assert.equal(teacherAccountReviewDecision("UNKNOWN", false, false), "MANUAL_REVIEW");
});

test("verified invited teacher can confirm onboarding without activating school membership", () => {
  assert.match(migration, /elsif v_user\.account_status='INVITED' then/);
  assert.match(migration, /TEACHER_ACCOUNT_ONBOARDING_CONFIRMED/);
  assert.match(migration, /verified_email',v_auth\.email,'invitation_id',v_invitation\.id/);
  assert.match(migration, /update public\.users set is_active=true,account_status='ACTIVE'/);
  assert.doesNotMatch(migration, /insert into public\.school_memberships|update public\.school_memberships/);
});
