import { AlertTriangle, BarChart3, Download, Info, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { usePersistentClassSetup } from "../classes/PersistentClassSetup";
import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentMarks, type PersistentMarkOffering } from "../marks/PersistentMarks";
import { activeOLLevelGradingConfiguration, getOLLevelGradingBand } from "../marks/gradingConfiguration";
import { getMarksPreview } from "../marks/marksCalculation";

type AnalysisRow = {
  learnerId: string;
  admissionNumber: string;
  learnerName: string;
  stream: string;
  offering: PersistentMarkOffering;
  score: number | null;
  grade: string;
  descriptor: string;
  state: string;
  moderated: boolean;
};

function csvCell(value: string | number) { return `"${String(value).replaceAll('"', '""')}"`; }
function formatNumber(value: number | null) { return value === null ? "—" : value.toFixed(1); }

export function ResultsAnalysisPage() {
  const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
  const school = useSchoolContext();
  const setup = usePersistentClassSetup();
  const marks = usePersistentMarks();
  const [programme, setProgramme] = useState<"O_LEVEL" | "A_LEVEL">("O_LEVEL");
  const [selectedClass, setSelectedClass] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("all");
  const [selectedStream, setSelectedStream] = useState("all");
  const [stage, setStage] = useState<"draft" | "moderated">("draft");

  const termName = school.termName || "No term selected";
  const classOptions = useMemo(() => setup.classes
    .filter((item) => item.programme === programme && item.academicYearId === school.academicYearId && item.status !== "ARCHIVED" && item.status !== "CLOSED")
    .map((item) => ({ id: item.id, name: item.name })), [setup.classes, programme, school.academicYearId]);
  const activeClassId = classOptions.some((item) => item.id === selectedClass) ? selectedClass : classOptions[0]?.id ?? "";
  const activeClassName = classOptions.find((item) => item.id === activeClassId)?.name ?? "";
  const classOfferings = marks.workspace.offerings.filter((item) => item.programme === programme && item.classId === activeClassId);
  const visibleOfferings = classOfferings.filter((item) => selectedSubject === "all" || item.id === selectedSubject);
  const streamOptions = [...new Set(classOfferings.map((item) => item.streamName).filter((value): value is string => Boolean(value)))].sort();

  const rows: AnalysisRow[] = visibleOfferings.flatMap((offering) => {
    const submission = marks.submissions[offering.id];
    const moderated = submission?.status === "MODERATED";
    if (stage === "moderated" && !moderated) return [];
    return offering.learners
      .filter(() => selectedStream === "all" || offering.streamName === selectedStream)
      .map((learner) => {
        const preview = getMarksPreview(
          learner.aoiMark == null ? "" : String(learner.aoiMark),
          learner.examMark == null ? "" : String(learner.examMark),
          learner.aoiStatus,
          learner.examStatus,
        );
        return {
          learnerId: learner.id,
          admissionNumber: learner.admissionNumber,
          learnerName: learner.name,
          stream: offering.streamName ?? "",
          offering,
          score: preview.state === "PRESENT" ? Number(preview.total) : null,
          grade: preview.grade,
          descriptor: preview.descriptor,
          state: preview.state,
          moderated,
        };
      });
  });

  const completeRows = rows.filter((row) => row.score !== null);
  const average = completeRows.length ? completeRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / completeRows.length : null;
  const moderatedCount = completeRows.filter((row) => row.moderated).length;
  const subjectSummaries = visibleOfferings
    .filter((offering) => stage === "draft" || marks.submissions[offering.id]?.status === "MODERATED")
    .map((offering) => {
      const subjectRows = rows.filter((row) => row.offering.id === offering.id);
      const scores = subjectRows.flatMap((row) => row.score === null ? [] : [row.score]);
      return { offering, total: subjectRows.length, complete: scores.length, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
    });

  useEffect(() => { setSelectedSubject("all"); setSelectedStream("all"); }, [activeClassId]);
  useEffect(() => { if (!streamOptions.includes(selectedStream)) setSelectedStream("all"); }, [streamOptions.join("|"), selectedStream]);

  function exportDraftCsv() {
    const header = ["Learner ID", "Admission No.", "Learner", "Class", "Stream", "Subject", "Total %", "Grade", "Descriptor", "Mark state", "Moderation state"];
    const body = rows.map((row) => [row.learnerId, row.admissionNumber, row.learnerName, row.offering.className, row.stream, row.offering.subjectName, row.score ?? "", row.score === null ? "" : row.grade, row.score === null ? "" : row.descriptor, row.state, row.moderated ? "Moderated in review" : "Not moderated"]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `review-analysis-${activeClassName.toLowerCase().replaceAll(" ", "-")}-${marks.termId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const loading = school.loading || setup.loading || marks.loading;
  const fetchError = school.error || setup.error || marks.error;

  return <>
    <header className="page-heading analysis-heading">
      <div><span className="eyebrow">RESULTS &amp; REPORTING</span><h1>Results &amp; Analysis</h1><p>Explore saved results for {termName} {school.academicYearName}. These are review calculations, not approved or published school results.</p></div>
      {!programme.includes("A_LEVEL") && rows.length > 0 && <button type="button" className="secondary-button" onClick={exportDraftCsv}><Download size={17} aria-hidden="true" /> Export review CSV</button>}
    </header>

    <section className="panel analysis-filter-panel" aria-label="Analysis filters">
      <div className="analysis-filters">
        {!inOLevelWorkspace && <label><span>Programme</span><select value={programme} onChange={(event) => { setProgramme(event.target.value as "O_LEVEL" | "A_LEVEL"); setSelectedClass(""); setSelectedSubject("all"); setSelectedStream("all"); }}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label>}
        <label><span>Class</span><select value={activeClassId} disabled={loading || !classOptions.length} onChange={(event) => { setSelectedClass(event.target.value); setSelectedSubject("all"); setSelectedStream("all"); }}><option value="">{loading ? "Loading classes…" : "No configured class"}</option>{classOptions.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label><span>Subject</span><select value={selectedSubject} disabled={programme === "A_LEVEL" || !classOfferings.length} onChange={(event) => setSelectedSubject(event.target.value)}><option value="all">All configured subjects</option>{classOfferings.map((offering) => <option value={offering.id} key={offering.id}>{offering.subjectName}</option>)}</select></label>
        <label><span>Stream</span><select value={selectedStream} disabled={programme === "A_LEVEL" || !streamOptions.length} onChange={(event) => setSelectedStream(event.target.value)}><option value="all">All streams</option>{streamOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Review stage</span><select value={stage} disabled={programme === "A_LEVEL"} onChange={(event) => setStage(event.target.value as "draft" | "moderated")}><option value="draft">All saved records</option><option value="moderated">Moderated only</option></select></label>
      </div>
    </section>

    {fetchError && <section className="panel analysis-empty-state" role="alert"><AlertTriangle size={25} aria-hidden="true" /><div><h2>Results data could not be loaded</h2><p>{fetchError}</p><button type="button" className="secondary-button" disabled={loading} onClick={() => { void setup.reload(); void marks.reload(); void school.refresh(); }}><RefreshCw size={16} aria-hidden="true" /> Retry data fetch</button></div></section>}
    {!fetchError && loading && <section className="panel analysis-empty-state" role="status"><RefreshCw size={22} className="spin" aria-hidden="true" /><div><h2>Loading saved results</h2><p>Fetching the selected school’s classes, offerings and saved marks for {termName}.</p></div></section>}
    {!fetchError && !loading && !school.academicYearId && <section className="panel analysis-empty-state"><Info size={25} aria-hidden="true" /><div><h2>Academic year required</h2><p>Create or select an academic year before reviewing results.</p><Link className="text-button" to="/setup/academic-years">Open academic years</Link></div></section>}
    {!fetchError && !loading && school.academicYearId && !school.termId && <section className="panel analysis-empty-state"><Info size={25} aria-hidden="true" /><div><h2>Term required</h2><p>Create or select a term for {school.academicYearName} before reviewing saved marks.</p><Link className="text-button" to="/setup/academic-years">Open academic years</Link></div></section>}
    {!fetchError && !loading && school.termId && programme === "A_LEVEL" && <section className="panel analysis-setup-state"><Settings2 size={28} aria-hidden="true" /><div><h2>A-Level analysis needs its own grading configuration</h2><p>A-Level classes and mark records are stored separately. Configure combinations, papers, assessment weights and a versioned A-Level grading scale before calculating results. O-Level rules are not reused.</p></div></section>}
    {!fetchError && !loading && school.termId && programme === "O_LEVEL" && !classOptions.length && <section className="panel analysis-empty-state"><Info size={25} aria-hidden="true" /><div><h2>No O-Level classes configured for this academic year</h2><p>Results uses the school’s persistent class register for {school.academicYearName}. Create or activate O-Level classes, then refresh this page.</p><Link className="text-button" to={inOLevelWorkspace ? "/school/o-level/classes" : "/setup/classes"}>Open Classes</Link></div></section>}
    {!fetchError && !loading && school.termId && programme === "O_LEVEL" && classOptions.length > 0 && !classOfferings.length && <section className="panel analysis-empty-state"><Info size={25} aria-hidden="true" /><div><h2>No subject offerings found for {activeClassName}</h2><p>There are no saved mark-entry offerings for this class and term. Confirm that subjects are offered to this class and that authorized teacher allocations exist.</p><Link className="text-button" to="/marks/entry">Open Marks Entry</Link></div></section>}
    {!fetchError && !loading && school.termId && programme === "O_LEVEL" && classOfferings.length > 0 && <>
      <p className="analysis-draft-notice"><Info size={18} aria-hidden="true" /> Averages and grade bands include completed saved marks only. Missing, absent and exempt marks are never counted as zero. Moderation here is a review state; approval and publication are not implemented.</p>
      <section className="analysis-summary" aria-label="Analysis summary">
        <article><span>Visible records</span><strong>{rows.length}</strong><small>Filtered learner–subject pairs</small></article>
        <article><span>Complete marks</span><strong>{completeRows.length}</strong><small>{rows.length ? `${Math.round(completeRows.length / rows.length * 100)}% of visible records` : "No visible records"}</small></article>
        <article><span>Mean of complete marks</span><strong>{formatNumber(average)}{average === null ? "" : "%"}</strong><small>Not a class final average</small></article>
        <article><span>Moderated records</span><strong>{moderatedCount}</strong><small>Still not approved or published</small></article>
      </section>

      <div className="analysis-sections">
        <section className="panel analysis-distribution"><div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><BarChart3 size={18} aria-hidden="true" /></div><div><h2>Competency distribution</h2><p>{completeRows.length} completed result{completeRows.length === 1 ? "" : "s"} · {activeOLLevelGradingConfiguration.name} v{activeOLLevelGradingConfiguration.version}</p></div></div></div>
          {completeRows.length ? <div className="analysis-band-list">{activeOLLevelGradingConfiguration.bands.map((band) => { const count = completeRows.filter((row) => getOLLevelGradingBand(row.score ?? -1)?.numericValue === band.numericValue).length; return <div className="analysis-band-row" key={band.numericValue}><span>{band.label} <small>{band.numericValue}</small></span><div className="analysis-band-track" role="img" aria-label={`${band.label}: ${count} of ${completeRows.length} completed results`}><span style={{ width: `${count / completeRows.length * 100}%` }} /></div><strong>{count}</strong></div>; })}</div> : <p className="analysis-no-data">{stage === "moderated" ? "No moderated results match this selection." : "Enter and save both required marks for a learner to see the distribution."}</p>}
        </section>

        <section className="panel analysis-subject-panel"><div className="panel-heading"><div><h2>Subject overview</h2><p>Completion and average by configured offering.</p></div></div><div className="table-wrapper"><table className="data-table analysis-subject-table"><thead><tr><th>Subject</th><th>Complete</th><th>Unresolved</th><th>Average</th><th>Workflow</th></tr></thead><tbody>{subjectSummaries.map(({ offering, total, complete, average: subjectAverage }) => { const status = marks.submissions[offering.id]?.status; return <tr key={offering.id}><td><strong>{offering.subjectName}</strong><small>{offering.teacherName ?? "No teacher assigned"}</small></td><td>{complete} / {total}</td><td>{total - complete}</td><td>{formatNumber(subjectAverage)}{subjectAverage === null ? "" : "%"}</td><td>{status ? status.replaceAll("_", " ") : "Draft"}</td></tr>; })}{!subjectSummaries.length && <tr><td colSpan={5}>No moderated subjects match this selection.</td></tr>}</tbody></table></div></section>
      </div>

      <section className="panel analysis-results-panel"><div className="panel-heading"><div><h2>Learner result detail</h2><p>One row per learner and subject offering. A score appears only after both required mark components are saved.</p></div><Link className="text-button" to="/marks/marksheet">View marksheet</Link></div><div className="table-wrapper"><table className="data-table analysis-results-table"><thead><tr><th>Learner</th><th>Stream</th><th>Subject</th><th>Total</th><th>Grade</th><th>Descriptor / mark state</th><th>Review</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.offering.id}:${row.learnerId}`}><td><strong>{row.learnerName}</strong><small>{row.admissionNumber}</small></td><td>{row.stream || "—"}</td><td>{row.offering.subjectName}</td><td>{row.score === null ? "—" : `${row.score}%`}</td><td>{row.score === null ? "—" : row.grade}</td><td>{row.score === null ? row.state.replaceAll("_", " ") : row.descriptor}</td><td>{row.moderated ? "Moderated review" : "Not moderated"}</td><td><Link className="table-view-button" to={`/marks/entry?offering=${encodeURIComponent(row.offering.id)}`}>Open entry</Link></td></tr>)}{!rows.length && <tr><td colSpan={8}>No learner results match these filters. Choose “All saved records” or another class, subject or stream.</td></tr>}</tbody></table></div></section>
    </>}
  </>;
}
