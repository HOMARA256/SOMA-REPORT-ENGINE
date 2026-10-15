import { createClient } from "@supabase/supabase-js";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);
function getSchoolAuthTabId() {
    if (typeof window === "undefined")
        return "server";
    const tabIdKey = "ourschool-school-auth-tab-id";
    let tabId = window.sessionStorage.getItem(tabIdKey);
    if (!tabId) {
        tabId = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        window.sessionStorage.setItem(tabIdKey, tabId);
    }
    return tabId;
}
const schoolAuthTabId = getSchoolAuthTabId();
export const supabase = supabaseConfigured
    ? createClient(supabaseUrl, publishableKey, {
        // School accounts are commonly used side-by-side on a shared workstation.
        // Keep their tokens and auth broadcasts scoped to this browser tab, not every
        // open school workspace in the same browser profile.
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `ourschool-school-auth-${schoolAuthTabId}`, storage: typeof window === "undefined" ? undefined : window.sessionStorage },
    })
    : null;
export const platformSupabase = supabaseConfigured
    ? createClient(supabaseUrl, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "ourschool-platform-auth" },
    })
    : null;
