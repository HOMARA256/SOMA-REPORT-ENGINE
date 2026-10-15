import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../context/SchoolContext";
export function GuardianLearnersPage() {
    const school = useSchoolContext();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState({ fullName: "", phone: "", email: "" });
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        if (!supabase || !school.schoolId) {
            setItems([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError("");
        const { data, error: resultError } = await supabase.rpc("get_guardian_linked_learners", { p_school_id: school.schoolId });
        if (resultError) {
            setError(resultError.message);
            setItems([]);
        }
        else
            setItems(Array.isArray(data) ? data : []);
        setLoading(false);
    }, [school.schoolId]);
    useEffect(() => { void load(); }, [load]);
    async function saveContact(event) {
        event.preventDefault();
        if (!supabase || !school.schoolId || !editing)
            return;
        setSaving(true);
        setError("");
        setNotice("");
        const { error: saveError } = await supabase.rpc("update_school_guardian_profile", {
            p_school_id: school.schoolId, p_guardian_id: editing, p_full_name: draft.fullName,
            p_phone: draft.phone, p_email: draft.email || null,
        });
        if (saveError)
            setError(saveError.message);
        else {
            setNotice("Shared guardian contact details updated for this school and all linked learner profiles.");
            setEditing(null);
            await load();
        }
        setSaving(false);
    }
    if (currentUser.role !== "PARENT_GUARDIAN")
        return <section className="panel"><h1>Guardian access required</h1><p>This school-scoped view is available to linked guardian accounts.</p></section>;
    return <main className="page-content guardian-learners-page">
    <header className="page-heading"><div><span className="eyebrow">SCHOOL FAMILY PORTAL</span><h1>Linked learners</h1><p>Only learners linked to your guardian account in {school.schoolName || "the selected school"} are shown.</p></div><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button></header>
    {error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}
    {loading ? <section className="panel">Loading school-linked learners…</section> : items.length === 0 ? <section className="panel"><h2>No linked learner records</h2><p>Your account is not linked to a learner in this school yet. Contact the School Administrator and ask them to link your guardian record.</p></section> : <div className="guardian-learner-grid">{items.map((item) => <article className="panel guardian-learner-card" key={`${item.guardianId}-${item.learnerId}`}><div><span className="eyebrow">{item.relationship}{item.isPrimary ? " · PRIMARY CONTACT" : ""}{item.isEmergency ? " · EMERGENCY" : ""}</span><h2>{item.learnerName}</h2><p>{item.admissionNumber} · {[item.className, item.streamName].filter(Boolean).join(" / ") || "Class allocation pending"}</p><p>Messages: {Object.entries(item.communicationPermissions ?? {}).filter(([, allowed]) => allowed).map(([key]) => key).join(", ") || "none"}</p></div>{editing === item.guardianId ? <form className="guardian-contact-form" onSubmit={(event) => void saveContact(event)}><label>Shared guardian name<input required minLength={2} value={draft.fullName} onChange={(event) => setDraft({ ...draft, fullName: event.target.value })}/></label><label>Phone<input required minLength={5} value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })}/></label><label>Email (optional)<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })}/></label><div><button className="primary-button" disabled={saving}><Save size={15}/>{saving ? "Saving…" : "Save shared details"}</button><button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancel</button></div></form> : <div className="guardian-contact-summary"><span>{item.guardianName}</span><span>{item.phone || "No phone"}</span><span>{item.email || "No email"}</span><button type="button" className="secondary-button" onClick={() => { setEditing(item.guardianId); setDraft({ fullName: item.guardianName, phone: item.phone ?? "", email: item.email ?? "" }); }}>Update shared contact details</button></div>}</article>)}</div>}
  </main>;
}
