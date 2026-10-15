import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
test("school dashboard shortcuts target registered routes", async () => {
    const dashboard = await readFile(new URL("apps/web/src/features/dashboard/Dashboard.tsx", root), "utf8");
    const routes = await readFile(new URL("apps/web/src/App.tsx", root), "utf8");
    for (const path of ["/learners/new", "/marks/entry", "/setup/classes", "/setup/academic-years", "/reports/cards", "/marks/moderation"]) {
        assert.ok(dashboard.includes(`to: "${path}"`), `dashboard shortcut should use ${path}`);
        assert.ok(routes.includes(`path="${path}"`), `route table should include ${path}`);
    }
});
test("platform dashboard directory returns school-scoped live counts and billing records", async () => {
    const migration = await readFile(new URL("supabase/migrations/20261013120000_platform_directory_live_tenant_data.sql", root), "utf8");
    for (const table of ["school_memberships", "learners", "academic_classes", "report_snapshots", "system_jobs", "school_platform_conversations", "subscription_payments", "subscription_periods"]) {
        assert.ok(migration.includes(`public.${table}`), `platform directory should aggregate ${table}`);
    }
    assert.match(migration, /get_platform_recent_activity/);
    assert.match(migration, /public\.platform_audit_logs/);
    assert.match(migration, /if not public\.is_platform_administrator\(\) then/i);
    assert.doesNotMatch(migration, /'users',\s*0|'learners',\s*0|'payments',\s*'\[\]'::jsonb/i);
});
test("platform dashboard does not silently turn a failed directory request into zeros", async () => {
    const workspace = await readFile(new URL("apps/web/src/features/platform/PlatformWorkspace.tsx", root), "utf8");
    const pages = await readFile(new URL("apps/web/src/features/platform/PlatformPages.tsx", root), "utf8");
    assert.match(workspace, /schoolsError/);
    assert.match(workspace, /reloadSchools/);
    assert.match(pages, /registered-school dashboard data could not be loaded/i);
    assert.match(pages, /onClick=\{\(\) => void reloadSchools\(\)\}/);
});
