import { Activity, BookOpen, CheckSquare, ChevronDown, ClipboardCheck, FileCheck2, FileText, GraduationCap, Layers3, Users, UserCog } from "lucide-react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { useSchoolContext } from "../context/SchoolContext";
import { AcademicSetupHealthPage } from "./AcademicSetupHealthPage";
import { currentUser } from "../../config/currentUser";
import { isWorkspaceSectionActive } from "./workspaceNavigation";

const sections = [
  { label: "Overview & setup health", path: "/school/o-level", icon: Activity },
  { label: "Classes & streams", path: "/school/o-level/classes", icon: Layers3 },
  { label: "Subjects & offerings", path: "/school/o-level/subjects", icon: BookOpen },
  { label: "Learners & enrolment", path: "/school/o-level/learners", icon: GraduationCap },
  { label: "Teachers & allocations", path: "/school/o-level/teachers", icon: UserCog },
  { label: "Assessments", path: "/school/o-level/assessments", icon: ClipboardCheck },
  { label: "Marks & missing marks", path: "/school/o-level/marks", icon: FileText },
  { label: "Moderation & approvals", path: "/school/o-level/moderation", icon: CheckSquare },
  { label: "Results & reports", path: "/school/o-level/results", icon: FileCheck2 },
];

export function OLevelWorkspace() {
  const context = useSchoolContext();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const isOverview = location.pathname === "/school/o-level";
  const isSectionActive = (path: string) => isWorkspaceSectionActive(location.pathname, path);
  const primarySections = sections.slice(0, 4);
  const overflowSections = sections.slice(4);
  const activeOverflowSection = overflowSections.find((item) => isSectionActive(item.path));
  const overflowActive = Boolean(activeOverflowSection);
  return <div className="olevel-workspace">
    <header className="olevel-workspace-header">
      <div><span className="eyebrow">SCHOOL CONTROL CENTRE · S1–S4</span><h1>O-Level Workspace</h1><p>One connected workspace for the lower-secondary academic cycle.</p></div>
      <div className="olevel-context"><span><small>School</small><strong>{context.schoolName || "Loading school…"}</strong></span><span><small>Academic year</small><strong>{context.academicYearName || "Not configured"}</strong></span><span><small>Current term</small><strong>{context.termName || "Not configured"}</strong></span><span><small>Signed-in role</small><strong>{String(currentUser.role || "School user").replaceAll("_", " ")}</strong></span></div>
    </header>
    <nav className="olevel-workspace-nav workspace-section-nav" aria-label="O-Level Workspace sections">
      {primarySections.map(({ label, path, icon: Icon }) => <Link key={path} to={path} aria-current={isSectionActive(path) ? "page" : undefined} className={isSectionActive(path) ? "active" : ""}><Icon size={17}/><span>{label}</span></Link>)}
      <div className="workspace-overflow">
        <button type="button" className={overflowActive ? "workspace-overflow-trigger active" : "workspace-overflow-trigger"} aria-label={activeOverflowSection ? `${activeOverflowSection.label} section menu` : "More workspace sections"} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}>
          <span className="workspace-overflow-current">{activeOverflowSection?.label ?? "More"}</span><ChevronDown size={16} aria-hidden="true" />
        </button>
        {moreOpen && <div className="workspace-overflow-menu" role="menu">
          {overflowSections.map(({ label, path, icon: Icon }) => <Link key={path} to={path} role="menuitem" aria-current={isSectionActive(path) ? "page" : undefined} className={isSectionActive(path) ? "active" : ""} onClick={() => setMoreOpen(false)}><Icon size={16} aria-hidden="true" /><span>{label}</span></Link>)}
        </div>}
      </div>
    </nav>
    <main className="olevel-workspace-content">{isOverview && <Overview/>}<Outlet/></main>
  </div>;
}

function Overview() {
  const context = useSchoolContext();
  return <section className="olevel-overview">
    <div className="olevel-welcome"><div><span className="eyebrow">AUTHORITATIVE S1–S4 WORKSPACE</span><h2>O-Level academic operations</h2><p>Classes, curriculum, enrolment, allocations and marks share the school's persistent academic records.</p></div><GraduationCap size={38}/></div>
    <div className="olevel-overview-grid">
      <Link to="/school/o-level/classes"><Layers3/><strong>Classes & streams</strong><span>Manage S1–S4 classes and their streams</span></Link>
      <Link to="/school/o-level/subjects"><BookOpen/><strong>Subjects & offerings</strong><span>Activate curriculum subjects and offer them to classes</span></Link>
      <Link to="/school/o-level/learners"><Users/><strong>Learners & enrolment</strong><span>Review learner placement and subject selections</span></Link>
      <Link to="/school/o-level/teachers"><UserCog/><strong>Teachers & allocations</strong><span>Connect staff to active class offerings</span></Link>
      <Link to="/school/o-level/assessments"><ClipboardCheck/><strong>Assessments</strong><span>Configure term assessment work</span></Link>
      <Link to="/school/o-level/marks"><FileText/><strong>Marks</strong><span>Enter marks and resolve incomplete records</span></Link>
      <Link to="/school/o-level/moderation"><CheckSquare/><strong>Moderation & approvals</strong><span>Review and authorize results</span></Link>
      <Link to="/school/o-level/results"><FileCheck2/><strong>Results & reports</strong><span>Review learner outcomes and report cards</span></Link>
    </div>
    <div className="olevel-health-embed"><AcademicSetupHealthPage/></div>
    {!context.academicYearId && <div className="olevel-setup-alert"><strong>Academic year is not configured.</strong><span>Set up the shared academic year and term before creating classes or recording marks.</span><Link to="/setup/academic-years">Open Academic Setup</Link></div>}
  </section>;
}
