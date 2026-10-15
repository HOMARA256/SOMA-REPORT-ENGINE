import { AlertTriangle, CheckCircle2, Database, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useSchoolContext } from "../context/SchoolContext";
import { getMarksPreview } from "./marksCalculation";
import { usePersistentMarks, type PersistentActivity, type PersistentMarkLearner, type PersistentMarkState } from "./PersistentMarks";

type Draft = { aoiMark: string; aoiStatus: PersistentMarkState; examMark: string; examStatus: PersistentMarkState; activity1Raw: string; activity1Status: PersistentMarkState; activity2Raw: string; activity2Status: PersistentMarkState; examRaw: string };
const states: PersistentMarkState[] = ["MISSING", "PRESENT", "ABSENT", "EXEMPT"];
function draftFrom(row: PersistentMarkLearner): Draft {
  return { aoiMark: row.aoiMark === null ? "" : String(row.aoiMark), aoiStatus: row.aoiStatus, examMark: row.examMark === null ? "" : String(row.examMark), examStatus: row.examStatus, activity1Raw: row.activity1Raw == null ? "" : String(row.activity1Raw), activity1Status: row.activity1Status ?? "MISSING", activity2Raw: row.activity2Raw == null ? "" : String(row.activity2Raw), activity2Status: row.activity2Status ?? "MISSING", examRaw: row.examRaw == null ? "" : String(row.examRaw) };
}

