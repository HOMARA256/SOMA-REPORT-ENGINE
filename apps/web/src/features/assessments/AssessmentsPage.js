import { ClipboardCheck, Pencil, Plus, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { SearchInput } from "../../components/common/SearchInput";
import { useSchoolContext } from "../context/SchoolContext";
import { ALevelAssessmentConfiguration } from "./ALevelAssessmentConfiguration";
const blankDraft = { name: "", programme: "O-Level", termId: "", componentCount: 1, maximumMark: 100, status: "Draft" };
function mapAssessment(row) {
    return { id: row.id, name: row.name, programme: row.programme === "A_LEVEL" ? "A-Level" : "O-Level", term: row.term,
        termId: row.termId, academicYearId: row.academicYearId, componentCount: row.componentCount, maximumMark: Number(row.maximumMark),
        status: row.status === "ACTIVE" ? "Open" : row.status === "INACTIVE" ? "Closed" : "Draft", locked: Boolean(row.locked) };
}
export function AssessmentsPage() {
    const context = useSchoolContext();
    const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
    const [records, setRecords] = useState([]);
    const [search, setSearch] = useState("");
    const [programme, setProgramme] = useState(inOLevelWorkspace ? "O-Level" : "ALL");
    const [editorId, setEditorId] = useState(null);
    const [draft, setDraft] = useState(blankDraft);
    const [baseline, setBaseline] = useState(blankDraft);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [loading, setLoading] = useState(true);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const reloadVersion = useRef(0);
    const canManage = currentUser.permissions.includes("academics.manage");
    const isDirty = editorId !== null && JSON.stringify(draft) !== JSON.stringify(baseline);
    const reload = useCallback(async () => {
        const version = ++reloadVersion.current;
        const isCurrent = () => version === reloadVersion.current;
        if (context.loading)
            return false;
        if (!context.schoolId) {
            setRecords([]);
            setError("Select a configured school before opening assessments.");
            setLoading(false);
            return false;
        }
        setLoading(true);
        setError("");
        try {
            const result = await supabase.rpc("get_school_academic_assessments", { p_school_id: context.schoolId });
            if (!isCurrent())
                return false;
            if (result.error)
                throw new Error(result.error.message);
            setRecords((result.data ?? []).map(mapAssessment));
            return true;
        }
        catch (loadError) {
            if (isCurrent()) {
                setRecords([]);
                setError(`Assessments could not be loaded from Supabase: ${loadError instanceof Error ? loadError.message : "Unexpected connection error."}`);
            }
            return false;
        }
        finally {
            if (isCurrent())
                setLoading(false);
        }
    }, [context.loading, context.schoolId]);
    useEffect(() => {
        if (context.loading) {
            reloadVersion.current += 1;
            setRecords([]);
            setError("");
            setLoading(true);
            return;
        }
        void reload();
        return () => { reloadVersion.current += 1; };
    }, [context.loading, reload]);
    const isLoading = loading || context.loading;
    const visibleRecords = context.loading ? [] : records;
    const filteredAssessments = useMemo(() => {
        const query = search.trim().toLowerCase();
        return visibleRecords.filter((assessment) => (!inOLevelWorkspace || assessment.programme === "O-Level") &&
            (!query || assessment.name.toLowerCase().includes(query) || assessment.term.toLowerCase().includes(query)) &&
            (programme === "ALL" || assessment.programme === programme));
    }, [inOLevelWorkspace, programme, visibleRecords, search]);
    function openNew() {
        const values = { ...blankDraft, termId: context.termId, programme: inOLevelWorkspace ? "O-Level" : blankDraft.programme };
        setEditorId("new");
        setDraft(values);
        setBaseline(values);
        setError("");
        setNotice("");
    }
    function openEdit(record) {
        const values = { name: record.name, programme: record.programme, termId: record.termId,
            componentCount: record.componentCount, maximumMark: record.maximumMark, status: record.status };
        setEditorId(record.id);
        setDraft(values);
        setBaseline(values);
        setError("");
        setNotice("");
    }
    function requestClose() { if (isDirty)
        setConfirmDiscard(true);
    else
        setEditorId(null); }
    async function save() {
        if (busy)
            return;
        const name = draft.name.trim();
        if (!name) {
            setError("Enter an assessment name.");
            return;
        }
        if (!draft.termId || !context.terms.some((term) => term.id === draft.termId && term.academicYearId === context.academicYearId)) {
            setError("Select a term in the active academic year.");
            return;
        }
        if (!Number.isInteger(draft.componentCount) || draft.componentCount < 1 || draft.componentCount > 20) {
            setError("Component count must be between 1 and 20.");
            return;
        }
        if (draft.maximumMark <= 0 || draft.maximumMark > 10000) {
            setError("Maximum mark must be greater than 0 and no more than 10000.");
            return;
        }
        if (records.some((item) => item.id !== editorId && item.name.toLowerCase() === name.toLowerCase() && item.termId === draft.termId && item.programme === draft.programme)) {
            setError("An assessment with this name already exists in the selected programme and term.");
            return;
        }
        if (!context.schoolId || !context.academicYearId) {
            setError("The selected school and academic year are required.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const result = await supabase.rpc("save_school_academic_assessment", {
                p_school_id: context.schoolId, p_academic_year_id: context.academicYearId, p_term_id: draft.termId,
                p_assessment_id: editorId === "new" ? null : editorId, p_name: name,
                p_programme: draft.programme === "O-Level" ? "O_LEVEL" : "A_LEVEL",
                p_component_count: draft.componentCount, p_maximum_mark: draft.maximumMark,
                p_status: draft.status === "Open" ? "ACTIVE" : draft.status === "Closed" ? "INACTIVE" : "DRAFT",
            });
            if (result.error)
                throw new Error(result.error.message);
            const savedId = result.data;
            let savedRecordVisible = false;
            let refreshError = "";
            try {
                const verified = await supabase.rpc("get_school_academic_assessments", { p_school_id: context.schoolId });
                if (verified.error)
                    throw new Error(verified.error.message);
                const refreshed = (verified.data ?? []).map(mapAssessment);
                setRecords(refreshed);
                savedRecordVisible = refreshed.some((record) => record.id === savedId);
            }
            catch (verifyError) {
                refreshError = verifyError instanceof Error ? verifyError.message : "Unexpected connection error.";
            }
            setEditorId(null);
            setNotice(savedRecordVisible
                ? `${name} was saved to Supabase (record ${savedId}) and is available for marks entry.`
                : `${name} was saved to Supabase (record ${savedId}), but could not be verified in the register${refreshError ? `: ${refreshError}` : " yet"}. Do not save it again; refresh to verify.`);
        }
        catch (saveError) {
            setError(`Assessment was not confirmed: ${saveError instanceof Error ? saveError.message : "Unexpected connection error."} Your form is still open so you can review it.`);
        }
        finally {
            setBusy(false);
        }
    }
    return <>
    <section className="page-heading"><div><span className="eyebrow">ACADEMIC MANAGEMENT</span><h1>Assessments</h1><p>Configure persistent assessment periods, component counts, maximum marks, and lifecycle status.</p></div>{canManage && <button type="button" className="primary-button" disabled={busy || isLoading || !context.schoolId} onClick={openNew}><Plus size={18} aria-hidden="true"/> Add Assessment</button>}</section>
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {error && !editorId && <p className="form-error-message" role="alert">{error}</p>}
    {editorId && <section className="panel action-form" aria-labelledby="assessment-editor-title"><div className="panel-heading"><div><h2 id="assessment-editor-title">{editorId === "new" ? "Create assessment" : "Edit assessment"}</h2><p>Saved to the selected school, academic year, and term.</p></div><button type="button" className="icon-button" aria-label="Close assessment editor" disabled={busy} onClick={requestClose}><X size={18}/></button></div>{error && <p className="form-error-message" role="alert">{error}</p>}<div className="action-form-grid"><label className="form-field form-field-wide"><span>Assessment name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })}/></label><label className="form-field"><span>Programme</span><select value={draft.programme} disabled={inOLevelWorkspace} onChange={(event) => setDraft({ ...draft, programme: event.target.value })}><option>O-Level</option><option>A-Level</option></select></label><label className="form-field"><span>Term</span><select value={draft.termId} onChange={(event) => setDraft({ ...draft, termId: event.target.value })}><option value="">Select term</option>{context.terms.filter((term) => term.academicYearId === context.academicYearId).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}</select></label><label className="form-field"><span>Component count</span><input type="number" min="1" max="20" value={draft.componentCount} onChange={(event) => setDraft({ ...draft, componentCount: Number(event.target.value) })}/></label><label className="form-field"><span>Maximum mark</span><input type="number" min="0.01" max="10000" step="0.01" value={draft.maximumMark} onChange={(event) => setDraft({ ...draft, maximumMark: Number(event.target.value) })}/></label><label className="form-field"><span>Status</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option>Draft</option><option>Open</option><option>Closed</option></select></label></div><div className="action-form-footer"><button type="button" className="secondary-button" disabled={busy} onClick={requestClose}>Cancel</button><button type="button" className="primary-button" disabled={busy || !isDirty} onClick={() => void save()}><Save size={16}/> {busy ? "Saving…" : editorId === "new" ? "Save Assessment" : "Save Changes"}</button></div></section>}
    <section className="assessment-summary-grid" aria-label="Assessment overview"><AssessmentSummary label="Configured Assessments" value={isLoading ? "…" : String(visibleRecords.length)} detail="Current school context"/><AssessmentSummary label="Open for Entry" value={isLoading ? "…" : String(visibleRecords.filter((assessment) => assessment.status === "Open").length)} detail="Available to authorised teachers"/><AssessmentSummary label="Assessment Components" value={isLoading ? "…" : String(visibleRecords.reduce((total, assessment) => total + assessment.componentCount, 0))} detail="Configured component records"/></section>
    <section className="panel assessment-management-panel"><div className="assessment-toolbar"><label className="assessment-search"><SearchInput value={search} onChange={setSearch} placeholder="Search assessment or term…"/></label><label className="assessment-filter"><span>Programme</span><select value={programme} disabled={inOLevelWorkspace} onChange={(event) => setProgramme(event.target.value)}><option value="ALL">All programmes</option><option value="O-Level">O-Level</option><option value="A-Level">A-Level</option></select></label><button type="button" className="secondary-button" disabled={isLoading} onClick={() => void reload()}>Refresh</button></div><div className="assessment-results-heading"><h2>Assessment configuration</h2><p>{isLoading ? "Loading from Supabase…" : `${filteredAssessments.length} assessment${filteredAssessments.length === 1 ? "" : "s"} match the current filters.`}</p></div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Assessment</th><th>Programme</th><th>Term</th><th>Components</th><th>Maximum mark</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredAssessments.map((assessment) => <tr key={assessment.id}><td><div className="assessment-name-cell"><span className="assessment-icon"><ClipboardCheck size={16} aria-hidden="true"/></span><strong>{assessment.name}</strong></div></td><td>{assessment.programme}</td><td>{assessment.term}</td><td>{assessment.componentCount}</td><td>{assessment.maximumMark}</td><td><span className={`status-badge ${assessment.status === "Open" ? "status-active" : "status-inactive"}`}>{assessment.locked ? "Locked" : assessment.status}</span></td><td>{canManage && !assessment.locked ? <button type="button" className="table-view-button" disabled={busy} onClick={() => openEdit(assessment)}><Pencil size={15}/> Edit</button> : "—"}</td></tr>)}{!isLoading && !filteredAssessments.length && <tr><td colSpan={7} className="table-empty-state">No assessments match the current school, year, and filters. Add an assessment or change filters.</td></tr>}</tbody></table></div></section>
    {!inOLevelWorkspace && <ALevelAssessmentConfiguration />}
    <ConfirmDialog open={confirmDiscard} title="Discard unsaved assessment changes?" confirmLabel="Discard changes" destructive onCancel={() => setConfirmDiscard(false)} onConfirm={() => { setConfirmDiscard(false); setEditorId(null); }}><p>The assessment editor contains changes that have not been saved.</p></ConfirmDialog>
  </>;
}
function AssessmentSummary({ label, value, detail }) { return <article className="assessment-summary-card"><span className="assessment-summary-icon"><ClipboardCheck size={20} aria-hidden="true"/></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>; }
