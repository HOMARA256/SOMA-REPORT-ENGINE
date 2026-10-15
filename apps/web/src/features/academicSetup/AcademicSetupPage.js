import { BookOpenCheck, CalendarDays, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useSchoolContext } from "../context/SchoolContext";
import { supabase } from "../../config/supabaseClient";
import { currentUser } from "../../config/currentUser";
import { useSystemDialogs } from "../../components/system/SystemDialogs";
export function AcademicSetupPage() {
    const dialogs = useSystemDialogs();
    const context = useSchoolContext();
    const activeYear = context.academicYears.find((year) => year.id === context.academicYearId);
    const operationalTerms = context.terms.filter((term) => ["OPEN", "MARKS_OPEN", "REVIEW"].includes(term.status)).length;
    const [form, setForm] = useState("");
    const [name, setName] = useState("");
    const [termNumber, setTermNumber] = useState("1");
    const [startsOn, setStartsOn] = useState("");
    const [endsOn, setEndsOn] = useState("");
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [activatingTermId, setActivatingTermId] = useState("");
    const canManageAcademics = currentUser.permissions.includes("academics.manage");
    async function savePeriod(event) {
        event.preventDefault();
        if (!supabase || !form)
            return;
        setBusy(true);
        setNotice("");
        const { error } = await supabase.rpc("save_school_academic_period", { p_school_id: context.schoolId, p_kind: form, p_parent_year: form === "TERM" ? context.academicYearId : null, p_name: name, p_number: form === "TERM" ? Number(termNumber) : null, p_starts_on: startsOn, p_ends_on: endsOn });
        if (error)
            setNotice(error.message || "The academic period could not be saved.");
        else {
            setNotice(`${form === "YEAR" ? "Academic year" : "Term"} saved.`);
            setForm("");
            setName("");
            setStartsOn("");
            setEndsOn("");
            await context.refresh();
        }
        setBusy(false);
    }
    async function activateTerm(termId, termName) {
        if (!supabase || !context.schoolId || !canManageAcademics || activatingTermId)
            return;
        if (!await dialogs.confirm({ title: `Open ${termName} for marks?`, message: "Confirm that the term dates are correct and that staff are ready to begin academic work.", confirmLabel: "Open term" }))
            return;
        setActivatingTermId(termId);
        setNotice("");
        try {
            const { error } = await supabase.rpc("activate_school_academic_term", {
                p_school_id: context.schoolId, p_term_id: termId,
                p_reason: "Academic administrator confirmed the term dates and opened it for marks.",
            });
            if (error)
                setNotice(`The term could not be opened: ${error.message || "Check the term and academic-year setup."}`);
            else {
                setNotice(`${termName} is now open for marks.`);
                await context.refresh();
            }
        }
        catch (error) {
            setNotice(`The term could not be opened: ${error instanceof Error ? error.message : "Check your connection and try again."}`);
        }
        finally {
            setActivatingTermId("");
        }
    }
    return <>
    {notice && !form && <p className={notice.includes("could not") ? "form-error-message" : "form-success-message"} role={notice.includes("could not") ? "alert" : "status"}>{notice}</p>}
    <section className="page-heading"><div><span className="eyebrow">ACADEMIC MANAGEMENT</span><h1>Academic Setup</h1><p>Manage academic years and term lifecycle states before opening assessment and marks workflows.</p></div></section>
    <section className="panel class-setup-entry"><div><h2>Classes and streams</h2><p>Configure classes and inspect their learners, offerings and marks status.</p></div><Link className="secondary-button" to="/setup/classes">Manage classes</Link></section>
    <section className="panel class-setup-entry"><div><h2>Academic Setup Health</h2><p>Validate missing streams, class teachers, subject offerings, teacher allocations and learner enrolments.</p></div><Link className="secondary-button" to="/setup/health">Run health checks</Link></section>
    <section className="panel class-setup-entry"><div><h2>Teacher subject allocations</h2><p>Assign Teacher-role staff to term, class, stream and active subject offerings.</p></div><Link className="secondary-button" to="/setup/teacher-allocations">Manage allocations</Link></section>

    <section className="stats-grid" aria-label="Academic setup overview">
      <AcademicStat label="Active Academic Year" value={context.loading ? "Loading…" : activeYear?.name ?? "Not configured"} detail={activeYear?.status ?? "Create an academic year"} icon={<CalendarDays size={18}/>}/>
      <AcademicStat label="Configured Terms" value={context.loading ? "Loading…" : String(context.terms.length)} detail={context.terms.length ? `For ${activeYear?.name ?? "selected year"}` : "No terms configured"} icon={<BookOpenCheck size={18}/>}/>
      <AcademicStat label="Operational Terms" value={context.loading ? "Loading…" : String(operationalTerms)} detail="Open for academic work" icon={<CheckCircle2 size={18}/>} status="success"/>
    </section>

    {!context.loading && !activeYear && <section className="panel academic-guidance guidance-info"><div><strong>Academic year required</strong><p>No academic year exists for {context.schoolName}. Create the first year before adding terms, classes or assessments.</p></div><button type="button" className="primary-button" onClick={() => setForm("YEAR")}>Create Academic Year</button></section>}
    {activeYear && !context.terms.length && <section className="panel academic-guidance guidance-warning"><div><strong>Term required</strong><p>Create a term for {activeYear.name} before entering marks or configuring A-Level work.</p></div><button type="button" className="primary-button" onClick={() => setForm("TERM")}>Create Term</button></section>}

    {form && <form className="panel live-academic-form academic-period-form" onSubmit={savePeriod}><div><h2>{form === "YEAR" ? "Create Academic Year" : `Create Term for ${activeYear?.name}`}</h2><p>The saved period becomes available throughout the school workspace after validation.</p></div><div className="form-grid"><label className="form-field">Name<input required value={name} placeholder={form === "YEAR" ? "e.g. 2027" : "e.g. Term I"} onChange={event => setName(event.target.value)}/></label>{form === "TERM" && <label className="form-field">Term number<select value={termNumber} onChange={event => setTermNumber(event.target.value)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>}<label className="form-field">Start date<input required type="date" value={startsOn} onChange={event => setStartsOn(event.target.value)}/></label><label className="form-field">End date<input required type="date" min={startsOn} value={endsOn} onChange={event => setEndsOn(event.target.value)}/></label></div>{notice && <p className="form-error-message" role="alert">{notice}</p>}<div className="form-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : `Save ${form === "YEAR" ? "Academic Year" : "Term"}`}</button><button type="button" className="secondary-button" onClick={() => { setForm(""); setNotice(""); }}>Cancel</button></div></form>}

    {activeYear && <section className="panel"><div className="panel-heading"><div className="panel-title-group"><span className="panel-icon"><CalendarDays size={19} aria-hidden="true"/></span><div><h2>{activeYear.name} academic year</h2><p>{activeYear.startsOn} to {activeYear.endsOn}</p></div></div><span className="status-badge status-active">{activeYear.status}</span></div>
      <div className="table-wrapper"><table className="data-table"><thead><tr><th>Term</th><th>Start date</th><th>End date</th><th>Lifecycle status</th><th>Action</th></tr></thead><tbody>{context.terms.map((term) => <tr key={term.id}><td><strong>{term.name}</strong></td><td>{term.startsOn}</td><td>{term.endsOn}</td><td><span className={`status-badge ${["OPEN", "MARKS_OPEN", "REVIEW"].includes(term.status) ? "status-active" : "status-inactive"}`}>{term.status.replaceAll("_", " ")}</span></td><td>{term.status === "DRAFT" && canManageAcademics ? <button type="button" className="table-view-button" disabled={Boolean(activatingTermId)} onClick={() => void activateTerm(term.id, term.name)}>{activatingTermId === term.id ? "Opening…" : "Open for marks"}</button> : "—"}</td></tr>)}{!context.terms.length && <tr><td colSpan={5} className="table-empty-state">No terms have been configured for this academic year.</td></tr>}</tbody></table></div>
    </section>}
  </>;
}
function AcademicStat({ label, value, detail, icon, status }) { return <article className="stat-card"><div className="stat-card-header"><span className="stat-label">{label}</span><span className={`stat-icon ${status ? `stat-icon-${status}` : ""}`}>{icon}</span></div><strong className="stat-value">{value}</strong><span className="stat-detail">{detail}</span></article>; }
