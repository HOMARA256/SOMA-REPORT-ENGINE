import { Bell, BookOpenCheck, Building2, CalendarDays, ChevronDown, LogOut, Menu, Settings, UserRound, } from "lucide-react";
import { useEffect, useRef, useState, } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../../features/context/SchoolContext";
import { FullscreenButton } from "./FullscreenButton";
import { BackNavigationButton } from "./BackNavigationButton";
import { NotificationCountBadge, useUnreadMessageCount } from "../../features/notifications/useUnreadMessageCount.tsx";
export function Topbar({ menuOpen, onOpenMenu, }) {
    const navigate = useNavigate();
    const location = useLocation();
    const school = useSchoolContext();
    const unreadMessageCount = useUnreadMessageCount(supabase);
    const platformSchoolSelection = currentUser.role === "PLATFORM_ADMIN" && location.pathname.startsWith("/platform/schools");
    const [accountOpen, setAccountOpen] = useState(false);
    const [profilePhotoUrl, setProfilePhotoUrl] = useState(currentUser.profilePhotoUrl ?? null);
    const accountRef = useRef(null);
    useEffect(() => {
        function handleOutsideClick(event) {
            if (accountRef.current &&
                !accountRef.current.contains(event.target)) {
                setAccountOpen(false);
            }
        }
        document.addEventListener("mousedown", handleOutsideClick);
        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, []);
    useEffect(() => {
        const refreshPhoto = (event) => {
            const detail = event.detail;
            setProfilePhotoUrl(detail?.url ?? null);
        };
        window.addEventListener("soma-profile-photo-updated", refreshPhoto);
        return () => window.removeEventListener("soma-profile-photo-updated", refreshPhoto);
    }, []);
    function handleLogout() {
        setAccountOpen(false);
        void supabase?.auth.signOut({ scope: "local" });
        navigate("/login");
    }
    return (<header className="topbar">
      <div className="mobile-brand">
        <button type="button" className="mobile-menu-button" onClick={onOpenMenu} aria-label="Open navigation" aria-controls="school-navigation-drawer" aria-expanded={menuOpen}>
          <Menu size={21} aria-hidden="true"/>
        </button>
        <strong>{school.loading ? "Loading…" : school.schoolShortName}</strong>
      </div>

      <div className="context-controls">
        <div className="context-field context-school">
          <span>School</span>

          {school.loading ? <div className="context-school-skeleton" aria-label="Loading school context"/> : platformSchoolSelection ? <div className="select-wrapper"><Building2 size={17} aria-hidden="true"/><select aria-label="Subscribed school" value={school.schoolId} onChange={event => school.selectSchool(event.target.value)}>{school.schools.map(item => <option key={item.schoolId} value={item.schoolId}>{item.schoolName}</option>)}</select></div> : <div className="select-wrapper context-school-select">{school.schoolLogo ? <img src={school.schoolLogo} alt=""/> : <Building2 size={17} aria-hidden="true"/>}<select aria-label="School" value={school.schoolId} onChange={event => school.selectSchool(event.target.value)}>{school.schools.map(item => <option key={item.schoolId} value={item.schoolId}>{item.schoolName}</option>)}</select></div>}
        </div>

        <label className="context-field">
          <span>Academic Year</span>

          <div className="select-wrapper">
            <CalendarDays size={17} aria-hidden="true"/>

            <select aria-label="Academic Year" value={school.academicYearId || "CREATE"} disabled={school.loading || !school.schoolId} onChange={event => event.target.value === "CREATE" ? navigate("/setup/academic-years") : school.selectAcademicYear(event.target.value)}>
              {!school.academicYears.length && <option value="CREATE">Create Academic Year</option>}
              {school.academicYears.map(year => <option value={year.id} key={year.id}>{year.name}</option>)}
            </select>
          </div>
        </label>

        <label className="context-field">
          <span>Term</span>

          <div className="select-wrapper">
            <BookOpenCheck size={17} aria-hidden="true"/>

            <select aria-label="Term" value={school.termId || "CREATE"} disabled={school.loading || !school.academicYearId} onChange={event => event.target.value === "CREATE" ? navigate("/setup/academic-years") : school.selectTerm(event.target.value)}>
              {!school.terms.length && <option value="CREATE">Create Term</option>}
              {school.terms.map(term => <option value={term.id} key={term.id}>{term.name}</option>)}
            </select>
          </div>
        </label>
      </div>

      <div className="user-area">
        <FullscreenButton />
        <BackNavigationButton />
        <button type="button" className="topbar-icon-button" aria-label={unreadMessageCount ? `Notifications, ${unreadMessageCount} unread messages` : "Notifications"} title={unreadMessageCount ? `${unreadMessageCount} unread messages` : "Notifications"} onClick={() => navigate("/notifications")}>
          <Bell size={19} strokeWidth={1.8}/>
          <NotificationCountBadge count={unreadMessageCount}/>
        </button>

        <div className="account-wrapper" ref={accountRef}>
          <button type="button" className="user-account-trigger" onClick={() => setAccountOpen((current) => !current)} aria-expanded={accountOpen} aria-haspopup="menu">
            <div className="user-avatar" aria-hidden="true">
              {profilePhotoUrl ? <img src={profilePhotoUrl} alt=""/> : currentUser.initials}
            </div>

            <div className="user-details">
              <strong>
                {currentUser.name}
              </strong>

              <span>
                {currentUser.roleLabel}
              </span>
            </div>

            <ChevronDown size={17} className={accountOpen
            ? "account-chevron-open"
            : ""} aria-hidden="true"/>
          </button>

          {accountOpen && (<div className="account-menu" role="menu">
              <div className="account-menu-header">
                <strong>
                  {currentUser.name}
                </strong>

                <span>
                  {currentUser.email}
                </span>

                <small>
                  {currentUser.roleLabel}
                </small>
              </div>

              <div className="account-menu-divider"/>

              <button type="button" role="menuitem" onClick={() => {
                setAccountOpen(false);
                navigate("/profile");
            }}>
                <UserRound size={17} aria-hidden="true"/>

                My Profile
              </button>

              {currentUser.permissions.includes("settings.manage") && (<button type="button" role="menuitem" onClick={() => {
                    setAccountOpen(false);
                    navigate("/settings");
                }}>
                  <Settings size={17} aria-hidden="true"/>

                  Settings
                </button>)}

              <div className="account-menu-divider"/>

              <button type="button" role="menuitem" className="logout-menu-item" onClick={handleLogout}>
                <LogOut size={17} aria-hidden="true"/>

                Log Out
              </button>
            </div>)}
        </div>
      </div>
    </header>);
}
