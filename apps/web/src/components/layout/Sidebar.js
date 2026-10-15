import { Building2, ChevronLeft, ChevronRight, UsersRound, X, } from "lucide-react";
import { NavLink } from "react-router-dom";
import { navigationGroups } from "../../config/navigation";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../../features/context/SchoolContext";
export function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose, }) {
    const school = useSchoolContext();
    const groups = currentUser.role === "PARENT_GUARDIAN"
        ? [...navigationGroups, { title: "FAMILY", items: [{ label: "Linked learners", path: "/guardian/learners", icon: UsersRound, permission: "dashboard.view" }] }]
        : navigationGroups;
    const visibleGroups = groups
        .map((group) => ({
        ...group,
        items: group.items.filter((item) => (currentUser.role === "PARENT_GUARDIAN" && item.path === "/guardian/learners")
            || currentUser.permissions.includes(item.permission)),
    }))
        .filter((group) => group.items.length > 0);
    return (<aside id="school-navigation-drawer" className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">{school.schoolLogo ? <img src={school.schoolLogo} alt=""/> : <Building2 size={25} aria-hidden="true"/>}</div>

        {!collapsed && (<div className="brand-copy">
            <strong>{school.loading ? "Loading…" : school.schoolShortName || school.schoolName}</strong>
            <span>Academic Workspace</span>
          </div>)}

        <button type="button" className="mobile-nav-close" onClick={onMobileClose} aria-label="Close navigation">
          <X size={20} aria-hidden="true"/>
        </button>
      </div>

      <button type="button" className="sidebar-toggle" onClick={onToggle} aria-controls="school-navigation-drawer" aria-expanded={!collapsed} aria-label={collapsed
            ? "Expand sidebar"
            : "Collapse sidebar"} title={collapsed
            ? "Expand sidebar"
            : "Collapse sidebar"}>
        {collapsed ? (<ChevronRight size={18} aria-hidden="true"/>) : (<ChevronLeft size={18} aria-hidden="true"/>)}
      </button>

      <nav className="sidebar-nav" aria-label="Main navigation">
        {visibleGroups.map((group) => (<div className="nav-group" key={group.title}>
            {!collapsed && (<p className="nav-section-title">
                {group.title}
              </p>)}

            <div className="nav-group-items">
              {group.items.map(({ label, path, icon: Icon, }) => (<NavLink key={path} to={path} onClick={onMobileClose} title={collapsed
                    ? label
                    : undefined} className={({ isActive }) => `nav-item ${isActive
                    ? "active"
                    : ""}`}>
                    <Icon className="nav-icon" size={19} strokeWidth={1.8} aria-hidden="true"/>

                    {!collapsed && (<span>{label}</span>)}
                  </NavLink>))}
            </div>
          </div>))}
      </nav>

      <div className="sidebar-footer">
        <div className="system-status">
          <span className="status-dot" aria-hidden="true"/>

          {!collapsed && (<div>
              <strong>Review workspace</strong>
              <span>Live connection enabled</span>
            </div>)}
        </div>

        {!collapsed && (<span className="version">
            SOMA REPORT ENGINE v0.1.0
          </span>)}
      </div>
    </aside>);
}
