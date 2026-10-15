import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPublicAppOrigin } from "../_shared/publicAppUrl.ts";
const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const html = (value) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));
async function sendBrandedEmail(to, input, link, resendKey, from) {
    const logoUrl = input.schoolLogo ? (() => {
        try {
            const value = new URL(input.schoolLogo);
            return value.protocol === "https:" ? value.href : "";
        }
        catch {
            return "";
        }
    })() : "";
    const logo = logoUrl ? `<img src="${html(logoUrl)}" alt="" width="56" height="56" style="object-fit:contain;border-radius:12px">` : "";
    const schoolName = html(input.schoolName || "your school");
    const teacherName = html(input.teacherName || "Teacher");
    const sender = html(input.inviterName || "School Administrator");
    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            from, to: [to], subject: `Teacher invitation · ${input.schoolName}`,
            html: `<div style="margin:0;background:#f3f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172943"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe4ef;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;background:#132f54;color:#fff">${logo}<div style="font-size:12px;font-weight:700;letter-spacing:2px;margin-top:12px">SCHOOL STAFF INVITATION</div><h1 style="font-size:24px;line-height:1.25;margin:8px 0 0">${schoolName}</h1></div><div style="padding:28px"><p>Hello ${teacherName},</p><p><strong>${schoolName}</strong> has invited you to join its staff workspace as a <strong>Teacher</strong>. This membership is limited to this school and its assigned classes and subjects.</p><p>Invited by ${sender}. This secure, single-use link expires in seven days.</p><p style="margin:28px 0"><a href="${html(link)}" style="display:inline-block;background:#2459a6;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:9px">Accept teacher invitation</a></p><p style="font-size:13px;color:#5d6f86">After opening the link, sign in with this invited email or set up your password, then select <strong>Accept school invitation</strong> to activate this school membership. If you already have a SOMA REPORT ENGINE account, use its existing password; you will not receive a reusable password by email.</p><p style="font-size:12px;color:#667890;border-top:1px solid #e1e8f1;padding-top:16px">Powered by SOMA REPORT ENGINE</p></div></div></div>`,
        }),
    });
    return response.ok;
}
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (request.method !== "POST")
        return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const origin = getPublicAppOrigin();
    if (!url || !serviceKey || !origin)
        return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: identity, error: identityError } = await service.auth.getUser(bearer);
    if (identityError || !identity.user)
        return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const input = await request.json().catch(() => null);
    if (!input)
        return respond({ error: "REQUEST_BODY_INVALID" }, 400);
    let invitation;
    if (input.action === "resend") {
        if (!input.invitationId)
            return respond({ error: "INVITATION_ID_REQUIRED" }, 400);
        const { data, error } = await service.rpc("prepare_school_teacher_invitation_resend", {
            p_invitation_id: input.invitationId, p_actor_auth_user_id: identity.user.id,
        });
        if (error || !data)
            return respond({ error: error?.message?.includes("SCHOOL_ADMIN_REQUIRED") ? "SCHOOL_ADMIN_REQUIRED" : "INVITATION_NOT_RESENDABLE" }, 409);
        invitation = data;
    }
    else {
        if (!input.schoolId || !input.name || !input.email)
            return respond({ error: "VALID_TEACHER_DETAILS_REQUIRED" }, 400);
        const { data, error } = await service.rpc("create_school_teacher_invitation", {
            p_school_id: input.schoolId,
            p_actor_auth_user_id: identity.user.id,
            p_name: input.name,
            p_email: input.email,
            p_department: input.department ?? "",
            p_assignments: input.assignments ?? [],
        });
        if (error || !data) {
            const message = error?.message ?? "";
            if (error?.code === "23505" && message.includes("school_teacher_invitation_one_open_per_email")) {
                return respond({ error: "TEACHER_INVITATION_ALREADY_OPEN" }, 409);
            }
            const schemaErrorCodes = new Set(["PGRST202", "42P01", "42703", "42883"]);
            if (error?.code && schemaErrorCodes.has(error.code)) {
                console.error("Teacher invitation RPC is unavailable in the database schema", { code: error.code });
                return respond({ error: "INVITATION_DATABASE_NOT_READY", diagnosticCode: error.code }, 503);
            }
            const errors = {
                SCHOOL_ADMIN_REQUIRED: "SCHOOL_ADMIN_REQUIRED", SCHOOL_NOT_ACTIVE: "SCHOOL_NOT_ACTIVE",
                TEACHER_ALREADY_MEMBER: "TEACHER_ALREADY_MEMBER", TEACHER_ACCOUNT_COLLISION: "TEACHER_ACCOUNT_COLLISION",
                SCHOOL_MEMBERSHIP_SUSPENDED_USE_REACTIVATE: "SCHOOL_MEMBERSHIP_SUSPENDED",
                SCHOOL_MEMBERSHIP_REMOVED_USE_RESTORE: "SCHOOL_MEMBERSHIP_REMOVED",
                INVALID_TEACHER_ASSIGNMENT: "INVALID_TEACHER_ASSIGNMENT", TEACHER_ASSIGNMENT_OUTSIDE_SCHOOL: "TEACHER_ASSIGNMENT_OUTSIDE_SCHOOL",
                PRIMARY_TEACHER_ALREADY_ASSIGNED: "PRIMARY_TEACHER_ALREADY_ASSIGNED", VALID_TEACHER_INVITATION_REQUIRED: "VALID_TEACHER_DETAILS_REQUIRED",
                TEACHER_ROLE_NOT_CONFIGURED: "TEACHER_ROLE_NOT_CONFIGURED", PLATFORM_ACCOUNT_CANNOT_BE_TEACHER: "PLATFORM_ACCOUNT_CANNOT_BE_TEACHER",
            };
            const code = Object.keys(errors).find((item) => message.includes(item));
            if (!code)
                console.error("Teacher invitation creation failed", { code: error?.code ?? "UNKNOWN" });
            return respond({ error: code ? errors[code] : "INVITATION_CREATE_FAILED", diagnosticCode: error?.code ?? null }, code === "SCHOOL_ADMIN_REQUIRED" ? 403 : 409);
        }
        invitation = { ...data, teacherName: input.name.trim(), email: input.email.trim().toLowerCase() };
    }
    const recipient = invitation.email ?? input.email?.trim().toLowerCase() ?? "";
    if (!recipient)
        return respond({ error: "INVITATION_EMAIL_UNAVAILABLE" }, 409);
    const redirect = new URL("/teacher-invitation/accept", origin);
    redirect.searchParams.set("invitation", invitation.invitationId);
    let targetAuthUserId = invitation.targetAuthUserId ?? null;
    if (!targetAuthUserId) {
        const { data: created, error: createError } = await service.auth.admin.createUser({
            email: recipient, email_confirm: false,
            user_metadata: { full_name: invitation.teacherName ?? input.name?.trim() ?? "Teacher" },
        });
        if (createError || !created.user) {
            await service.rpc("finalize_school_teacher_invitation", { p_invitation_id: invitation.invitationId, p_auth_user_id: null, p_sent: false });
            return respond({ error: "TEACHER_ACCOUNT_SETUP_FAILED" }, 502);
        }
        targetAuthUserId = created.user.id;
    }
    const { data: targetAccount, error: targetAccountError } = await service.auth.admin.getUserById(targetAuthUserId);
    if (targetAccountError || !targetAccount.user) {
        await service.rpc("finalize_school_teacher_invitation", { p_invitation_id: invitation.invitationId, p_auth_user_id: null, p_sent: false });
        return respond({ error: "TEACHER_ACCOUNT_SETUP_FAILED" }, 502);
    }
    // Unconfirmed addresses need the Auth invitation flow (including on resend).
    // Confirmed existing accounts receive a one-time magic link to sign in.
    const linkType = targetAccount.user.email_confirmed_at ? "magiclink" : "invite";
    const { data: generated, error: linkError } = await service.auth.admin.generateLink({
        type: linkType,
        email: recipient,
        options: {
            redirectTo: redirect.toString(),
            data: {
                full_name: invitation.teacherName ?? input.name?.trim() ?? "Teacher",
                school_name: invitation.schoolName,
                school_teacher_invitation_id: invitation.invitationId,
            },
        },
    });
    const actionLink = generated?.properties?.action_link ?? "";
    if (linkError || !actionLink) {
        await service.rpc("finalize_school_teacher_invitation", { p_invitation_id: invitation.invitationId, p_auth_user_id: null, p_sent: false });
        return respond({ error: "TEACHER_INVITATION_LINK_FAILED" }, 502);
    }
    const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    const from = Deno.env.get("SCHOOL_INVITATION_FROM_EMAIL")?.trim() ?? "";
    const invitationSent = Boolean(resendKey && from && await sendBrandedEmail(recipient, invitation, actionLink, resendKey, from).catch(() => false));
    const { error: finalizeError } = await service.rpc("finalize_school_teacher_invitation", {
        p_invitation_id: invitation.invitationId, p_auth_user_id: targetAuthUserId, p_sent: invitationSent,
    });
    if (finalizeError) {
        return respond({ error: "INVITATION_SAVE_FAILED" }, 500);
    }
    return respond({
        invitationId: invitation.invitationId,
        invitationSent,
        activationLink: invitationSent ? null : actionLink,
        message: invitationSent ? "SCHOOL_BRANDED_INVITATION_SENT" : "INVITATION_CREATED_LINK_READY",
    }, invitationSent ? 201 : 202);
});
