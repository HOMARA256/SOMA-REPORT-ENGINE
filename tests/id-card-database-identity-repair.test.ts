import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
const [migration, mirror, sync, push] = await Promise.all([
  read("../database/migrations/092_fix_identity_card_random_bytes_and_audit_profile_fk.sql"),
  read("../supabase/migrations/20261011160000_fix_identity_card_random_bytes_and_audit_profile_fk.sql"),
  read("../scripts/sync-academic-migrations.mjs"),
  read("../scripts/push-admissions-completion.ps1"),
]);

test("ID-card and admission repairs are mirrored and included in the guarded push", () => {
  assert.equal(migration, mirror);
  assert.match(sync, /092_fix_identity_card_random_bytes_and_audit_profile_fk\.sql.*20261011160000_fix_identity_card_random_bytes_and_audit_profile_fk\.sql/);
  assert.match(push, /20261011160000_fix_identity_card_random_bytes_and_audit_profile_fk\.sql/);
  assert.match(push, /for \(\$attempt = 1; \$attempt -le 3; \$attempt\+\+\)/);
  assert.match(push, /Rerun this script when the database connection is stable/);
  assert.match(migration, /issue_school_identity_cards\(uuid,text,uuid\[\],date\)[\s\S]*search_path = public, auth, extensions, pg_temp/);
  assert.match(migration, /audit_logs_normalize_profile_identity/);
  assert.match(migration, /profile\.id::text = v_auth_user_id::text/);
});
