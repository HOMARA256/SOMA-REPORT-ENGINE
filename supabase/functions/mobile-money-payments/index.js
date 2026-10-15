import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function mtnConfig() {
    const apiUser = Deno.env.get("MTN_COLLECTION_API_USER") ?? "";
    const apiKey = Deno.env.get("MTN_COLLECTION_API_KEY") ?? "";
    const subscriptionKey = Deno.env.get("MTN_COLLECTION_SUBSCRIPTION_KEY") ?? "";
    const target = Deno.env.get("MTN_TARGET_ENVIRONMENT") ?? "";
    const base = Deno.env.get("MTN_LIVE_BASE_URL") ?? "";
    if (!apiUser || !apiKey || !subscriptionKey || target !== "mtnuganda" || !base)
        return null;
    let parsed;
    try {
        parsed = new URL(base);
    }
    catch {
        return null;
    }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        return null;
    return { apiUser, apiKey, subscriptionKey, target, base: parsed.origin };
}
async function mtnToken(config) {
    const response = await fetch(`${config.base}/collection/token/`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${config.apiUser}:${config.apiKey}`)}`, "Ocp-Apim-Subscription-Key": config.subscriptionKey },
    });
    if (!response.ok)
        throw new Error("PROVIDER_AUTHENTICATION_FAILED");
    const data = await response.json();
    if (typeof data.access_token !== "string")
        throw new Error("PROVIDER_AUTHENTICATION_FAILED");
    return data.access_token;
}
async function mtnStatus(config, token, requestId) {
    const response = await fetch(`${config.base}/collection/v1_0/requesttopay/${requestId}`, {
        headers: { Authorization: `Bearer ${token}`, "Ocp-Apim-Subscription-Key": config.subscriptionKey, "X-Target-Environment": config.target },
    });
    if (!response.ok)
        throw new Error("PROVIDER_STATUS_UNAVAILABLE");
    return await response.json();
}
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (request.method !== "POST")
        return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!url || !serviceKey)
        return reply({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    if (!bearer)
        return reply({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: authError } = await service.auth.getUser(bearer);
    if (authError || !identity.user)
        return reply({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const input = await request.json().catch(() => null);
    if (!input || typeof input.action !== "string")
        return reply({ error: "REQUEST_REQUIRED" }, 400);
    if (input.action === "readiness") {
        const schoolId = typeof input.schoolId === "string" ? input.schoolId : null;
        if (schoolId && !uuid.test(schoolId))
            return reply({ error: "SCHOOL_ID_INVALID" }, 400);
        const { data, error } = await service.rpc("get_mobile_money_provider_readiness", { p_school_id: schoolId });
        if (error)
            return reply({ error: error.message.includes("ACCESS_DENIED") || error.message.includes("ADMIN_REQUIRED") ? "BILLING_ACCESS_DENIED" : "PROVIDER_STATUS_UNAVAILABLE" }, 403);
        const configReady = Boolean(mtnConfig());
        const providers = (data ?? []).map((provider) => {
            const id = provider.provider;
            const available = id === "MTN_MOMO_UG" && provider.is_available === true && configReady;
            const reason = available ? null : id === "AIRTEL_MONEY_UG"
                ? "Airtel merchant onboarding is not connected. Live payment initiation requires KYC, production credentials, approved API setup, callback, reconciliation, and settlement verification."
                : provider.mode === "SANDBOX"
                    ? "MTN sandbox is configured. Live payment initiation requires merchant onboarding, KYC, provider verification, approved callback, reconciliation, settlement, and production credentials."
                    : provider.is_available !== true
                        ? provider.unavailable_reason
                        : "MTN production API credentials are not configured on the server.";
            return { ...provider, is_available: available, unavailable_reason: reason };
        });
        return reply({ providers });
    }
    if (input.action !== "initiate" && input.action !== "status" && input.action !== "reminder")
        return reply({ error: "ACTION_UNSUPPORTED" }, 400);
    const schoolId = typeof input.schoolId === "string" ? input.schoolId : "";
    if (!uuid.test(schoolId))
        return reply({ error: "SCHOOL_ID_INVALID" }, 400);
    const { data: readiness, error: readinessError } = await service.rpc("get_mobile_money_provider_readiness", { p_school_id: schoolId });
    if (readinessError)
        return reply({ error: "BILLING_ACCESS_DENIED" }, 403);
    if (input.action === "reminder") {
        const invoiceId = typeof input.invoiceId === "string" ? input.invoiceId : "";
        if (!uuid.test(invoiceId))
            return reply({ error: "INVOICE_ID_INVALID" }, 400);
        const { data, error } = await service.rpc("send_platform_subscription_payment_reminder", { p_actor_auth_user_id: identity.user.id, p_school_id: schoolId, p_invoice_id: invoiceId });
        if (error)
            return reply({ error: error.message.includes("PLATFORM_ADMIN_REQUIRED") ? "PLATFORM_ADMIN_REQUIRED" : "PAYMENT_REMINDER_FAILED" }, error.message.includes("PLATFORM_ADMIN_REQUIRED") ? 403 : 400);
        return reply({ reminder: data });
    }
    if (input.action === "initiate") {
        const invoiceId = typeof input.invoiceId === "string" ? input.invoiceId : "";
        const provider = input.provider;
        const payerPhone = typeof input.payerPhone === "string" ? input.payerPhone : "";
        const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey : "";
        if (!uuid.test(invoiceId) || !uuid.test(idempotencyKey) || !["MTN_MOMO_UG", "AIRTEL_MONEY_UG"].includes(provider))
            return reply({ error: "PAYMENT_REQUEST_INVALID" }, 400);
        const record = (readiness ?? []).find((row) => row.provider === provider);
        if (!record || record.is_available !== true)
            return reply({ error: "PAYMENT_PROVIDER_UNAVAILABLE", reason: record?.unavailable_reason ?? "Provider is not configured." }, 409);
        if (provider !== "MTN_MOMO_UG")
            return reply({ error: "PAYMENT_PROVIDER_ADAPTER_UNAVAILABLE" }, 409);
        const config = mtnConfig();
        if (!config)
            return reply({ error: "PAYMENT_PROVIDER_CREDENTIALS_MISSING" }, 409);
        const { data: attempt, error: createError } = await service.rpc("create_mobile_money_payment_attempt", {
            p_actor_auth_user_id: identity.user.id,
            p_school_id: schoolId,
            p_invoice_id: invoiceId,
            p_provider: provider,
            p_payer_phone: payerPhone,
            p_idempotency_key: idempotencyKey,
        });
        if (createError) {
            const safeError = createError.message.match(/PAYMENT_[A-Z_]+|INVOICE_[A-Z_]+|INVALID_[A-Z_]+|SCHOOL_ADMIN_REQUIRED_FOR_OWN_SCHOOL/)?.[0] ?? "PAYMENT_ATTEMPT_COULD_NOT_BE_CREATED";
            return reply({ error: safeError }, safeError === "PAYMENT_ALREADY_PENDING" ? 409 : 400);
        }
        const attemptData = attempt;
        const { data: context, error: contextError } = await service.rpc("get_mobile_money_attempt_context", { p_attempt_id: attemptData.paymentAttemptId });
        if (contextError)
            return reply({ error: "PAYMENT_ATTEMPT_REQUIRES_SUPPORT" }, 502);
        const payment = context;
        if (payment.status !== "PENDING" || payment.environment !== "LIVE")
            return reply({ attempt: { id: payment.paymentAttemptId, status: payment.status, reference: payment.paymentReference, maskedPhone: `+256******${payment.payerPhone.slice(-3)}` } });
        try {
            const token = await mtnToken(config);
            const response = await fetch(`${config.base}/collection/v1_0/requesttopay`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Ocp-Apim-Subscription-Key": config.subscriptionKey, "X-Target-Environment": config.target, "X-Reference-Id": payment.providerRequestId, "Content-Type": "application/json" },
                body: JSON.stringify({ amount: String(payment.amountMinor), currency: "UGX", externalId: payment.externalReference, payer: { partyIdType: "MSISDN", partyId: payment.payerPhone }, payerMessage: `SOMA invoice ${payment.externalReference}`, payeeNote: `SOMA invoice ${payment.externalReference}` }),
            });
            if (response.status >= 400 && response.status < 500) {
                await service.rpc("record_mobile_money_request_result", { p_attempt_id: payment.paymentAttemptId, p_accepted: false, p_failure_category: "PROVIDER_REQUEST_REJECTED" });
                return reply({ error: "PAYMENT_REQUEST_REJECTED" }, 502);
            }
            if (response.status !== 202)
                return reply({ attempt: { id: payment.paymentAttemptId, status: "PENDING", reference: payment.paymentReference, maskedPhone: `+256******${payment.payerPhone.slice(-3)}` }, message: "Provider acceptance is being verified. The invoice remains locked against duplicate requests." }, 202);
            await service.rpc("record_mobile_money_request_result", { p_attempt_id: payment.paymentAttemptId, p_accepted: true, p_failure_category: null });
            return reply({ attempt: { id: payment.paymentAttemptId, status: "AWAITING_PAYER_APPROVAL", reference: payment.paymentReference, maskedPhone: `+256******${payment.payerPhone.slice(-3)}` } });
        }
        catch {
            // A network timeout can happen after provider acceptance. Keep the request
            // pending so a second click cannot cause a duplicate mobile-money prompt.
            return reply({ attempt: { id: payment.paymentAttemptId, status: "PENDING", reference: payment.paymentReference, maskedPhone: `+256******${payment.payerPhone.slice(-3)}` }, message: "Provider acceptance is being verified. The invoice remains locked against duplicate requests." }, 202);
        }
    }
    const attemptId = typeof input.attemptId === "string" ? input.attemptId : "";
    if (!uuid.test(attemptId))
        return reply({ error: "PAYMENT_ATTEMPT_ID_INVALID" }, 400);
    const { data: context, error: contextError } = await service.rpc("get_mobile_money_attempt_context", { p_attempt_id: attemptId });
    if (contextError)
        return reply({ error: "PAYMENT_ATTEMPT_NOT_FOUND" }, 404);
    const payment = context;
    if (payment.schoolId !== schoolId)
        return reply({ error: "BILLING_ACCESS_DENIED" }, 403);
    if (payment.provider !== "MTN_MOMO_UG" || payment.environment !== "LIVE")
        return reply({ error: "PAYMENT_PROVIDER_UNAVAILABLE" }, 409);
    if (["SUCCESSFUL", "FAILED", "REJECTED", "EXPIRED", "CANCELLED"].includes(payment.status))
        return reply({ attempt: { id: attemptId, status: payment.status, reference: payment.paymentReference } });
    const config = mtnConfig();
    if (!config)
        return reply({ error: "PAYMENT_PROVIDER_CREDENTIALS_MISSING" }, 409);
    try {
        const token = await mtnToken(config);
        const result = await mtnStatus(config, token, payment.providerRequestId);
        const rawStatus = typeof result.status === "string" ? result.status.toUpperCase() : "PENDING";
        const status = ["SUCCESSFUL", "FAILED", "REJECTED", "EXPIRED", "PENDING", "PROCESSING"].includes(rawStatus) ? rawStatus : "PROCESSING";
        const amount = Number(result.amount);
        const currency = typeof result.currency === "string" ? result.currency : null;
        const reference = typeof result.financialTransactionId === "string" ? result.financialTransactionId : null;
        const eventId = `${payment.providerRequestId}:${status}:${reference ?? "pending"}`;
        const { data: finalized, error: finalizeError } = await service.rpc("finalize_mobile_money_payment", {
            p_attempt_id: attemptId, p_final_status: status, p_provider_reference: reference,
            p_amount_minor: Number.isSafeInteger(amount) ? amount : null, p_currency: currency, p_provider_event_id: eventId,
        });
        if (finalizeError)
            return reply({ error: "PAYMENT_STATUS_RECONCILIATION_FAILED" }, 502);
        return reply({ attempt: { id: attemptId, status: finalized.status, reference: payment.paymentReference } });
    }
    catch {
        return reply({ error: "PAYMENT_STATUS_UNAVAILABLE" }, 502);
    }
});
