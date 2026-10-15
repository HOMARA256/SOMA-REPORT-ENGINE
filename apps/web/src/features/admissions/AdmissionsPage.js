import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Check, FileUp, RefreshCw, Search, Send, ShieldCheck } from "lucide-react";
import { supabase } from "../../config/supabaseClient";
import { currentUser } from "../../config/currentUser";
import { useSchoolContext } from "../context/SchoolContext";
import { SchoolAdmissionForm } from "./SchoolAdmissionForm";
import { AdmissionRecordPanel } from "./AdmissionRecordPanel";
import { SchoolAdmissionDocuments } from "./SchoolAdmissionDocuments";
import { useSystemDialogs } from "../../components/system/SystemDialogs";
const message = (error) => {
    if (error instanceof Error && error.message)
        return error.message;
    if (error && typeof error === "object") {
        const value = error;
        const detail = [value.message, value.details, value.hint]
            .filter((part) => typeof part === "string" && part.trim().length > 0)
            .join(" ");
        if (detail) {
            if (value.code === "42501" || /SCHOOL_ADMIN_REQUIRED|ADMISSIONS_PERMISSION_REQUIRED/.test(detail))
                return "Your account does not have permission to manage admissions for the selected school. Confirm the school and your assigned role.";
            if (value.code === "PGRST202" || /function .* does not exist|could not find the function/i.test(detail))
                return `PostgREST cannot resolve an admissions RPC (${detail}). Refresh the schema cache or confirm that the function migration is applied.`;
            return detail;
        }
    }
    return "The admissions request failed without a database error message. Check the connection and refresh.";
};
const rpc = async (name, args) => {
    if (!supabase)
        throw new Error("Database connection is not configured.");
    const result = await supabase.rpc(name, args);
    if (result.error)
        throw result.error;
    return result.data;
};
const admissionViews = [
    { id: "overview", label: "Overview", icon: ShieldCheck },
    { id: "new", label: "New admission & drafts", icon: FileUp },
    { id: "review", label: "Awaiting review", icon: Search },
    { id: "confirmed", label: "Confirmed admissions", icon: Check },
    { id: "documents", label: "Documents & PDFs", icon: FileUp },
];
function AdmissionsSubNavigation({ active, onNavigate }) {
    const navigate = useNavigate();
    const navRef = useRef(null);
    const probeRef = useRef(null);
    const moreRef = useRef(null);
    const [visibleCount, setVisibleCount] = useState(admissionViews.length);
    useEffect(() => {
        const nav = navRef.current, probe = probeRef.current;
        if (!nav || !probe)
            return;
        const measure = () => {
            const links = Array.from(probe.querySelectorAll("[data-tab-measure]"));
            const fullWidth = links.reduce((total, link) => total + link.offsetWidth, 0) + Math.max(0, links.length - 1) * 8;
            const fullAvailable = nav.clientWidth - 24;
            if (fullWidth <= fullAvailable) {
                setVisibleCount(admissionViews.length);
                return;
            }
            const available = fullAvailable - (moreRef.current?.offsetWidth ?? 84) - 12;
            let used = 0, count = 0;
            for (const link of links) {
                const next = link.offsetWidth + (count ? 8 : 0);
                if (used + next > available)
                    break;
                used += next;
                count += 1;
            }
            setVisibleCount(count === admissionViews.length ? count : Math.max(1, count));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(nav);
        observer.observe(probe);
        return () => observer.disconnect();
    }, [navRef, probeRef, moreRef, visibleCount]);
    useEffect(() => {
        const closeOnOutside = (event) => {
            if (event.target instanceof Node && !navRef.current?.contains(event.target))
                moreRef.current?.removeAttribute("open");
        };
        const closeOnEscape = (event) => {
            if (event.key === "Escape" && moreRef.current?.open) {
                moreRef.current.removeAttribute("open");
                moreRef.current.querySelector("summary")?.focus();
            }
        };
        document.addEventListener("pointerdown", closeOnOutside);
        document.addEventListener("keydown", closeOnEscape);
        return () => { document.removeEventListener("pointerdown", closeOnOutside); document.removeEventListener("keydown", closeOnEscape); };
    }, [navRef, moreRef]);
    const visible = admissionViews.slice(0, visibleCount);
    const overflow = admissionViews.slice(visibleCount);
    const activeHidden = overflow.find((item) => item.id === active);
    const go = async (event, id) => {
        event.preventDefault();
        if (await onNavigate(id))
            navigate(`/admissions/${id}`);
        moreRef.current?.removeAttribute("open");
    };
    return <nav className="admissions-subnav" aria-label="Admissions pages" ref={navRef}>
    <div className="admissions-subnav__tabs">{visible.map(({ id, label, icon: Icon }) => <Link key={id} to={`/admissions/${id}`} onClick={(event) => void go(event, id)} className={active === id ? "is-active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>)}</div>
    {overflow.length > 0 && <details className={`admissions-subnav__more ${activeHidden ? "has-active" : ""}`} ref={moreRef}>
      <summary aria-label={activeHidden ? `More pages, current page ${activeHidden.label}` : "More admissions pages"}>{activeHidden ? <><span className="admissions-subnav__more-current">{activeHidden.label}</span><span className="admissions-subnav__more-label">More</span></> : "More"}</summary>
      <div className="admissions-subnav__menu">{overflow.map(({ id, label, icon: Icon }) => <Link key={id} to={`/admissions/${id}`} onClick={(event) => void go(event, id)} className={active === id ? "is-active" : ""} aria-current={active === id ? "page" : undefined}><Icon size={17} aria-hidden="true"/>{label}</Link>)}</div>
    </details>}
    <div className="admissions-subnav__probe" ref={probeRef} aria-hidden="true">{admissionViews.map(({ label, icon: Icon }) => <span data-tab-measure key={label}><Icon size={17}/>{label}</span>)}</div>
    <label className="admissions-subnav__compact">Admissions page<select aria-label="Admissions page" value={active} onChange={async (event) => { if (await onNavigate(event.target.value))
        navigate(`/admissions/${event.target.value}`); }}>{admissionViews.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
  </nav>;
}
export function PublicAdmissionsPage() {
    const { schoolCode = "" } = useParams();
    const [openings, setOpenings] = useState([]);
    const [openingId, setOpeningId] = useState("");
    const [statusData, setStatusData] = useState(null);
    const [publicForms, setPublicForms] = useState([]);
    const [access, setAccess] = useState(() => {
        try {
            const value = sessionStorage.getItem(`admission:${schoolCode}`);
            return value ? JSON.parse(value) : null;
        }
        catch {
            return null;
        }
    });
    const [learner, setLearner] = useState({ firstName: "", otherName: "", lastName: "", dateOfBirth: "", gender: "" });
    const [guardian, setGuardian] = useState({ fullName: "", relationship: "Parent/Guardian", phone: "", email: "" });
    const [classLevel, setClassLevel] = useState("");
    const [documents, setDocuments] = useState({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const selected = openings.find((item) => item.id === openingId) ?? openings[0];
    const loadOpenings = useCallback(async () => {
        try {
            const data = await rpc("get_public_admission_openings", { p_school_code: schoolCode });
            setOpenings(Array.isArray(data) ? data : []);
            if (!openingId && Array.isArray(data) && data[0]) {
                setOpeningId(data[0].id);
                setClassLevel(String(data[0].targetClassLevels?.[0] ?? ""));
            }
        }
        catch (cause) {
            setError(message(cause));
        }
    }, [schoolCode]);
    useEffect(() => { void loadOpenings(); }, [loadOpenings]);
    useEffect(() => {
        let active = true;
        void supabase?.functions.invoke("admission-public-documents", { body: { schoolCode } }).then(({ data, error }) => {
            if (active && !error && Array.isArray(data?.documents))
                setPublicForms(data.documents);
        }).catch(() => undefined);
        return () => { active = false; };
    }, [schoolCode]);
    useEffect(() => {
        if (!access?.applicationReference || !access.accessToken)
            return;
        void rpc("get_public_admission_application_status", { p_reference: access.applicationReference, p_access_token: access.accessToken }).then(setStatusData).catch((cause) => setError(message(cause)));
    }, [access]);
    async function uploadRequiredFiles(application) {
        const chosen = selected?.requiredDocuments?.filter((doc) => documents[doc.type]) ?? [];
        for (const requirement of chosen) {
            const file = documents[requirement.type];
            const signed = await supabase.functions.invoke("admission-public-upload", { body: { reference: application.applicationReference, accessToken: application.accessToken, fileName: file.name, mimeType: file.type || "application/octet-stream", fileSize: file.size } });
            if (signed.error || signed.data?.error)
                throw new Error(signed.data?.error ?? signed.error?.message ?? "The secure upload could not be started.");
            const { error: uploadError } = await supabase.storage.from("school-admission-documents").uploadToSignedUrl(signed.data.path, signed.data.token, file, { contentType: file.type, upsert: false });
            if (uploadError)
                throw uploadError;
            await rpc("record_public_admission_document", { p_reference: application.applicationReference, p_access_token: application.accessToken, p_document_type: requirement.type, p_storage_path: signed.data.path, p_file_name: file.name, p_mime_type: file.type || "application/octet-stream", p_file_size: file.size });
        }
    }
    async function submit(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        setNotice("");
        try {
            if (!selected)
                throw new Error("This school has no active admission opening.");
            const result = access?.applicationReference
                ? await rpc("save_public_admission_draft", { p_reference: access.applicationReference, p_access_token: access.accessToken, p_class_level: Number(classLevel), p_learner_details: learner, p_guardian_details: guardian })
                : await rpc("start_public_admission_application", { p_opening_id: selected.id, p_class_level: Number(classLevel), p_learner_details: learner, p_guardian_details: guardian });
            const credentials = { ...access, ...result };
            if (!credentials.applicationReference || !credentials.accessToken)
                throw new Error("The application reference could not be confirmed; please retry.");
            await uploadRequiredFiles(credentials);
            const submitted = await rpc("submit_public_admission_application", { p_reference: credentials.applicationReference, p_access_token: credentials.accessToken });
            const saved = { ...credentials, ...submitted };
            setAccess(saved);
            sessionStorage.setItem(`admission:${schoolCode}`, JSON.stringify(saved));
            setStatusData(null);
            setNotice(`Application submitted. Keep reference ${saved.applicationReference} and secure access token ${saved.accessToken}. This browser session also stores them so you can check updates.`);
            setDocuments({});
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setLoading(false);
        }
    }
    async function saveDraft(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        setNotice("");
        try {
            if (!selected)
                throw new Error("This school has no active admission opening.");
            const result = access?.applicationReference
                ? await rpc("save_public_admission_draft", { p_reference: access.applicationReference, p_access_token: access.accessToken, p_class_level: Number(classLevel), p_learner_details: learner, p_guardian_details: guardian })
                : await rpc("start_public_admission_application", { p_opening_id: selected.id, p_class_level: Number(classLevel), p_learner_details: learner, p_guardian_details: guardian });
            const saved = { ...access, ...result };
            setAccess(saved);
            sessionStorage.setItem(`admission:${schoolCode}`, JSON.stringify(saved));
            setNotice(`Draft saved. Keep reference ${saved.applicationReference} and secure access token ${saved.accessToken}.`);
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setLoading(false);
        }
    }
    async function checkStatus(event) {
        event.preventDefault();
        setLoading(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
            const credentials = { applicationReference: String(form.get("reference") ?? ""), accessToken: String(form.get("token") ?? "") };
            setStatusData(await rpc("get_public_admission_application_status", { p_reference: credentials.applicationReference, p_access_token: credentials.accessToken }));
            setAccess(credentials);
            sessionStorage.setItem(`admission:${schoolCode}`, JSON.stringify(credentials));
        }
        catch (cause) {
            setError(message(cause));
            setStatusData(null);
        }
        finally {
            setLoading(false);
        }
    }
    async function withdrawApplication() {
        if (!access)
            return;
        setLoading(true);
        setError("");
        try {
            const status = await rpc("withdraw_public_admission_application", { p_reference: access.applicationReference, p_access_token: access.accessToken });
            setStatusData({ ...statusData, ...status });
            setNotice("Your application has been withdrawn.");
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setLoading(false);
        }
    }
    return <main className="admissions-public">
    <header className="admissions-public__brand">{selected?.schoolLogo && <img src={selected.schoolLogo} alt=""/>}<div><p className="eyebrow">ONLINE ADMISSIONS</p><h1>{selected?.schoolName ?? "School admission portal"}</h1><p>{selected?.schoolAddress} {selected?.schoolPhone && ` · ${selected.schoolPhone}`} {selected?.schoolEmail && ` · ${selected.schoolEmail}`}</p></div></header>
    {error && <div className="admissions-alert" role="alert">{error}</div>}{notice && <div className="admissions-notice" role="status">{notice}{notice.includes("pending learner is now in the Learners register") && <> <Link to="/learners">Open Learners</Link></>}</div>}
    {openings.length === 0 ? <section className="admissions-card"><h2>Applications are not currently open</h2><p>Please contact the school for the next intake period.</p></section> : <>
      <section className="admissions-card"><label>Admission intake<select value={openingId || selected?.id || ""} onChange={(e) => { setOpeningId(e.target.value); setClassLevel(""); }}><option value="">Choose intake</option>{openings.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.academicYear}</option>)}</select></label>
        {selected && <><p>{selected.openingDate} – {selected.closingDate}</p><p>{selected.reportingRequirements}</p></>}</section>
      {publicForms.length > 0 && <section className="admissions-card"><h2>School admission forms</h2><p>These documents were explicitly published for admission applicants. Links expire automatically.</p><div className="admissions-docs">{publicForms.map((doc) => <a key={doc.url} href={doc.url} target="_blank" rel="noreferrer">{doc.title} · {doc.fileName}</a>)}</div></section>}
      <form className="admissions-card admissions-form" onSubmit={submit}>
        <h2>Learner details</h2><div className="admissions-grid"><label>First name<input required value={learner.firstName} onChange={(e) => setLearner({ ...learner, firstName: e.target.value })}/></label><label>Other name<input value={learner.otherName} onChange={(e) => setLearner({ ...learner, otherName: e.target.value })}/></label><label>Last name<input required value={learner.lastName} onChange={(e) => setLearner({ ...learner, lastName: e.target.value })}/></label><label>Date of birth<input type="date" value={learner.dateOfBirth} onChange={(e) => setLearner({ ...learner, dateOfBirth: e.target.value })}/></label><label>Gender<select value={learner.gender} onChange={(e) => setLearner({ ...learner, gender: e.target.value })}><option value="">Select</option><option>Female</option><option>Male</option><option>Prefer not to say</option></select></label><label>Intended class level<select required value={classLevel || String(selected?.targetClassLevels?.[0] ?? "")} onChange={(e) => setClassLevel(e.target.value)}><option value="">Select</option>{selected?.targetClassLevels?.map((level) => <option value={level} key={level}>Senior {level}</option>)}</select></label></div>
        <h2>Parent or guardian</h2><div className="admissions-grid"><label>Full name<input required value={guardian.fullName} onChange={(e) => setGuardian({ ...guardian, fullName: e.target.value })}/></label><label>Relationship<input value={guardian.relationship} onChange={(e) => setGuardian({ ...guardian, relationship: e.target.value })}/></label><label>Phone<input required type="tel" value={guardian.phone} onChange={(e) => setGuardian({ ...guardian, phone: e.target.value })}/></label><label>Email<input type="email" value={guardian.email} onChange={(e) => setGuardian({ ...guardian, email: e.target.value })}/></label></div>
        <h2>Required documents</h2><div className="admissions-docs">{(selected?.requiredDocuments ?? []).map((doc) => <label key={doc.type}>{doc.type}{doc.required && " *"}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.txt" onChange={(e) => { const file = e.target.files?.[0]; if (file)
            setDocuments({ ...documents, [doc.type]: file }); }}/></label>)}</div>
        <p className="admissions-help"><ShieldCheck size={16}/> Application submission does not create a learner account or place the learner in a class. The school reviews your application first.</p>
        <div className="admissions-actions"><button type="button" className="button button--secondary" disabled={loading} onClick={() => void saveDraft({ preventDefault: () => undefined })}>Save draft</button><button className="button button--primary" disabled={loading}>{loading ? "Submitting…" : <><Send size={17}/> Submit application</>}</button></div>
      </form>
    </>}
    <section className="admissions-card"><h2>Check application status</h2><form className="admissions-grid" onSubmit={checkStatus}><label>Application reference<input name="reference" defaultValue={access?.applicationReference ?? ""} required/></label><label>Secure access token<input name="token" type="password" required/></label><button className="button button--secondary" disabled={loading}><Search size={16}/> Check status</button></form>
      {statusData && <div className="admissions-status"><strong>{statusData.status?.replaceAll("_", " ")}</strong>{statusData.decisionReason && <p>{statusData.decisionReason}</p>}{statusData.interviewAt && <p>Interview: {new Date(statusData.interviewAt).toLocaleString()}</p>}{statusData.notifications?.map((item, i) => <p key={i}>{item.title}: {item.message}</p>)}{access && !["CONVERTED_TO_LEARNER", "REJECTED", "EXPIRED", "WITHDRAWN"].includes(statusData.status) && <button className="button button--secondary" disabled={loading} onClick={() => void withdrawApplication()}>Withdraw application</button>}</div>}
    </section>
  </main>;
}
export function AdmissionsManagementPage() {
    const { section } = useParams();
    const navigate = useNavigate();
    const activeView = section ?? "overview";
    const dialogs = useSystemDialogs();
    const school = useSchoolContext();
    const canManage = currentUser.permissions.includes("admissions.manage") || currentUser.role === "SCHOOL_ADMIN";
    const [data, setData] = useState({ openings: [], applications: [], academicYears: [], classes: [] });
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [openingFilter, setOpeningFilter] = useState("ALL");
    const [yearFilter, setYearFilter] = useState("ALL");
    const [levelFilter, setLevelFilter] = useState("ALL");
    const [decisionFilter, setDecisionFilter] = useState("ALL");
    const [submittedDate, setSubmittedDate] = useState("");
    const [incompleteOnly, setIncompleteOnly] = useState(false);
    const [interviewAt, setInterviewAt] = useState("");
    const [selection, setSelection] = useState(null);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [draftDirty, setDraftDirty] = useState(false);
    const [opening, setOpening] = useState({ title: "", academicYearId: "", targetClassLevels: [], openingDate: "", closingDate: "", reportingRequirements: "", requiredDocuments: [{ type: "Birth certificate", required: true }, { type: "Previous school report", required: false }], status: "DRAFT" });
    const [decision, setDecision] = useState("");
    const [classId, setClassId] = useState("");
    const [streamId, setStreamId] = useState("");
    const [aLevelCombinationId, setALevelCombinationId] = useState("");
    const [existingLearnerId, setExistingLearnerId] = useState("");
    const [religionIds, setReligionIds] = useState([]);
    const [electiveIds, setElectiveIds] = useState([]);
    const [guardianMode, setGuardianMode] = useState("NEW");
    const [guardianId, setGuardianId] = useState("");
    const [guardianName, setGuardianName] = useState("");
    const [guardianPhone, setGuardianPhone] = useState("");
    const [guardianEmail, setGuardianEmail] = useState("");
    const [guardianRelationship, setGuardianRelationship] = useState("Parent/Guardian");
    const [guardianEmergency, setGuardianEmergency] = useState(true);
    const [guardianPermissions, setGuardianPermissions] = useState({ academic: true, administrative: true, emergency: true });
    const [guardianQuery, setGuardianQuery] = useState("");
    const [guardianMatches, setGuardianMatches] = useState([]);
    const [officerUserId, setOfficerUserId] = useState("");
    const isSchoolAdmin = currentUser.role === "SCHOOL_ADMIN";
    useEffect(() => {
        const warnBeforeLeave = (event) => {
            if (!draftDirty)
                return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", warnBeforeLeave);
        return () => window.removeEventListener("beforeunload", warnBeforeLeave);
    }, [draftDirty]);
    useEffect(() => {
        if (!draftDirty)
            return;
        const guardInternalNavigation = (event) => {
            if (!(event.target instanceof Element))
                return;
            const anchor = event.target.closest("a[href]");
            if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download"))
                return;
            const destination = new URL(anchor.href, window.location.href);
            if (destination.origin !== window.location.origin || destination.pathname === "/admissions" || destination.pathname.startsWith("/admissions/"))
                return;
            event.preventDefault();
            event.stopPropagation();
            void dialogs.confirm({ title: "Leave this draft?", message: "Your edits have not been saved. You can save them as a draft first, or leave this editor and continue later.", confirmLabel: "Leave editor", cancelLabel: "Stay and save" }).then((leave) => {
                if (leave) {
                    setDraftDirty(false);
                    navigate(`${destination.pathname}${destination.search}${destination.hash}`);
                }
            });
        };
        document.addEventListener("click", guardInternalNavigation, true);
        return () => document.removeEventListener("click", guardInternalNavigation, true);
    }, [draftDirty, dialogs, navigate]);
    async function confirmSubpageChange(nextView) {
        if (nextView === activeView || !draftDirty)
            return true;
        return dialogs.confirm({ title: "Leave this draft?", message: "Your edits have not been saved. You can save them as a draft first, or leave this editor and continue later.", confirmLabel: "Leave editor", cancelLabel: "Stay and save" });
    }
    const load = useCallback(async () => {
        if (!school.schoolId || !canManage)
            return;
        setBusy(true);
        setError("");
        try {
            const result = await rpc("get_school_admissions_workspace", { p_school_id: school.schoolId });
            setData(result ?? { openings: [], applications: [], academicYears: [], classes: [] });
            return result;
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setBusy(false);
        }
    }, [school.schoolId, canManage]);
    useEffect(() => { void load(); }, [load]);
    useEffect(() => { if (window.location.hash === "#school-admission-form")
        requestAnimationFrame(() => document.getElementById("school-admission-form")?.scrollIntoView({ block: "start" })); }, []);
    useEffect(() => { setExistingLearnerId(selection?.possibleLearners?.length === 1 ? selection.possibleLearners[0].id : ""); }, [selection]);
    useEffect(() => {
        setGuardianMode("NEW");
        setGuardianId("");
        setGuardianMatches([]);
        setGuardianQuery("");
        setGuardianName(selection?.guardian?.fullName ?? "");
        setGuardianPhone(selection?.guardian?.phone ?? "");
        setGuardianEmail(selection?.guardian?.email ?? "");
        setGuardianRelationship(selection?.guardian?.relationship ?? "Parent/Guardian");
    }, [selection?.id]);
    useEffect(() => {
        let active = true;
        if (!school.schoolId || guardianQuery.trim().length < 2 || !supabase) {
            setGuardianMatches([]);
            return;
        }
        const timer = window.setTimeout(async () => {
            const { data: result, error: lookupError } = await supabase.rpc("search_school_guardians", { p_school_id: school.schoolId, p_query: guardianQuery.trim() });
            if (!active)
                return;
            if (lookupError) {
                setError(message(lookupError));
                setGuardianMatches([]);
            }
            else
                setGuardianMatches(Array.isArray(result) ? result : []);
        }, 250);
        return () => { active = false; window.clearTimeout(timer); };
    }, [guardianQuery, school.schoolId]);
    const filtered = useMemo(() => (data.applications ?? []).filter((row) => (statusFilter === "ALL" || row.status === statusFilter) && (openingFilter === "ALL" || row.openingId === openingFilter) &&
        (yearFilter === "ALL" || row.academicYearId === yearFilter) && (levelFilter === "ALL" || row.classLevel === Number(levelFilter)) &&
        (decisionFilter === "ALL" || (decisionFilter === "UNDECIDED" ? !["ACCEPTED", "WAITLISTED", "REJECTED", "WITHDRAWN", "CONVERTED_TO_LEARNER"].includes(row.status) : row.status === decisionFilter)) &&
        (!submittedDate || (row.submittedAt ?? "").slice(0, 10) === submittedDate) &&
        (!incompleteOnly || (row.missingRequiredDocuments?.length ?? 0) > 0 || row.documents.some((doc) => doc.status === "REJECTED")) &&
        (!query || `${row.reference} ${row.learner.firstName} ${row.learner.lastName} ${row.guardian.fullName}`.toLowerCase().includes(query.toLowerCase()))), [data, statusFilter, openingFilter, yearFilter, levelFilter, decisionFilter, submittedDate, incompleteOnly, query]);
    const visibleApplications = filtered.filter((row) => activeView === "confirmed"
        ? ["ACCEPTED", "CONVERTED_TO_LEARNER"].includes(row.status)
        : !["ACCEPTED", "CONVERTED_TO_LEARNER"].includes(row.status));
    async function saveOpening(event) {
        event.preventDefault();
        if (!school.schoolId)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const id = await rpc("save_school_admission_opening", { p_school_id: school.schoolId, p_opening_id: opening.id ?? null, p_academic_year_id: opening.academicYearId, p_title: opening.title, p_levels: opening.targetClassLevels, p_opening_date: opening.openingDate, p_closing_date: opening.closingDate, p_reporting_requirements: opening.reportingRequirements, p_required_documents: opening.requiredDocuments, p_status: opening.status });
            setOpening({ ...opening, id });
            setNotice("Admission opening saved.");
            await load();
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setBusy(false);
        }
    }
    async function review(status) {
        if (!selection || !school.schoolId)
            return;
        if (status === "INTERVIEW_REQUIRED" && !interviewAt) {
            setError("Set the interview date and time before scheduling it.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await rpc("review_school_admission_application", { p_school_id: school.schoolId, p_application_id: selection.id, p_status: status, p_decision_reason: decision, p_interview_at: status === "INTERVIEW_REQUIRED" ? new Date(interviewAt).toISOString() : null });
            setNotice(status === "ACCEPTED" ? `Application ${selection.reference} accepted. The pending learner is now in the Learners register for class and subject setup.` : `Application ${selection.reference} updated.`);
            setSelection(null);
            setDecision("");
            setInterviewAt("");
            if (status === "ACCEPTED")
                navigate("/admissions/confirmed");
            else
                navigate("/admissions/review");
            await load();
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setBusy(false);
        }
    }
    async function convert() {
        if (!selection || !school.schoolId || !classId)
            return;
        if ((selection.possibleLearners?.length ?? 0) > 0 && !existingLearnerId) {
            setError("Confirm which existing learner profile this application should link to.");
            return;
        }
        if (!conversionReady) {
            setError(selectedClass?.programme === "A_LEVEL" ? "Choose an active A-Level combination for this academic year." : "Complete the required O-Level religious education and elective choices before admitting this learner.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const id = await rpc("admit_school_applicant_as_learner_with_guardian", { p_school_id: school.schoolId, p_application_id: selection.id, p_class_id: classId, p_stream_id: streamId || null, p_admission_date: selection.learner.admissionDate || new Date().toISOString().slice(0, 10), p_religion_offering_ids: religionIds, p_elective_offering_ids: electiveIds, p_a_level_combination_id: aLevelCombinationId || null, p_existing_learner_id: existingLearnerId || selection.pendingLearnerId || null, p_guardian_id: guardianMode === "EXISTING" ? guardianId : null, p_guardian_name: guardianMode === "NEW" ? guardianName : null, p_guardian_phone: guardianMode === "NEW" ? guardianPhone : null, p_guardian_email: guardianMode === "NEW" ? guardianEmail || null : null, p_relationship: guardianRelationship, p_is_primary: true, p_is_emergency: guardianEmergency, p_communication_permissions: guardianPermissions });
            setNotice(`Learner admitted and linked to the selected class, subject offerings, and school-scoped guardian record.`);
            const refreshed = await load();
            setSelection(refreshed?.applications?.find((item) => item.id === selection.id) ?? { ...selection, status: "CONVERTED_TO_LEARNER", convertedLearnerId: id });
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setBusy(false);
        }
    }
    async function setAdmissionsOfficer(userId, enabled) {
        if (!school.schoolId)
            return;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            await rpc("set_school_admissions_officer", { p_school_id: school.schoolId, p_user_id: userId, p_enabled: enabled });
            setNotice(enabled ? "Admissions Officer access granted. The person’s existing school role was saved and can be restored when access is removed." : "Admissions Officer access removed and the prior school role restored.");
            setOfficerUserId("");
            await load();
        }
        catch (cause) {
            setError(message(cause));
        }
        finally {
            setBusy(false);
        }
    }
    async function openDocument(path) {
        const { data: signed, error: signedError } = await supabase.storage.from("school-admission-documents").createSignedUrl(path, 90);
        if (signedError) {
            setError(message(signedError));
            return;
        }
        window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
    }
    if (!canManage)
        return <main className="page-content"><section className="admissions-card"><h1>Admissions access required</h1><p>Ask your school administrator to grant admissions access.</p></section></main>;
    const selectedClass = data.classes?.find((item) => item.id === classId);
    const religionMin = Number(selectedClass?.religionMin ?? (selectedClass?.level <= 2 ? 1 : 0));
    const religionMax = Number(selectedClass?.religionMax ?? (selectedClass?.level <= 2 ? 1 : 0));
    const conversionReady = Boolean(classId) && ((selection?.possibleLearners?.length ?? 0) === 0 || Boolean(existingLearnerId)) &&
        (guardianMode !== "EXISTING" || Boolean(guardianId)) && (guardianMode !== "NEW" || (guardianName.trim().length >= 2 && guardianPhone.trim().length >= 5)) &&
        (selectedClass?.programme !== "A_LEVEL" || Boolean(aLevelCombinationId)) &&
        (selectedClass?.programme !== "O_LEVEL" || (religionIds.length >= religionMin && religionIds.length <= religionMax && electiveIds.length >= Number(selectedClass.electiveMin ?? 0) && electiveIds.length <= Number(selectedClass.electiveMax ?? Number.MAX_SAFE_INTEGER)));
    if (!admissionViews.some((item) => item.id === activeView))
        return <Navigate to="/admissions/overview" replace/>;
    const selectionView = selection && ["ACCEPTED", "CONVERTED_TO_LEARNER"].includes(selection.status) ? "confirmed" : "review";
    return <main className="page-content admissions-admin">
    <header className="page-heading"><div><span className="eyebrow">SCHOOL CONTROL CENTRE</span><h1>Admissions</h1><p>Review applications, stage accepted learners, then complete approval, class placement, and subject offerings.</p></div><button className="button button--secondary" onClick={() => void load()}><RefreshCw size={16}/> Refresh</button></header>
    <AdmissionsSubNavigation active={activeView} onNavigate={confirmSubpageChange}/>
    {error && <div className="admissions-alert" role="alert">{error}</div>}{notice && <div className="admissions-notice" role="status">{notice}</div>}
    <section className="admissions-admin-grid admissions-view-panel" hidden={activeView !== "overview"}><form className="admissions-card admissions-form" onSubmit={saveOpening}><h2>{opening.id ? "Edit admission opening" : "Admission opening"}</h2><label>Title<input required value={opening.title} onChange={(e) => setOpening({ ...opening, title: e.target.value })}/></label><label>Academic year<select required value={opening.academicYearId} onChange={(e) => setOpening({ ...opening, academicYearId: e.target.value })}><option value="">Select year</option>{(data.academicYears ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><fieldset><legend>Eligible class levels</legend><div className="admissions-levels">{[1, 2, 3, 4, 5, 6].map((level) => <label key={level}><input type="checkbox" checked={opening.targetClassLevels.includes(level)} onChange={(e) => setOpening({ ...opening, targetClassLevels: e.target.checked ? [...opening.targetClassLevels, level].sort() : opening.targetClassLevels.filter((n) => n !== level) })}/> S{level}</label>)}</div></fieldset><div className="admissions-grid"><label>Opens<input type="date" required value={opening.openingDate} onChange={(e) => setOpening({ ...opening, openingDate: e.target.value })}/></label><label>Closes<input type="date" required value={opening.closingDate} onChange={(e) => setOpening({ ...opening, closingDate: e.target.value })}/></label></div><label>Reporting requirements<textarea value={opening.reportingRequirements} onChange={(e) => setOpening({ ...opening, reportingRequirements: e.target.value })}/></label><label>Public status<select value={opening.status} onChange={(e) => setOpening({ ...opening, status: e.target.value })}><option>DRAFT</option><option>OPEN</option><option>CLOSED</option><option>ARCHIVED</option></select></label><div className="admissions-actions"><button className="button button--primary" disabled={busy}>Save opening</button>{opening.id && <button type="button" className="button button--secondary" onClick={() => setOpening({ title: "", academicYearId: "", targetClassLevels: [], openingDate: "", closingDate: "", reportingRequirements: "", requiredDocuments: [{ type: "Birth certificate", required: true }, { type: "Previous school report", required: false }], status: "DRAFT" })}>New opening</button>}</div></form></section>
    <section className="admissions-card admissions-requirements-card admissions-view-panel" hidden={activeView !== "overview"}><div className="admissions-card__head"><h2>Requirements for the opening being edited</h2><button type="button" className="button button--secondary" onClick={() => setOpening({ ...opening, requiredDocuments: [...opening.requiredDocuments, { type: "", required: true }] })}>Add requirement</button></div><div className="admissions-requirements">{opening.requiredDocuments.map((doc, index) => <article className="admissions-requirement" key={`${doc.type}-${index}`}><label className="admissions-requirement__name">Document name<input value={doc.type} onChange={(event) => setOpening({ ...opening, requiredDocuments: opening.requiredDocuments.map((item, i) => i === index ? { ...item, type: event.target.value } : item) })}/></label><div className="admissions-requirement__actions"><label className="admissions-requirement__required"><input type="checkbox" checked={doc.required} onChange={(event) => setOpening({ ...opening, requiredDocuments: opening.requiredDocuments.map((item, i) => i === index ? { ...item, required: event.target.checked } : item) })}/><span>Required document</span></label><button type="button" className="button button--secondary" onClick={() => setOpening({ ...opening, requiredDocuments: opening.requiredDocuments.filter((_, i) => i !== index) })}>Remove</button></div></article>)}</div></section>
    {school.schoolId && <div className="admissions-view-panel" hidden={activeView !== "new"}><SchoolAdmissionForm schoolId={school.schoolId} schoolName={school.schoolName} openings={data.openings ?? []} onDirtyChange={setDraftDirty} onChanged={async () => { await load(); }} onConfirmed={async (applicationId) => { const result = await load(); const row = result?.applications?.find((item) => item.id === applicationId); if (row) {
        setSelection(row);
        setClassId("");
        setStreamId("");
        navigate("/admissions/confirmed");
        requestAnimationFrame(() => document.querySelector(".admissions-review")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } }}/></div>}
    <section className="admissions-card admissions-filters admissions-view-panel" hidden={activeView !== "review" && activeView !== "confirmed"} aria-label="Admission register filters"><label>Academic year<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}><option value="ALL">All years</option>{(data.academicYears ?? []).map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select></label><label>Target class level<select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}><option value="ALL">All levels</option>{[1, 2, 3, 4, 5, 6].map((level) => <option key={level} value={level}>Senior {level}</option>)}</select></label><label>Decision status<select value={decisionFilter} onChange={(event) => setDecisionFilter(event.target.value)}><option value="ALL">All decisions</option><option value="UNDECIDED">Pending decision</option>{["ACCEPTED", "WAITLISTED", "REJECTED", "WITHDRAWN", "CONVERTED_TO_LEARNER"].map((status) => <option key={status}>{status.replaceAll("_", " ")}</option>)}</select></label></section>
      <section className="admissions-card admissions-view-panel" hidden={activeView !== "review" && activeView !== "confirmed"}><div className="admissions-card__head"><h2>{activeView === "confirmed" ? "Confirmed admissions" : "Applications awaiting review or action"}</h2><span>{visibleApplications.length} application(s)</span></div><div className="admissions-filters"><label><Search size={16}/><input placeholder="Search name or reference" value={query} onChange={(e) => setQuery(e.target.value)}/></label><select value={openingFilter} onChange={(e) => setOpeningFilter(e.target.value)}><option value="ALL">All openings</option>{(data.openings ?? []).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="ALL">All statuses</option>{["DRAFT", "SUBMITTED", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "INTERVIEW_REQUIRED", "ACCEPTED", "WAITLISTED", "REJECTED", "WITHDRAWN", "EXPIRED", "CONVERTED_TO_LEARNER"].map((status) => <option key={status}>{status}</option>)}</select><label>Submitted on<input type="date" value={submittedDate} onChange={(e) => setSubmittedDate(e.target.value)}/></label><label><input type="checkbox" checked={incompleteOnly} onChange={(e) => setIncompleteOnly(e.target.checked)}/> Incomplete/rejected docs</label></div><div className="admissions-register">{visibleApplications.map((row) => <button className={`admissions-register__row ${selection?.id === row.id ? "is-selected" : ""}`} key={row.id} onClick={() => { setSelection(row); setClassId(""); setStreamId(""); navigate(["ACCEPTED", "CONVERTED_TO_LEARNER"].includes(row.status) ? "/admissions/confirmed" : "/admissions/review"); }}><span><strong>{row.learner.firstName} {row.learner.lastName}</strong><small>{row.reference} · Senior {row.classLevel}</small></span><span className={`admissions-status-tag status-${row.status.toLowerCase()}`}>{row.status.replaceAll("_", " ")}</span><span>{row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : "Draft"}</span></button>)}{visibleApplications.length === 0 && <p className="admissions-empty">{busy ? "Loading applications…" : "No applications match the selected filters."}</p>}</div></section>
      <section className="admissions-card admissions-view-panel" hidden={activeView !== "overview"}><h2>Admission openings</h2><div className="admissions-register">{(data.openings ?? []).map((item) => <div className="admissions-register__row" key={item.id}><span><strong>{item.title}</strong><small>{item.yearName} · {item.openingDate}–{item.closingDate} · {(item.targetClassLevels ?? []).map((level) => `S${level}`).join(", ")}</small></span><span className={`admissions-status-tag status-${item.status.toLowerCase()}`}>{item.status}</span><span>{item.applicationCount} applications</span><button type="button" className="button button--secondary" onClick={() => setOpening({ ...item, academicYearId: item.yearId, requiredDocuments: item.requiredDocuments ?? [], id: item.id })}>Edit</button><a className="button button--secondary" href={`/apply/${currentUser.schoolCode}`} target="_blank" rel="noreferrer">Public portal</a></div>)}{(data.openings ?? []).length === 0 && <p className="admissions-empty">No admission openings yet.</p>}</div></section>
    {selection && <section className="admissions-card admissions-review admissions-view-panel" hidden={activeView !== selectionView}><div className="admissions-card__head"><div><span className="eyebrow">APPLICATION {selection.reference}</span><h2>{selection.learner.firstName} {selection.learner.otherName} {selection.learner.lastName}</h2><p>Senior {selection.classLevel} · {selection.openingTitle}</p></div><button className="button button--secondary" onClick={() => setSelection(null)}>Close</button></div><div className="admissions-grid"><p><strong>Guardian:</strong> {selection.guardian.fullName} · {selection.guardian.phone}</p><p><strong>Email:</strong> {selection.guardian.email || "Not provided"}</p><p><strong>Date of birth:</strong> {selection.learner.dateOfBirth || "Not provided"}</p></div>{(selection.missingRequiredDocuments?.length ?? 0) > 0 && <p className="admissions-alert">Required documents missing: {selection.missingRequiredDocuments?.join(", ")}</p>}<h3>Application documents</h3><div className="admissions-docs">{selection.documents.map((doc) => <div key={doc.id}><span>{doc.type}: {doc.fileName} · {doc.status}</span><button className="button button--secondary" onClick={() => void openDocument(doc.path)}>Secure view</button></div>)}</div><label>Decision note<textarea value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Add a reason or information request"/></label><div className="admissions-actions admissions-actions--wrap">{["UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "ACCEPTED", "WAITLISTED", "REJECTED", "WITHDRAWN"].map((status) => <button className="button button--secondary" key={status} disabled={busy} onClick={() => void review(status)}>{status.replaceAll("_", " ")}</button>)}</div><div className="admissions-interview"><label>Interview date and time<input type="datetime-local" value={interviewAt} onChange={(event) => setInterviewAt(event.target.value)}/></label><button className="button button--secondary" disabled={busy || !interviewAt} onClick={() => void review("INTERVIEW_REQUIRED")}>{selection.status === "INTERVIEW_REQUIRED" ? "Update interview schedule" : "Schedule interview"}</button>{selection.interviewAt && <span>Scheduled: {new Date(selection.interviewAt).toLocaleString()}</span>}</div>{selection.status === "ACCEPTED" && <div className="admissions-conversion"><h3>Report confirmed — admit as learner</h3><div className="admissions-grid"><label>Class<select value={classId} onChange={(e) => { setClassId(e.target.value); setStreamId(""); }}><option value="">Choose class</option>{(data.classes ?? []).filter((item) => item.level === selection.classLevel && item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.programme}</option>)}</select></label><label>Stream<select value={streamId} onChange={(e) => setStreamId(e.target.value)}><option value="">Choose stream</option>{(selectedClass?.streams ?? []).map((stream) => <option key={stream.id} value={stream.id}>{stream.name}</option>)}</select></label></div><button className="button button--primary" disabled={busy || !classId} onClick={() => void convert()}><Check size={17}/> Admit as learner</button><p>This creates one learner, guardian, admission number, and active enrolment. Existing application records remain linked for audit.</p></div>}</section>}
    {selection && school.schoolId && <section className="admissions-card admissions-view-panel" hidden={activeView !== "documents"}><SchoolAdmissionDocuments key={selection.id} schoolId={school.schoolId} applicationId={selection.id} requirements={(data.openings ?? []).find((item) => item.id === selection.openingId)?.requiredDocuments ?? []} documents={selection.documents} onSaved={async () => { const refreshed = await load(); setSelection(refreshed?.applications?.find((item) => item.id === selection.id) ?? selection); }}/></section>}
    {activeView === "documents" && !selection && <section className="admissions-card admissions-empty-state"><h2>Select an application first</h2><p>Choose a record from Awaiting review or Confirmed admissions to manage its protected documents or school-file PDF. Your application selection stays available as you move between pages.</p></section>}
    {selection?.status === "ACCEPTED" && (selection.possibleLearners?.length ?? 0) > 0 && <section className="admissions-card admissions-subject-choice admissions-view-panel" hidden={activeView !== "confirmed"}><h2>Existing learner match found</h2><p>To prevent duplicate learner profiles, confirm the existing record to link. The school and guardian details are checked again by the database.</p><label>Existing learner<select required value={existingLearnerId} onChange={(event) => setExistingLearnerId(event.target.value)}><option value="">Choose a learner profile</option>{selection.possibleLearners?.map((learner) => <option key={learner.id} value={learner.id}>{learner.fullName} · {learner.admissionNumber} · {learner.status}{learner.dateOfBirth ? ` · DOB ${learner.dateOfBirth}` : ""}</option>)}</select></label></section>}
    {selection?.status === "ACCEPTED" && <section className="admissions-card admissions-guardian-link admissions-view-panel" hidden={activeView !== "confirmed"}><h2>Parent or guardian</h2><p>Search only this school’s guardian directory. A similar name or shared phone is only a possible match—choose explicitly to link, or create a separate record.</p><label>Find existing guardian<input value={guardianQuery} onChange={(event) => setGuardianQuery(event.target.value)} placeholder="Search name, phone, or email…"/></label>{guardianMatches.length > 0 && <div className="guardian-match-list">{guardianMatches.map((guardian) => <button type="button" key={guardian.id} className={guardianId === guardian.id && guardianMode === "EXISTING" ? "is-selected" : ""} onClick={() => { setGuardianMode("EXISTING"); setGuardianId(guardian.id); setGuardianName(guardian.fullName); setGuardianPhone(guardian.phone ?? ""); setGuardianEmail(guardian.email ?? ""); }}><strong>{guardian.fullName}</strong><span>{guardian.phone ?? "No phone"}{guardian.email ? ` · ${guardian.email}` : ""}</span><small>{guardian.linkedLearnerCount} linked learner(s) in this school · select to link</small></button>)}</div>}{guardianQuery.trim().length >= 2 && guardianMatches.length === 0 && <p className="admissions-guardian-empty">No exact directory result. You can create a new guardian; records are never merged automatically.</p>}<button type="button" className="button button--secondary" onClick={() => { setGuardianMode("NEW"); setGuardianId(""); setGuardianName(selection.guardian?.fullName ?? ""); setGuardianPhone(selection.guardian?.phone ?? ""); setGuardianEmail(selection.guardian?.email ?? ""); }}>Create a new guardian record</button>{guardianMode === "NEW" && <div className="admissions-grid"><label>Guardian name<input required minLength={2} value={guardianName} onChange={(event) => setGuardianName(event.target.value)}/></label><label>Phone<input required minLength={5} value={guardianPhone} onChange={(event) => setGuardianPhone(event.target.value)}/></label><label>Email (optional)<input type="email" value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)}/></label></div>}<div className="admissions-grid"><label>Relationship to this learner<input value={guardianRelationship} onChange={(event) => setGuardianRelationship(event.target.value)}/></label><label className="guardian-check"><input type="checkbox" checked={guardianEmergency} onChange={(event) => setGuardianEmergency(event.target.checked)}/> Emergency contact for this learner</label></div><fieldset><legend>Communication permissions for this learner</legend>{["academic", "administrative", "emergency"].map((kind) => <label className="guardian-check" key={kind}><input type="checkbox" checked={guardianPermissions[kind]} onChange={(event) => setGuardianPermissions(current => ({ ...current, [kind]: event.target.checked }))}/> {kind[0].toUpperCase() + kind.slice(1)} messages</label>)}</fieldset></section>}
    {selection?.status === "ACCEPTED" && selectedClass?.programme === "O_LEVEL" && <section className="admissions-card admissions-subject-choice admissions-view-panel" hidden={activeView !== "confirmed"}><h2>Curriculum subject selection for conversion</h2><p>Religious Education is a curriculum requirement group, fulfilled only by eligible offerings actually available to this class and stream. Choose the appropriate learner-specific option; neither selection implies religion.</p>{selectedClass.level <= 2 && <fieldset><legend>Religious Education · choose {religionMin}{religionMax !== religionMin ? `–${religionMax}` : ""} available option(s)</legend>{(selectedClass.offerings ?? []).filter((item) => item.requirement === "RELIGION_OPTION" && (!item.streamId || item.streamId === streamId)).map((item) => <label key={item.id}><input type={religionMin === 1 && religionMax === 1 ? "radio" : "checkbox"} name="admission-religion-option" checked={religionIds.includes(item.id)} onChange={(event) => setReligionIds(current => event.target.checked ? (religionMax === 1 ? [item.id] : [...new Set([...current, item.id])]) : current.filter(id => id !== item.id))} disabled={!religionIds.includes(item.id) && religionIds.length >= religionMax}/>{item.code} · {item.name}</label>)}</fieldset>}<fieldset><legend>Electives</legend>{(selectedClass.offerings ?? []).filter((item) => item.requirement === "ELECTIVE" && (!item.streamId || item.streamId === streamId)).map((item) => <label key={item.id}><input type="checkbox" checked={electiveIds.includes(item.id)} onChange={(event) => setElectiveIds(event.target.checked ? [...electiveIds, item.id] : electiveIds.filter((id) => id !== item.id))}/>{item.code} · {item.name}</label>)}</fieldset></section>}
    {selection?.status === "ACCEPTED" && selectedClass?.programme === "A_LEVEL" && <section className="admissions-card admissions-subject-choice admissions-view-panel" hidden={activeView !== "confirmed"}><h2>A-Level combination</h2><p>The chosen combination must match this class’s academic year and all five combination subjects must be actively offered before admission can complete.</p><label>Combination<select required value={aLevelCombinationId} onChange={(event) => setALevelCombinationId(event.target.value)}><option value="">Choose an active combination</option>{(data.aLevelCombinations ?? []).filter((item) => item.academicYearId === selectedClass.yearId && (item.level === "BOTH" || item.level === `S${selectedClass.level}`)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} ({item.yearName})</option>)}</select></label>{(data.aLevelCombinations ?? []).find((item) => item.id === aLevelCombinationId)?.subjects?.map((item) => <span className="admissions-status-tag" key={`${item.code}-${item.role}`}>{item.code} · {item.name} · {item.role}</span>)}</section>}
    {selection?.status === "CONVERTED_TO_LEARNER" && selection.convertedLearnerId && <section className="admissions-card admissions-view-panel" hidden={activeView !== "confirmed"}><h2>Connected learner record</h2><p>This admission is linked to the school’s persistent learner and enrolment records.</p><div className="admissions-actions"><Link className="button" to={`/learners/${selection.convertedLearnerId}`}>Learner profile</Link>{classId && <Link className="button" to={`/setup/classes/${classId}`}>Class roster</Link>}<Link className="button" to="/id-cards">Learner ID cards</Link><Link className="button" to="/progression">Promotion and year-end decisions</Link></div></section>}
    {selection?.status === "CONVERTED_TO_LEARNER" && isSchoolAdmin && school.schoolId && <div className="admissions-view-panel" hidden={activeView !== "documents"}><AdmissionRecordPanel schoolId={school.schoolId} schoolName={school.schoolName} schoolLogo={school.schoolLogo} application={selection}/></div>}
    {isSchoolAdmin && <section className="admissions-card admissions-view-panel" hidden={activeView !== "overview"}><h2>Admissions officers</h2><p>Assigning this role replaces the person’s current school role while they handle admissions; the prior role is retained and restored when access is removed.</p><div className="admissions-grid"><label>Staff member<select value={officerUserId} onChange={(e) => setOfficerUserId(e.target.value)}><option value="">Choose an active staff member</option>{(data.staff ?? []).filter((item) => item.role !== "ADMISSIONS_OFFICER").map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label><button className="button button--primary" disabled={!officerUserId || busy} onClick={() => void setAdmissionsOfficer(officerUserId, true)}>Grant admissions access</button></div>{(data.admissionsOfficers ?? []).map((item) => <div className="admissions-register__row" key={item.userId}><span><strong>{item.name}</strong><small>{item.email} · Previous role: {item.previousRole}</small></span><span>Since {new Date(item.assignedAt).toLocaleDateString()}</span><button className="button button--secondary" onClick={() => void setAdmissionsOfficer(item.userId, false)}>Restore prior role</button></div>)}</section>}
    <p className="admissions-help"><FileUp size={16}/> Public applications are free and independent of subscription payment status. Protected application files are delivered only through short-lived signed URLs.</p>
  </main>;
}
