import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CalendarDays,
  CircleDollarSign,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DashboardMetric, DashboardPanel, DashboardQuickActions, DashboardStatistics, DashboardEmptyState } from "../../components/dashboard/DashboardPrimitives";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import type { Permission } from "../../types/auth";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentLearners } from "../learners/PersistentLearners";
import { usePersistentClassSetup } from "../classes/PersistentClassSetup";
import { usePersistentMarks } from "../marks/PersistentMarks";
import { useUnreadMessageCount } from "../notifications/useUnreadMessageCount";
import { SchoolMessageDashboardCard } from "../notifications/SchoolMessageDashboardCard";
import { usePersistentModeration } from "../marks/PersistentModeration";
import { fetchSchoolTeacherDirectory, type SchoolTeacher } from "../staff/schoolTeacherDirectory";
import { summarizeMarkOfferings } from "./dashboardMetrics";

type StaffState = "loading" | "ready" | "empty" | "error" | "forbidden";

export function Dashboard() {
  if (currentUser.role === "TEACHER") return <TeacherDashboard />;
  return <SchoolDashboard />;
}

function TeacherDashboard() {
  const school = useSchoolContext();
  const marks = usePersistentMarks();
  const unreadMessages = useUnreadMessageCount(supabase, school.schoolId);
  const offerings = marks.workspace.offerings;
  const incompleteCount = offerings.reduce((count, offering) => count + offering.learners.filter((learner) => learner.aoiStatus === "MISSING" || learner.examStatus === "MISSING").length + (marks.submissions[offering.id]?.status === "RETURNED" ? 1 : 0), 0);
  const currentTasks = offerings.filter((offering) => offering.learners.some((learner) => learner.aoiStatus === "MISSING" || learner.examStatus === "MISSING") || marks.submissions[offering.id]?.status === "RETURNED");
  const title = `${school.academicYearName || "Selected year"}${school.termName ? ` · ${school.termName}` : ""}`;
  const pathFor = (offering: (typeof offerings)[number]) => offering.programme === "A_LEVEL" ? "/marks/a-level-entry" : "/marks/entry";
  const queryFor = (offering: (typeof offerings)[number]) => `?offering=${encodeURIComponent(offering.id)}&term=${encodeURIComponent(school.termId || "")}`;

  return <main className="dashboard-page teacher-dashboard">
    <header className="page-heading"><div><span className="eyebrow">TEACHER WORKSPACE</span><h1>My dashboard</h1><p>{school.schoolName || "Selected school"} · {title}</p></div><button type="button" className="secondary-button" onClick={() => { void school.refresh(); void marks.reload(); }} disabled={school.loading || marks.loading}>Refresh dashboard</button></header>
    {school.error && <div className="form-error-message" role="alert">The selected school context could not be verified. Refresh or select an authorized school before continuing.</div>}
    {marks.error && <div className="form-error-message" role="alert">Teaching assignments could not be loaded. Your workspace is not showing an empty result; refresh or contact the School Administrator.</div>}
    <div className="teacher-dashboard-summary">
      <article className="teacher-dashboard-stat"><span>My classes & subjects</span><strong>{marks.loading ? "…" : offerings.length}</strong><small>Active assignments for this school and selected term</small></article>
      <article className="teacher-dashboard-stat"><span>Marks to complete</span><strong>{marks.loading ? "…" : incompleteCount}</strong><small>Only learners in your assigned offerings</small></article>
      <article className="teacher-dashboard-stat"><span>Unread notifications</span><strong>{unreadMessages ?? "…"}</strong><small><Link to="/notifications">Open this school’s notifications</Link></small></article>
    </div>
    <SchoolMessageDashboardCard />
    <section className="panel teacher-dashboard-section"><div className="staff-results-heading"><div><h2>My teaching assignments</h2><p>Assignments come from the selected school, academic year, term, and your active teacher allocations.</p></div></div>
      {marks.loading && <p role="status">Loading authorized assignments…</p>}
      {!marks.loading && !marks.error && offerings.length === 0 && <div className="dashboard-empty-state"><BookOpenCheck size={24}/><strong>No teaching allocations for this term yet</strong><span>Your school membership remains active. The School Administrator can add or update your class and subject allocations at any time.</span></div>}
      {offerings.length > 0 && <div className="teacher-assignment-grid">{offerings.map((offering) => {
        const missing = offering.learners.filter((learner) => learner.aoiStatus === "MISSING" || learner.examStatus === "MISSING").length;
        const submission = marks.submissions[offering.id];
        return <article className="teacher-assignment-card" key={offering.id}><div><span className="eyebrow">{offering.programme === "A_LEVEL" ? "A-LEVEL" : "O-LEVEL"}</span><h3>{offering.className}{offering.streamName ? ` · ${offering.streamName}` : ""}</h3><p>{offering.subjectCode} · {offering.subjectName}</p></div><dl><div><dt>Learners</dt><dd>{offering.learners.length}</dd></div><div><dt>Marks task</dt><dd>{missing ? `${missing} incomplete` : "Up to date"}</dd></div><div><dt>Submission</dt><dd>{submission?.status?.replaceAll("_", " ") ?? "Draft"}</dd></div></dl><Link className="primary-button" to={`${pathFor(offering)}${queryFor(offering)}`}>{missing ? "Continue marks" : "Open class marks"}</Link></article>;
      })}</div>}
    </section>
    <section className="panel teacher-dashboard-section"><div className="staff-results-heading"><div><h2>My next actions</h2><p>Tasks are limited to records and submissions in your active teaching allocations.</p></div></div>
      {currentTasks.length > 0 ? <ul className="teacher-task-list">{currentTasks.map((offering) => <li key={offering.id}><span><strong>{offering.className}{offering.streamName ? ` · ${offering.streamName}` : ""} — {offering.subjectName}</strong><small>{marks.submissions[offering.id]?.status === "RETURNED" ? "Submission returned for correction" : `${offering.learners.filter((learner) => learner.aoiStatus === "MISSING" || learner.examStatus === "MISSING").length} learner marks still incomplete`}</small></span><Link to={`${pathFor(offering)}${queryFor(offering)}`}>Review marks <ArrowRight size={16}/></Link></li>)}</ul> : !marks.loading && !marks.error && <div className="dashboard-empty-state"><CheckCircle2 size={24}/><strong>No marks completion tasks</strong><span>There are no missing marks in your current assignments.</span></div>}
      <div className="teacher-dashboard-links"><Link to="/notifications">Notifications {Boolean(unreadMessages) && <span className="notification-count">{unreadMessages}</span>}</Link><Link to="/messages">Messages</Link></div>
    </section>
  </main>;
}

