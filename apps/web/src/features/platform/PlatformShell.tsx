import { Activity, Bell, Building2, ChevronLeft, CreditCard, Database, HeartPulse, LayoutDashboard, LogOut, MapPinned, Menu, MessageCircleMore, ReceiptText, Settings, ShieldCheck, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, NavLink, useLocation, useNavigate } from "react-router-dom";
import { usePlatformWorkspace } from "./PlatformWorkspace";
import { platformSupabase as supabase } from "../../config/supabaseClient";
import { FullscreenButton } from "../../components/layout/FullscreenButton";
import { BackNavigationButton } from "../../components/layout/BackNavigationButton";
import { NotificationCountBadge, useUnreadMessageCount } from "../notifications/useUnreadMessageCount.tsx";

const navigation = [
  ["Dashboard", "/platform/dashboard", LayoutDashboard],
  ["Schools", "/platform/schools", Building2],
  ["Subscriptions", "/platform/subscriptions", CreditCard],
  ["Payments", "/platform/payments", ReceiptText],
  ["Notifications", "/platform/notifications", Bell],
  ["School Communications", "/platform/messages", MessageCircleMore],
  ["Payment Settings", "/platform/settings/payments", CreditCard],
  ["Subject Catalogue", "/platform/catalogue/subjects", Database],
  ["Location Catalogue", "/platform/catalogue/locations", MapPinned],
  ["System Health", "/platform/system/health", HeartPulse],
  ["Security", "/platform/security", ShieldCheck],
  ["Audit", "/platform/audit", Activity],
  ["Settings", "/platform/settings", Settings],
] as const;

export function PlatformAdminGuard({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    async function verify() {
      if (!supabase) return active && setAuthorized(false);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return active && setAuthorized(false);
      const { data: administrator } = await supabase.from("platform_admins").select("id").eq("auth_user_id", userData.user.id).eq("is_active", true).maybeSingle();
      if (active) setAuthorized(Boolean(administrator));
    }
    void verify();
    const { data } = supabase?.auth.onAuthStateChange(() => void verify()) ?? { data: { subscription: null } };
    return () => { active = false; data.subscription?.unsubscribe(); };
  }, []);
  if (authorized === null) return <main className="auth-checking" aria-live="polite">Verifying platform authorization…</main>;
  if (!authorized) return <Navigate to="/platform/login" replace/>;
  return children;
}

export function PlatformShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = usePlatformWorkspace();
  const unreadMessageCount = useUnreadMessageCount(supabase);
  useEffect(() => {
    document.title = "SOMA REPORT ENGINE | Platform Control Centre";
  }, [location.pathname]);
  const selectedId = location.pathname.match(/^\/platform\/schools\/([^/]+)/)?.[1];
  const selectedSchool = selectedId && selectedId !== "new" ? workspace.schoolById(selectedId) : undefined;

  return <div className="platform-shell">
    <aside className={`platform-sidebar ${mobileOpen ? "is-open" : ""}`}>
      <div className="platform-brand"><span><img src="/soma-report-engine-logo.png" alt="" /></span><div><strong>SOMA REPORT ENGINE</strong><small>Platform Control Centre</small></div><button type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={19}/></button></div>
      <nav aria-label="Platform navigation">
        {navigation.map(([label, path, Icon]) => <NavLink key={path} to={path} end={path === "/platform/settings"} onClick={() => setMobileOpen(false)} className={({ isActive }) => isActive ? "active" : ""}><Icon size={18}/><span>{label}</span></NavLink>)}
      </nav>
      <div className="platform-sidebar-status"><span/><div><strong>Core workspace available</strong><small>Payment providers require configuration</small></div></div>
    </aside>
    {mobileOpen && <button className="platform-backdrop" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)}/>} 
    <div className="platform-main">
      <header className="platform-topbar">
        <button className="platform-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button>
        {selectedSchool ? <div className="platform-selected-context"><button type="button" onClick={() => navigate("/platform/schools")}><ChevronLeft size={17}/> All Schools</button><div><small>Selected school</small><strong>{selectedSchool.name}</strong><span>{selectedSchool.accountStatus} · {selectedSchool.plan.toUpperCase()}</span></div></div> : <div className="platform-global-context"><strong>Platform Control Centre</strong><span><i/> System operational</span></div>}
        <div className="platform-topbar-actions"><BackNavigationButton/><FullscreenButton className="platform-fullscreen-button"/><button type="button" className="platform-notification-button" aria-label={unreadMessageCount ? `Platform notifications, ${unreadMessageCount} unread messages` : "Platform notifications"} title={unreadMessageCount ? `${unreadMessageCount} unread messages` : "Platform notifications"} onClick={() => navigate("/platform/notifications")}><Bell size={18}/><NotificationCountBadge count={unreadMessageCount}/></button><button type="button" className="platform-account" onClick={() => navigate("/platform/account")}><span>PA</span><div><strong>Platform Administrator</strong><small>One authorised identity</small></div></button><button type="button" aria-label="Sign out" onClick={() => { workspace.signOut(); navigate("/platform/login"); }}><LogOut size={18}/></button></div>
      </header>
      {workspace.notice && <div className="platform-notice" role="status"><span>{workspace.notice}</span><button type="button" onClick={workspace.clearNotice}>Dismiss</button></div>}
      <main className="platform-content">{children}</main>
    </div>
  </div>;
}
