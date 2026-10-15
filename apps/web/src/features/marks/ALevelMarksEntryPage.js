import { AlertTriangle, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentMarks } from "./PersistentMarks";
import { AcademicContext, useLiveAcademics } from "../alevel/useLiveAcademics";
const db = supabase;
export function ALevelMarksEntryPage() {
    const workspace = useLiveAcademics();
    const school = useSchoolContext();
    const authorizedMarks = usePersistentMarks();
    const [searchParams] = useSearchParams();
    const assessments = workspace.data?.assessments ?? [];
    const offerings = workspace.data?.offerings ?? [];
    const [assessmentId, setAssessmentId] = useState("");
    const [offeringId, setOfferingId] = useState("");
    const [paperId, setPaperId] = useState("");
    const [papers, setPapers] = useState([]);
    const [assignments, setAssignments] = useState([]);
    const [saved, setSaved] = useState({});
    const [drafts, setDrafts] = useState({});
    const [results, setResults] = useState({});
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState("");
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        const requestedOffering = searchParams.get("offering");
        if (requestedOffering && offerings.some((item) => item.id === requestedOffering))
            setOfferingId(requestedOffering);
    }, [offerings, searchParams]);
    const activeAssessmentId = assessments.some(item => item.id === assessmentId) ? assessmentId : assessments[0]?.id ?? "";
    const activeOffering = offerings.find(item => item.id === offeringId) ?? offerings[0];
    const activePaper = papers.find(item => item.id === paperId) ?? papers[0];
    const load = useCallback(async () => {
        if (!db || !activeAssessmentId || !activeOffering?.id) {
            setPapers([]);
            setAssignments([]);
            return;
        }
        if (authorizedMarks.loading)
            return;
        const authorizedOffering = authorizedMarks.workspace.offerings.find(item => item.id === activeOffering.id && item.programme === "A_LEVEL");
        if (!school.termId || authorizedMarks.workspace.termId !== school.termId || !authorizedOffering) {
            setPapers([]);
            setAssignments([]);
            setError("This A-Level offering is not assigned to your current school and term.");
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        setNotice("");
        const [paperResult, assignmentResult, markResult] = await Promise.all([
            db.from("assessment_subject_papers").select("system_subject_paper_id,display_order,system_subject_papers(id,paper_name)").eq("assessment_id", activeAssessmentId).eq("school_subject_offering_id", activeOffering.id).eq("is_required", true).order("display_order"),
            db.rpc("get_authorized_a_level_marks_roster", { p_term_id: school.termId, p_offering_id: activeOffering.id }),
            db.from("a_level_paper_marks").select("learner_assignment_id,system_subject_paper_id,mark,mark_state").eq("assessment_id", activeAssessmentId).eq("school_subject_offering_id", activeOffering.id).eq("academic_term_id", school.termId),
        ]);
        const queryError = paperResult.error ?? assignmentResult.error ?? markResult.error;
        if (queryError) {
            setError(queryError.message || "A-Level marks could not be loaded.");
            setLoading(false);
            return;
        }
        const nextPapers = (paperResult.data ?? []).map((item) => item.system_subject_papers).filter(Boolean);
        const nextAssignments = (assignmentResult.data ?? []).map(item => ({ id: item.id, learnerId: item.learnerId, admission: item.admission ?? "—", learnerName: item.learnerName ?? "", combination: item.combination ?? "—" }));
        const nextSaved = {};
        for (const item of markResult.data ?? [])
            nextSaved[`${item.learner_assignment_id}:${item.system_subject_paper_id}`] = { value: item.mark === null ? "" : String(item.mark), state: item.mark_state };
        setPapers(nextPapers);
        setAssignments(nextAssignments);
        setSaved(nextSaved);
        setDrafts({});
        if (nextPapers.length && !nextPapers.some(item => item.id === paperId))
            setPaperId(nextPapers[0].id);
        const nextResults = {};
        await Promise.all(nextAssignments.map(async (assignment) => { const { data } = await db.rpc("a_level_subject_result", { p_assessment: activeAssessmentId, p_assignment: assignment.id, p_offering: activeOffering.id }); if (data?.[0])
            nextResults[assignment.id] = data[0]; }));
        setResults(nextResults);
        setLoading(false);
    }, [activeAssessmentId, activeOffering?.id, authorizedMarks.loading, authorizedMarks.workspace.offerings, authorizedMarks.workspace.termId, school.termId, paperId]);
    useEffect(() => { void load(); }, [load]);
    const keyFor = (assignmentId) => `${assignmentId}:${activePaper?.id ?? ""}`;
    const valueFor = (assignmentId) => drafts[keyFor(assignmentId)] ?? saved[keyFor(assignmentId)] ?? { value: "", state: "MISSING" };
    const unresolved = useMemo(() => assignments.filter(item => valueFor(item.id).state !== "PRESENT").length, [assignments, drafts, saved, activePaper?.id]);
    function update(assignmentId, next) {
        const current = valueFor(assignmentId);
        const merged = { ...current, ...next };
        if (next.value !== undefined) {
            if (next.value !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(next.value) || Number(next.value) > 100))
                return;
            merged.state = next.value === "" ? current.state : "PRESENT";
        }
        if (next.state && next.state !== "PRESENT")
            merged.value = "";
        setDrafts(items => ({ ...items, [keyFor(assignmentId)]: merged }));
        setNotice("");
    }
    async function save(assignmentId) {
        if (!db || !activePaper || !activeOffering || !activeAssessmentId)
            return;
        const mark = valueFor(assignmentId);
        if (mark.state === "PRESENT" && (mark.value === "" || Number(mark.value) < 0 || Number(mark.value) > 100)) {
            setError("A PRESENT mark must be between 0 and 100. Zero is valid.");
            return;
        }
        setBusy(assignmentId);
        setError("");
        setNotice("");
        const { error: saveError } = await db.rpc("save_a_level_paper_mark", { p_assessment: activeAssessmentId, p_assignment: assignmentId, p_offering: activeOffering.id, p_paper: activePaper.id, p_state: mark.state, p_mark: mark.state === "PRESENT" ? Number(mark.value) : null });
        setBusy("");
        if (saveError) {
            setError(saveError.message || "The mark could not be saved.");
            return;
        }
        setNotice(`${activePaper.paper_name} saved. The backend recalculated the subject result from selected required papers only.`);
        await load();
    }
    const contextReady = workspace.setupState === "READY" && !workspace.error && !workspace.loading && Boolean(workspace.data);
    return <div className="live-academics">
    <section className="page-heading a-level-page-heading"><div><span className="eyebrow">ADVANCED SECONDARY WORKFLOW</span><h1>A-Level Paper Marks</h1><p>Only papers selected by School Administration are shown. One paper is graded directly; multiple complete papers are averaged before grading.</p></div></section>
    <AcademicContext workspace={workspace}/>
    {contextReady && <>
    <section className="panel live-academic-controls a-level-selectors">
      <label className="form-field"><span>Assessment</span><select value={activeAssessmentId} onChange={event => { setAssessmentId(event.target.value); setPaperId(""); }}><option value="">Select assessment</option>{assessments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="form-field"><span>Subject</span><select value={activeOffering?.id ?? ""} onChange={event => { setOfferingId(event.target.value); setPaperId(""); }}><option value="">Select subject</option>{offerings.map(item => <option key={item.id} value={item.id}>{item.short_name} · {item.name}</option>)}</select></label>
      <label className="form-field"><span>Selected paper</span><select value={activePaper?.id ?? ""} onChange={event => setPaperId(event.target.value)}><option value="">Select paper</option>{papers.map((item, index) => <option key={item.id} value={item.id}>P{index + 1} · {item.paper_name}</option>)}</select></label>
      <span className="marks-entry-counter">{unresolved} unresolved</span>
    </section>
    <section className="marks-grid-shell a-level-marks-shell"><div className="marks-grid-alert"><AlertTriangle size={18}/><p>Blank is not zero. PRESENT accepts 0–100. MISSING, ABSENT and EXEMPT remain explicit. Unselected papers are excluded completely.</p></div>
      {error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}
      {loading ? <p role="status">Loading the authorised roster and marks…</p> : !activePaper ? <p className="table-empty-state">No papers have been selected for this subject and assessment.</p> : <div className="table-wrapper marks-grid-wrapper"><table className="marks-grid-table a-level-paper-entry-table"><thead><tr><th>#</th><th>Admission No.</th><th>Learner</th><th>Combination</th><th>Mark /100</th><th>State</th><th>Subject score</th><th>Grade</th><th>Points</th><th>Action</th></tr></thead><tbody>{assignments.map((assignment, index) => { const mark = valueFor(assignment.id); const result = results[assignment.id]; return <tr key={assignment.id}><td>{index + 1}</td><td>{assignment.admission}</td><td><strong>{assignment.learnerName}</strong></td><td>{assignment.combination}</td><td><input aria-label={`${assignment.learnerName} mark`} inputMode="decimal" value={mark.value} onChange={event => update(assignment.id, { value: event.target.value })}/></td><td><select aria-label={`${assignment.learnerName} mark state`} value={mark.state} onChange={event => update(assignment.id, { state: event.target.value })}><option value="MISSING">Missing</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="EXEMPT">Exempt</option></select></td><td>{result?.subject_score ?? "—"}</td><td>{result?.grade ?? "—"}</td><td>{result?.points ?? "—"}</td><td><button type="button" className="marks-save-button" disabled={busy === assignment.id} onClick={() => void save(assignment.id)}><Save size={15}/>{busy === assignment.id ? "Saving…" : "Save"}</button></td></tr>; })}{!assignments.length && <tr><td colSpan={10} className="table-empty-state">No active learners inherit this subject from a saved combination.</td></tr>}</tbody></table></div>}
    </section></>}
  </div>;
}
