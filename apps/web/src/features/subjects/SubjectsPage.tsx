import { BookOpen, Check, Plus, Search, ShieldAlert, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { currentUser } from "../../config/currentUser";
import { DeleteRecordButton } from "../../components/DeleteRecordButton";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import type { SubjectProgramme } from "./subjectData";
import { useSchoolSettings } from "../settings/SchoolSettingsWorkspace";

export function SubjectsPage() {
  const workspace = useAcademicWorkspace();
  const { profile } = useSchoolSettings();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [programme, setProgramme] = useState(searchParams.get("programme") === "A_LEVEL" ? "A-Level" : searchParams.get("programme") === "O_LEVEL" ? "O-Level" : "ALL");
  const [className, setClassName] = useState("ALL");
  const [department, setDepartment] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [showCatalogue, setShowCatalogue] = useState(false);
  const [catalogueProgramme, setCatalogueProgramme] = useState<SubjectProgramme>("O_LEVEL");
  const [catalogueSearch, setCatalogueSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [compulsory, setCompulsory] = useState(true);
  const [notice, setNotice] = useState("");
  const canManage = currentUser.permissions.includes("academics.manage");

  const departments = [...new Set(workspace.subjects.map((subject) => subject.department))].sort();
  const filteredSubjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return workspace.subjects.filter((subject) => (
      (!query || [subject.name, subject.code, subject.department].some((value) => value.toLowerCase().includes(query)))
      && (programme === "ALL" || subject.programme === programme)
      && (className === "ALL" || subject.classNames.includes(className))
      && (department === "ALL" || subject.department === department)
      && (status === "ALL" || subject.status === status)
    ));
  }, [className, department, programme, search, status, workspace.subjects]);

  const availableClasses = workspace.classes.filter((item) => item.programme === catalogueProgramme);
  const catalogueItems = workspace.systemSubjects.filter((item) => {
    const query = catalogueSearch.trim().toLowerCase();
    return item.programme === catalogueProgramme
      && !workspace.subjects.some((subject) => subject.systemSubjectId === item.id)
      && (!query || [item.name, item.shortName, item.department].some((value) => value.toLowerCase().includes(query)));
  });

  function resetCatalogue() {
    setSelectedIds([]); setSelectedClasses([]); setCatalogueSearch(""); setCompulsory(true);
  }

  function submitCatalogue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = workspace.addSubjectsFromCatalogue({ systemSubjectIds: selectedIds, classNames: selectedClasses, compulsory });
    if (error) { setNotice(error); return; }
    setNotice(`${selectedIds.length} subject${selectedIds.length === 1 ? "" : "s"} selected from the system catalogue for this review session.`);
    resetCatalogue(); setShowCatalogue(false);
  }

  return <>
    <section className="page-heading">
      <div><span className="eyebrow">ACADEMIC MANAGEMENT</span><h1>{profile.officialName || "School"} Academic Subjects</h1><p>Select the subjects this school offers, connect them to classes, and open each subject workspace.</p></div>
      {canManage && <button type="button" className="primary-button" onClick={() => { setShowCatalogue(true); setNotice(""); }}><Plus size={18} aria-hidden="true" /> Add Subjects</button>}
    </section>

    <p className="class-workspace-note"><ShieldAlert size={17} aria-hidden="true" /> The SOMA REPORT ENGINE National Subject Catalogue is read-only. Required subjects are locked; optional subjects can be activated for this school.</p>
    {notice && <p className="class-workspace-note" role="status">{notice}</p>}

    <section className="subject-summary-grid responsive-grid" aria-label="Subject configuration summary">
      <SubjectSummaryCard label="Subjects Offered" value={String(workspace.subjects.length)} detail="Selected by this school" />
      <SubjectSummaryCard label="O-Level" value={String(workspace.subjects.filter((item) => item.programme === "O-Level").length)} detail="Ordinary level offerings" />
      <SubjectSummaryCard label="A-Level" value={String(workspace.subjects.filter((item) => item.programme === "A-Level").length)} detail="Advanced level offerings" />
      <SubjectSummaryCard label="Departments" value={String(departments.length)} detail="Represented in selections" />
    </section>

    <section className="panel subject-management-panel">
      <div className="subject-toolbar subject-toolbar-wide">
        <label className="subject-search"><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subject, code or department…" /></label>
        <Filter label="Programme" value={programme} onChange={setProgramme} options={["ALL", "O-Level", "A-Level"]} />
        <Filter label="Class" value={className} onChange={setClassName} options={["ALL", ...workspace.classes.map((item) => item.name)]} />
        <Filter label="Department" value={department} onChange={setDepartment} options={["ALL", ...departments]} />
        <Filter label="Status" value={status} onChange={setStatus} options={["ALL", "Active", "Inactive"]} />
      </div>
      <div className="subject-results-heading"><h2>School subject offerings</h2><p>{filteredSubjects.length} subject{filteredSubjects.length === 1 ? "" : "s"} match the current filters.</p></div>
      <div className="table-wrapper"><table className="data-table subject-offerings-table"><thead><tr><th>Subject</th><th>School code</th><th>Programme</th><th>Classes</th><th>Teachers</th><th>Rule</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {filteredSubjects.map((subject) => { const offerings = workspace.offerings.filter((item) => item.subjectId === subject.id); const advancedOfferings = workspace.aLevelOfferings.filter((item) => item.subjectCode === subject.code && item.subjectName === subject.name); const teachers = [...new Set([...offerings.map((item) => item.teacher), ...advancedOfferings.map((item) => item.teacher)])]; return <tr key={subject.id}>
          <td><Link className="subject-name-link" to={`/setup/subjects/${subject.id}`}><span className="subject-icon"><BookOpen size={16} aria-hidden="true" /></span><span><strong>{subject.name}</strong><small>{subject.department} · {subject.verificationStatus.replaceAll("_", " ")}</small></span></Link></td>
          <td><span className="subject-code">{subject.code}</span></td><td>{subject.programme}</td><td>{subject.classNames.join(", ") || "Not allocated"}</td><td>{teachers.join(", ") || "Not assigned"}</td><td>{subject.compulsory ? "Compulsory" : "Elective"}</td><td><span className={`status-badge ${subject.status === "Active" ? "status-active" : "status-inactive"}`}>{subject.status}</span></td>
          <td><div className="session-row-actions"><Link className="table-view-button" to={`/setup/subjects/${subject.id}`}>Open</Link>{canManage && <DeleteRecordButton label={subject.name} onDelete={() => workspace.deleteSubject(subject.id)} onDeleted={() => setNotice(`${subject.name} removed from this review session.`)} />}</div></td>
        </tr>; })}
        {!filteredSubjects.length && <tr><td colSpan={8} className="subject-empty-row">No school subjects match these filters.</td></tr>}
      </tbody></table></div>
    </section>

    {showCatalogue && <div className="catalogue-backdrop" role="presentation"><form className="catalogue-dialog" role="dialog" aria-modal="true" aria-labelledby="catalogue-title" onSubmit={submitCatalogue}>
      <header><div><span className="eyebrow">SUBJECT CATALOGUE</span><h2 id="catalogue-title">Activate subjects for this school</h2><p>Select optional learning areas, then choose the classes that will offer them.</p></div><button type="button" className="catalogue-close" aria-label="Close subject catalogue" onClick={() => { setShowCatalogue(false); resetCatalogue(); }}><X size={20} /></button></header>
      <div className="catalogue-layout">
        <section className="catalogue-picker"><div className="catalogue-controls"><label>Programme<select value={catalogueProgramme} onChange={(event) => { setCatalogueProgramme(event.target.value as SubjectProgramme); setSelectedIds([]); setSelectedClasses([]); }}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label><label className="catalogue-search"><span>Find a subject</span><input value={catalogueSearch} onChange={(event) => setCatalogueSearch(event.target.value)} placeholder="Search catalogue…" /></label></div>
          <div className="catalogue-list">{catalogueItems.map((item) => <label key={item.id} className={`catalogue-item ${selectedIds.includes(item.id) ? "catalogue-item-selected" : ""}`}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span className="catalogue-check"><Check size={15} /></span><span><strong>{item.name}</strong><small>{item.department} · {item.subjectLevel?.replaceAll("_", " ") ?? "Level pending"}</small></span><em>{item.verificationStatus.replaceAll("_", " ")}</em></label>)}{!catalogueItems.length && <p className="catalogue-empty">No unselected catalogue subjects match this search.</p>}</div>
        </section>
        <aside className="catalogue-allocation"><h3>Class allocation</h3><p>Only classes in the selected programme are shown.</p><div className="catalogue-class-list">{availableClasses.map((item) => <label key={item.id}><input type="checkbox" checked={selectedClasses.includes(item.name)} onChange={() => setSelectedClasses((current) => current.includes(item.name) ? current.filter((name) => name !== item.name) : [...current, item.name])} /><span>{item.name}</span></label>)}</div><label className="catalogue-rule"><input type="checkbox" checked={compulsory} onChange={(event) => setCompulsory(event.target.checked)} /><span><strong>Compulsory subject</strong><small>Eligible active learners in selected classes are included by default.</small></span></label><dl><div><dt>Selected subjects</dt><dd>{selectedIds.length}</dd></div><div><dt>Selected classes</dt><dd>{selectedClasses.length}</dd></div></dl></aside>
      </div>
      <footer><button type="button" className="secondary-button" onClick={() => { setShowCatalogue(false); resetCatalogue(); }}>Cancel</button><button type="submit" className="primary-button" disabled={!selectedIds.length || !selectedClasses.length}>Add selected subjects</button></footer>
    </form></div>}
  </>;
}

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="subject-filter"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option === "ALL" ? `All ${label.toLowerCase()}s` : option}</option>)}</select></label>;
}

function SubjectSummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="subject-summary-card"><span className="subject-summary-icon"><BookOpen size={20} aria-hidden="true" /></span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}
