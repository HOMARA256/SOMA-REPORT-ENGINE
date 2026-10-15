import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile("supabase/migrations/20261014220000_teacher_invitation_activated_context.sql", "utf8");
const mirror = await readFile("database/migrations/111_teacher_invitation_activated_context.sql", "utf8");
const prior = await readFile("supabase/migrations/20261014210000_distinguish_teacher_onboarding_from_platform_lock.sql", "utf8");

test("teacher invitation context reports activation from this school's membership", () => {
  assert.equal(migration, mirror);
  assert.match(migration, /'activated',coalesce\(v_membership\.status='ACTIVE',false\)/);
  assert.match(migration, /where school_id=v_school\.id and user_id=v_user\.id/);
  assert.match(migration, /lower\(v_identity\.email\) is distinct from v_invitation\.invited_email/);
  assert.match(migration, /grant execute on function public\.get_my_school_teacher_invitation\(uuid\) to authenticated/);
  assert.doesNotMatch(migration, /update public\.school_memberships|insert into public\.school_memberships/);
});

test("migration restores the missing response field without otherwise changing the prior function", () => {
  const previousFunction = prior.slice(0, prior.indexOf("create or replace function public.list_school_teacher_invitations"));
  const restoredFunction = migration.slice(migration.indexOf("create or replace function"), migration.indexOf("revoke all on function"));
  const expected = previousFunction.slice(previousFunction.indexOf("create or replace function"))
    .replace("'accountActive',coalesce(v_user.is_active,not v_collision),'membershipStatus'", "'accountActive',coalesce(v_user.is_active,not v_collision),'activated',coalesce(v_membership.status='ACTIVE',false),\n    'membershipStatus'")
    .trim();
  assert.equal(restoredFunction.trim(), expected);
});
