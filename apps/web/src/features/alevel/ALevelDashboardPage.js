import { BookOpenCheck, Building2, ChevronDown, ClipboardCheck, FileCheck2, Layers3, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { usePersistentClassSetup } from "../classes/PersistentClassSetup";
import { AcademicContext, academicRpc, useLiveAcademics } from "./useLiveAcademics";
export function ALevelDashboardPage() {
    const workspace = useLiveAcademics();
    const classSetup = usePersistentClassSetup();
    const location = useLocation();
    const [moreOpen, setMoreOpen] = useState(false);
    const data = workspace.data;
    const ready = workspace.setupState === "READY" && !workspace.error && !workspace.loading && Boolean(data);
    const metric = (value) => workspace.loading ? "Loading…" : workspace.error ? "Could not load" : ready ? value ?? 0 : "Not configured";
    const cards = [
        ["Active subjects", metric(data?.offerings.length), "/setup/subjects?programme=A_LEVEL"],
        ["Saved combinations", metric(data?.combinations.length), "/school/alevel/combinations"],
        ["Assessments & papers", metric(data?.assessments.length), "/setup/assessments?programme=A_LEVEL"],
        ["Assigned learners", metric(data?.learners.filter((learner) => learner.combination_id).length), "/school/alevel/combinations"],
    ];
    const primaryNavigation = [
        ["Overview", "/school/alevel", Layers3],
        ["Subject combinations", "/school/alevel/combinations", BookOpenCheck],
        ["Subjects & papers", "/setup/subjects?programme=A_LEVEL", ClipboardCheck],
        ["Assessments", "/setup/assessments?programme=A_LEVEL", FileCheck2],
    ];
    const overflowNavigation = [
        ["Enter paper marks", "/marks/a-level-entry", ClipboardCheck],
        ["Configure grading", "/settings/academics/a-level/grading", Settings2],
        ["Reports", "/reports/cards", FileCheck2],
    ];
    const isActive = (path) => {
        const basePath = path.split("?")[0];
        return location.pathname === basePath || location.pathname.startsWith(`${basePath}/`);
    };
    const activeOverflowSection = overflowNavigation.find(([, path]) => isActive(path));
    const overflowActive = Boolean(activeOverflowSection);
    return <div className="live-academics">
    <header className="page-heading"><div><span className="eyebrow">ADVANCED SECONDARY</span><h1>A-Level Workspace</h1><p>Saved offerings, combinations and assessment paper configurations for this school.</p></div></header>
    <nav className="a-level-workspace-nav workspace-section-nav" aria-label="A-Level Workspace sections">
      {primaryNavigation.map(([label, path, Icon]) => <Link key={path} to={path} aria-current={isActive(path) ? "page" : undefined} className={isActive(path) ? "active" : ""}><Icon size={17} aria-hidden="true"/><span>{label}</span></Link>)}
      <div className="workspace-overflow">
        <button type="button" className={overflowActive ? "workspace-overflow-trigger active" : "workspace-overflow-trigger"} aria-label={activeOverflowSection ? `${activeOverflowSection[0]} section menu` : "More workspace sections"} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((open) => !open)}><span className="workspace-overflow-current">{activeOverflowSection?.[0] ?? "More"}</span><ChevronDown size={16} aria-hidden="true"/></button>
        {moreOpen && <div className="workspace-overflow-menu" role="menu">{overflowNavigation.map(([label, path, Icon]) => <Link key={path} to={path} role="menuitem" aria-current={isActive(path) ? "page" : undefined} className={isActive(path) ? "active" : ""} onClick={() => setMoreOpen(false)}><Icon size={16} aria-hidden="true"/><span>{label}</span></Link>)}</div>}
      </div>
    </nav>
    <AcademicContext workspace={workspace}/>
    <section className="a-level-dashboard-grid">{cards.map(([label, count, to]) => ready
            ? <Link className="panel a-level-dashboard-card" key={String(label)} to={String(to)}><div><span>{label}</span><strong>{count}</strong></div></Link>
            : <article className="panel a-level-dashboard-card is-disabled" key={String(label)} aria-disabled="true"><div><span>{label}</span><strong>{count}</strong></div></article>)}</section>
    <section className="panel live-academic-form a-level-classes-panel"><div className="panel-heading"><div><h2>A-Level classes</h2><p>Senior 5 and Senior 6 classes are managed here, separately from the O-Level workspace.</p></div><Link className="primary-button" to="/school/alevel/classes/new"><Building2 size={17}/> Add A-Level class</Link></div>{classSetup.error && <p className="form-error-message" role="alert">A-Level classes could not be loaded: {classSetup.error}</p>}{classSetup.loading ? <p>Loading A-Level classes…</p> : <div className="table-wrapper"><table className="data-table"><thead><tr><th>Class</th><th>Academic level</th><th>Academic year</th><th>Learners</th><th>Streams</th><th>Status</th></tr></thead><tbody>{classSetup.classes.filter(item => item.programme === "A_LEVEL" && (item.level === 5 || item.level === 6)).map(item => <tr key={item.id}><td><Link to={`/setup/classes/${item.id}`}>{item.name}</Link></td><td>Senior {item.level}</td><td>{classSetup.academicYears.find(year => year.id === item.academicYearId)?.name ?? "—"}</td><td>{item.learnerCount}</td><td>{item.streams.length}</td><td>{item.status}</td></tr>)}</tbody></table>{!classSetup.classes.some(item => item.programme === "A_LEVEL" && (item.level === 5 || item.level === 6)) && <div className="a-level-subject-empty"><Building2 size={28}/><h3>No S5 or S6 classes yet</h3><p>Create the A-Level classes here. They will not appear in O-Level class lists.</p><Link className="primary-button" to="/school/alevel/classes/new">Create Senior 5 or Senior 6</Link></div>}</div>}</section>
    {ready && <><div className="live-academic-actions" aria-label="A-Level workspace actions"><Link className="primary-button" to="/marks/a-level-entry"><BookOpenCheck size={17}/> Enter paper marks</Link><Link className="secondary-button" to="/settings/academics/a-level/grading"><Settings2 size={17}/> Configure grading</Link></div>
    <section className="panel live-academic-form a-level-subject-panel"><div className="panel-heading"><div><h2>Active school subjects</h2><p>Only active A-Level offerings for the selected academic year appear here.</p></div>{Boolean(data?.offerings.length) && <Link className="secondary-button" to="/setup/subjects?programme=A_LEVEL">Manage subjects</Link>}</div>{data?.offerings.length ? <div className="table-wrapper"><table className="data-table"><thead><tr><th>Subject</th><th>Short name</th><th>Classification</th><th>Configured papers</th></tr></thead><tbody>{data.offerings.map((offering) => <tr key={offering.id}><td>{offering.name}</td><td>{offering.short_name}</td><td>{offering.subject_level}</td><td>{offering.papers.map((paper) => paper.paper_name).join(", ") || "Paper configuration required"}</td></tr>)}</tbody></table></div> : <div className="a-level-subject-empty"><BookOpenCheck size={30}/><h3>No active A-Level subjects</h3><p>Activate the school’s A-Level subject offerings before creating combinations, selecting papers, or entering marks.</p><Link className="primary-button" to="/setup/subjects?programme=A_LEVEL">Activate A-Level subjects</Link></div>}</section></>}
  </div>;
}
export function ALevelCombinationsPage() {
    const workspace = useLiveAcademics();
    const [selected, setSelected] = useState([]);
    const [combination, setCombination] = useState("");
    const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirmAssign, setConfirmAssign] = useState(false);
    const ready = workspace.setupState === "READY" && !workspace.error && !workspace.loading && Boolean(workspace.data);
    async function assign() {
        if (!ready)
            return;
        setBusy(true);
        setNotice("");
        setError("");
        try {
            const count = await academicRpc("assign_a_level_combination", { p_combination: combination, p_learners: selected, p_starts_on: date });
            setNotice(`${count} learner assignment${count === 1 ? "" : "s"} saved. Existing marks and previous assignment history were preserved.`);
            setSelected([]);
            setConfirmAssign(false);
            await workspace.reload();
        }
        catch (reason) {
            setError(`Assignments could not be saved. Your selections were preserved. ${reason.message}`);
        }
        finally {
            setBusy(false);
        }
    }
    return <div className="live-academics">
    <header className="page-heading"><div><span className="eyebrow">A-LEVEL</span><h1>Subject combinations</h1><p>Assignments inherit all five subjects. Previous assignments and their marks remain preserved.</p></div>{ready && <Link className="primary-button" to="/school/alevel/combinations/new">Create combination</Link>}</header>
    <AcademicContext workspace={workspace}/>
    {ready && <><section className="a-level-combination-grid">{workspace.data?.combinations.map((item) => <article className="panel live-academic-form" key={item.id}><h2>{item.code} · {item.name}</h2><p>{item.level} · {item.status}</p><ul>{item.subjects.map((subject) => <li key={subject.school_subject_offering_id}>{workspace.data?.offerings.find((offering) => offering.id === subject.school_subject_offering_id)?.name ?? "Historical offering"} — {subject.subject_role.replaceAll("_", " ")}</li>)}</ul></article>)}</section>
    <section className="panel live-academic-form"><h2>Assign learners</h2><div className="live-academic-controls"><label className="form-field">Saved combination<select value={combination} onChange={(event) => setCombination(event.target.value)}><option value="">Select combination</option>{workspace.data?.combinations.filter((item) => item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label className="form-field">Effective from<input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)}/></label><button className="primary-button" disabled={busy || !workspace.data?.can_manage || !combination || !selected.length} onClick={() => setConfirmAssign(true)}>{busy ? "Saving assignments…" : `Assign ${selected.length} learner${selected.length === 1 ? "" : "s"}`}</button></div>{notice && <p className="form-success-message" role="status">{notice}</p>}{error && <div className="form-error-message" role="alert">{error}<button className="secondary-button" type="button" disabled={busy} onClick={() => void assign()}>Retry</button></div>}<div className="table-wrapper"><table className="data-table"><thead><tr><th>Select</th><th>Learner</th><th>Admission</th><th>Class</th><th>Combination</th></tr></thead><tbody>{workspace.data?.learners.map((learner) => <tr key={learner.id}><td><input type="checkbox" aria-label={`Select ${learner.first_name} ${learner.last_name}`} checked={selected.includes(learner.id)} onChange={(event) => setSelected((old) => event.target.checked ? [...old, learner.id] : old.filter((id) => id !== learner.id))}/></td><td>{learner.first_name} {learner.last_name}</td><td>{learner.admission_number}</td><td>{learner.class_name}</td><td>{workspace.data?.combinations.find((item) => item.id === learner.combination_id)?.code ?? "Not assigned"}</td></tr>)}</tbody></table></div>{!workspace.data?.learners.length && <p>No active A-Level enrolments available for assignment.</p>}<ConfirmDialog open={confirmAssign} title={`Assign ${selected.length} learner${selected.length === 1 ? "" : "s"}?`} description="Confirm the academic assignment before it is saved." confirmLabel={`Assign ${selected.length} learner${selected.length === 1 ? "" : "s"}`} busy={busy} error={error} currentState="Selected learners retain their current combination until confirmation." nextState="The selected active combination becomes effective on the chosen date." impact="New combination assignment records will be created." preserved="Learner profiles, previous assignments, marks, reports, and audit history." reversible={false} destination="Remain on Subject combinations with refreshed assignments." onCancel={() => setConfirmAssign(false)} onConfirm={() => void assign()}><p>Cancel closes this confirmation without changing any learner record.</p></ConfirmDialog></section></>}
  </div>;
}
