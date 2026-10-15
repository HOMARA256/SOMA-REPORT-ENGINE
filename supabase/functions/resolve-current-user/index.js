import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization,x-client-info,apikey,content-type" };
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response("ok", { headers: cors });
    if (request.method !== "POST")
        return respond({ error: "METHOD_NOT_ALLOWED" }, 405);
    const url = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey)
        return respond({ error: "SERVER_CONFIGURATION_ERROR" }, 500);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const bearer = request.headers.get("Authorization") ?? "";
    const { data: identity, error } = await service.auth.getUser(bearer.replace(/^Bearer\s+/i, ""));
    if (error || !identity.user)
        return respond({ error: "AUTHENTICATION_REQUIRED" }, 401);
    const { data: platform } = await service.from("platform_admins").select("id,full_name,email,is_active,mfa_required,profile_photo_path").eq("auth_user_id", identity.user.id).maybeSingle();
    if (platform) {
        if (!platform.is_active)
            return respond({ error: "ACCOUNT_INACTIVE", message: "This Platform Administrator account is inactive." }, 403);
        await service.from("platform_admins").update({ last_login_at: new Date().toISOString() }).eq("id", platform.id);
        const profilePhotoUrl = await signedProfilePhotoUrl(service, platform.profile_photo_path);
        return respond({ user: { id: platform.id, email: platform.email, name: platform.full_name, role: "PLATFORM_ADMIN", schoolId: null, status: "ACTIVE", profilePhotoPath: platform.profile_photo_path, profilePhotoUrl, mustChangePassword: Boolean(identity.user.user_metadata?.must_change_password), mfaRequired: platform.mfa_required, permissions: ["platform.manage"] } });
    }
    const { data: appUser } = await service.from("users").select("id,email,full_name,username,account_status,must_change_password,is_active,profile_photo_path").eq("auth_user_id", identity.user.id).maybeSingle();
    if (!appUser)
        return respond({ error: "PROFILE_NOT_FOUND", message: "No SOMA REPORT ENGINE user profile is connected to this account." }, 403);
    if (!appUser.is_active || appUser.account_status !== "ACTIVE")
        return respond({ error: "ACCOUNT_INACTIVE", message: "This user account is inactive." }, 403);
    // School choice is stored server-side and is only honored when the user still
    // has an active membership. A stale preference can never grant tenant access.
    const [{ data: preference }, { data: memberships }] = await Promise.all([
        service.from("school_user_context_preferences").select("school_id").eq("auth_user_id", identity.user.id).maybeSingle(),
        service.from("school_memberships").select("id,school_id,role_id,status,updated_at").eq("user_id", appUser.id).eq("status", "ACTIVE").order("updated_at", { ascending: false }),
    ]);
    const membership = (memberships ?? []).find((item) => item.school_id === preference?.school_id) ?? (memberships ?? [])[0] ?? null;
    if (!membership)
        return respond({ error: "MEMBERSHIP_NOT_FOUND", message: "No school membership is connected to this account." }, 403);
    if (membership.status !== "ACTIVE")
        return respond({ error: "MEMBERSHIP_INACTIVE", message: "This school membership is inactive." }, 403);
    const [{ data: school }, { data: role }] = await Promise.all([
        service.from("schools").select("id,official_name,school_code,is_active,lifecycle_status,logo_url").eq("id", membership.school_id).maybeSingle(),
        service.from("roles").select("id,code,name").eq("id", membership.role_id).maybeSingle(),
    ]);
    if (!school)
        return respond({ error: "SCHOOL_NOT_FOUND", message: "The connected school no longer exists." }, 403);
    if (!school.is_active || ["SUSPENDED", "ARCHIVED"].includes(school.lifecycle_status))
        return respond({ error: "SCHOOL_SUSPENDED", message: "Your school access is suspended. Your password remains valid; contact SOMA REPORT ENGINE Support." }, 403);
    const { data: rolePermissions } = role ? await service.from("role_permissions").select("permissions(code)").eq("role_id", role.id) : { data: [] };
    const permissions = (rolePermissions ?? []).map((item) => { const permission = item.permissions; return permission?.code; }).filter(Boolean);
    await service.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", appUser.id);
    const profilePhotoUrl = await signedProfilePhotoUrl(service, appUser.profile_photo_path);
    return respond({ user: { id: appUser.id, username: appUser.username, email: appUser.email, name: appUser.full_name, role: role?.code ?? "STAFF", roleLabel: role?.name ?? "Staff User", schoolId: school.id, schoolCode: school.school_code, schoolName: school.official_name, schoolLogo: school.logo_url, status: appUser.account_status, membershipStatus: membership.status, profilePhotoPath: appUser.profile_photo_path, profilePhotoUrl, mustChangePassword: appUser.must_change_password || Boolean(identity.user.user_metadata?.must_change_password), permissions } });
});
async function signedProfilePhotoUrl(client, path) {
    if (!path)
        return null;
    const { data, error } = await client.storage.from("profile-photos").createSignedUrl(path, 60 * 60 * 24);
    return error ? null : data.signedUrl;
}
