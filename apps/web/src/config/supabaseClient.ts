import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.generated";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigured = Boolean(supabaseUrl && publishableKey);

function getSchoolAuthTabId() {
  if (typeof window === "undefined") return "server";
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
  ? createClient<Database>(supabaseUrl!, publishableKey!, {
      // School accounts are commonly used side-by-side on a shared workstation.
      // Keep their tokens and auth broadcasts scoped to this browser tab, not every
      // open school workspace in the same browser profile.
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: `ourschool-school-auth-${schoolAuthTabId}`, storage: typeof window === "undefined" ? undefined : window.sessionStorage },
    })
  : null;

export const platformSupabase = supabaseConfigured
  ? createClient<Database>(supabaseUrl!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "ourschool-platform-auth" },
    })
  : null;
