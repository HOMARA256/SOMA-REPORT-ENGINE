import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("School Administrator reset email targets the supported school recovery route", async () => {
  const [action, resetPage, localConfig] = await Promise.all([
    read("supabase/functions/manage-school-admin-access/index.ts"),
    read("apps/web/src/features/auth/ResetPasswordPage.tsx"),
    read("supabase/config.toml"),
  ]);

  assert.match(action, /if \(!appUrl\) return json\(\{ error: "SERVER_CONFIGURATION_ERROR" \}, 500\)/);
  assert.match(action, /redirectTo: `\$\{appUrl\}\/reset-password\/school`/);
  assert.doesNotMatch(action, /redirectTo: `\$\{appUrl\}\/reset-password`/);
  assert.match(resetPage, /portal === "school" \|\| portal === "platform"/);
  assert.match(localConfig, /site_url = "http:\/\/localhost:5173"/);
  assert.match(localConfig, /"http:\/\/localhost:5173\/\*\*"/);
});
