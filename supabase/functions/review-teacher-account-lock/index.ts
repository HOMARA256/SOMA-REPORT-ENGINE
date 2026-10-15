import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { teacherAccountReviewDecision } from "./accountReviewDecision.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const bearer = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: identity, error: identityError } = await service.auth.getUser(bearer);
  if (identityError || !identity.user) return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
  const { data: actor } = await service.from("platform_admins").select("id").eq("auth_user_id", identity.user.id).eq("is_active", true).maybeSingle();
  if (!actor) return respond({ error: "PLATFORM_ADMIN_REQUIRED" }, 403);

  const input = await request.json().catch(() => null) as { conversationId?: string; invitationId?: string; invitedEmail?: string; reason?: string } | null;
  const conversationId = input?.conversationId?.trim();
  const invitationId = input?.invitationId?.trim();
  const invitedEmail = input?.invitedEmail?.trim().toLowerCase();
  const reason = input?.reason?.trim();
  if (!conversationId || !reason || reason.length < 8 || reason.length > 1000 || (!invitationId && !invitedEmail)) return respond({ error: "REVIEW_FIELDS_REQUIRED" }, 400);

  const { data: conversation } = await service.from("school_platform_conversations")
    .select("id,school_id,category,related_entity_type,related_entity_id,action_url")
    .eq("id", conversationId).maybeSingle();
  if (!conversation) {
    return respond({ error: "ACCOUNT_REVIEW_TICKET_REQUIRED" }, 404);
  }
  const alreadyLinked = conversation.category === "TEACHER_ACCOUNT_ACCESS"
    && conversation.related_entity_type === "school_teacher_invitation"
    && Boolean(conversation.related_entity_id);
  const staffSupport = conversation.category === "GENERAL_SUPPORT"
    && /^\/staff(?:[/?#]|$)/i.test(conversation.action_url ?? "")
    && !conversation.related_entity_id;
  if (!alreadyLinked && !staffSupport) return respond({ error: "ACCOUNT_REVIEW_TICKET_REQUIRED" }, 404);

  let invitation: { id: string; school_id: string; invited_email: string; invited_name: string; status: string; target_auth_user_id: string | null; accepted_user_id: string | null } | null = null;
  if (alreadyLinked) {
    if (invitationId && conversation.related_entity_id !== invitationId) return respond({ error: "ACCOUNT_REVIEW_TICKET_REQUIRED" }, 404);
    const { data } = await service.from("school_teacher_invitations")
      .select("id,school_id,invited_email,invited_name,status,target_auth_user_id,accepted_user_id")
      .eq("id", conversation.related_entity_id).eq("school_id", conversation.school_id).maybeSingle();
    invitation = data;
  } else {
    if (!invitedEmail || invitationId) return respond({ error: "INVITED_TEACHER_EMAIL_REQUIRED" }, 400);
    const { data: invitations, error: invitationLookupError } = await service.from("school_teacher_invitations")
      .select("id,school_id,invited_email,invited_name,status,target_auth_user_id,accepted_user_id")
      .eq("school_id", conversation.school_id);
    if (invitationLookupError) return respond({ error: "TEACHER_INVITATION_LOOKUP_FAILED" }, 500);
    const matches = (invitations ?? []).filter((item) => item.invited_email.trim().toLowerCase() === invitedEmail && !["REVOKED", "DECLINED"].includes(item.status));
    if (matches.length > 1) return respond({ error: "MULTIPLE_TEACHER_INVITATIONS_MATCH" }, 409);
    invitation = matches[0] ?? null;
  }
  if (!invitation || ["REVOKED", "DECLINED"].includes(invitation.status)) return respond({ error: "TEACHER_INVITATION_NOT_REVIEWABLE" }, 409);

  let profileQuery = service.from("users").select("id,auth_user_id,email,is_active,account_status");
  if (invitation.accepted_user_id) profileQuery = profileQuery.eq("id", invitation.accepted_user_id);
  else if (invitation.target_auth_user_id) profileQuery = profileQuery.eq("auth_user_id", invitation.target_auth_user_id);
  else profileQuery = profileQuery.eq("email", invitation.invited_email);
  const { data: profile, error: profileError } = await profileQuery.maybeSingle();
  if (profileError || !profile?.auth_user_id) return respond({ error: "TEACHER_ACCOUNT_NOT_LINKED" }, 409);
  if (invitation.target_auth_user_id && profile.auth_user_id !== invitation.target_auth_user_id) return respond({ error: "INVITATION_ACCOUNT_MISMATCH" }, 409);
  const { data: authRecord, error: authLookupError } = await service.auth.admin.getUserById(profile.auth_user_id);
  if (authLookupError || !authRecord.user) return respond({ error: "AUTH_ACCOUNT_LOOKUP_FAILED" }, 502);
  const authBanUntil = authRecord.user.banned_until ? Date.parse(authRecord.user.banned_until) : 0;
  const authStillBanned = Number.isFinite(authBanUntil) && authBanUntil > Date.now();
  const decision = teacherAccountReviewDecision(profile.account_status, profile.is_active, authStillBanned);
  if (decision === "MANUAL_REVIEW") return respond({ error: "ACCOUNT_STATUS_REQUIRES_MANUAL_REVIEW" }, 409);

  if (!alreadyLinked) {
    const { error: linkError } = await service.from("school_platform_conversations").update({
      category: "TEACHER_ACCOUNT_ACCESS",
      subject: `Teacher account access review · ${invitation.invited_name}`.slice(0, 180),
      related_entity_type: "school_teacher_invitation",
      related_entity_id: invitation.id,
    }).eq("id", conversation.id).eq("school_id", invitation.school_id);
    if (linkError) return respond({ error: "ACCOUNT_REVIEW_TICKET_LINK_FAILED" }, 500);
  }
  if (decision !== "REACTIVATE") return respond({
    status: decision,
    accountStatus: profile.account_status,
    teacherName: invitation.invited_name,
    teacherEmail: invitation.invited_email,
    schoolId: invitation.school_id,
    invitationId: invitation.id,
    membershipChanged: false,
    invitationAccepted: false,
  });

  const previous = { is_active: profile.is_active, account_status: profile.account_status, auth_banned_until: authRecord.user.banned_until ?? null };
  const { error: auditError } = await service.from("platform_audit_logs").insert({
    platform_admin_id: actor.id,
    school_id: invitation.school_id,
    action: "TEACHER_GLOBAL_ACCOUNT_REACTIVATED",
    target_type: "SOMA_TEACHER_ACCOUNT",
    target_id: profile.id,
    previous_state: previous,
    new_state: { is_active: true, account_status: "ACTIVE", invitation_id: invitation.id, conversation_id: conversation.id },
    reason,
    session_metadata: { source: "teacher_account_access_review", platform_auth_user_id: identity.user.id },
  });
  if (auditError) return respond({ error: "PLATFORM_AUDIT_WRITE_FAILED" }, 500);

  const { error: authError } = await service.auth.admin.updateUserById(profile.auth_user_id, { ban_duration: "none" });
  if (authError) return respond({ error: "AUTH_ACCOUNT_UPDATE_FAILED", auditRecorded: true }, 502);
  const { error: updateError } = await service.from("users").update({ is_active: true, account_status: "ACTIVE" }).eq("id", profile.id);
  if (updateError) return respond({ error: "ACCOUNT_STATUS_UPDATE_FAILED", authUnblocked: true, auditRecorded: true }, 500);

  return respond({ status: "REACTIVATED", teacherName: invitation.invited_name, teacherEmail: invitation.invited_email, schoolId: invitation.school_id, membershipChanged: false, invitationAccepted: false });
});
