import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database.generated";

type Client = SupabaseClient<Database> | null;

export function useUnreadMessageCount(client: Client, schoolId?: string) {
  const [count, setCount] = useState<number | null>(null);
  const refresh = useCallback(async () => {
    if (!client || (schoolId !== undefined && !schoolId)) {
      setCount(0);
      return;
    }
    const { data, error } = schoolId !== undefined
      ? await (client as any).rpc("get_school_unread_notification_count", { p_school_id: schoolId })
      : await (client as any).rpc("get_unread_message_count");
    if (!error) setCount(Math.max(0, Number(data) || 0));
  }, [client, schoolId]);

  useEffect(() => {
    setCount(null);
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onUpdated = () => void refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("soma-notifications-updated", onUpdated);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("soma-notifications-updated", onUpdated);
    };
  }, [refresh]);

  return count;
}

export function NotificationCountBadge({ count }: { count: number | null }) {
  if (!count) return null;
  return <span className="notification-count-badge" aria-hidden="true">{count > 99 ? "99+" : count}</span>;
}
