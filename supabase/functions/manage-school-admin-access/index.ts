import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Action = "REVOKE_INVITATION" | "UNLOCK" | "DISABLE" | "RESTORE" | "PASSWORD_RESET";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

  const service = createClient(url, key, { auth: { persistSession: false } });
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: identity } = await service.auth.getUser(bearer);
  if (!identity.user) return json({ error: "AUTHENTICATION_REQUIRED" }, 401);

  const { data: actor } = await service.from("platform_admins").select("id").eq("auth_user_id", identity.user.id).eq("is_active", true).maybeSingle();
  if (!actor) return json({ error: "PLATFORM_ADMIN_REQUIRED" }, 403);

  const body = await request.json().catch(() => null) as { schoolId?: string; action?: Action; reason?: string } | null;
  const action = body?.action;
  const reason = body?.reason?.trim();
  if (!body?.schoolId || !action || !reason) return json({ error: "SCHOOL_ACTION_AND_REASON_REQUIRED" }, 400);
  if (!(["REVOKE_INVITATION", "UNLOCK", "DISABLE", "RESTORE", "PASSWORD_RESET"] as Action[]).includes(action)) return json({ error: "INVALID_ADMIN_ACTION" }, 400);

  const { data: invitation } = await service.from("school_admin_invitations")
    .select("id,school_id,email,invited_user_id,status")
    .eq("school_id", body.schoolId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!invitation) return json({ error: "SCHOOL_ADMIN_NOT_FOUND" }, 404);

  const { data: appUser } = invitation.invited_user_id
    ? await service.from("users").select("id,auth_user_id,account_status,is_active").eq("auth_user_id", invitation.invited_user_id).maybeSingle()
    : { data: null };

  const audit = async (newState: Record<string, unknown>) => {
    await service.from("platform_audit_logs").insert({
      platform_admin_id: actor.id, school_id: body.schoolId, action: `SCHOOL_ADMIN_${action}`,
      target_type: "school_administrator", target_id: appUser?.id ?? invitation.id,
      previous_state: { invitation_status: invitation.status, account_status: appUser?.account_status ?? null, is_active: appUser?.is_active ?? null },
      new_state: newState, reason, session_metadata: { source: "platform_control_centre" },
    });
  };

  if (action === "REVOKE_INVITATION") {
    if (!["PENDING", "SENT", "DELIVERED"].includes(invitation.status)) return json({ error: "INVITATION_NOT_OPEN" }, 409);
    const now = new Date().toISOString();
    await service.from("school_admin_invitations").update({ status: "REVOKED", revoked_at: now, updated_at: now }).eq("id", invitation.id);
    await service.from("school_invitation_events").insert({ invitation_id: invitation.id, school_id: body.schoolId, event_type: "REVOKED", actor_platform_admin_id: actor.id, safe_metadata: { reason } });
    await audit({ invitation_status: "REVOKED" });
    return json({ status: "REVOKED" });
  }

  if (!appUser?.auth_user_id) return json({ error: "ADMIN_IDENTITY_NOT_LINKED" }, 409);

  if (action === "DISABLE" || action === "UNLOCK" || action === "RESTORE") {
    const enabled = action !== "DISABLE";
    const accountStatus = enabled ? "ACTIVE" : "DISABLED";
    const authResult = await service.auth.admin.updateUserById(appUser.auth_user_id, { ban_duration: enabled ? "none" : "876000h" });
    if (authResult.error) return json({ error: "AUTH_ACCOUNT_UPDATE_FAILED" }, 502);
    await service.from("users").update({ is_active: enabled, account_status: accountStatus }).eq("id", appUser.id);
    await service.from("school_memberships").update({ status: enabled ? "ACTIVE" : "INACTIVE" }).eq("school_id", body.schoolId).eq("user_id", appUser.id);
    await audit({ account_status: accountStatus, is_active: enabled });
    return json({ status: accountStatus });
  }

  const appUrl = Deno.env.get("PUBLIC_APP_URL")?.trim().replace(/\/+$/, "");
  if (!appUrl) return json({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
  const reset = await service.auth.resetPasswordForEmail(invitation.email, { redirectTo: `${appUrl}/reset-password/school` });
  if (reset.error) return json({ error: "PASSWORD_RESET_EMAIL_FAILED" }, 502);
  await service.from("users").update({ must_change_password: true }).eq("id", appUser.id);
  await audit({ password_reset: "SENT", must_change_password: true });
  return json({ status: "PASSWORD_RESET_SENT" });
});
