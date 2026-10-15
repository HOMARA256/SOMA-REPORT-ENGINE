import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const migration = await readFile(new URL("../database/migrations/078_mobile_money_payment_initiation.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/mobile-money-payments/index.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../apps/web/src/features/platform/MobileMoneyPaymentsPanel.tsx", import.meta.url), "utf8");
const platform = await readFile(new URL("../apps/web/src/features/platform/PlatformPages.tsx", import.meta.url), "utf8");
const schoolPage = await readFile(new URL("../apps/web/src/features/platform/ProductionBillingPages.tsx", import.meta.url), "utf8");
const mirror = await readFile(new URL("../supabase/migrations/20261009100000_mobile_money_payment_initiation.sql", import.meta.url), "utf8");
test("mobile money migration mirror is identical and limited to supported Uganda providers", () => {
    assert.equal(mirror, migration);
    assert.match(migration, /MTN_MOMO_UG/);
    assert.match(migration, /AIRTEL_MONEY_UG/);
    assert.match(migration, /v_invoice\.currency<>'UGX'/);
});
test("payment initiation is server-only, tenant-authorized, idempotent, and excludes sandbox attempts", () => {
    assert.match(migration, /create_mobile_money_payment_attempt/);
    assert.match(migration, /SCHOOL_ADMIN_REQUIRED_FOR_OWN_SCHOOL/);
    assert.match(migration, /platform_admins pa where pa\.auth_user_id=p_actor_auth_user_id and pa\.is_active/);
    assert.match(migration, /vault\.create_secret\(v_phone/);
    assert.match(migration, /platform_payment_one_active_attempt_per_invoice_uq[\s\S]*?where environment='LIVE'/);
    assert.match(migration, /revoke all on function public\.process_sandbox_mtn_callback[\s\S]*?from public,anon,authenticated/);
});
test("payment settlement trusts only provider status and locks/settles invoice once", () => {
    assert.match(edge, /mtnStatus\(config, token, payment\.providerRequestId\)/);
    assert.match(edge, /finalize_mobile_money_payment/);
    assert.match(migration, /p_amount_minor is distinct from v_attempt\.amount_minor/);
    assert.match(migration, /p_currency is distinct from 'UGX'/);
    assert.match(migration, /on conflict\(payment_attempt_id\) do nothing/);
    assert.match(migration, /on conflict\(idempotency_key\) do nothing/);
});
test("Airtel remains fail-closed until its approved API adapter and onboarding exist", () => {
    assert.match(edge, /PAYMENT_PROVIDER_ADAPTER_UNAVAILABLE/);
    assert.match(edge, /Airtel merchant onboarding is not connected/);
    assert.match(migration, /callback_status<>'VERIFIED'/);
    assert.match(migration, /settlement_status<>'VERIFIED'/);
});
test("School and Platform payment screens share the confirmed, tenant-scoped initiation panel", () => {
    assert.match(panel, /Confirm Payment Request/);
    assert.match(panel, /crypto\.randomUUID\(\)/);
    assert.match(panel, /Uganda mobile number/);
    assert.match(platform, /MobileMoneyPaymentsPanel schoolId=\{school\.id\}[^>]*mode="platform"/);
    assert.match(schoolPage, /MobileMoneyPaymentsPanel schoolId=\{context\.schoolId\}[^>]*mode="school"/);
});
