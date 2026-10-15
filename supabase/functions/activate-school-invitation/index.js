import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map(v => v.toString(16).padStart(2, "0")).join("");
const activationPasswordFingerprint = async (invitationId, password, secret) => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${invitationId}\0${password}`));
    return Array.from(new Uint8Array(signature)).map(value => value.toString(16).padStart(2, "0")).join("");
};
Deno.serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (req.method !== "POST")
        return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL"), key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key)
        return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const service = createClient(url, key, { auth: { persistSession: false } });
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: identity } = await service.auth.getUser(jwt);
    if (!identity.user)
        return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const body = await req.json().catch(() => null);
    if (!body?.token || !body.newPassword || !body.phone || !body.acceptTerms || !body.acceptPrivacy)
        return respond({ error: "ACTIVATION_FIELDS_REQUIRED" }, 400);
    if (body.newPassword.length < 12 || !/[A-Z]/.test(body.newPassword) || !/[a-z]/.test(body.newPassword) || !/[0-9]/.test(body.newPassword) || !/[\W_]/.test(body.newPassword))
        return respond({ error: "WEAK_PASSWORD" }, 400);
    const tokenHash = await hash(body.token);
    const { data: invitation } = await service.from("school_admin_invitations").select("id,school_id,invited_user_id,status,expires_at,revoked_at,used_at,requires_mfa").eq("token_hash", tokenHash).maybeSingle();
    if (!invitation || invitation.invited_user_id !== identity.user.id)
        return respond({ error: "INVITATION_INVALID" }, 403);
    const activationMarker = "school_activation_password_set_for";
    if (invitation.status === "ACCEPTED" && invitation.used_at) {
        if (identity.user.app_metadata?.[activationMarker]) {
            const completedAppMetadata = { ...identity.user.app_metadata };
            delete completedAppMetadata[activationMarker];
            await service.auth.admin.updateUserById(identity.user.id, { app_metadata: completedAppMetadata });
        }
        return respond({ schoolId: invitation.school_id, status: "SETUP_IN_PROGRESS" });
    }
    if (!["PENDING", "SENT", "DELIVERED"].includes(invitation.status) || invitation.revoked_at || invitation.used_at || new Date(invitation.expires_at) <= new Date())
        return respond({ error: "INVITATION_EXPIRED_OR_USED" }, 410);
    if (invitation.requires_mfa) {
        const { data: factors } = await service.auth.admin.mfa.listFactors({ userId: identity.user.id });
        if (!factors?.totp?.some((factor) => factor.status === "verified"))
            return respond({ error: "MFA_ENROLLMENT_REQUIRED" }, 409);
    }
    const passwordFingerprint = await activationPasswordFingerprint(invitation.id, body.newPassword, key);
    const passwordAlreadySet = identity.user.app_metadata?.[activationMarker] === passwordFingerprint;
    if (!passwordAlreadySet) {
        const nextAppMetadata = { ...identity.user.app_metadata, [activationMarker]: passwordFingerprint };
        const { error: passwordError } = await service.auth.admin.updateUserById(identity.user.id, { password: body.newPassword, email_confirm: true, user_metadata: { ...identity.user.user_metadata, must_change_password: false }, app_metadata: nextAppMetadata });
        if (passwordError)
            return respond({ error: "PASSWORD_CHANGE_FAILED" }, 500);
    }
    const { data: schoolId, error } = await service.rpc("activate_school_admin_invitation", { p_invitation_id: invitation.id, p_auth_user_id: identity.user.id, p_confirmed_phone: body.phone, p_terms_version: "2026-01", p_privacy_version: "2026-01" });
    if (error) {
        console.error("School invitation activation RPC failed", { code: error.code, message: error.message, invitationId: invitation.id });
        return respond({ error: "ACTIVATION_FAILED" }, 409);
    }
    const completedAppMetadata = { ...identity.user.app_metadata };
    delete completedAppMetadata[activationMarker];
    const { error: metadataError } = await service.auth.admin.updateUserById(identity.user.id, { app_metadata: completedAppMetadata });
    if (metadataError)
        console.error("Completed school activation metadata cleanup failed", { code: metadataError.code, invitationId: invitation.id });
    return respond({ schoolId, status: "SETUP_IN_PROGRESS" });
});
