import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Save, UserPlus } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { useSystemDialogs } from "../../components/system/SystemDialogs";
const emptyLearner = { firstName: "", otherName: "", lastName: "", dateOfBirth: "", gender: "", nationality: "", previousSchool: "", admissionType: "NEW", admissionDate: "", notes: "" };
const emptyGuardian = { fullName: "", relationship: "Parent/Guardian", phone: "", alternatePhone: "", email: "", address: "", emergencyContact: true };
const errorText = (cause) => {
    if (cause instanceof Error && cause.message)
        return cause.message;
    if (cause && typeof cause === "object") {
        const error = cause;
        const detail = [error.message, error.details, error.hint]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join(" ");
        if (detail) {
            if (error.code === "42501" || /SCHOOL_ADMIN_REQUIRED|ADMISSIONS_PERMISSION_REQUIRED/.test(detail))
                return "Your account does not have permission to manage admissions for this school.";
            if (error.code === "PGRST202" || /function .* does not exist|could not find the function/i.test(detail))
                return `PostgREST cannot resolve an admissions RPC (${detail}). Refresh the schema cache or confirm the function migration is applied.`;
            return detail;
        }
    }
    return "The admission request failed without a database error message. Check the connection and refresh.";
};
async function rpc(name, args) {
    if (!supabase)
        throw new Error("The school database is not configured.");
    const { data, error } = await supabase.rpc(name, args);
    if (error)
        throw error;
    return data;
}
export function SchoolAdmissionForm({ schoolId, schoolName, openings, onConfirmed, onChanged, onDirtyChange }) {
    const dialogs = useSystemDialogs();
    const [drafts, setDrafts] = useState([]);
    const [id, setId] = useState("");
    const [reference, setReference] = useState("");
    const [savedAt, setSavedAt] = useState("");
    const [openingId, setOpeningId] = useState("");
    const [level, setLevel] = useState("");
    const [learner, setLearner] = useState(emptyLearner);
    const [guardian, setGuardian] = useState(emptyGuardian);
    const [reviewing, setReviewing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const activeOpening = openings.find((item) => item.id === openingId);
    const availableOpenings = openings.filter((item) => item.status === "OPEN" || item.status === "DRAFT" || item.id === openingId);
    const missing = useMemo(() => [
        !openingId && "Admission intake", !level && "Class level",
        !learner.admissionDate && "Admission date",
        !learner.firstName.trim() && "First name", !learner.lastName.trim() && "Last name",
        !learner.dateOfBirth && "Date of birth", !learner.gender && "Gender",
        !guardian.fullName.trim() && "Guardian name", !guardian.phone.trim() && "Guardian phone",
    ].filter(Boolean), [openingId, level, learner, guardian]);
    const loadDrafts = useCallback(async () => {
        if (!schoolId) {
            setDrafts([]);
            return;
        }
        try {
            setDrafts(await rpc("get_school_admission_drafts", { p_school_id: schoolId }) ?? []);
        }
        catch (cause) {
            setError(errorText(cause));
        }
    }, [schoolId]);
    useEffect(() => { void loadDrafts(); }, [loadDrafts]);
    useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => {
        setId("");
        setReference("");
        setSavedAt("");
        setOpeningId("");
        setLevel("");
        setLearner(emptyLearner);
        setGuardian(emptyGuardian);
        setDirty(false);
        setReviewing(false);
    }, [schoolId]);
    async function chooseDraft(draftId) {
        if (dirty && !await dialogs.confirm({ title: "Discard unsaved changes?", message: "Your last saved draft will remain available.", confirmLabel: "Discard changes", cancelLabel: "Keep editing" }))
            return;
        const draft = drafts.find((item) => item.id === draftId);
        if (!draft) {
            reset();
            return;
        }
        setId(draft.id);
        setReference(draft.reference);
        setSavedAt(draft.updatedAt);
        setOpeningId(draft.openingId);
        setLevel(String(draft.classLevel));
        setLearner({ ...emptyLearner, ...draft.learner });
        setGuardian({ ...emptyGuardian, ...draft.guardian });
        setDirty(false);
        setReviewing(false);
        setError("");
        setNotice("");
    }
    function reset() {
        setId("");
        setReference("");
        setSavedAt("");
        setOpeningId("");
        setLevel("");
        setLearner(emptyLearner);
        setGuardian(emptyGuardian);
        setDirty(false);
        setReviewing(false);
        setError("");
        setNotice("");
    }
    async function saveDraft() {
        if (!schoolId || !openingId || !level)
            throw new Error("Choose an admission intake and class level before saving.");
        const saved = await rpc("save_school_admission_draft", {
            p_school_id: schoolId, p_application_id: id || null, p_opening_id: openingId,
            p_class_level: Number(level), p_learner_details: learner, p_guardian_details: guardian,
        });
        setId(saved.id);
        setReference(saved.reference);
        setSavedAt(saved.updatedAt);
        setDirty(false);
        await loadDrafts();
        await onChanged();
        return saved.id;
    }
    async function save(event) {
        event.preventDefault();
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await saveDraft();
            setNotice("Draft saved to this school. You can resume it after signing in again.");
        }
        catch (cause) {
            setError(errorText(cause));
        }
        finally {
            setBusy(false);
        }
    }
    async function confirm() {
        if (missing.length) {
            setError(`Complete: ${missing.join(", ")}.`);
            return;
        }
        if (!await dialogs.confirm({ title: "Confirm admission", message: "Confirm this admission information and continue to class placement?", confirmLabel: "Confirm admission" }))
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const applicationId = dirty || !id ? await saveDraft() : id;
            await rpc("confirm_school_admission_draft", { p_school_id: schoolId, p_application_id: applicationId });
            setNotice("Admission reviewed. Select the class and stream below to complete enrolment.");
            setReviewing(false);
            setDirty(false);
            await loadDrafts();
            await onConfirmed(applicationId);
        }
        catch (cause) {
            setError(errorText(cause));
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="admissions-card school-admission-form" id="school-admission-form" aria-labelledby="school-admission-title">
    <div className="admissions-card__head"><div><span className="eyebrow">SCHOOL-ENTERED ADMISSION</span><h2 id="school-admission-title">{schoolName} · Admission form</h2><p>Save a draft without creating a learner or admission number. Confirmation continues through the existing placement workflow.</p></div><UserPlus size={25} aria-hidden="true"/></div>
    {error && <p className="admissions-alert" role="alert">{error}</p>}{notice && <p className="admissions-notice" role="status">{notice}</p>}
    <div className="admissions-grid"><label>Resume a school draft<select value={id} onChange={(event) => void chooseDraft(event.target.value)}><option value="">New admission</option>{drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.reference} · {draft.learner.firstName} {draft.learner.lastName} · {new Date(draft.updatedAt).toLocaleString()}</option>)}</select></label><p className="admissions-help">{savedAt ? `Last saved ${new Date(savedAt).toLocaleString()} · ${reference}` : "No saved draft selected."}</p></div>
    {reviewing ? <div className="school-admission-review"><h3>Review before confirmation</h3><dl><div><dt>Intake</dt><dd>{activeOpening?.title} · {activeOpening?.yearName} · S{level}</dd></div><div><dt>Learner</dt><dd>{[learner.firstName, learner.otherName, learner.lastName].filter(Boolean).join(" ")} · {learner.gender} · {learner.dateOfBirth}</dd></div><div><dt>Guardian</dt><dd>{guardian.fullName} · {guardian.phone}</dd></div><div><dt>Admission type</dt><dd>{learner.admissionType.replaceAll("_", " ")}</dd></div></dl>{missing.length > 0 && <p className="admissions-alert">Missing: {missing.join(", ")}</p>}<div className="admissions-actions"><button type="button" className="button" onClick={() => setReviewing(false)}>Back to edit</button><button type="button" className="button button--primary" disabled={busy || missing.length > 0} onClick={() => void confirm()}><ClipboardCheck size={17}/>{busy ? "Confirming…" : "Confirm and place learner"}</button></div></div> :
            <form className="admissions-form" onSubmit={(event) => void save(event)}>
      <h3>Admission and learner identity</h3>
      <div className="admissions-grid"><label>Admission intake<select required value={openingId} onChange={(event) => { const next = openings.find((item) => item.id === event.target.value); setOpeningId(event.target.value); setLevel(String(next?.targetClassLevels[0] ?? "")); setDirty(true); }}><option value="">Choose intake</option>{availableOpenings.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.yearName}</option>)}</select></label><label>Intended level<select required value={level} onChange={(event) => { setLevel(event.target.value); setDirty(true); }}><option value="">Choose level</option>{activeOpening?.targetClassLevels.map((item) => <option key={item} value={item}>Senior {item}</option>)}</select></label><label>Admission date<input type="date" value={learner.admissionDate} onChange={(event) => { setLearner({ ...learner, admissionDate: event.target.value }); setDirty(true); }}/></label><label>Admission type<select value={learner.admissionType} onChange={(event) => { setLearner({ ...learner, admissionType: event.target.value }); setDirty(true); }}><option value="NEW">New admission</option><option value="TRANSFER_IN">Transfer in</option><option value="RETURNING">Returning learner</option></select></label><label>Previous school (if relevant)<input value={learner.previousSchool} onChange={(event) => { setLearner({ ...learner, previousSchool: event.target.value }); setDirty(true); }}/></label><label>First legal name<input value={learner.firstName} onChange={(event) => { setLearner({ ...learner, firstName: event.target.value }); setDirty(true); }}/></label><label>Other name<input value={learner.otherName} onChange={(event) => { setLearner({ ...learner, otherName: event.target.value }); setDirty(true); }}/></label><label>Last legal name<input value={learner.lastName} onChange={(event) => { setLearner({ ...learner, lastName: event.target.value }); setDirty(true); }}/></label><label>Date of birth<input type="date" max={new Date().toISOString().slice(0, 10)} value={learner.dateOfBirth} onChange={(event) => { setLearner({ ...learner, dateOfBirth: event.target.value }); setDirty(true); }}/></label><label>Gender<select value={learner.gender} onChange={(event) => { setLearner({ ...learner, gender: event.target.value }); setDirty(true); }}><option value="">Select</option><option value="Female">Female</option><option value="Male">Male</option><option value="Unspecified">Unspecified</option></select></label><label>Nationality<input value={learner.nationality} onChange={(event) => { setLearner({ ...learner, nationality: event.target.value }); setDirty(true); }}/></label></div>
      <h3>Guardian and emergency contact</h3><div className="admissions-grid"><label>Guardian full name<input value={guardian.fullName} onChange={(event) => { setGuardian({ ...guardian, fullName: event.target.value }); setDirty(true); }}/></label><label>Relationship<input value={guardian.relationship} onChange={(event) => { setGuardian({ ...guardian, relationship: event.target.value }); setDirty(true); }}/></label><label>Phone<input type="tel" value={guardian.phone} onChange={(event) => { setGuardian({ ...guardian, phone: event.target.value }); setDirty(true); }}/></label><label>Alternative phone<input type="tel" value={guardian.alternatePhone} onChange={(event) => { setGuardian({ ...guardian, alternatePhone: event.target.value }); setDirty(true); }}/></label><label>Email (optional)<input type="email" value={guardian.email} onChange={(event) => { setGuardian({ ...guardian, email: event.target.value }); setDirty(true); }}/></label><label>Address<input value={guardian.address} onChange={(event) => { setGuardian({ ...guardian, address: event.target.value }); setDirty(true); }}/></label></div><label className="school-admission-checkbox"><input type="checkbox" checked={guardian.emergencyContact} onChange={(event) => { setGuardian({ ...guardian, emergencyContact: event.target.checked }); setDirty(true); }}/> Primary emergency contact</label>
      <label>Restricted internal admission notes<textarea value={learner.notes} onChange={(event) => { setLearner({ ...learner, notes: event.target.value }); setDirty(true); }}/></label>
      <div className="admissions-actions"><button type="submit" className="button button--primary" disabled={busy || !openingId || !level}><Save size={17}/>{busy ? "Saving…" : "Save draft"}</button><button type="button" className="button" disabled={busy || !openingId || !level} onClick={() => { setError(""); setReviewing(true); }}>Review</button><button type="button" className="button" disabled={busy} onClick={async () => { if (!dirty || await dialogs.confirm({ title: "Discard unsaved changes?", message: "Your saved draft will remain available.", confirmLabel: "Discard changes", cancelLabel: "Keep editing" }))
                reset(); }}>Cancel</button></div>
    </form>}
    {availableOpenings.length === 0 && <p className="admissions-help">Create an admission opening first, then return here to enter or resume a school admission.</p>}
  </section>;
}