export function MarksEntryPage() {
  const school = useSchoolContext();
  const marks = usePersistentMarks();
  const [searchParams] = useSearchParams();
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  useEffect(() => {
    const requestedOffering = searchParams.get("offering");
    const requestedTerm = searchParams.get("term");
    if (requestedOffering && (!requestedTerm || requestedTerm === marks.workspace.termId) && marks.workspace.offerings.some((item) => item.id === requestedOffering)) setSelectedOfferingId(requestedOffering);
  }, [marks.workspace.offerings, marks.workspace.termId, searchParams]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [activityDrafts, setActivityDrafts] = useState<Record<string, { score: string; status: PersistentMarkState }>>({});
  const [selectedActivityId, setSelectedActivityId] = useState("");
  const [newActivity, setNewActivity] = useState({ title: "", date: "", maximum: "100" });
  const [showCreateActivity, setShowCreateActivity] = useState(false);
  const [saving, setSaving] = useState("");
  const [component, setComponent] = useState<"ACTIVITY" | "EXAM">("ACTIVITY");
  const [notice, setNotice] = useState("");
  const offering = marks.workspace.offerings.find((item) => item.id === selectedOfferingId) ?? marks.workspace.offerings[0];
  const activities = offering?.activities ?? [];
  const selectedActivity = activities.find((item) => item.id === selectedActivityId) ?? activities[0];
  const submission = offering ? marks.submissions[offering.id] : undefined;
  const submissionLocked = Boolean(submission && submission.status !== "RETURNED");

  useEffect(() => {
    if (marks.workspace.offerings.length && !marks.workspace.offerings.some((item) => item.id === selectedOfferingId)) setSelectedOfferingId(marks.workspace.offerings[0].id);
  }, [marks.workspace.offerings, selectedOfferingId]);
  useEffect(() => { setDrafts({}); setActivityDrafts({}); setSelectedActivityId(""); setNotice(""); }, [offering?.id, marks.termId]);

  const incomplete = useMemo(() => offering?.learners.filter((row) => {
    const value = drafts[row.id] ?? draftFrom(row);
    return offering.programme === "O_LEVEL"
      ? row.aoiSelection?.state !== "COMPLETE" || row.aoiSelection.contribution == null || row.aoiMark == null
        || Math.abs(row.aoiSelection.contribution - row.aoiMark) > 0.01 || value.examStatus !== "PRESENT"
      : value.aoiStatus === "MISSING" || value.examStatus === "MISSING";
  }).length ?? 0, [offering, drafts]);
  const hasUnsavedDrafts = Object.keys(drafts).length > 0 || Object.keys(activityDrafts).length > 0;

  function rowDraft(row: PersistentMarkLearner) { return drafts[row.id] ?? draftFrom(row); }
  function update(row: PersistentMarkLearner, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [row.id]: { ...rowDraft(row), ...patch } }));
    setNotice("");
  }
  function updateMark(row: PersistentMarkLearner, field: "aoiMark" | "examMark", value: string) {
    const maximum = field === "aoiMark" ? 20 : 80;
    if (value !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(value) || Number(value) > maximum)) return;
    const statusField = field === "aoiMark" ? "aoiStatus" : "examStatus";
    update(row, { [field]: value, [statusField]: value === "" ? "MISSING" : "PRESENT" });
  }
  function updateStatus(row: PersistentMarkLearner, field: "aoiStatus" | "examStatus", value: PersistentMarkState) {
    const markField = field === "aoiStatus" ? "aoiMark" : "examMark";
    update(row, { [field]: value, ...(value !== "PRESENT" ? { [markField]: "" } : {}) });
  }
  function updateRaw(row: PersistentMarkLearner, field: "activity1Raw" | "activity2Raw" | "examRaw", value: string) {
    if (value !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(value) || Number(value) > 100)) return;
    const statusField = field === "activity1Raw" ? "activity1Status" : field === "activity2Raw" ? "activity2Status" : "examStatus";
    update(row, { [field]: value, [statusField]: value === "" ? "MISSING" : "PRESENT" });
  }
  function updateRawStatus(row: PersistentMarkLearner, field: "activity1Status" | "activity2Status" | "examStatus", value: PersistentMarkState) {
    const rawField = field === "activity1Status" ? "activity1Raw" : field === "activity2Status" ? "activity2Raw" : "examRaw";
    update(row, { [field]: value, ...(value !== "PRESENT" ? { [rawField]: "" } : {}) });
  }
  function activityDraft(activity: PersistentActivity, row: PersistentMarkLearner) {
    const key = `${activity.id}:${row.id}`;
    const saved = row.activityMarks?.find((mark) => mark.activityId === activity.id);
    return activityDrafts[key] ?? { score: saved?.score == null ? "" : String(saved.score), status: saved?.status ?? "MISSING" };
  }
  function updateActivityDraft(activity: PersistentActivity, row: PersistentMarkLearner, patch: Partial<{ score: string; status: PersistentMarkState }>) {
    const key = `${activity.id}:${row.id}`;
    setActivityDrafts((current) => ({ ...current, [key]: { ...activityDraft(activity,row), ...patch } }));
    setNotice("");
  }
  async function createActivity() {
    if (!offering) return;
    if (newActivity.title.trim().length < 3 || !newActivity.date || !newActivity.maximum || Number(newActivity.maximum) <= 0) {
      setNotice("Enter an activity title, date and a positive maximum score."); return;
    }
    setSaving("activity-create");
    const error = await marks.createActivity({ offeringId: offering.id, title: newActivity.title, date: newActivity.date, maximum: Number(newActivity.maximum) });
    setSaving("");
    if (error) return setNotice(error);
    setNewActivity({ title: "", date: "", maximum: "100" }); setShowCreateActivity(false);
    setNotice("Activity created in the existing O-Level marks register.");
  }
  async function saveOLevelRow(row: PersistentMarkLearner) {
    if (!offering) return;
    const draft = rowDraft(row);
    if (component === "ACTIVITY") {
      if (!selectedActivity) return setNotice("Create or choose an activity first.");
      const entry = activityDraft(selectedActivity,row);
      if (entry.status === "PRESENT" && entry.score === "") return setNotice(`${row.name}: enter the activity score or choose another state.`);
      setSaving(row.id);
      const error = await marks.saveActivityScore({ offeringId: offering.id, activityId: selectedActivity.id, learnerId: row.id,
        score: entry.status === "PRESENT" ? Number(entry.score) : null, status: entry.status });
      setSaving("");
      if (error) return setNotice(error);
      setActivityDrafts((current) => { const next = { ...current }; delete next[`${selectedActivity.id}:${row.id}`]; return next; });
      setNotice(`${row.name}'s ${selectedActivity.title} score was saved to Supabase.`);
      return;
    }
    if (draft.examStatus === "PRESENT" && draft.examRaw === "") return setNotice(`${row.name}: enter the exam score out of 100 or choose another state.`);
    setSaving(row.id);
    const error = await marks.saveOLevelComponent({ offeringId: offering.id, learnerId: row.id, component: "EXAM", rawMark: draft.examStatus === "PRESENT" ? Number(draft.examRaw) : null, status: draft.examStatus });
    setSaving("");
    if (error) return setNotice(error);
    setDrafts((current) => { const next = { ...current }; delete next[row.id]; return next; });
    setNotice(`${row.name}'s examination score was saved to Supabase.`);
  }
  async function saveRow(row: PersistentMarkLearner) {
    if (!offering) return;
    const draft = rowDraft(row);
    if (draft.aoiStatus === "PRESENT" && draft.aoiMark === "") return setNotice(`${row.name}: enter the AoI mark or choose another state.`);
    if (draft.examStatus === "PRESENT" && draft.examMark === "") return setNotice(`${row.name}: enter the examination mark or choose another state.`);
    setSaving(row.id);
    const error = await marks.save({ offeringId: offering.id, learnerId: row.id, aoiMark: draft.aoiStatus === "PRESENT" ? Number(draft.aoiMark) : null, aoiStatus: draft.aoiStatus, examMark: draft.examStatus === "PRESENT" ? Number(draft.examMark) : null, examStatus: draft.examStatus });
    setSaving("");
    if (error) return setNotice(error);
    setDrafts((current) => { const next = { ...current }; delete next[row.id]; return next; });
    setNotice(`${row.name}'s marks were saved to Supabase.`);
  }
  async function submitOffering() {
    if (!offering) return;
    setSaving("submission");
    try {
      const error = await marks.submitOffering(offering.id);
      setNotice(error ?? `${offering.className} · ${offering.subjectName} submitted for review.`);
    } finally { setSaving(""); }
  }

  if (!school.loading && !school.academicYearId) return <>
    <section className="page-heading"><div><span className="eyebrow">PERSISTENT ACADEMIC WORKFLOW</span><h1>Marks Entry</h1></div></section>
    <section className="panel academic-guidance guidance-info"><div><strong>Academic year required</strong><p>Create an academic year before entering marks.</p></div><Link className="primary-button" to="/setup/academic-years">Create Academic Year</Link></section>
  </>;
  if (!school.loading && school.academicYearId && !school.termId) return <>
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
    <section className="marks-persistence-banner"><Database size={20} /><div><strong>Supabase persistence active</strong><span>Record any number of Activities of Integration separately. Each score uses its activity’s maximum; qualifying results are normalized and converted by the approved school rule. The exam is entered out of 100 and contributes /80. Blank is never zero.</span></div><button className="secondary-button" type="button" disabled={marks.loading} onClick={() => void marks.reload()}><RefreshCw size={16} /> Refresh roster</button></section>
    {marks.error && <div className="form-error-message" role="alert">{marks.error}</div>}
    {marks.submissionError && <div className="form-error-message" role="alert">{marks.submissionError}</div>}
    {notice && <p className={notice.includes("saved to Supabase") || notice.includes("submitted for review") ? "marks-entry-success" : "marks-entry-notice"} role="status">{notice}</p>}
    {marks.loading ? <section className="panel marks-persistent-empty">Loading the allocation-derived roster…</section> : !offering ? <section className="panel marks-persistent-empty"><AlertTriangle /><div><h2>No authorised subject allocation</h2><p>Activate class subject offerings and assign a primary or co-teacher for this term. School Admin, DOS, Head Teacher and Deputy Head Teacher can view all configured offerings.</p></div></section> :
      <section className="marks-grid-shell">
        <div className="marks-offering-summary"><div><span>Class</span><strong>{offering.className}{offering.streamName ? ` · ${offering.streamName}` : ""}</strong></div><div><span>Subject</span><strong>{offering.subjectCode} · {offering.subjectName}</strong></div><div><span>Allocated teacher</span><strong>{offering.teacherName ?? "Not assigned"}</strong></div><div><span>Eligible learners</span><strong>{offering.learners.length}</strong></div></div>
        <div className="marks-submission-controls"><div><strong>{submission ? submission.status.replaceAll("_", " ") : "Draft marks"}</strong><span>{submission?.reviewNote ?? (submissionLocked ? "Marks are locked until an authorised reviewer returns the submission." : "Save all learner marks before submitting this offering for review.")}</span></div><button type="button" className="primary-button" disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || !offering.learners.length || incomplete > 0 || hasUnsavedDrafts || saving !== ""} onClick={() => void submitOffering()}>{saving === "submission" ? "Submitting…" : submission?.status === "RETURNED" ? "Resubmit for review" : "Submit for review"}</button></div>
        {offering.programme === "O_LEVEL" && <div className="marks-activity-controls"><div className="marks-activity-tabs" role="group" aria-label="O-Level assessment component"><button type="button" className={component === "ACTIVITY" ? "is-active" : ""} aria-pressed={component === "ACTIVITY"} onClick={() => setComponent("ACTIVITY")}>Activities of Integration ({activities.length})</button><button type="button" className={component === "EXAM" ? "is-active" : ""} aria-pressed={component === "EXAM"} onClick={() => setComponent("EXAM")}>End-of-term exam</button></div>{component === "ACTIVITY" && <div className="marks-activity-toolbar"><label><span>Recorded activity</span><select value={selectedActivity?.id ?? ""} onChange={(event) => setSelectedActivityId(event.target.value)}><option value="" disabled>No activity created</option>{activities.map((activity) => <option key={activity.id} value={activity.id}>A{activity.number} · {activity.title} · {activity.date || "date not recorded"} · /{activity.maximum}</option>)}</select></label><button type="button" className="secondary-button" disabled={submissionLocked || saving !== ""} onClick={() => setShowCreateActivity((current) => !current)}>{showCreateActivity ? "Cancel new activity" : "Add activity"}</button></div>}{component === "ACTIVITY" && showCreateActivity && <div className="marks-activity-create"><label><span>Activity title</span><input value={newActivity.title} maxLength={160} onChange={(event) => setNewActivity((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Community water project" /></label><label><span>Date given</span><input type="date" value={newActivity.date} onChange={(event) => setNewActivity((current) => ({ ...current, date: event.target.value }))} /></label><label><span>Maximum mark</span><input type="number" min="0.01" step="0.01" value={newActivity.maximum} onChange={(event) => setNewActivity((current) => ({ ...current, maximum: event.target.value }))} /></label><button type="button" className="primary-button" disabled={saving !== "" || submissionLocked} onClick={() => void createActivity()}>{saving === "activity-create" ? "Creating…" : "Create activity"}</button></div>}<p className="marks-activity-hint">Every activity stays in the register. The School Administrator’s versioned report setting determines how many latest completed activities count; additional scores are never deleted.</p></div>}
        {!offering.learners.length ? <div className="marks-persistent-empty"><AlertTriangle /><div><h2>No eligible learners</h2><p>Only active learners enrolled in this offering’s class and stream for the selected academic year appear here.</p></div></div> : offering.programme === "O_LEVEL" ? <div className="table-wrapper marks-grid-wrapper"><table className="marks-grid-table persistent-marks-table"><thead><tr><th>#</th><th>Admission No.</th><th>Learner</th><th>{component === "EXAM" ? "Exam /100" : selectedActivity ? `${selectedActivity.title} /${selectedActivity.maximum}` : "Activity score"}</th><th>State</th><th>AoIs used</th><th>AoI /20</th><th>Exam /80</th><th>Total /100</th><th>Grade</th><th>Final /3</th><th>Status</th><th>Save</th></tr></thead><tbody>{offering.learners.map((row,index) => {
          const draft = rowDraft(row);
          const activeEntry = selectedActivity ? activityDraft(selectedActivity,row) : null;
          const selection = row.aoiSelection;
          const preview = getMarksPreview(selection?.state === "COMPLETE" && selection.contribution != null ? String(selection.contribution) : "", row.examMark == null ? "" : String(row.examMark), selection?.state === "COMPLETE" ? "PRESENT" : "MISSING", row.examStatus);
          const changed = component === "EXAM" ? Boolean(drafts[row.id]) : Boolean(selectedActivity && activityDrafts[`${selectedActivity.id}:${row.id}`]);
          const disabled = Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter;
          return <tr key={row.id}><td>{index+1}</td><td>{row.admissionNumber}</td><td className="marks-learner-name">{row.name}</td>
            <td>{component === "EXAM" ? <input aria-label={`${row.name} exam score out of 100`} className="marks-grid-input" inputMode="decimal" value={draft.examRaw} disabled={disabled || (draft.examStatus !== "PRESENT" && draft.examStatus !== "MISSING")} onChange={(event) => updateRaw(row,"examRaw",event.target.value)} /> : <input aria-label={`${row.name} ${selectedActivity?.title ?? "activity"} score out of ${selectedActivity?.maximum ?? 0}`} className="marks-grid-input" inputMode="decimal" value={activeEntry?.score ?? ""} disabled={disabled || !selectedActivity || (activeEntry?.status !== "PRESENT" && activeEntry?.status !== "MISSING")} onChange={(event) => { if (!selectedActivity) return; const value=event.target.value; if (value !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(value) || Number(value)>selectedActivity.maximum)) return; updateActivityDraft(selectedActivity,row,{score:value,status:value===""?"MISSING":"PRESENT"}); }} />}</td>
            <td>{component === "EXAM" ? <select aria-label={`${row.name} exam state`} value={draft.examStatus} disabled={disabled} onChange={(event) => updateRawStatus(row,"examStatus",event.target.value as PersistentMarkState)}>{states.map((state)=><option key={state}>{state}</option>)}</select> : <select aria-label={`${row.name} activity state`} value={activeEntry?.status ?? "MISSING"} disabled={disabled || !selectedActivity} onChange={(event) => { if (!selectedActivity) return; const status=event.target.value as PersistentMarkState; updateActivityDraft(selectedActivity,row,{status, ...(status !== "PRESENT" ? {score:""} : {})}); }}>{states.map((state)=><option key={state}>{state}</option>)}</select>}</td>
            <td><span className={selection?.state === "COMPLETE" ? "marks-activity-complete" : "marks-activity-incomplete"}>{selection?.state === "POLICY_NOT_CONFIGURED" ? "Policy needed" : `${selection?.completed ?? 0}/${selection?.required ?? "?"} ${selection?.state === "COMPLETE" ? "complete" : "required"}`}</span></td><td>{selection?.contribution ?? "—"}</td><td>{row.examMark ?? "—"}</td><td><strong>{preview.total}</strong></td><td>{preview.gradingLabel || "—"}</td><td>{preview.threePointScoreDisplayed}</td><td><span className={`mark-workflow-status status-${row.workflowStatus.toLowerCase()}`}>{row.workflowStatus.replaceAll("_"," ")}</span></td>
            <td><button type="button" className={changed ? "marks-row-save has-change" : "marks-row-save"} aria-label={`Save ${component === "EXAM" ? "exam" : selectedActivity?.title ?? "activity"} for ${row.name}`} disabled={disabled || saving === row.id || !changed} onClick={() => void saveOLevelRow(row)}>{saving === row.id ? <RefreshCw className="spin" size={18} /> : changed ? <Save size={18} /> : <CheckCircle2 size={18} />}</button></td>
          </tr>;
        })}</tbody></table></div> : <div className="table-wrapper marks-grid-wrapper"><table className="marks-grid-table persistent-marks-table"><thead><tr><th>#</th><th>Admission No.</th><th>Learner</th><th>AoI /20</th><th>AoI state</th><th>Exam /80</th><th>Exam state</th><th>Mark %</th><th>Grade</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {offering.learners.map((row, index) => {
            const draft = rowDraft(row);
            const preview = getMarksPreview(draft.aoiMark, draft.examMark, draft.aoiStatus, draft.examStatus);
            const changed = Boolean(drafts[row.id]);
            return <tr key={row.id}><td>{index + 1}</td><td>{row.admissionNumber}</td><td className="marks-learner-name">{row.name}</td>
              <td><input aria-label={`${row.name} AoI mark out of 20`} className="marks-grid-input" inputMode="decimal" value={draft.aoiMark} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || (draft.aoiStatus !== "PRESENT" && draft.aoiStatus !== "MISSING")} onChange={(event) => updateMark(row, "aoiMark", event.target.value)} /></td>
              <td><select aria-label={`${row.name} AoI state`} value={draft.aoiStatus} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter} onChange={(event) => updateStatus(row, "aoiStatus", event.target.value as PersistentMarkState)}>{states.map((state) => <option key={state}>{state}</option>)}</select></td>
              <td><input aria-label={`${row.name} examination mark out of 80`} className="marks-grid-input" inputMode="decimal" value={draft.examMark} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || (draft.examStatus !== "PRESENT" && draft.examStatus !== "MISSING")} onChange={(event) => updateMark(row, "examMark", event.target.value)} /></td>
              <td><select aria-label={`${row.name} examination state`} value={draft.examStatus} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter} onChange={(event) => updateStatus(row, "examStatus", event.target.value as PersistentMarkState)}>{states.map((state) => <option key={state}>{state}</option>)}</select></td>
              <td><strong>{preview.total}</strong></td><td>{preview.grade}</td><td><span className={`mark-workflow-status status-${row.workflowStatus.toLowerCase()}`}>{row.workflowStatus.replaceAll("_", " ")}</span></td>
              <td><button type="button" className={changed ? "marks-row-save has-change" : "marks-row-save"} aria-label={changed ? "Save this learner's marks" : "Marks saved"} disabled={Boolean(marks.submissionError) || submissionLocked || !marks.workspace.canEnter || saving === row.id || !changed} onClick={() => void saveRow(row)} title="Save this learner's marks to Supabase">{saving === row.id ? <RefreshCw className="spin" size={18} /> : changed ? <Save size={18} /> : <CheckCircle2 size={18} />}</button></td>
            </tr>;
          })}
        </tbody></table></div>}
      </section>}
  </>;
}