function SchoolDashboard() {
  const school = useSchoolContext();
  const learners = usePersistentLearners();
  const setup = usePersistentClassSetup();
  const marks = usePersistentMarks();
  const moderation = usePersistentModeration(currentUser.permissions.includes("marks.moderate"));
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState<SchoolTeacher[]>([]);
  const [staffState, setStaffState] = useState<StaffState>("loading");
  const [staffError, setStaffError] = useState("");
  const staffRequest = useRef(0);
  const canReviewMarks = currentUser.permissions.includes("marks.review");
  const canModerateMarks = currentUser.permissions.includes("marks.moderate");
  const canViewStaff = currentUser.role === "SCHOOL_ADMIN" || currentUser.role === "PLATFORM_ADMIN";
  const canViewLearnerSummary = currentUser.role === "SCHOOL_ADMIN" || currentUser.role === "PLATFORM_ADMIN" || currentUser.permissions.includes("learners.view");
  const canViewSetupSummary = currentUser.role === "SCHOOL_ADMIN" || currentUser.role === "PLATFORM_ADMIN" || currentUser.permissions.includes("academics.manage");
  const canViewSubjectSummary = canViewSetupSummary || currentUser.permissions.includes("subjects.view");
  const canViewMarkSummary = canReviewMarks || canModerateMarks || currentUser.permissions.includes("marks.enter");

  const loadStaff = useCallback(async () => {
    const request = ++staffRequest.current;
    if (school.loading) { setStaffState("loading"); setTeachers([]); setStaffError(""); return; }
    if (!canViewStaff) { setStaffState("forbidden"); setTeachers([]); setStaffError(""); return; }
    if (school.error || !school.schoolId) {
      setStaffState("error"); setTeachers([]); setStaffError(school.error || "Select an active school to load staff."); return;
    }
    setStaffState("loading"); setTeachers([]); setStaffError("");
    try {
      const result = await fetchSchoolTeacherDirectory(school.schoolId);
      if (request !== staffRequest.current) return;
      setTeachers(result);
      setStaffState(result.length ? "ready" : "empty");
    } catch (error) {
      if (request !== staffRequest.current) return;
      setTeachers([]);
      setStaffError(error instanceof Error ? error.message : "Staff directory could not be loaded.");
      setStaffState("error");
    }
  }, [canViewStaff, school.error, school.loading, school.schoolId]);

  useEffect(() => { void loadStaff(); return () => { staffRequest.current += 1; }; }, [loadStaff]);

  const refreshAll = useCallback(() => {
    if (school.loading) return;
    void learners.reload();
    void setup.reload();
    void marks.reload();
    void moderation.reload();
    void loadStaff();
  }, [learners.reload, loadStaff, marks.reload, moderation.reload, school.loading, setup.reload]);

  useEffect(() => {
    const refreshOnFocus = () => refreshAll();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshAll]);

  const yearLearners = useMemo(() => learners.learners.filter((learner) =>
    learner.status === "ACTIVE" && learner.enrolment?.status === "ACTIVE"
      && learner.enrolment.academicYearId === school.academicYearId), [learners.learners, school.academicYearId]);
  const yearClasses = useMemo(() => setup.classes.filter((item) => item.academicYearId === school.academicYearId), [setup.classes, school.academicYearId]);
  const activeClasses = yearClasses.filter((item) => item.status === "ACTIVE");
  const activeStreams = activeClasses.reduce((count, item) => count + item.streams.filter((stream) => stream.status === "ACTIVE").length, 0);
  const activeSubjects = setup.activatedSubjects.filter((subject) => subject.academicYearId === school.academicYearId);
  const marksSummary = useMemo(() => summarizeMarkOfferings(marks.workspace.offerings), [marks.workspace.offerings]);
  const awaitingModeration = moderation.submissions.filter((item) => item.status === "READY" || item.status === "HOD_REVIEW");
  const termName = school.termName || "Current term";
  const yearName = school.academicYearName || "Selected year";

  const learnerState = !canViewLearnerSummary ? "forbidden" : school.academicYearId
    ? learners.loading || school.loading ? "loading" : learners.error ? "error" : learners.learners.length ? "ready" : "empty"
    : school.loading ? "loading" : "not-ready";
  const setupState = !canViewSetupSummary ? "forbidden" : school.academicYearId
    ? setup.loading || school.loading ? "loading" : setup.error ? "error" : yearClasses.length ? "ready" : "empty"
    : school.loading ? "loading" : "not-ready";
  const subjectState = !canViewSubjectSummary ? "forbidden" : school.academicYearId
    ? setup.loading || school.loading ? "loading" : setup.error ? "error" : activeSubjects.length ? "ready" : "empty"
    : school.loading ? "loading" : "not-ready";
  const markState = !canViewMarkSummary ? "forbidden" : school.loading || marks.loading ? "loading" : !school.termId ? "not-ready" : marks.error ? "error" : marks.workspace.offerings.some((item) => item.learners.length) ? "ready" : "empty";
  const moderationState = school.loading || moderation.loading ? "loading" : !school.termId ? "not-ready" : moderation.error ? "error" : "ready";
  const classProgress = marksSummary.classes.map(({ name, progress }) => ({ name, progress }));
  const subjectProgress = marksSummary.subjects.sort((a, b) => a.progress - b.progress || a.name.localeCompare(b.name));
  const mostAtRiskClass = classProgress.filter((item) => item.progress < 100).sort((a, b) => a.progress - b.progress)[0];

  const actions = ([
    { label: "Add learner", to: "/learners/new", icon: GraduationCap, permission: "learners.manage" },
    { label: "Enter marks", to: "/marks/entry", icon: ClipboardCheck, permission: "marks.enter" },
    { label: "View classes", to: "/setup/classes", icon: Building2, permission: "academics.manage" },
    { label: "Academic setup", to: "/setup/academic-years", icon: CalendarDays, permission: "academics.manage" },
    { label: "Generate reports", to: "/reports/cards", icon: BookOpenCheck, permission: "reports.view" },
    { label: "Review moderation", to: "/marks/moderation", icon: ShieldCheck, permission: "marks.moderate" },
  ] satisfies Array<{ label: string; to: string; icon: LucideIcon; permission: Permission }>).filter((item) => currentUser.permissions.includes(item.permission));

  return <>
    <section className="page-heading">
      <div>
        <span className="eyebrow">ACADEMIC MANAGEMENT</span>
        <h1>{school.loading ? "Loading workspace…" : `${school.schoolName} Dashboard`}</h1>
        <p>{school.loading ? "Resolving your authorized school and period…" : `Academic overview · ${yearName}${school.termId ? ` · ${termName}` : " · no term selected"}`}</p>
      </div>
      <div className="dashboard-heading-actions">
        <button type="button" className="secondary-button" onClick={refreshAll} disabled={school.loading}>Refresh dashboard</button>
        {currentUser.permissions.includes("marks.enter") && <button type="button" className="primary-button" onClick={() => navigate("/marks/entry")}><ClipboardCheck size={18} aria-hidden="true" />Enter Marks</button>}
      </div>
    </section>

    {school.error && <div className="form-error-message" role="alert">{school.error} <button type="button" className="text-button" onClick={() => void school.refresh()}>Retry</button></div>}
    {!school.loading && school.contextIssue && <div className="form-error-message" role="status">The selected academic period needs attention. Choose an available year and term before using term-based dashboard metrics.</div>}

    <section className="dashboard-metric-strip" aria-label="School overview">
      <DashboardMetric state={learnerState} stateMessage={learnerState === "empty" ? "No learner records" : learnerState === "not-ready" ? "No year selected" : learnerState === "error" ? learners.error : undefined} onRetry={() => void learners.reload()} label="Active learners" value={yearLearners.length} detail={`Enrolled · ${yearName}`} icon={GraduationCap} to="/learners" />
      <DashboardMetric state={staffState} stateMessage={staffState === "empty" ? "No teacher accounts" : staffState === "forbidden" ? "Not available for this role" : staffError} onRetry={() => void loadStaff()} label="Teaching staff" value={teachers.filter((item) => item.accountStatus === "ACTIVE" && item.membershipStatus === "ACTIVE").length} detail="Active accounts · all years" icon={Users} to="/people/users" />
      <DashboardMetric state={subjectState} stateMessage={subjectState === "empty" ? "No active subjects" : subjectState === "not-ready" ? "No year selected" : subjectState === "error" ? setup.error : undefined} onRetry={() => void setup.reload()} label="Active subjects" value={activeSubjects.length} detail={`School catalogue · ${yearName}`} icon={BookOpenCheck} to="/subjects" />
      <DashboardMetric state={setupState} stateMessage={setupState === "empty" ? "No classes configured" : setupState === "not-ready" ? "No year selected" : setupState === "error" ? setup.error : undefined} onRetry={() => void setup.reload()} label="Classes / streams" value={`${activeClasses.length} / ${activeStreams}`} detail={`Active structure · ${yearName}`} icon={Building2} to="/setup/classes" />
      <DashboardMetric state={markState} stateMessage={markState === "empty" ? "No current-term mark roster" : markState === "not-ready" ? "No term selected" : markState === "error" ? marks.error : undefined} onRetry={() => void marks.reload()} label="Marks completion" value={`${marksSummary.completionPercent}%`} detail={`${termName} · resolved components`} icon={BarChart3} to="/marks/entry" tone="green" />
      <DashboardMetric state={markState} stateMessage={markState === "empty" ? "No current-term mark roster" : markState === "not-ready" ? "No term selected" : markState === "error" ? marks.error : undefined} onRetry={() => void marks.reload()} label="Missing marks" value={marksSummary.missing} detail={`Require entry · ${termName}`} icon={AlertTriangle} to="/marks/missing" tone={marksSummary.missing ? "amber" : "green"} />
      <DashboardMetric state="not-ready" stateMessage="Not connected" label="Fee collection" value="—" detail="No school-fee dashboard source is connected." icon={CircleDollarSign} tone="slate" />
      <DashboardMetric state={canModerateMarks ? moderationState : "forbidden"} stateMessage={moderationState === "error" ? moderation.error : moderationState === "not-ready" ? "No term selected" : undefined} onRetry={() => void moderation.reload()} label="Pending moderation" value={awaitingModeration.length} detail={`Current-term review queue · ${termName}`} icon={ShieldCheck} to="/marks/moderation" tone={awaitingModeration.length ? "amber" : "slate"} />
    </section>

    {currentUser.role === "SCHOOL_ADMIN" && <SchoolMessageDashboardCard />}
    <DashboardPanel title="Quick actions" subtitle="Common tasks for your role">
      {actions.length ? <DashboardQuickActions items={actions} /> : <DashboardEmptyState title="No quick actions available" detail="Your current role has no dashboard shortcuts." />}
    </DashboardPanel>

    {canReviewMarks && (markState === "ready"
      ? <DashboardStatistics classProgress={classProgress} completionPercent={marksSummary.completionPercent} recordedMarks={marksSummary.recorded} resolvedMarks={marksSummary.resolved} missingMarks={marksSummary.missing} subjectProgress={subjectProgress} termName={termName} mostAtRiskClass={mostAtRiskClass} awaitingModeration={awaitingModeration.length} />
      : <DashboardPanel title="Academic statistics" subtitle={`${termName} · ${yearName}`}>
        {markState === "loading" ? <p aria-live="polite">Loading current-term marks from the authorized marks workspace…</p>
          : markState === "error" ? <div className="form-error-message" role="alert">{marks.error} <button className="text-button" type="button" onClick={() => void marks.reload()}>Retry</button></div>
            : <DashboardEmptyState title={markState === "not-ready" ? "Select a term" : "No current-term marks yet"} detail={markState === "not-ready" ? "Choose an academic term to see marks completion." : "Active class offerings and learner rosters will appear here once configured."} />}
      </DashboardPanel>)}

    <section className="dashboard-grid">
      <DashboardPanel title="Attention required" subtitle={`Current academic period · ${yearName}${school.termId ? ` · ${termName}` : ""}`}>
        <div className="attention-list">
          {canReviewMarks && markState === "ready" && marksSummary.missing > 0 && <Link className="attention-item" to="/marks/missing"><span className="attention-icon attention-icon-warning"><AlertTriangle size={19} aria-hidden="true" /></span><span className="attention-copy"><strong>{marksSummary.missing} unrecorded mark components</strong><small>Open the current-term missing-marks register</small></span><ArrowRight size={17} aria-hidden="true" /></Link>}
          {canModerateMarks && moderationState === "ready" && awaitingModeration.length > 0 && <Link className="attention-item" to="/marks/moderation"><span className="attention-icon"><ShieldCheck size={19} aria-hidden="true" /></span><span className="attention-copy"><strong>{awaitingModeration.length} submissions awaiting moderation</strong><small>Current-term assessment workflow</small></span><ArrowRight size={17} aria-hidden="true" /></Link>}
          {canReviewMarks && markState === "error" && <p className="form-error-message" role="alert">Marks attention items could not be loaded. <button className="text-button" type="button" onClick={() => void marks.reload()}>Retry</button></p>}
          {canModerateMarks && moderationState === "error" && <p className="form-error-message" role="alert">Moderation queue could not be loaded. <button className="text-button" type="button" onClick={() => void moderation.reload()}>Retry</button></p>}
          {(!canReviewMarks || (markState === "ready" && marksSummary.missing === 0)) && (!canModerateMarks || (moderationState === "ready" && awaitingModeration.length === 0)) && <DashboardEmptyState title="No actions need attention" detail="No outstanding current-term mark or moderation actions are visible for your role." />}
        </div>
      </DashboardPanel>

      {canViewStaff && <DashboardPanel title="Teaching staff overview" subtitle="School-scoped directory · current membership and allocations" className="teacher-panel" action={<Link className="text-button" to="/people/users">View all staff <ArrowRight size={16} aria-hidden="true" /></Link>}>
        {staffState === "loading" ? <p aria-live="polite">Loading staff directory…</p>
          : staffState === "error" ? <div className="form-error-message" role="alert">{staffError} <button className="text-button" type="button" onClick={() => void loadStaff()}>Retry</button></div>
            : staffState === "empty" ? <DashboardEmptyState title="No teacher accounts" detail="Teacher accounts for this school will appear here after they are created." />
              : <div className="teacher-overview-list">
                {teachers.slice(0, 8).map((teacher) => <article className="teacher-overview-item" key={teacher.id}>
                  <div className="teacher-overview-identity"><strong>{teacher.name}</strong><span>{teacher.department || "No department assigned"}</span></div>
                  <div className="teacher-overview-meta"><span>{teacher.allocationCount} active allocation{teacher.allocationCount === 1 ? "" : "s"}</span><span className={`status-badge ${teacher.accountStatus === "ACTIVE" ? "status-active" : "status-inactive"}`}>Account: {teacher.accountStatus}</span><span className={`status-badge ${teacher.membershipStatus === "ACTIVE" ? "status-active" : "status-inactive"}`}>School: {teacher.membershipStatus}</span></div>
                  <button type="button" className="table-action" onClick={() => navigate(`/people/users/${teacher.id}`)} aria-label={`View ${teacher.name} profile`}><ArrowRight size={17} aria-hidden="true" /></button>
                </article>)}
              </div>}
      </DashboardPanel>}
    </section>
  </>;
}
