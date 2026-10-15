import { useEffect, useRef, useState, } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useSchoolContext } from "../../features/context/SchoolContext";
const SIDEBAR_STORAGE_KEY = "ourschool.sidebar.collapsed";
export function AppShell({ children, }) {
    const school = useSchoolContext();
    const location = useLocation();
    const mainContentRef = useRef(null);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        return (window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
    });
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    useEffect(() => {
        if (!mobileMenuOpen)
            return;
        function closeOnEscape(event) {
            if (event.key === "Escape")
                setMobileMenuOpen(false);
        }
        document.addEventListener("keydown", closeOnEscape);
        return () => document.removeEventListener("keydown", closeOnEscape);
    }, [mobileMenuOpen]);
    useEffect(() => {
        if (!mobileMenuOpen)
            return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [mobileMenuOpen]);
    useEffect(() => {
        window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
    }, [sidebarCollapsed]);
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => {
            mainContentRef.current?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [location.pathname]);
    return (<div id="school-app-shell" className={`app-shell ${sidebarCollapsed
            ? "app-shell-sidebar-collapsed"
            : ""}`}>
      <Sidebar collapsed={sidebarCollapsed && !mobileMenuOpen} mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} onToggle={() => setSidebarCollapsed((current) => !current)}/>
      {mobileMenuOpen && <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation" onClick={() => setMobileMenuOpen(false)}/>}

      <div className="app-main">
        <Topbar menuOpen={mobileMenuOpen} onOpenMenu={() => setMobileMenuOpen(true)}/>
        {!school.loading && school.schoolProfileStatus === "REQUIRES_REPAIR" && <div className="school-configuration-alert" role="alert"><span><strong>School setup requires attention</strong><small>The required School Profile is missing or incomplete. Platform Administration has been notified.</small></span><button type="button" className="secondary-button" onClick={() => void school.refresh()}>Retry</button></div>}
        {school.error && <div className="school-configuration-alert school-context-error" role="alert"><span><strong>School context could not be loaded</strong><small>{school.error}</small></span><button type="button" className="secondary-button" onClick={() => void school.refresh()}>Retry</button></div>}

        <main id="main-content" className="content" ref={mainContentRef} tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>);
}
