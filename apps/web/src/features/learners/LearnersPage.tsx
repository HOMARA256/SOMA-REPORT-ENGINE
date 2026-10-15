import { BookOpen, GraduationCap, Search, UserPlus, Users } from "lucide-react";
import React, { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { usePersistentLearners } from "./PersistentLearners";
import { ProfilePhotoAvatar } from "../profile/ProfilePhotoAvatar";
import { currentUser } from "../../config/currentUser";

const ALL = "ALL";

function enrolmentForYear(learner: ReturnType<typeof usePersistentLearners>["learners"][number], yearId: string) {
  if (yearId === ALL) return learner.enrolment;
  if (learner.enrolment?.academicYearId === yearId) return learner.enrolment;
  return learner.history.find((item) => item.academicYearId === yearId) ?? null;
}

export default function LearnersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const inOLevelWorkspace = location.pathname.startsWith("/school/o-level");
  const canonicalDirectory = location.pathname === "/learners";
  const directoryPath = canonicalDirectory ? "/learners" : inOLevelWorkspace ? "/school/o-level/learners" : "/school/learners";
  const workspace = usePersistentLearners();
  const registrationNotice = typeof location.state?.registrationNotice === "string" ? location.state.registrationNotice : "";
  const [search, setSearch] = useState("");
  const [programme, setProgramme] = useState(inOLevelWorkspace ? "O_LEVEL" : ALL);
  const [yearId, setYearId] = useState(ALL);
  const [level, setLevel] = useState(ALL);
  const [classId, setClassId] = useState(ALL);
  const [streamId, setStreamId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [gender, setGender] = useState(ALL);
  const [subject, setSubject] = useState(ALL);
  const scoped = workspace.learners.filter((learner) => !inOLevelWorkspace || learner.enrolment?.programme === "O_LEVEL");
  const scopedClasses = workspace.classes.filter((item) => !inOLevelWorkspace || item.programme === "O_LEVEL");
  const visibleClasses = scopedClasses.filter((item) => (yearId === ALL || item.academicYearId === yearId)
    && (programme === ALL || item.programme === programme)
    && (level === ALL || String(item.level) === level));
  const streamOptions = classId === ALL ? [] : visibleClasses.find((item) => item.id === classId)?.streams ?? [];
  const subjects = Array.from(new Map(scoped.flatMap((learner) => learner.activeSubjects ?? []).map((item) => [item.id, item] as const)).values())
    .sort((a, b) => a.name.localeCompare(b.name));
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter((learner) => {
      const enrolment = enrolmentForYear(learner, yearId);
      const stream = enrolment && "streamId" in enrolment ? enrolment.streamId : null;
      const matchesSearch = !q || `${learner.firstName} ${learner.otherName ?? ""} ${learner.lastName} ${learner.admissionNumber}`.toLowerCase().includes(q);
      return matchesSearch
        && (programme === ALL || enrolment?.programme === programme)
        && (yearId === ALL || enrolment?.academicYearId === yearId)
        && (level === ALL || String(workspace.classes.find((item) => item.id === enrolment?.classId)?.level ?? "") === level)
        && (classId === ALL || enrolment?.classId === classId)
        && (streamId === ALL || stream === streamId)
        && (status === ALL || (enrolment?.status ?? learner.status) === status)
        && (gender === ALL || (learner.gender ?? "UNSPECIFIED").toUpperCase() === gender)
        && (subject === ALL || (enrolment?.id === learner.enrolment?.id && (learner.activeSubjects ?? []).some((item) => item.id === subject)));
    });
  }, [scoped, search, programme, yearId, level, classId, streamId, status, gender, subject, workspace.classes]);
  const active = scoped.filter((learner) => learner.status === "ACTIVE" && learner.enrolment).length;
  const pendingApproval = scoped.filter((learner) => learner.status === "PENDING_APPROVAL").length;
  const male = scoped.filter((learner) => learner.gender?.toUpperCase() === "MALE").length;
  const female = scoped.filter((learner) => learner.gender?.toUpperCase() === "FEMALE").length;
  const missingGuardian = scoped.filter((learner) => !learner.guardianPhone?.trim()).length;
  const incompleteSubjects = scoped.filter((learner) => learner.enrolment && !(learner.activeSubjects?.length)).length;

  function changeClass(value: string) {
    setClassId(value);
    setStreamId(ALL);
  }

  return <>
    <header className="page-heading">
      <div><span className="eyebrow">{inOLevelWorkspace ? "O-LEVEL WORKSPACE" : "LEARNER MANAGEMENT"}</span><h1>Learners</h1><p>Tenant-scoped learner identities and active class/stream enrolments.</p></div>
      <button type="button" className="primary-button" onClick={() => navigate(currentUser.role === "SCHOOL_ADMIN" ? "/admissions#school-admission-form" : `${directoryPath}/new`)}><UserPlus size={17} />{currentUser.role === "SCHOOL_ADMIN" ? "New admission" : "Add Learner"}</button>
    </header>
    {registrationNotice && <p className="form-success-message" role="status">{registrationNotice}</p>}
    {workspace.error && <div className="form-error-message" role="alert">{workspace.error}</div>}
    <section className="learner-summary-grid responsive-grid" aria-label="Learner statistics">
      <Summary icon={<Users size={21} />} label="Total learners" value={scoped.length} detail="Records for the selected school" />
      <Summary icon={<GraduationCap size={21} />} label="Active learners" value={active} detail="Currently enrolled" success />
      <Summary icon={<Users size={21} />} label="Awaiting approval and placement" value={pendingApproval} detail="Accepted admissions · class and subject setup pending" warning={pendingApproval > 0} />
      <Summary icon={<Users size={21} />} label="Male / Female" value={`${male} / ${female}`} detail="Gender counts" />
      {scoped.every((learner) => learner.sensitiveFieldsVisible !== false) && <Summary icon={<BookOpen size={21} />} label="Missing guardian contact" value={missingGuardian} detail="No guardian phone recorded" warning={missingGuardian > 0} />}
      <Summary icon={<BookOpen size={21} />} label="No active subject selections" value={incompleteSubjects} detail="Selection rows are absent" warning={incompleteSubjects > 0} />
    </section>
    <section className="panel learner-management-panel">
      <div className="learner-toolbar learner-directory-toolbar page-toolbar">
        <label className="learner-search"><span>Search learners</span><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or admission number" /></label>
        <Select label="Academic year" value={yearId} onChange={setYearId} options={[[ALL, "All years"], ...workspace.academicYears.map((item) => [item.id, item.name] as [string, string])]} />
        {!inOLevelWorkspace && <Select label="Programme" value={programme} onChange={(value) => { setProgramme(value); setClassId(ALL); setStreamId(ALL); }} options={[[ALL, "All programmes"], ["O_LEVEL", "O-Level"], ["A_LEVEL", "A-Level"]]} />}
        <Select label="Class level" value={level} onChange={(value) => { setLevel(value); setClassId(ALL); setStreamId(ALL); }} options={[[ALL, "All levels"], ...Array.from(new Set(visibleClasses.map((item) => item.level))).sort((a, b) => a - b).map((item) => [String(item), `Senior ${item}`] as [string, string])]} />
        <Select label="Class" value={classId} onChange={changeClass} options={[[ALL, "All classes"], ...visibleClasses.map((item) => [item.id, item.name] as [string, string])]} />
        <Select label="Stream" value={streamId} onChange={setStreamId} disabled={classId === ALL} options={[[ALL, "All streams"], ...streamOptions.map((item) => [item.id, item.name] as [string, string])]} />
        <Select label="Status" value={status} onChange={setStatus} options={[[ALL, "All statuses"], ...["PENDING_APPROVAL", "ACTIVE", "INACTIVE", "WITHDRAWN", "COMPLETED", "GRADUATED"].map((item) => [item, item === "PENDING_APPROVAL" ? "Awaiting approval" : item] as [string, string])]} />
        <Select label="Gender" value={gender} onChange={setGender} options={[[ALL, "All genders"], ["MALE", "Male"], ["FEMALE", "Female"], ["UNSPECIFIED", "Unspecified"]]} />
        <Select label="Subject" value={subject} onChange={setSubject} options={[[ALL, "All subjects"], ...subjects.map((item) => [item.id, item.name] as [string, string])]} />
      </div>
      <div className="learner-results-heading"><div><h2>Learner register</h2><p>{workspace.loading ? "Loading persistent records…" : `Showing ${filtered.length} of ${scoped.length} learners for the selected school.`}</p></div></div>
      <div className="table-wrapper"><table className="data-table learner-table responsive-table"><thead><tr><th>Learner</th><th>Admission No.</th><th>Class / stream</th><th>Gender</th><th>Status</th><th>Subject selection</th><th>Guardian</th><th>Actions</th></tr></thead><tbody>
        {filtered.map((learner) => { const enrolment = enrolmentForYear(learner, yearId); const currentYearSelection = enrolment?.id === learner.enrolment?.id; return <tr key={`${learner.id}-${enrolment?.id ?? "none"}`}>
          <td data-label="Learner"><span className="learner-person-button"><ProfilePhotoAvatar name={[learner.firstName, learner.otherName, learner.lastName].filter(Boolean).join(" ")} initials={`${learner.firstName[0] ?? ""}${learner.lastName[0] ?? ""}`} path={learner.profilePhotoPath} /><span className="learner-person-copy"><strong>{[learner.firstName, learner.otherName, learner.lastName].filter(Boolean).join(" ")}</strong></span></span></td>
          <td data-label="Admission No.">{learner.admissionNumber}</td><td data-label="Class / stream">{learner.status === "PENDING_APPROVAL" ? "Awaiting class and stream allocation" : enrolment ? `${enrolment.className}${enrolment.streamName ? ` · ${enrolment.streamName}` : ""}` : "Not enrolled for this year"}</td>
          <td data-label="Gender">{learner.gender ?? "—"}</td><td data-label="Status"><span className={`status-badge ${learner.status === "PENDING_APPROVAL" ? "status-pending" : learner.status === "ACTIVE" && enrolment?.status === "ACTIVE" ? "status-active" : "status-inactive"}`}>{learner.status === "PENDING_APPROVAL" ? "Awaiting approval" : enrolment?.status ?? learner.status}</span></td>
          <td data-label="Subject selection">{currentYearSelection ? learner.activeSubjects?.length ? `${learner.activeSubjects.length} active · ${learner.activeSubjects.map((item) => item.name).join(", ")}` : "No active selection" : "Historical subject choices not included"}</td>
          <td data-label="Guardian">{learner.sensitiveFieldsVisible === false ? "Restricted" : learner.guardianPhone ? <a href={`tel:${encodeURIComponent(learner.guardianPhone)}`}>{learner.guardianName || "Guardian"} · {learner.guardianPhone}</a> : "Missing contact"}</td>
          <td data-label="Actions"><div className="session-row-actions">{learner.status === "PENDING_APPROVAL" && <Link className="table-view-button" to="/admissions">Continue admission setup</Link>}<Link className="table-view-button" to={`/learners/${learner.id}`}>View profile</Link>{enrolment?.programme === "O_LEVEL" && currentYearSelection && <Link className="table-view-button" to={`/learners/${learner.id}/subjects`}>Subjects</Link>}</div></td>
        </tr>;})}
        {!workspace.loading && !filtered.length && <tr><td colSpan={8}><div className="learner-empty-state"><Users size={30} /><strong>No learners found</strong><span>Change the filters or register a learner for this school.</span></div></td></tr>}
      </tbody></table></div>
    </section>
  </>;
}

function Summary({ icon, label, value, detail, success = false, warning = false }: { icon: React.ReactNode; label: string; value: string | number; detail: string; success?: boolean; warning?: boolean }) {
  return <article className="learner-summary-card"><div className={`learner-summary-icon ${success ? "learner-summary-success" : warning ? "learner-summary-warning" : ""}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function Select({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][]; disabled?: boolean }) {
  return <label className="learner-filter"><span>{label}</span><select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}
