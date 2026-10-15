import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../database/migrations/117_school_teacher_message_centre.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../supabase/migrations/20261015130000_school_teacher_message_centre.sql", import.meta.url), "utf8");
const view = await readFile(new URL("../apps/web/src/features/notifications/SchoolTeacherMessages.tsx", import.meta.url), "utf8");
const worker = await readFile(new URL("../apps/api/src/worker.mjs", import.meta.url), "utf8");

test("school staff messages extend existing tables while separating platform support", () => {
  assert.equal(migration, mirror);
  assert.match(migration, /conversation_type='SCHOOL_TEACHER'/);
  assert.match(migration, /conversation_type='PLATFORM_SUPPORT'/);
  assert.match(migration, /public\.can_access_school_teacher_conversation\(p_conversation_id\)/);
  assert.match(migration, /public\.is_active_school_message_role\(c\.school_id,auth\.uid\(\),'TEACHER'\)/);
  assert.match(migration, /public\.is_active_school_message_role\(c\.school_id,auth\.uid\(\),'SCHOOL_ADMIN'\)/);
  assert.match(migration, /pg_get_constraintdef\(c\.oid\) like '%participant_role%'/);
  assert.match(migration, /message_centre_participant_role_check/);
  assert.doesNotMatch(migration, /create table public\.school_teacher_conversations/);
});

test("idempotent messages save before separately retried notifications", () => {
  assert.match(migration, /school_teacher_message_idempotency/);
  assert.match(migration, /school_teacher_conversation_request_key/);
  assert.match(migration, /school_teacher_message_notification_outbox/);
  assert.match(migration, /deliver_school_teacher_message_notices/);
  assert.match(worker, /deliver_school_teacher_message_notices/);
  assert.match(view, /replyKey\.current \?\?= crypto\.randomUUID\(\)/);
  assert.match(view, /Your draft is retained; retry safely/);
});

test("conversation actions pass the active school and notification links target the exact thread", () => {
  assert.match(view, /p_school_id: schoolAtRequest, p_conversation_id: id/);
  assert.match(view, /p_school_id: school\.schoolId, p_conversation_id: thread\.conversation\.id/);
  assert.match(migration, /\/messages\?view=school&school=/);
  assert.match(migration, /recipient_user_id=auth\.uid\(\) and public\.can_access_school_teacher_conversation\(conversation_id\)/);
});
