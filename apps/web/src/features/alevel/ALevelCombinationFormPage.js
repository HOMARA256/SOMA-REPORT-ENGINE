import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { AcademicContext, academicRpc, useLiveAcademics } from "./useLiveAcademics";
import { useSchoolContext } from "../context/SchoolContext";
export function ALevelCombinationFormPage() {
    const workspace = useLiveAcademics();
    const schoolContext = useSchoolContext();
    const navigate = useNavigate();
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [level, setLevel] = useState("BOTH");
    const [status, setStatus] = useState("ACTIVE");
    const [principals, setPrincipals] = useState(["", "", ""]);
    const [subsidiary, setSubsidiary] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [combinationSaved, setCombinationSaved] = useState(false);
    const [busy, setBusy] = useState(false);
    const [discardOpen, setDiscardOpen] = useState(false);
    const [savingMode, setSavingMode] = useState("");
    const [draftLoaded, setDraftLoaded] = useState(false);
    const [savedFingerprint, setSavedFingerprint] = useState(JSON.stringify({ code: "", name: "", level: "BOTH", status: "ACTIVE", principals: ["", "", ""], subsidiary: "" }));
    const offerings = workspace.data?.offerings ?? [];
    const gp = offerings.filter(o => o.subject_level === "GENERAL_PAPER");
    const ready = workspace.setupState === "READY" && !workspace.error && !workspace.loading && Boolean(workspace.data);
    const currentDraft = { code, name, level, status, principals, subsidiary };
    const currentFingerprint = JSON.stringify(currentDraft);
    const dirty = currentFingerprint !== savedFingerprint;
    useEffect(() => { const warn = (event) => { if (dirty)
        event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
    useEffect(() => { if (!ready || !schoolContext.schoolId || draftLoaded)
        return; setDraftLoaded(true); void academicRpc("get_school_form_draft", { p_school_id: schoolContext.schoolId, p_form_key: "a_level.combination.new" }).then((draft) => { if (!draft)
        return; const restored = { code: String(draft.code ?? ""), name: String(draft.name ?? ""), level: String(draft.level ?? "BOTH"), status: String(draft.status ?? "ACTIVE"), principals: Array.isArray(draft.principals) ? draft.principals.map(String).slice(0, 3).concat(["", "", ""]).slice(0, 3) : ["", "", ""], subsidiary: String(draft.subsidiary ?? "") }; setCode(restored.code); setName(restored.name); setLevel(restored.level); setStatus(restored.status); setPrincipals(restored.principals); setSubsidiary(restored.subsidiary); setSavedFingerprint(JSON.stringify(restored)); setNotice(`Draft restored from ${draft._updated_at ? new Date(String(draft._updated_at)).toLocaleString() : "your previous session"}.`); }).catch((reason) => setError(`Draft could not be restored. ${reason.message}`)); }, [draftLoaded, ready, schoolContext.schoolId]);
    async function saveDraft(leaveAfter = false) { if (!schoolContext.schoolId || busy)
        return; setSavingMode("DRAFT"); setBusy(true); setError(""); try {
        const savedAt = await academicRpc("save_school_form_draft", { p_school_id: schoolContext.schoolId, p_form_key: "a_level.combination.new", p_payload: currentDraft });
        setSavedFingerprint(currentFingerprint);
        setNotice(`Draft saved at ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. You can continue editing later.`);
        if (leaveAfter)
            navigate("/school/alevel/combinations");
    }
    catch (reason) {
        setError(`Draft could not be saved. Your entries were preserved. ${reason.message}`);
    }
    finally {
        setBusy(false);
        setSavingMode("");
    } }
    async function save(event) {
        event.preventDefault();
        if (combinationSaved)
            return;
        const mode = event.nativeEvent.submitter?.dataset.mode === "DRAFT" ? "DRAFT" : "ACTIVE";
        setSavingMode(mode);
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await academicRpc("save_a_level_combination", { p_year: workspace.year, p_code: code, p_name: name, p_level: level, p_status: status, p_principals: principals, p_subsidiary: subsidiary });
        }
        catch (reason) {
            setError(`Combination was not confirmed as saved. Refresh the combinations list before retrying. ${reason.message}`);
            setBusy(false);
            setSavingMode("");
            return;
        }
        setCombinationSaved(true);
        try {
            await academicRpc("clear_school_form_draft", { p_school_id: schoolContext.schoolId, p_form_key: "a_level.combination.new" });
        }
        catch (reason) {
            setError(`The combination was saved successfully, but its old draft could not be cleared. Do not create it again. ${reason.message}`);
            setBusy(false);
            setSavingMode("");
            return;
        }
        navigate("/school/alevel/combinations");
        setBusy(false);
        setSavingMode("");
    }
    function back() { if (dirty)
        setDiscardOpen(true);
    else
        navigate("/school/alevel/combinations"); }
    return <div className="live-academics"><header className="page-heading"><div><span className="eyebrow">A-LEVEL</span><h1>Create combination</h1><p>Three principals, automatic General Paper and one subsidiary from your active school offerings.</p></div><button type="button" className="secondary-button" onClick={back}>Back to combinations</button></header><AcademicContext workspace={workspace}/>
    {ready && <form className="panel live-academic-form" onSubmit={save}><div className="form-grid"><label className="form-field">Code<input required disabled={combinationSaved} maxLength={12} pattern="[A-Za-z0-9-]+" value={code} onChange={e => setCode(e.target.value.toUpperCase())}/></label><label className="form-field">Name<input required disabled={combinationSaved} value={name} onChange={e => setName(e.target.value)}/></label><label className="form-field">Level<select disabled={combinationSaved} value={level} onChange={e => setLevel(e.target.value)}><option value="BOTH">Senior 5 and Senior 6</option><option value="S5">Senior 5</option><option value="S6">Senior 6</option></select></label><label className="form-field">Status<select disabled={combinationSaved} value={status} onChange={e => setStatus(e.target.value)}><option>ACTIVE</option><option>DRAFT</option></select></label>
    {principals.map((value, index) => <label className="form-field" key={index}>Principal {index + 1}<select required disabled={combinationSaved} value={value} onChange={e => setPrincipals(old => old.map((x, i) => i === index ? e.target.value : x))}><option value="">Select principal</option>{offerings.filter(o => o.subject_level === "PRINCIPAL" && (!principals.includes(o.id) || o.id === value)).map(o => <option key={o.id} value={o.id}>{o.name} ({o.short_name})</option>)}</select></label>)}
    <label className="form-field">General Paper — automatic<input readOnly value={gp.length === 1 ? gp[0].name : "Activate exactly one General Paper offering"}/></label><label className="form-field">Subsidiary<select required disabled={combinationSaved} value={subsidiary} onChange={e => setSubsidiary(e.target.value)}><option value="">Select subsidiary</option>{offerings.filter(o => o.subject_level === "SUBSIDIARY").map(o => <option key={o.id} value={o.id}>{o.name} ({o.short_name})</option>)}</select></label></div>
    {notice && <p role="status" className="form-success-message">{notice}</p>}{error && <div role="alert" className="form-error-message">{error}</div>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy || combinationSaved || !workspace.data?.can_manage || !dirty} onClick={() => void saveDraft()}>{busy && savingMode === "DRAFT" ? "Saving draft…" : "Save Draft"}</button><button type="submit" data-mode="ACTIVE" className="primary-button" disabled={busy || combinationSaved || !workspace.data?.can_manage || gp.length !== 1}>{combinationSaved ? "Combination saved" : busy && savingMode === "ACTIVE" ? "Creating…" : "Create and Close"}</button>{combinationSaved && <button type="button" className="secondary-button" onClick={() => navigate("/school/alevel/combinations")}>Open combinations</button>}<button type="button" className="text-button" onClick={back}>Cancel</button></div></form>}<ConfirmDialog open={discardOpen} title="Unsaved changes" description="You have combination changes that have not been saved." confirmLabel="Discard Changes" cancelLabel="Keep Editing" secondaryLabel="Save Draft" onSecondary={() => void saveDraft(true)} destructive currentState="Your browser form contains unsaved changes." nextState="The saved database remains unchanged unless you choose Save Draft." impact="Discard removes only unsaved browser form values." preserved="Previously saved combinations, assignments, marks, and audit history." reversible={false} destination="Return to Subject combinations." onCancel={() => setDiscardOpen(false)} onConfirm={() => navigate("/school/alevel/combinations")}><p>Discarding does not delete any previously saved record.</p></ConfirmDialog></div>;
}
