import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPublicAppOrigin } from "../_shared/publicAppUrl.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const encoder = new TextEncoder();
const slug = (value) => value.normalize("NFKD").replace(/[’']/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const randomText = (bytes = 24) => { const value = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...value)).replace(/[+/=]/g, "").slice(0, bytes); };
const sha256 = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
const temporaryPassword = () => `${randomText(12)}!aA7`;
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (request.method !== "POST")
        return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey)
        return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const activationBase = getPublicAppOrigin();
    if (!activationBase)
        return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const bearer = request.headers.get("Authorization") ?? "";
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: identity, error: identityError } = await service.auth.getUser(bearer.replace(/^Bearer\s+/i, ""));
    if (identityError || !identity.user)
        return json({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const { data: platformAdmin } = await service.from("platform_admins").select("id").eq("auth_user_id", identity.user.id).eq("is_active", true).maybeSingle();
    if (!platformAdmin)
        return json({ error: "PLATFORM_ADMIN_REQUIRED" }, 403);
    const input = await request.json().catch(() => null);
    const required = ["schoolName", "schoolLevel", "schoolType", "district", "address", "adminName", "adminEmail", "adminPhone", "adminJobTitle", "planCode", "billingCadence", "subscriptionStart", "academicYear", "currentTerm"];
    if (!input || required.some((field) => !String(input[field] ?? "").trim()))
        return json({ error: "REQUIRED_FIELDS_MISSING" }, 400);
    if (!['UCE_ONLY', 'UACE_ONLY', 'BOTH'].includes(String(input.schoolLevel)))
        return json({ error: "INVALID_SCHOOL_LEVEL" }, 400);
    if (!['ANNUAL', 'TERMLY'].includes(String(input.billingCadence)))
        return json({ error: "INVALID_BILLING_CADENCE" }, 400);
    if (!['TERM_I', 'TERM_II', 'TERM_III'].includes(String(input.currentTerm)))
        return json({ error: "INVALID_ACADEMIC_TERM" }, 400);
    const location = input.location;
    if (!location?.countryId || !location.regionId || !location.districtCityId) {
        return json({ error: "VALID_UGANDA_LOCATION_REQUIRED" }, 400);
    }
    const windowStart = new Date();
    windowStart.setMinutes(Math.floor(windowStart.getMinutes() / 15) * 15, 0, 0);
    const actorKey = await sha256(identity.user.id);
    const { data: rate } = await service.from("platform_action_rate_limits").select("id,attempt_count,blocked_until").eq("actor_key", actorKey).eq("action_key", "REGISTER_SCHOOL").eq("window_started_at", windowStart.toISOString()).maybeSingle();
    if (rate?.blocked_until && new Date(rate.blocked_until) > new Date())
        return json({ error: "RATE_LIMITED" }, 429);
    if ((rate?.attempt_count ?? 0) >= 10) {
        await service.from("platform_action_rate_limits").update({ blocked_until: new Date(Date.now() + 15 * 60_000).toISOString() }).eq("id", rate.id);
        return json({ error: "RATE_LIMITED" }, 429);
    }
    if (rate)
        await service.from("platform_action_rate_limits").update({ attempt_count: rate.attempt_count + 1, updated_at: new Date().toISOString() }).eq("id", rate.id);
    else
        await service.from("platform_action_rate_limits").insert({ actor_key: actorKey, action_key: "REGISTER_SCHOOL", window_started_at: windowStart.toISOString() });
    const name = String(input.schoolName).trim();
    const baseCode = String(input.schoolCode || slug(name).split("-").map((part) => part[0]).join("")).replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12) || "SCHOOL";
    let code = baseCode;
    for (let suffix = 2; suffix < 100; suffix++) {
        const { count } = await service.from("schools").select("id", { count: "exact", head: true }).ilike("school_code", code);
        if (!count)
            break;
        code = `${baseCode}${suffix}`;
    }
    const baseUsername = `${slug(name)}.admin`;
    let username = baseUsername;
    for (let suffix = 2; suffix < 100; suffix++) {
        const { count } = await service.from("school_admin_invitations").select("id", { count: "exact", head: true }).ilike("username", username);
        if (!count)
            break;
        username = `${baseUsername}${suffix}`;
    }
    const password = temporaryPassword();
    const rawToken = randomText(36);
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 72 * 60 * 60_000);
    const email = String(input.adminEmail).trim().toLowerCase();
    const { data: existingSchoolUser } = await service.from("users").select("auth_user_id").ilike("email", email).maybeSingle();
    let adminAuthUserId = existingSchoolUser?.auth_user_id;
    let createdIdentity = false;
    if (adminAuthUserId) {
        const { count: platformIdentityCount } = await service.from("platform_admins").select("id", { count: "exact", head: true }).eq("auth_user_id", adminAuthUserId);
        if (platformIdentityCount)
            return json({ error: "ADMIN_EMAIL_RESERVED_FOR_PLATFORM" }, 409);
    }
    else {
        const { data: authCreated, error: authError } = await service.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { username, must_change_password: true } });
        if (authError || !authCreated.user)
            return json({ error: "ADMIN_IDENTITY_CREATION_FAILED" }, 409);
        adminAuthUserId = authCreated.user.id;
        createdIdentity = true;
    }
    const { data: provisioned, error: provisionError } = await service.rpc("provision_connected_school", {
        p_actor_auth_user_id: identity.user.id, p_admin_auth_user_id: adminAuthUserId,
        p_school_name: name, p_school_code: code, p_school_level: input.schoolLevel, p_school_type: input.schoolType,
        p_district: input.district, p_emis_number: input.emisNumber ?? "", p_address: input.address,
        p_school_email: input.schoolEmail || email, p_school_phone: input.schoolPhone || input.adminPhone,
        p_admin_name: input.adminName, p_admin_email: email, p_admin_phone: input.adminPhone, p_admin_username: username,
        p_plan_code: input.planCode, p_billing_cadence: input.billingCadence, p_subscription_start: input.subscriptionStart,
        p_trial_days: Number(input.trialDays || 0), p_internal_notes: input.notes ?? "", p_token_hash: tokenHash,
        p_invitation_expires_at: expiresAt.toISOString(), p_requires_mfa: Boolean(input.requiresMfa),
        p_registration: {
            draftId: input.draftId ?? null, shortName: input.shortName ?? "", logoUrl: input.logoUrl ?? "", website: input.website ?? "",
            location: { ...location, formattedAddress: [location.plotRoad, location.landmark, input.district, "Uganda"].filter(Boolean).join(", ") },
            academicYear: Number(input.academicYear), currentTerm: input.currentTerm, curriculumStartYear: input.curriculumStartYear ?? null,
            activeLearners: Number(input.activeLearners ?? 0), paymentStatus: input.paymentStatus ?? "PENDING",
            trialStart: input.trialStart ?? null, trialEnd: input.trialEnd ?? null, supportApproval: input.supportApproval ?? "",
            adminJobTitle: input.adminJobTitle,
        },
    });
    if (provisionError || !provisioned) {
        console.error("School provisioning failed", { code: provisionError?.code, message: provisionError?.message, details: provisionError?.details });
        if (createdIdentity && adminAuthUserId)
            await service.auth.admin.deleteUser(adminAuthUserId);
        const known = ["SCHOOL_CODE_EXISTS", "ADMIN_USERNAME_EXISTS", "ACTIVE_PLAN_NOT_FOUND", "SCHOOL_ADMIN_ROLE_NOT_FOUND", "PLATFORM_ADMIN_REQUIRED"];
        const matched = known.find((code) => provisionError?.message?.includes(code));
        return json({ error: matched ?? "SCHOOL_PROVISIONING_FAILED" }, matched ? 409 : 500);
    }
    const record = provisioned;
    const activationUrl = `${activationBase}/activate-school?token=${encodeURIComponent(rawToken)}`;
    const { error: deliveryError } = await service.auth.resetPasswordForEmail(email, { redirectTo: activationUrl });
    const invitationStatus = deliveryError ? "FAILED" : "SENT";
    await service.from("school_admin_invitations").update({ status: invitationStatus, sent_at: invitationStatus === "SENT" ? new Date().toISOString() : null, attempt_count: 1, failure_category: invitationStatus === "FAILED" ? "SUPABASE_AUTH_EMAIL_FAILED" : null }).eq("id", record.invitation_id);
    await service.from("school_invitation_events").insert({ invitation_id: record.invitation_id, school_id: record.school_id, event_type: invitationStatus, actor_platform_admin_id: platformAdmin.id, safe_metadata: { expires_at: expiresAt.toISOString() } });
    await service.from("schools").update({ lifecycle_status: invitationStatus === "SENT" ? "INVITATION_SENT" : "DRAFT" }).eq("id", record.school_id);
    return json({ schoolId: record.school_id, schoolCode: code, username, invitationStatus, reusedIdentity: !createdIdentity, expiresAt: expiresAt.toISOString() }, 201);
});
