import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getPublicAppOrigin } from "../_shared/publicAppUrl.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});
const html = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char] ?? char));

type RecoveryRequest = {
  requestId: string; authUserId: string; email: string; teacherName: string;
  schoolId: string; schoolName: string; schoolLogo?: string | null; requesterName: string;
};

async function sendRecoveryEmail(request: RecoveryRequest, link: string, apiKey: string, from: string) {
  const logoUrl = request.schoolLogo ? (() => {
    try { const value = new URL(request.schoolLogo); return value.protocol === "https:" ? value.href : ""; }
    catch { return ""; }
  })() : "";
  const logo = logoUrl ? `<img src="${html(logoUrl)}" alt="" width="56" height="56" style="object-fit:contain;border-radius:12px">` : "";
  const school = html(request.schoolName);
  const name = html(request.teacherName || "Teacher");
  const requester = html(request.requesterName || "School Administrator");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [request.email], subject: `Password reset requested · ${request.schoolName}`,
      html: `<div style="margin:0;background:#f3f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#172943"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dbe4ef;border-radius:16px;overflow:hidden"><div style="padding:24px 28px;background:#132f54;color:#fff">${logo}<div style="font-size:12px;font-weight:700;letter-spacing:2px;margin-top:12px">ACCOUNT SECURITY</div><h1 style="font-size:24px;line-height:1.25;margin:8px 0 0">SOMA REPORT ENGINE</h1></div><div style="padding:28px"><p>Hello ${name},</p><p>${school} requested a password reset for your SOMA REPORT ENGINE account. The request was made by ${requester}.</p><p>This reset changes the password for your one sign-in account across all schools. It does not change your school memberships or academic records.</p><p>The secure link is single-use and expires according to the authentication provider’s recovery-link policy. If you did not expect this request, contact the school through a trusted channel and do not use the link.</p><p style="margin:28px 0"><a href="${html(link)}" style="display:inline-block;background:#2459a6;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:9px">Set a new password</a></p><p style="font-size:12px;color:#667890;border-top:1px solid #e1e8f1;padding-top:16px">Passwords are handled by Supabase Authentication. They are never shared with your school.</p></div></div></div>`,
      text: `Hello ${request.teacherName || "Teacher"}. ${request.schoolName} requested a password reset for your SOMA REPORT ENGINE account. This changes your one sign-in password across all schools, not memberships or academic records. Use this single-use link to set a new password: ${link} If you did not expect this request, do not use the link and contact the school through a trusted channel.`,
    }),
  });
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const origin = getPublicAppOrigin();
  if (!url || !serviceKey || !origin) return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: identity, error: identityError } = await service.auth.getUser(bearer);
  if (identityError || !identity.user) return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const input = await request.json().catch(() => null) as { schoolId?: string; teacherUserId?: string } | null;
  if (!input?.schoolId || !input.teacherUserId) return respond({ error: "RECOVERY_REQUEST_INVALID" }, 400);

  const { data, error: prepareError } = await service.rpc("prepare_school_teacher_password_recovery", {
    p_school_id: input.schoolId,
    p_teacher_user_id: input.teacherUserId,
    p_actor_auth_user_id: identity.user.id,
  });
  if (prepareError || !data) {
    const code = prepareError?.message?.includes("SCHOOL_ADMIN_REQUIRED") ? "SCHOOL_ADMIN_REQUIRED"
      : prepareError?.message?.includes("SCHOOL_NOT_ACTIVE") ? "SCHOOL_NOT_ACTIVE"
      : prepareError?.message?.includes("ACTIVE_SCHOOL_TEACHER_REQUIRED") ? "ACTIVE_SCHOOL_TEACHER_REQUIRED"
      : "RECOVERY_REQUEST_FAILED";
    return respond({ error: code }, code === "SCHOOL_ADMIN_REQUIRED" ? 403 : 409);
  }
  if (data.error === "RATE_LIMITED") return respond({ error: "RATE_LIMITED" }, 429);
  const recovery = data as RecoveryRequest;
  let sent = false;
  let failure: "NOT_CONFIGURED" | "LINK_GENERATION_FAILED" | "EMAIL_PROVIDER_FAILED" = "NOT_CONFIGURED";
  try {
    const apiKey = Deno.env.get("RESEND_API_KEY")?.trim() ?? "";
    const from = Deno.env.get("SCHOOL_INVITATION_FROM_EMAIL")?.trim() ?? "";
    if (apiKey && from) {
      const redirect = new URL("/reset-password/school", origin);
      redirect.searchParams.set("recoveryRequest", recovery.requestId);
      const { data: generated, error: generateError } = await service.auth.admin.generateLink({
        type: "recovery", email: recovery.email, options: { redirectTo: redirect.toString() },
      });
      const actionLink = generated?.properties?.action_link ?? "";
      if (generateError || !actionLink) failure = "LINK_GENERATION_FAILED";
      else {
        failure = "EMAIL_PROVIDER_FAILED";
        sent = await sendRecoveryEmail(recovery, actionLink, apiKey, from).catch(() => false);
      }
    }
  } catch {
    failure = "EMAIL_PROVIDER_FAILED";
  }

  const { data: finalized, error: finalizeError } = await service.rpc("finalize_school_teacher_password_recovery", {
    p_request_id: recovery.requestId, p_sent: sent, p_failure_category: sent ? null : failure,
  });
  if (finalizeError || finalized !== true) return respond({ error: "RECOVERY_AUDIT_FAILED" }, 500);
  return sent
    ? respond({ sent: true })
    : respond({ error: failure === "NOT_CONFIGURED" ? "DELIVERY_NOT_CONFIGURED" : "DELIVERY_FAILED" }, 502);
});
