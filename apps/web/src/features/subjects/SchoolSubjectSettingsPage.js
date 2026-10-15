import { BookOpen, CheckCircle2, ChevronDown, ChevronUp, LockKeyhole, Plus, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useLocation } from "react-router-dom";
import { useSchoolSettings } from "../settings/SchoolSettingsWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
const activationReasons = [
    "Required by the NCDC Lower Secondary curriculum",
    "Required for the school's approved A-Level combinations",
    "Part of the school's approved curriculum offering",
    "Required by current learner enrolment and subject choices",
    "Qualified teacher and timetable capacity are available",
    "Approved by school academic leadership",
];
const deactivationReasons = [
    "The subject is not offered in the selected academic year",
    "No learners are enrolled for this subject",
    "Qualified teaching capacity is not currently available",
    "Removed following the school's curriculum review",
    "Replaced by another approved school subject offering",
];
export function SchoolSubjectSettingsPage() {
    const { profile } = useSchoolSettings();
    const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
    const context = useSchoolContext();
    const schoolId = context.schoolId;
    const yearId = context.academicYearId;
    const [schoolName, setSchoolName] = useState("");
    const [subjects, setSubjects] = useState([]);
    const [offerings, setOfferings] = useState([]);
    const [query, setQuery] = useState("");
    const [programme, setProgramme] = useState(inOLevelWorkspace ? "O_LEVEL" : "ALL");
    const [area, setArea] = useState("ALL");
    const [active, setActive] = useState("ALL");
    const [rule, setRule] = useState("ALL");
    const [expanded, setExpanded] = useState(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState("");
    const [statusRequest, setStatusRequest] = useState(null);
    const [reason, setReason] = useState("");
    const [showInternal, setShowInternal] = useState(false);
    const [internal, setInternal] = useState({ name: "", code: "", area: "", programme: "O_LEVEL" });
    const loadVersion = useRef(0);
    void schoolName;
    async function load() { const version = ++loadVersion.current; const isCurrent = () => version === loadVersion.current; if (context.loading) {
        setSubjects([]);
        setOfferings([]);
        setSchoolName("");
        setError("");
        return false;
    } setError(""); if (context.error) {
        setSubjects([]);
        setOfferings([]);
        setError(context.error);
        return false;
    } if (!schoolId || !yearId) {
        setSubjects([]);
        setOfferings([]);
        setSchoolName("");
        return false;
    } try {
        if (!supabase)
            throw new Error("Supabase is not configured.");
        const result = await supabase.rpc("get_school_subject_settings", { p_school_id: schoolId, p_academic_year_id: yearId });
        if (!isCurrent())
            return false;
        if (result.error)
            throw new Error(result.error.message);
        const payload = result.data;
        setSchoolName(payload?.schoolName ?? "");
        setSubjects(payload?.catalogue ?? []);
        setOfferings(payload?.offerings ?? []);
        return true;
    }
    catch (loadError) {
        if (isCurrent())
            setError(`Subject settings could not be refreshed: ${loadError instanceof Error ? loadError.message : "Unexpected connection error."}`);
        return false;
    } }
    useEffect(() => { setStatusRequest(null); setReason(""); void load(); }, [schoolId, yearId, context.loading, context.error]);
    const scopedSubjects = subjects.filter(subject => !inOLevelWorkspace || subject.programme === "O_LEVEL");
    const scopedOfferings = offerings.filter(offering => !inOLevelWorkspace || scopedSubjects.some(subject => subject.id === offering.system_subject_id));
    const offeringBySubject = useMemo(() => new Map(scopedOfferings.filter(o => o.system_subject_id).map(o => [o.system_subject_id, o])), [scopedOfferings]);
    const areas = [...new Set(scopedSubjects.map(s => s.department_category))].sort();
    const hasAlternativeReligiousOption = (subject) => Boolean(subject.curriculum_choice_levels?.some(level => subjects.some(other => other.id !== subject.id && other.programme === subject.programme && other.curriculum_choice_levels?.includes(level) && offeringBySubject.get(other.id)?.status === "ACTIVE")));
    const isCurriculumRequired = (subject) => subject.is_compulsory || Boolean(subject.curriculum_choice_levels?.length);
    const isProtectedFromDeactivation = (subject) => subject.is_compulsory || Boolean(subject.curriculum_choice_levels?.length && !hasAlternativeReligiousOption(subject));
    const levelLabel = (levels) => levels?.length ? levels.map(level => `S${level}`).join(", ") : "O-Level";
    const filtered = scopedSubjects.filter(s => { const isActive = offeringBySubject.get(s.id)?.status === "ACTIVE"; return `${s.subject_name} ${s.subject_code ?? ""}`.toLowerCase().includes(query.toLowerCase()) && (programme === "ALL" || s.programme === programme) && (area === "ALL" || s.department_category === area) && (active === "ALL" || (active === "ACTIVE") === isActive) && (rule === "ALL" || (rule === "REQUIRED") === isCurriculumRequired(s)); });
    function requestChange(subject, next) { setReason(""); setError(""); setStatusRequest({ subject, next }); }
    async function confirmChange() { if (!supabase || !schoolId || !yearId || !statusRequest || !reason)
        return; const { subject, next } = statusRequest; setBusy(subject.id); setError(""); setNotice(""); try {
        const { error: rpcError } = await supabase.rpc("set_school_catalogue_subject_status", { p_school_id: schoolId, p_academic_year_id: yearId, p_system_subject_id: subject.id, p_active: next, p_reason: reason });
        if (rpcError)
            throw new Error(rpcError.message);
        const refreshed = await load();
        setStatusRequest(null);
        setReason("");
        setNotice(refreshed ? `${subject.subject_name} ${next ? "activated" : "deactivated"} for this school. Reason: ${reason}.` : `Supabase saved the ${next ? "activation" : "deactivation"} for ${subject.subject_name}, but the catalogue could not refresh. Do not repeat the action; refresh this page to verify.`);
    }
    catch (saveError) {
        const detail = saveError instanceof Error ? saveError.message : "Unknown database error";
        setError(isProtectedFromDeactivation(subject) && !next ? "This required subject cannot be deactivated; keep at least one Religious Education option active." : /audit_logs_user_id_fkey/i.test(detail) ? "Supabase could not save this activation because its audit identity is out of date. The change was rolled back; no subject status changed. Apply the pending subject-activation migration before retrying." : /offering_status|column .*status|42804|schema cache/i.test(detail) ? "Subject activation is blocked by an outdated Supabase function. No change was confirmed. Apply the latest subject-curriculum migration, then refresh and retry." : `The subject status could not be confirmed: ${detail}`);
        setStatusRequest(null);
        setReason("");
    }
    finally {
        setBusy("");
    } }
    async function addInternal(event) { event.preventDefault(); if (!supabase || !schoolId || !yearId)
        return; setBusy("internal"); setError(""); setNotice(""); const name = internal.name.trim(); try {
        const { error: rpcError } = await supabase.rpc("create_school_internal_subject", { p_school_id: schoolId, p_academic_year_id: yearId, p_programme: internal.programme, p_code: internal.code, p_name: name, p_learning_area: internal.area });
        if (rpcError)
            throw new Error(rpcError.message);
        const refreshed = await load();
        setNotice(refreshed ? `${name} was created as a school-owned subject and saved to the catalogue.` : `${name} was saved, but the subject catalogue could not refresh. Do not create it again; refresh to verify.`);
        setInternal({ name: "", code: "", area: "", programme: "O_LEVEL" });
        setShowInternal(false);
    }
    catch (saveError) {
        setError(`The school subject was not confirmed: ${saveError instanceof Error ? saveError.message : "Unexpected connection error."}`);
    }
    finally {
        setBusy("");
    } }
    return <><section className="page-heading"><div><span className="eyebrow">ACADEMIC MANAGEMENT</span><h1>{profile.officialName || "School"} Academic Subjects</h1><p>Activate optional learning areas, review required subjects and manage school-owned subjects.</p></div><div className="session-row-actions"><ContactPlatformSupportButton category="SUBJECT_ACTIVATION"/><button className="primary-button" onClick={() => setShowInternal(!showInternal)}><Plus size={18}/> Add School Subject</button></div></section>{error && <div className="form-error-message" role="alert">{error}</div>}{notice && <p className="class-workspace-note" role="status">{notice}</p>}
 {showInternal && <form className="panel subject-internal-form" onSubmit={addInternal}><div className="panel-heading"><div><h2>Create school-owned subject</h2><p>This subject remains private to {profile.officialName || "this school"}.</p></div></div><div className="form-grid"><label className="form-field"><span>Subject name</span><input required value={internal.name} onChange={e => setInternal({ ...internal, name: e.target.value })}/></label><label className="form-field"><span>School code</span><input value={internal.code} onChange={e => setInternal({ ...internal, code: e.target.value })}/></label><label className="form-field"><span>Learning area</span><input required value={internal.area} onChange={e => setInternal({ ...internal, area: e.target.value })}/></label><label className="form-field"><span>Academic level</span><select disabled={inOLevelWorkspace} value={internal.programme} onChange={e => setInternal({ ...internal, programme: e.target.value })}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label></div><div className="form-actions"><button className="secondary-button" type="button" onClick={() => setShowInternal(false)}>Cancel</button><button className="primary-button" disabled={busy === "internal"}>{busy === "internal" ? "Creating…" : "Create School Subject"}</button></div></form>}
 <section className="panel subject-management-panel">
  <div className="subject-toolbar subject-toolbar-wide">
   <label className="subject-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search subject, learning area or code"/></label>
   <Filter label="Academic Level" value={programme} set={setProgramme} values={["ALL", "O_LEVEL", "A_LEVEL"]} disabled={inOLevelWorkspace}/>
   <Filter label="Learning Area" value={area} set={setArea} values={["ALL", ...areas]}/>
   <Filter label="Active Status" value={active} set={setActive} values={["ALL", "ACTIVE", "INACTIVE"]}/>
   <Filter label="Subject Rule" value={rule} set={setRule} values={["ALL", "REQUIRED", "OPTIONAL"]}/>
  </div>
  <div className="table-wrapper"><table className="data-table subject-settings-table">
   <thead><tr><th>Subject / Learning Area</th><th>Code</th><th>Academic Level</th><th>Curriculum Rule</th><th>Active for This School</th><th>Paper Structure</th><th>Action</th></tr></thead>
   <tbody>{filtered.map(subject => {
            const enabled = offeringBySubject.get(subject.id)?.status === "ACTIVE";
            const required = isCurriculumRequired(subject);
            const curriculumLevels = subject.curriculum_required_levels ?? [];
            const choiceLevels = subject.curriculum_choice_levels ?? [];
            return <Fragment key={subject.id}><tr>
     <td><div className="subject-learning-area-cell"><strong>{subject.subject_name}</strong><small><span>{subject.short_name}</span><span>{subject.department_category}</span></small></div></td>
     <td><span className="subject-code">{subject.subject_code ?? "Not assigned"}</span></td>
     <td>{subject.programme === "O_LEVEL" ? "O-Level" : "A-Level"}<small className="subject-level-label">{subject.subject_level?.replaceAll("_", " ")}</small></td>
     <td>{subject.is_compulsory ? <span className="status-badge status-active subject-curriculum-badge"><LockKeyhole size={13}/> Required · {levelLabel(curriculumLevels)}</span> : choiceLevels.length ? <span className="status-badge status-active subject-curriculum-badge">Required choice · {levelLabel(choiceLevels)}</span> : "Optional subject"}</td>
     <td><span className={`status-badge ${enabled ? "status-active" : "status-inactive"}`}>{enabled ? "Active" : "Inactive"}</span></td>
     <td><button className="table-action subject-paper-count" onClick={() => setExpanded(expanded === subject.id ? null : subject.id)} aria-label={`View ${subject.subject_name} paper structure`}><BookOpen size={15}/>{subject.system_subject_papers.length} {expanded === subject.id ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button></td>
     <td><button className="table-view-button" disabled={busy === subject.id || (enabled && isProtectedFromDeactivation(subject))} onClick={() => requestChange(subject, !enabled)}>{isProtectedFromDeactivation(subject) && enabled ? "Locked" : required && !enabled ? "Activate required" : enabled ? "Deactivate" : "Activate"}</button></td>
    </tr>{expanded === subject.id && <tr><td colSpan={7}><div className="platform-catalogue-papers">{subject.system_subject_papers.length ? subject.system_subject_papers.map(p => <article key={p.id}><BookOpen size={17}/><div><strong>{p.paper_code} · {p.paper_name}</strong><span>{p.official_component_type ?? p.component_type.replaceAll("_", " ")}</span></div></article>) : <p className="subject-papers-empty">No active paper structure is configured for this subject.</p>}</div></td></tr>}</Fragment>;
        })}</tbody>
  </table></div>
  <footer>{filtered.length} catalogue subjects · {offerings.filter(o => o.status === "ACTIVE").length} active school offerings</footer>
 </section>
 {statusRequest && <div className="subject-status-backdrop" role="presentation" onMouseDown={event => { if (event.currentTarget === event.target && !busy)
        setStatusRequest(null); }}><section className="subject-status-dialog" role="dialog" aria-modal="true" aria-labelledby="subject-status-title"><header><div><span className="eyebrow">SUBJECT OFFERING</span><h2 id="subject-status-title">{statusRequest.next ? "Activate" : "Deactivate"} {statusRequest.subject.subject_name}</h2></div><button type="button" className="icon-button" aria-label="Close" disabled={Boolean(busy)} onClick={() => setStatusRequest(null)}><X size={19}/></button></header><div className="subject-status-summary"><BookOpen size={20}/><div><strong>{statusRequest.subject.subject_code ?? "No code"} · {statusRequest.subject.programme === "A_LEVEL" ? "A-Level" : "O-Level"}</strong><span>{statusRequest.subject.department_category} · {statusRequest.subject.system_subject_papers.length} official paper{statusRequest.subject.system_subject_papers.length === 1 ? "" : "s"}</span></div></div><label className="form-field"><span>Reason for {statusRequest.next ? "activation" : "deactivation"}</span><select autoFocus value={reason} onChange={event => setReason(event.target.value)}><option value="">Select a reason</option>{(statusRequest.next ? activationReasons.filter(item => isCurriculumRequired(statusRequest.subject) || item !== "Required by the NCDC Lower Secondary curriculum") : deactivationReasons).map(item => <option key={item} value={item}>{item}</option>)}</select></label><p className="subject-status-impact"><CheckCircle2 size={17}/> The selected reason will be saved in the audit history with this change.</p><footer><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => setStatusRequest(null)}>Cancel</button><button type="button" className="primary-button" disabled={!reason || Boolean(busy)} onClick={() => void confirmChange()}>{busy ? "Saving…" : statusRequest.next ? "Activate Subject" : "Deactivate Subject"}</button></footer></section></div>}</>;
}
function Filter({ label, value, set, values, disabled = false }) { return <label className="subject-filter"><span>{label}</span><select disabled={disabled} value={value} onChange={e => set(e.target.value)}>{values.map(v => <option key={v} value={v}>{v === "ALL" ? `All ${label.toLowerCase()}s` : v.replaceAll("_", " ")}</option>)}</select></label>; }
