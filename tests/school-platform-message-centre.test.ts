import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../database/migrations/081_school_platform_message_centre.sql", import.meta.url), "utf8");
const mirror = await readFile(new URL("../supabase/migrations/20261009130000_school_platform_message_centre.sql", import.meta.url), "utf8");
const repairMigration = await readFile(new URL("../database/migrations/082_fix_school_platform_message_notifications.sql", import.meta.url), "utf8");
const repairMirror = await readFile(new URL("../supabase/migrations/20261009140000_fix_school_platform_message_notifications.sql", import.meta.url), "utf8");
const app = await readFile(new URL("../apps/web/src/features/notifications/NotificationCenterPages.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../apps/web/src/index.css", import.meta.url), "utf8");
const routes = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
const supportLink = await readFile(new URL("../apps/web/src/features/notifications/MessageCentreLink.tsx", import.meta.url), "utf8");
const unreadMigration = await readFile(new URL("../database/migrations/083_unread_message_notification_bell.sql", import.meta.url), "utf8");
const unreadMirror = await readFile(new URL("../supabase/migrations/20261009150000_unread_message_notification_bell.sql", import.meta.url), "utf8");
const unreadHook = await readFile(new URL("../apps/web/src/features/notifications/useUnreadMessageCount.tsx", import.meta.url), "utf8");
const topbar = await readFile(new URL("../apps/web/src/components/layout/Topbar.tsx", import.meta.url), "utf8");

test("school-platform conversations stay tenant scoped and role guarded in database RPCs", () => {
  assert.match(migration, /public\.is_school_message_member\(p_school_id\)/);
  assert.match(migration, /r\.code in \('SCHOOL_ADMIN','HEAD_TEACHER','DEPUTY_HEAD_TEACHER','DIRECTOR_OF_STUDIES','BURSAR_READ_ONLY'\)/);
  assert.match(migration, /public\.is_active_platform_admin\(\) or exists/);
  assert.match(migration, /create policy school_platform_conversations_read[\s\S]*?public\.can_access_school_platform_conversation\(id\)/);
  assert.match(migration, /public\.create_school_platform_conversation/);
  assert.match(migration, /public\.post_school_platform_message/);
});

test("the existing notification table remains the only notification and unread source", () => {
  assert.match(migration, /alter table public\.system_notifications add column if not exists conversation_id/);
  assert.match(migration, /public\.get_notification_centre/);
  assert.match(migration, /public\.mark_notification_centre_read/);
  assert.doesNotMatch(migration, /create table if not exists public\.(message_notifications|conversation_notifications)/);
  assert.match(app, /get_notification_centre/);
  assert.match(app, /mark_notification_centre_read/);
});

test("conversation notifications insert one idempotency key value for the declared target column", () => {
  assert.match(repairMigration, /action_url, idempotency_key[\s\S]*?concat\('message:', p_event_type, ':', p_conversation_id/);
  assert.equal(repairMirror, repairMigration);
});

test("the unread bell count is recipient-scoped and refreshes when messages are read", () => {
  assert.match(unreadMigration, /recipient_user_id = auth\.uid\(\)/);
  assert.match(unreadMigration, /event_type in \('CONVERSATION_OPENED', 'CONVERSATION_REPLY'\)/);
  assert.match(unreadMigration, /public\.can_access_school_platform_conversation\(p_conversation_id\)/);
  assert.match(unreadHook, /get_unread_message_count/);
  assert.match(topbar, /NotificationCountBadge/);
  assert.equal(unreadMirror, unreadMigration);
});

test("message attachments use private storage and protect internal platform notes", () => {
  assert.match(migration, /values\('message-attachments','message-attachments',false,10485760/);
  assert.match(migration, /public\.can_read_message_attachment_path\(name\)/);
  assert.match(migration, /not m\.is_internal_platform_note or public\.is_active_platform_admin\(\)/);
  assert.match(app, /record_school_platform_attachment/);
  assert.match(app, /createSignedUrl/);
});

test("school and platform routes are connected and feature pages link into contextual support", () => {
  assert.match(routes, /path="\/messages" element=\{<MessageCentrePage \/>\}/);
  assert.match(routes, /path="messages" element=\{<MessageCentrePage platform\/>\}/);
  assert.match(supportLink, /new URLSearchParams\(\{\s*category,\s*returnTo\s*\}\)/);
  assert.match(supportLink, /category=/);
  assert.equal(mirror, migration);
});

test("message centre renders existing sender, unread, activity, date grouping and mobile-chat data accessibly", () => {
  assert.match(app, /senderAuthUserId:string/);
  assert.match(app, /message-row-outgoing/);
  assert.match(app, /message-row-incoming/);
  assert.match(app, /message-date-separator/);
  assert.match(app, /message-unread-badge/);
  assert.match(app, /activity\(item\.updatedAt\)/);
  assert.match(app, /message-mobile-back/);
  assert.match(app, /message-attachments/);
  assert.match(styles, /\.message-bubble-outgoing/);
  assert.match(styles, /\.message-compose \{[^}]*grid-template-columns/);
  assert.match(styles, /has-selected-conversation \.message-conversation-list \{ display:none/);
  assert.doesNotMatch(app, /Delivered|Read receipts|typing indicator/i);
});

test("chat and conversation list can be resized with pointer and keyboard and the composer attachment control stays compact", () => {
  assert.match(app, /message-resize-handle/);
  assert.match(app, /aria-orientation="vertical"/);
  assert.match(app, /event\.key==="ArrowLeft"\|\|event\.key==="ArrowRight"/);
  assert.match(app, /soma-message-list-width/);
  assert.match(styles, /grid-template-columns:minmax\(17rem,var\(--message-list-width,32%\)\) 10px minmax\(0,1fr\)/);
  assert.match(styles, /resize:vertical/);
  assert.match(styles, /grid-template-columns:2\.75rem minmax\(0,1fr\) auto/);
  assert.match(styles, /\.message-resize-handle \{ display:none/);
});
