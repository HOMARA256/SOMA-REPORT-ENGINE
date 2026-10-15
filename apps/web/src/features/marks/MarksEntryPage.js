import { AlertTriangle, CheckCircle2, Database, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSchoolContext } from "../context/SchoolContext";
import { getMarksPreview } from "./marksCalculation";
import { usePersistentMarks } from "./PersistentMarks";
const states = ["MISSING", "PRESENT", "ABSENT", "EXEMPT"];
function draftFrom(row) {
    return { aoiMark: row.aoiMark === null ? "" : String(row.aoiMark), aoiStatus: row.aoiStatus, examMark: row.examMark === null ? "" : String(row.examMark), examStatus: row.examStatus };
}
export function MarksEntryPage() {
    const school = useSchoolContext();
    const marks = usePersistentMarks();
    const [searchParams] = useSearchParams();
    const [selectedOfferingId, setSelectedOfferingId] = useState("");
    useEffect(() => {
        const requestedOffering = searchParams.get("offering");
        const requestedTerm = searchParams.get("term");
        if (requestedOffering && (!requestedTerm || requestedTerm === marks.workspace.termId) && marks.workspace.offerings.some((item) => item.id === requestedOffering))
            setSelectedOfferingId(requestedOffering);
    }, [marks.workspace.offerings, marks.workspace.termId, searchParams]);
    const [drafts, setDrafts] = useState({});
    const [saving, setSaving] = useState("");
    const [notice, setNotice] = useState("");
    const offering = marks.workspace.offerings.find((item) => item.id === selectedOfferingId) ?? marks.workspace.offerings[0];
    const submission = offering ? marks.submissions[offering.id] : undefined;
    const submissionLocked = Boolean(submission && submission.status !== "RETURNED");
    useEffect(() => {
        if (marks.workspace.offerings.length && !marks.workspace.offerings.some((item) => item.id === selectedOfferingId))
            setSelectedOfferingId(marks.workspace.offerings[0].id);
    }, [marks.workspace.offerings, selectedOfferingId]);
    useEffect(() => { setDrafts({}); setNotice(""); }, [offering?.id, marks.termId]);
    const incomplete = useMemo(() => offering?.learners.filter((row) => {
        const value = drafts[row.id] ?? draftFrom(row);
        return value.aoiStatus === "MISSING" || value.examStatus === "MISSING";
    }).length ?? 0, [offering, drafts]);
    const hasUnsavedDrafts = Object.keys(drafts).length > 0;
    function rowDraft(row) { return drafts[row.id] ?? draftFrom(row); }
    function update(row, patch) {
        setDrafts((current) => ({ ...current, [row.id]: { ...rowDraft(row), ...patch } }));
        setNotice("");
    }
    function updateMark(row, field, value) {
        const maximum = field === "aoiMark" ? 20 : 80;
        if (value !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(value) || Number(value) > maximum))
            return;
        const statusField = field === "aoiMark" ? "aoiStatus" : "examStatus";
        update(row, { [field]: value, [statusField]: value === "" ? "MISSING" : "PRESENT" });
    }
    function updateStatus(row, field, value) {
        const markField = field === "aoiStatus" ? "aoiMark" : "examMark";
        update(row, { [field]: value, ...(value !== "PRESENT" ? { [markField]: "" } : {}) });
    }
    async function saveRow(row) {
        if (!offering)
            return;
        const draft = rowDraft(row);
        if (draft.aoiStatus === "PRESENT" && draft.aoiMark === "")
            return setNotice(`${row.name}: enter the AoI mark or choose another state.`);
        if (draft.examStatus === "PRESENT" && draft.examMark === "")
            return setNotice(`${row.name}: enter the examination mark or choose another state.`);
        setSaving(row.id);
        const error = await marks.save({ offeringId: offering.id, learnerId: row.id, aoiMark: draft.aoiStatus === "PRESENT" ? Number(draft.aoiMark) : null, aoiStatus: draft.aoiStatus, examMark: draft.examStatus === "PRESENT" ? Number(draft.examMark) : null, examStatus: draft.examStatus });
        setSaving("");
        if (error)
            return setNotice(error);
        setDrafts((current) => { const next = { ...current }; delete next[row.id]; return next; });
        setNotice(`${row.name}'s marks were saved to Supabase.`);
    }
    async function submitOffering() {
        if (!offering)
            return;
        setSaving("submission");
        try {
            const error = await marks.submitOffering(offering.id);
            setNotice(error ?? `${offering.className} · ${offering.subjectName} submitted for review.`);
        }
        finally {
            setSaving("");
        }
    }
    if (!school.loading && !school.academicYearId)
        return <>
    <section className="page-heading"><div><span className="eyebrow">PERSISTENT ACADEMIC WORKFLOW</span><h1>Marks Entry</h1></div></section>
    <section className="panel academic-guidance guidance-info"><div><strong>Academic year required</strong><p>Create an academic year before entering marks.</p></div><Link className="primary-button" to="/setup/academic-years">Create Academic Year</Link></section>
  </>;
    if (!school.loading && school.academicYearId && !school.termId)
        return <>
    <section className="page-heading"><div><span className="eyebrow">PERSISTENT ACADEMIC WORKFLOW</span><h1>Marks Entry</h1></div></section>
    <section className="panel academic-guidance guidance-warning"><div><strong>Term required</strong><p>Create a term for {school.academicYearName} before entering marks.</p></div><Link className="primary-button" to="/setup/academic-years">Create Term</Link></section>
  </>;
    return <>
    <section className="page-heading persistent-marks-heading">
      <div><span className="eyebrow">PERSISTENT ACADEMIC WORKFLOW</span><h1>Marks Entry</h1><p>Roster membership comes from the selected term, active class enrolments and authorised teacher allocations. Saved marks and review submissions are persisted in Supabase.</p></div>
      <div className="marks-entry-header-actions">
        <label className="marks-entry-selector"><span>Term</span><select value={marks.termId} onChange={(event) => void marks.selectTerm(event.target.value)}>{marks.terms.map((term) => <option key={term.id} value={term.id}>{term.name} · {term.status.replaceAll("_", " ")}</option>)}</select></label>
        <label className="marks-entry-selector"><span>Class &amp; subject</span><select value={offering?.id ?? ""} onChange={(event) => { setSelectedOfferingId(event.target.value); setDrafts({}); }}><option value="" disabled>Select allocation</option>{marks.workspace.offerings.map((item) => <option key={item.id} value={item.id}>{item.className}{item.streamName ? ` ${item.streamName}` : ""} · {item.subjectCode} — {item.subjectName}</option>)}</select></label>
        <span className="marks-entry-counter">{incomplete} incomplete</span>
      </div>
    </section>
    <section className="marks-persistence-banner"><Database size={20}/><div><strong>Supabase persistence active</strong><span>AoI is validated out of 20, examination out of 80, and the total is calculated out of 100. Blank is never converted to zero.</span></div><button className="secondary-button" type="button" disabled={marks.loading} onClick={() => void marks.reload()}><RefreshCw size={16}/> Refresh roster</button></section>
    {marks.error && <div className="form-error-message" role="alert">{marks.error}</div>}
    {marks.submissionError && <div className="form-error-message" role="alert">{marks.submissionError}</div>}
    {notice && <p className={notice.includes("saved to Supabase") || notice.includes("submitted for review") ? "marks-entry-success" : "marks-entry-notice"} role="status">{notice}</p>}
    {marks.loading ? <section className="panel marks-persistent-empty">Loading the allocation-derived roster…</section> : !offering ? <section className="panel marks-persistent-empty"><AlertTriangle /><div><h2>No authorised subject allocation</h2><p>Activate class subject offerings and assign a primary or co-teacher for this term. School Admin, DOS, Head Teacher and Deputy Head Teacher can view all configured offerings.</p></div></section> :
            <section className="marks-grid-shell">
        <div className="marks-offering-summary"><div><span>Class</span><strong>{offering.className}{offering.streamName ? ` · ${offering.streamName}` : ""}</strong></div><div><span>Subject</span><strong>{offering.subjectCode} · {offering.subjectName}</strong></div><div><span>Allocated teacher</span><strong>{offering.teacherName ?? "Not assigned"}</strong></div><div><span>Eligible learners</span><strong>{offering.learners.length}</strong></div></div>
        <div className="marks-submission-controls"><div><strong>{submission ? submission.status.replaceAll("_", " ") : "Draft marks"}</strong><span>{submission?.reviewNote ?? (submissionLocked ? "Marks are locked until an authorised reviewer returns the submission." : "Save all learner marks before submitting this offering for review.")}</span></div><button type="button" className="primary-button" disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || !offering.learners.length || incomplete > 0 || hasUnsavedDrafts || saving !== ""} onClick={() => void submitOffering()}>{saving === "submission" ? "Submitting…" : submission?.status === "RETURNED" ? "Resubmit for review" : "Submit for review"}</button></div>
        {!offering.learners.length ? <div className="marks-persistent-empty"><AlertTriangle /><div><h2>No eligible learners</h2><p>Only active learners enrolled in this offering’s class and stream for the selected academic year appear here.</p></div></div> : <div className="table-wrapper marks-grid-wrapper"><table className="marks-grid-table persistent-marks-table"><thead><tr><th>#</th><th>Admission No.</th><th>Learner</th><th>AoI /20</th><th>AoI state</th><th>Exam /80</th><th>Exam state</th><th>Mark %</th><th>Grade</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {offering.learners.map((row, index) => {
                        const draft = rowDraft(row);
                        const preview = getMarksPreview(draft.aoiMark, draft.examMark, draft.aoiStatus, draft.examStatus);
                        const changed = Boolean(drafts[row.id]);
                        return <tr key={row.id}><td>{index + 1}</td><td>{row.admissionNumber}</td><td className="marks-learner-name">{row.name}</td>
              <td><input aria-label={`${row.name} AoI mark out of 20`} className="marks-grid-input" inputMode="decimal" value={draft.aoiMark} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || (draft.aoiStatus !== "PRESENT" && draft.aoiStatus !== "MISSING")} onChange={(event) => updateMark(row, "aoiMark", event.target.value)}/></td>
              <td><select aria-label={`${row.name} AoI state`} value={draft.aoiStatus} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter} onChange={(event) => updateStatus(row, "aoiStatus", event.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></td>
              <td><input aria-label={`${row.name} examination mark out of 80`} className="marks-grid-input" inputMode="decimal" value={draft.examMark} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || (draft.examStatus !== "PRESENT" && draft.examStatus !== "MISSING")} onChange={(event) => updateMark(row, "examMark", event.target.value)}/></td>
              <td><select aria-label={`${row.name} examination state`} value={draft.examStatus} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter} onChange={(event) => updateStatus(row, "examStatus", event.target.value)}>{states.map((state) => <option key={state}>{state}</option>)}</select></td>
              <td><strong>{preview.total}</strong></td><td>{preview.grade}</td><td><span className={`mark-workflow-status status-${row.workflowStatus.toLowerCase()}`}>{row.workflowStatus.replaceAll("_", " ")}</span></td>
              <td><button type="button" className={changed ? "marks-row-save has-change" : "marks-row-save"} aria-label={changed ? "Save this learner's marks" : "Marks saved"} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || saving === row.id || !changed} onClick={() => void saveRow(row)} title="Save this learner's marks to Supabase">{saving === row.id ? <RefreshCw className="spin" size={18}/> : changed ? <Save size={18}/> : <CheckCircle2 size={18}/>}</button></td>
            </tr>;
                    })}
        </tbody></table></div>}
      </section>}
  </>;
}
