import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const registration = await readFile(new URL("../supabase/functions/register-school/index.ts", import.meta.url), "utf8");
const resend = await readFile(new URL("../supabase/functions/resend-school-invitation/index.ts", import.meta.url), "utf8");
const activate = await readFile(new URL("../supabase/functions/activate-school-invitation/index.ts", import.meta.url), "utf8");
const publicAppUrl = await readFile(new URL("../supabase/functions/_shared/publicAppUrl.ts", import.meta.url), "utf8");
const provisioning = await readFile(new URL("../supabase/migrations/20260925170000_reuse_school_admin_identity.sql", import.meta.url), "utf8");
const connectedProvisioning = await readFile(new URL("../supabase/migrations/20260925102851_connected_school_registration_workflow.sql", import.meta.url), "utf8");
const academicYearSync = await readFile(new URL("../supabase/migrations/20261008130000_sync_registered_school_academic_year.sql", import.meta.url), "utf8");
test("school registration requires a valid app redirect before tenant or Auth side effects", () => {
    const appUrlGuard = registration.indexOf("if (!activationBase)");
    const authCreation = registration.indexOf("service.auth.admin.createUser");
    const provision = registration.indexOf('rpc("provision_connected_school"');
    assert.ok(appUrlGuard >= 0 && appUrlGuard < authCreation && appUrlGuard < provision);
    assert.doesNotMatch(registration, /new URL\(request\.url\)\.origin/);
    assert.match(registration, /getPublicAppOrigin/);
});
test("invitation resend validates the app redirect before rotating the token", () => {
    assert.ok(resend.indexOf("if(!appUrl)") < resend.indexOf("const rawToken=randomText()"));
    assert.doesNotMatch(resend, /new URL\(request\.url\)\.origin/);
});
test("activation binds the invitation to the invited Auth identity and school", () => {
    assert.match(activate, /invitation\.invited_user_id!==identity\.user\.id/);
    assert.match(activate, /activate_school_admin_invitation/);
});
test("school provisioning scopes memberships, academic records, and compulsory offerings to the new school", () => {
    assert.match(provisioning, /values\(v_school_id,v_user_id,v_role_id,'INACTIVE'\)/);
    assert.match(provisioning, /from public\.system_subjects s where s\.programme='O_LEVEL'/);
    assert.match(provisioning, /select v_school_id,v_year_id,s\.id/);
    assert.match(connectedProvisioning, /where id=v_school/);
    assert.match(connectedProvisioning, /insert into public\.school_academic_profiles\(school_id/);
    assert.match(connectedProvisioning, /values\(v_school,/);
});
test("new tenant academic profile, academic year, and billing period use the selected academic year", () => {
    assert.match(academicYearSync, /v_year:=coalesce\(nullif\(p_registration->>'academicYear'/);
    assert.match(academicYearSync, /update public\.academic_years[\s\S]*?set name=v_year::text,starts_on=make_date\(v_year,1,1\),ends_on=make_date\(v_year,12,31\)[\s\S]*?where school_id=v_school/);
    assert.match(academicYearSync, /values\(v_school,p_school_level,v_year,v_term/);
    assert.match(academicYearSync, /values\(v_school,v_subscription,v_plan,v_year,v_term/);
    assert.match(academicYearSync, /if not found then raise exception 'SCHOOL_ACADEMIC_YEAR_NOT_FOUND'/);
});
test("new tenant provisioning links any legacy admin profile before invitation activation", () => {
    const linkIdentity = academicYearSync.indexOf("set auth_user_id=p_admin_auth_user_id");
    const verifyIdentity = academicYearSync.indexOf("SCHOOL_ADMIN_IDENTITY_PROFILE_MISMATCH");
    const academicProfile = academicYearSync.indexOf("insert into public.school_academic_profiles");
    assert.ok(linkIdentity >= 0 && linkIdentity < academicProfile);
    assert.ok(verifyIdentity > linkIdentity && verifyIdentity < academicProfile);
    assert.match(academicYearSync, /where lower\(email\)=lower\(trim\(p_admin_email\)\) and auth_user_id is null/);
});
test("redirect origin rejects missing or unsafe values while allowing localhost development", () => {
    assert.match(publicAppUrl, /Deno\.env\.get\("PUBLIC_APP_URL"\)/);
    assert.match(publicAppUrl, /url\.protocol !== "https:" && !localHttp/);
    assert.match(publicAppUrl, /\["localhost", "127\.0\.0\.1"\]/);
});
