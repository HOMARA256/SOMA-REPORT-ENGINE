import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261014200000_teacher_invitation_platform_review_status.sql", "utf8");
const page = await readFile("apps/web/src/features/auth/TeacherInvitationAcceptPage.tsx", "utf8");

test("teacher review status RPC is bound to the signed-in invited identity and exact invitation", () => {
  assert.match(migration, /lower\(v_identity\.email\) is distinct from v_invitation\.invited_email/);
  assert.match(migration, /related_entity_type='school_teacher_invitation'/);
  assert.match(migration, /related_entity_id=v_invitation\.id/);
  assert.match(migration, /school_id=v_invitation\.school_id/);
  assert.match(migration, /revoke all .* from public,anon/);
  assert.match(migration, /grant execute .* to authenticated/);
  assert.doesNotMatch(migration, /message_body|conversation_messages/);
});

test("invitation page distinguishes unsubmitted, pending, and completed review states with manual refresh", () => {
  assert.match(page, /get_my_teacher_account_review_status/);
  assert.match(page, /No review request yet/);
  assert.match(page, /Your School Administrator sent a linked request/);
  assert.match(page, /The restriction is still detected/);
  assert.match(page, /Refresh status/);
});
