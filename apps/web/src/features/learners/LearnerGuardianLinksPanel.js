import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Save } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
export function LearnerGuardianLinksPanel({ schoolId, learnerId }) {
    const [links, setLinks] = useState([]);
    const [matches, setMatches] = useState([]);
    const [query, setQuery] = useState("");
    const [guardianId, setGuardianId] = useState("");
    const [newGuardian, setNewGuardian] = useState(false);
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [relationship, setRelationship] = useState("Parent/Guardian");
    const [primary, setPrimary] = useState(false);
    const [emergency, setEmergency] = useState(false);
    const [permissions, setPermissions] = useState({ academic: true, administrative: true, emergency: true });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const load = useCallback(async () => {
        if (!supabase)
            return;
        const { data, error: loadError } = await supabase.rpc("get_learner_guardian_links", { p_school_id: schoolId, p_learner_id: learnerId });
        if (loadError)
            setError(loadError.message);
        else
            setLinks(Array.isArray(data) ? data : []);
    }, [schoolId, learnerId]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        let active = true;
        if (!supabase || query.trim().length < 2) {
            setMatches([]);
            return;
        }
        const timer = window.setTimeout(async () => {
            const { data, error: lookupError } = await supabase.rpc("search_school_guardians", { p_school_id: schoolId, p_query: query.trim() });
            if (!active)
                return;
            if (lookupError)
                setError(lookupError.message);
            else
                setMatches(Array.isArray(data) ? data : []);
        }, 200);
        return () => { active = false; window.clearTimeout(timer); };
    }, [query, schoolId]);
    function editLink(item) {
        setGuardianId(item.id);
        setNewGuardian(false);
        setName(item.fullName);
        setPhone(item.phone ?? "");
        setEmail(item.email ?? "");
        setRelationship(item.relationship);
        setPrimary(item.isPrimary);
        setEmergency(item.isEmergency);
        setPermissions({ academic: Boolean(item.communicationPermissions?.academic), administrative: Boolean(item.communicationPermissions?.administrative), emergency: Boolean(item.communicationPermissions?.emergency) });
    }
    async function save(event) {
        event.preventDefault();
        if (!supabase)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        const { error: saveError } = await supabase.rpc("link_school_guardian_to_learner", {
            p_school_id: schoolId, p_learner_id: learnerId, p_guardian_id: newGuardian ? null : guardianId || null,
            p_full_name: newGuardian ? name : null, p_phone: newGuardian ? phone : null, p_email: newGuardian ? email || null : null,
            p_relationship: relationship, p_is_primary: primary, p_is_emergency: emergency, p_communication_permissions: permissions,
        });
        if (saveError)
            setError(saveError.message);
        else {
            setNotice("This learner’s guardian relationship and communication permissions were saved without changing sibling links.");
            setGuardianId("");
            setNewGuardian(false);
            setName("");
            setPhone("");
            setEmail("");
            setQuery("");
            await load();
        }
        setBusy(false);
    }
    return <section className="panel learner-guardian-links"><div className="panel-heading"><div><h2><Link2 size={17}/> Guardian links</h2><p>Each relationship, emergency designation, and communication permission belongs to this learner only.</p></div></div>
    {error && <p className="form-error-message" role="alert">{error}</p>}{notice && <p className="form-success-message" role="status">{notice}</p>}
    {links.length === 0 ? <p>No guardian records are linked to this learner.</p> : <div className="learner-guardian-list">{links.map(item => <article key={item.id}><div><strong>{item.fullName}</strong><span>{item.relationship}{item.isPrimary ? " · Primary" : ""}{item.isEmergency ? " · Emergency" : ""}</span><small>{item.phone || "No phone"}{item.email ? ` · ${item.email}` : ""}</small><small>Messages: {Object.entries(item.communicationPermissions ?? {}).filter(([, allowed]) => allowed).map(([key]) => key).join(", ") || "none"}</small></div><button type="button" className="secondary-button" onClick={() => editLink(item)}>Edit this learner’s link</button></article>)}</div>}
    <form onSubmit={(event) => void save(event)}><h3><Plus size={16}/> Add or update guardian link</h3><label>Search this school’s guardian records<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, or email"/></label>{matches.length > 0 && <div className="guardian-match-list">{matches.map(item => <button type="button" key={item.id} className={guardianId === item.id && !newGuardian ? "is-selected" : ""} onClick={() => { setGuardianId(item.id); setNewGuardian(false); setName(item.fullName); setPhone(item.phone ?? ""); setEmail(item.email ?? ""); }}><strong>{item.fullName}</strong><span>{item.phone ?? "No phone"}{item.email ? ` · ${item.email}` : ""}</span><small>{item.linkedLearnerCount} linked learner(s) in this school · choose explicitly</small></button>)}</div>}<button type="button" className="secondary-button" onClick={() => { setGuardianId(""); setNewGuardian(true); setName(""); setPhone(""); setEmail(""); }}>Create separate guardian record</button>{newGuardian && <div className="form-grid"><label>Name<input required minLength={2} value={name} onChange={event => setName(event.target.value)}/></label><label>Phone<input required minLength={5} value={phone} onChange={event => setPhone(event.target.value)}/></label><label>Email (optional)<input type="email" value={email} onChange={event => setEmail(event.target.value)}/></label></div>}<div className="form-grid"><label>Relationship to this learner<input value={relationship} onChange={event => setRelationship(event.target.value)}/></label><label className="guardian-check"><input type="checkbox" checked={primary} onChange={event => setPrimary(event.target.checked)}/>Primary contact for this learner</label><label className="guardian-check"><input type="checkbox" checked={emergency} onChange={event => setEmergency(event.target.checked)}/>Emergency contact for this learner</label></div><fieldset><legend>Communication permissions for this learner</legend>{["academic", "administrative", "emergency"].map(kind => <label className="guardian-check" key={kind}><input type="checkbox" checked={permissions[kind]} onChange={event => setPermissions(current => ({ ...current, [kind]: event.target.checked }))}/>{kind[0].toUpperCase() + kind.slice(1)} messages</label>)}</fieldset><button className="primary-button" disabled={busy || (!newGuardian && !guardianId)}><Save size={16}/>{busy ? "Saving…" : "Save guardian link"}</button></form>
  </section>;
}
