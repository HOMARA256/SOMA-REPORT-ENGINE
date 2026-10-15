import { supabase } from "../../config/supabaseClient";
export async function resolveCurrentIdentity(client = supabase) {
    if (!client)
        return { user: null, error: "Supabase is not configured for this deployment.", code: "NOT_CONFIGURED" };
    const { data, error } = await client.functions.invoke("resolve-current-user", { body: {} });
    if (error || !data?.user)
        return { user: null, error: data?.message ?? "Your authenticated account is not authorised for this workspace.", code: data?.error ?? "IDENTITY_RESOLUTION_FAILED" };
    return { user: data.user, error: "", code: "" };
}
export async function clearAuthenticatedSession() {
    if (supabase)
        await supabase.auth.signOut({ scope: "local" });
}
