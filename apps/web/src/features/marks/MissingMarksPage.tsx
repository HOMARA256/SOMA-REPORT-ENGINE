import { AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { getOfferingLearners, learnerDisplayName, useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";

type StateFilter = "ALL" | "MISSING" | "ABSENT" | "EXEMPT";

export function MissingMarksPage() {
  const navigate = useNavigate();
  const workspace = useAcademicWorkspace();
  const schoolContext = useSchoolContext();
  const [offeringId, setOfferingId] = useState("s1-mathematics");
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("ALL");
  const offering = workspace.offerings.find((item) => item.id === offeringId) ?? workspace.offerings[0];

  const openItems = offering ? getOfferingLearners(offering, workspace.learners).flatMap((learner) => {
    const marks = workspace.getMarks(offering.id, learner.id);
    return offering.components.flatMap((component) => {
      const componentState = marks[`${component.key}State`];
      return componentState === "PRESENT" && marks[component.key] !== "" ? [] : [{
        id: `${offering.id}:${learner.id}:${component.key}`,
        learner: learnerDisplayName(learner),
        learnerId: learner.id,
        component: `${component.label} (${component.maximum})`,
        state: componentState === "PRESENT" ? "MISSING" as const : componentState,
      }];
    });
  }) : [];

  const records = openItems.filter((item) => {
    const term = query.trim().toLowerCase();
    return (state === "ALL" || state === item.state)
      && (!term || item.learner.toLowerCase().includes(term) || item.learnerId.toLowerCase().includes(term));
  });
  const missingCount = openItems.filter((item) => item.state === "MISSING").length;
  const reviewedCount = openItems.length - missingCount;
  const currentTerm = schoolContext.termName || "No term selected";

  return <>
    <section className="page-heading">
      <div><span className="eyebrow">ACADEMIC WORKFLOW</span><h1>Missing Marks</h1><p>{currentTerm} {schoolContext.academicYearName} · Missing, absent and exempt states are read from saved marks for the selected offering.</p></div>
      <span className="missing-marks-counter"><AlertTriangle size={17} aria-hidden="true" /> {openItems.length} unresolved component{openItems.length === 1 ? "" : "s"}</span>
    </section>

    <section className="missing-summary-grid responsive-grid" aria-label="Mark completion summary">
      <article className="missing-summary-card"><span className="missing-summary-icon warning"><AlertTriangle size={20} /></span><div><span>Missing</span><strong>{missingCount}</strong><small>Require a mark or explicit state</small></div></article>
      <article className="missing-summary-card"><span className="missing-summary-icon danger"><AlertTriangle size={20} /></span><div><span>Absent or exempt</span><strong>{reviewedCount}</strong><small>Await authorised review</small></div></article>
      <article className="missing-summary-card"><span className="missing-summary-icon success"><CheckCircle2 size={20} /></span><div><span>Recorded components</span><strong>{offering ? getOfferingLearners(offering, workspace.learners).length * offering.components.length - openItems.length : 0}</strong><small>Present values saved in this session</small></div></article>
    </section>

    <section className="panel missing-marks-panel">
      <div className="missing-marks-toolbar">
        <label className="missing-offering-filter"><span>Class and subject</span><select value={offering?.id ?? ""} onChange={(event) => setOfferingId(event.target.value)}><option value="" disabled>No configured offering</option>{workspace.offerings.map((item) => <option key={item.id} value={item.id}>{item.className} · {item.subjectName}</option>)}</select></label>
        <label className="assessment-search"><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search learner or LIN…" aria-label="Search missing marks" /></label>
        <label className="missing-offering-filter"><span>State</span><select value={state} onChange={(event) => setState(event.target.value as StateFilter)}><option value="ALL">All unresolved</option><option value="MISSING">Missing</option><option value="ABSENT">Absent</option><option value="EXEMPT">Exempt</option></select></label>
      </div>
      <div className="missing-marks-heading"><h2>Components requiring attention</h2><p>Only saving a valid mark in Marks Entry changes a missing component. State changes remain visible for review.</p></div>
      <div className="table-wrapper"><table className="data-table missing-marks-table"><thead><tr><th>Learner</th><th>Class</th><th>Subject</th><th>Component</th><th>Teacher</th><th>State</th><th>Action</th></tr></thead><tbody>
        {records.map((record) => <tr key={record.id}><td><div className="missing-learner"><strong>{record.learner}</strong><small>{record.learnerId}</small></div></td><td>{offering?.className}</td><td>{offering?.subjectName}</td><td>{record.component}</td><td>{offering?.teacher}</td><td><span className={`status-badge ${record.state === "MISSING" ? "status-overdue" : "status-pending"}`}>{record.state}</span></td><td><button type="button" className="table-view-button" onClick={() => navigate(`/marks/entry?offering=${offering?.id}`)}>Open entry</button></td></tr>)}
        {!records.length && <tr><td className="empty-table-cell" colSpan={7}><CheckCircle2 size={20} aria-hidden="true" /> No unresolved components match this selection.</td></tr>}
      </tbody></table></div>
    </section>
  </>;
}
