import { Building2, CalendarDays, CheckCircle2, ExternalLink, KeyRound, Mail, School, ShieldCheck, UserRound, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import { currentUser } from "../../config/currentUser";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { ProfilePhotoEditor } from "./ProfilePhotoEditor";
import { announceProfilePhotoChange, saveMyProfilePhoto } from "./profilePhotoStorage";
import { DisplayThemeSettings } from "../../components/layout/DisplayThemeSettings";
const permissionLabels = {
    "dashboard.view": "View school dashboard",
    "learners.view": "View learner records",
    "academics.manage": "Manage academic setup",
    "subjects.view": "View school subjects",
    "assessments.view": "View assessment setup",
    "marks.enter": "Enter authorised marks",
    "marks.review": "Review marks and marksheets",
    "marks.moderate": "Moderate submitted marks",
    "results.view": "View calculated results",
    "results.lock": "Lock moderated result scopes",
    "results.approve": "Approve result scopes",
    "analysis.view": "View academic analysis",
    "reports.view": "View report cards",
    "reports.generate": "Prepare report snapshots",
    "reports.narrate": "Write report narratives",
    "reports.publish": "Publish approved reports",
    "users.view": "View school staff and users",
    "users.manage": "Manage school users",
    "imports.manage": "Manage school imports and exports",
    "audit.view": "View school audit history",
    "settings.manage": "Manage school settings",
};
export function UserProfilePage() {
    const [photoUrl, setPhotoUrl] = useState(currentUser.profilePhotoUrl ?? null);
    const workspace = useAcademicWorkspace();
    const schoolContext = useSchoolContext();
    const activeLearners = workspace.learners.filter((item) => item.status === "Active").length;
    const activeStaff = workspace.staff.filter((item) => item.accountStatus === "Active").length;
    return <>
    <section className="user-profile-hero">
      <div className="user-profile-avatar" aria-hidden="true">{photoUrl ? <img src={photoUrl} alt=""/> : currentUser.initials}</div>
      <div><span className="eyebrow">MY PROFILE</span><h1>{currentUser.name}</h1><p>{currentUser.roleLabel} · {schoolContext.schoolName}</p><div className="user-profile-badges"><span className="profile-role-badge">{currentUser.roleLabel}</span><span className={`status-badge ${currentUser.membershipStatus === "ACTIVE" ? "status-active" : "status-inactive"}`}>{currentUser.membershipStatus ?? "Platform account"}</span></div></div>
    </section>

    <section className="panel user-profile-photo-panel"><div className="panel-heading"><div><h2>Profile photo</h2><p>Your optional photo is private. Initials remain visible when you remove it.</p></div></div><ProfilePhotoEditor name={currentUser.name} initials={currentUser.initials} photoUrl={photoUrl} onSave={async (file) => {
            try {
                const saved = await saveMyProfilePhoto(file, currentUser.profilePhotoPath);
                currentUser.profilePhotoPath = saved.path;
                currentUser.profilePhotoUrl = saved.url;
                setPhotoUrl(saved.url);
                announceProfilePhotoChange(saved.url);
                return null;
            }
            catch (cause) {
                return cause instanceof Error ? cause.message : "Profile photo could not be saved.";
            }
        }}/></section>

    <DisplayThemeSettings />
    <section className="profile-context-summary" aria-label="Account context summary">
      <article><Building2 /><span>School</span><strong>{currentUser.schoolCode ?? "Platform"}</strong><small>{schoolContext.schoolName}</small></article>
      <article><ShieldCheck /><span>Role</span><strong>{currentUser.roleLabel}</strong><small>{currentUser.permissions.length} granted capabilities</small></article>
      <article><CalendarDays /><span>Academic context</span><strong>{schoolContext.academicYearName || "No year"} · {schoolContext.termName || "No term"}</strong><small>{schoolContext.termStatus || "Not configured"}</small></article>
      <article><Users /><span>School records</span><strong>{activeLearners} learners</strong><small>{activeStaff} active staff accounts</small></article>
    </section>

    <div className="user-profile-layout">
      <section className="panel user-profile-account"><div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><UserRound size={18}/></div><div><h2>Account identity</h2><p>Identity attached to the current authenticated membership.</p></div></div></div><dl className="profile-details"><ProfileFact label="Full name" value={currentUser.name}/><ProfileFact label="Email address" value={currentUser.email} icon={<Mail size={14}/>}/><ProfileFact label="Account role" value={currentUser.roleLabel}/><ProfileFact label="Membership" value={currentUser.membershipStatus ?? "Platform-wide"}/><ProfileFact label="User reference" value={currentUser.id}/></dl><p className="profile-scope-note"><KeyRound size={16}/> Passwords and sign-in security belong to the authentication provider and are never stored on this profile screen.</p></section>

      <section className="panel user-profile-school"><div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><School size={18}/></div><div><h2>School membership</h2><p>The school scope applied to every academic operation.</p></div></div></div><dl className="profile-details"><ProfileFact label="School" value={schoolContext.schoolName}/><ProfileFact label="School code" value={currentUser.schoolCode ?? "Not applicable"}/><ProfileFact label="Membership role" value={currentUser.roleLabel}/><ProfileFact label="Membership status" value={currentUser.membershipStatus ?? "Not applicable"}/><ProfileFact label="School reference" value={schoolContext.schoolId || "Unavailable"}/></dl><p className="profile-scope-note"><ShieldCheck size={16}/> This school scope is resolved from the signed-in membership and enforced for academic operations.</p></section>
    </div>

    <section className="panel user-profile-permissions"><div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><CheckCircle2 size={18}/></div><div><h2>Access and responsibilities</h2><p>Effective capabilities for this school membership.</p></div></div><span className="profile-permission-count">{currentUser.permissions.length} permissions</span></div><div className="profile-permission-grid">{currentUser.permissions.map((permission) => <div key={permission}><CheckCircle2 size={16}/><span><strong>{permissionLabels[permission] ?? permission}</strong><small>{permission}</small></span></div>)}</div></section>

    <section className="panel user-profile-links"><div className="panel-heading"><div><h2>Connected school areas</h2><p>Open areas available through this membership.</p></div></div><div className="profile-link-grid"><ProfileLink to="/dashboard" label="School dashboard" detail="Current school activity and readiness"/>{currentUser.permissions.includes("users.view") && <ProfileLink to="/people/users" label="Staff & users" detail="School memberships and teaching staff"/>}{currentUser.permissions.includes("settings.manage") && <ProfileLink to="/settings" label="School settings" detail="School-owned configuration"/>}{currentUser.permissions.includes("audit.view") && <ProfileLink to="/audit" label="Audit history" detail="Authorised activity for this school"/>}</div></section>
  </>;
}
function ProfileFact({ label, value, icon }) { return <div><dt>{label}</dt><dd className={icon ? "profile-value-icon" : undefined}>{icon}{value}</dd></div>; }
function ProfileLink({ to, label, detail }) { return <Link to={to}><span><strong>{label}</strong><small>{detail}</small></span><ExternalLink size={16}/></Link>; }
