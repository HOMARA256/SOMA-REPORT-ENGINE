import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPublicAppOrigin } from "../_shared/publicAppUrl.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const origin = getPublicAppOrigin();
  if (!url || !serviceKey || !anonKey || !origin) return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: identity, error: identityError } = await service.auth.getUser(bearer);
  if (identityError || !identity.user) return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const body = await request.json().catch(() => null) as { invitationId?: string } | null;
  if (!body?.invitationId) return respond({ error: "INVITATION_ID_REQUIRED" }, 400);

  // The RPC checks auth.uid() against the invitation's school. The service-role
  // client has no calling user's identity, so invoke it with the verified JWT.
  const schoolAdmin = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });
  const { data: activation, error: activationError } = await schoolAdmin.rpc("activate_school_teacher_invitation", {
    p_invitation_id: body.invitationId,
  });
  if (activationError || !activation?.activated) {
    const message = activationError?.message ?? "";
    const code = message.includes("SCHOOL_ADMIN_REQUIRED") ? "SCHOOL_ADMIN_REQUIRED"
      : message.includes("TEACHER_ACCEPTANCE_REQUIRED") ? "TEACHER_ACCEPTANCE_REQUIRED"
      : message.includes("PRIMARY_TEACHER_ALREADY_ASSIGNED") ? "PRIMARY_TEACHER_ALREADY_ASSIGNED"
      : message.includes("INVITED_TEACHER_ASSIGNMENT_NO_LONGER_AVAILABLE") ? "INVITED_TEACHER_ASSIGNMENT_NO_LONGER_AVAILABLE"
      : message.includes("TEACHER_ACCOUNT_GLOBAL_RESTRICTED") ? "TEACHER_ACCOUNT_GLOBAL_RESTRICTED"
      : message.includes("SCHOOL_MEMBERSHIP_SUSPENDED") ? "SCHOOL_MEMBERSHIP_SUSPENDED"
      : message.includes("SCHOOL_TEACHER_MEMBERSHIP_ADMIN_ACTION_REQUIRED") ? "SCHOOL_MEMBERSHIP_RESTORE_REQUIRED"
      : message.includes("SCHOOL_NOT_ACTIVE") ? "SCHOOL_NOT_ACTIVE"
      : "TEACHER_INVITATION_ACTIVATION_FAILED";
    return respond({ error: code }, code === "SCHOOL_ADMIN_REQUIRED" ? 403 : 409);
  }

  if (!activation.passwordSetupRequired) {
    return respond({ activated: true, passwordSetupRequired: false, passwordSetupEmailSent: false });
  }
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
  const from = Deno.env.get("SCHOOL_INVITATION_FROM_EMAIL")?.trim() ?? "";
  if (!resendKey || !from) return respond({ activated: true, passwordSetupRequired: true, passwordSetupEmailSent: false, warning: "DELIVERY_NOT_CONFIGURED" });

  const redirect = new URL("/reset-password/school", origin);
  const { data: generated, error: generateError } = await service.auth.admin.generateLink({
    type: "recovery", email: activation.teacherEmail, options: { redirectTo: redirect.toString() },
  });
  const actionLink = generated?.properties?.action_link ?? "";
  if (generateError || !actionLink) return respond({ activated: true, passwordSetupRequired: true, passwordSetupEmailSent: false, warning: "PASSWORD_SETUP_LINK_FAILED" });

  const school = escapeHtml(activation.schoolName ?? "your school");
  const teacher = escapeHtml(activation.teacherName ?? "Teacher");
  const html = `<div style="margin:0;background:#f3f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172943"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe4ef;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;background:#132f54;color:#fff"><div style="font-size:12px;font-weight:700;letter-spacing:2px">SCHOOL STAFF ACCESS</div><h1 style="font-size:24px;line-height:1.25;margin:8px 0 0">${school}</h1></div><div style="padding:28px"><p>Hello ${teacher},</p><p>Your Teacher membership at <strong>${school}</strong> has been activated by the School Administrator after your acceptance.</p><p>Set a password for your SOMA REPORT ENGINE sign-in. Passwords are managed securely by Supabase Authentication and are never visible to the school.</p><p style="margin:28px 0"><a href="${escapeHtml(actionLink)}" style="display:inline-block;background:#2459a6;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:9px">Set your password</a></p><p>After setting your password, return to the sign-in page and sign in with <strong>${escapeHtml(activation.teacherEmail)}</strong>.</p><p style="font-size:12px;color:#667890;border-top:1px solid #e1e8f1;padding-top:16px">This is a single-use password setup link. If you did not expect it, contact your school through a trusted channel.</p></div></div></div>`;
  let emailSent = false;
  try {
    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [activation.teacherEmail], subject: `Set your password · ${activation.schoolName}`,
        html,
        text: `Hello ${activation.teacherName}. Your Teacher membership at ${activation.schoolName} has been activated. Set your SOMA REPORT ENGINE password here: ${actionLink} After setting it, sign in with ${activation.teacherEmail}. This link is single-use.`,
      }),
    });
    emailSent = delivery.ok;
  } catch { emailSent = false; }
  return respond({ activated: true, passwordSetupRequired: true, passwordSetupEmailSent: emailSent,
    warning: emailSent ? null : "PASSWORD_SETUP_EMAIL_FAILED" });
});
