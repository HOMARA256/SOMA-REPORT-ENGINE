import { BarChart3, Download, Info, Settings2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getOfferingLearners, learnerDisplayName, useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { activeOLLevelGradingConfiguration, getOLLevelGradingBand } from "../marks/gradingConfiguration";
import { getMarksPreview } from "../marks/marksCalculation";
function csvCell(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}
function formatNumber(value) {
    return value === null ? "—" : value.toFixed(1);
}
export function ResultsAnalysisPage() {
    const inOLevelWorkspace = useLocation().pathname.startsWith("/school/o-level");
    const workspace = useAcademicWorkspace();
    const schoolContext = useSchoolContext();
    const [programme, setProgramme] = useState("O_LEVEL");
    const [selectedClass, setSelectedClass] = useState("Senior 3");
    const [selectedSubject, setSelectedSubject] = useState("all");
    const [selectedStream, setSelectedStream] = useState("all");
    const [stage, setStage] = useState("draft");
    const termName = schoolContext.termName || "No term selected";
    const isALevel = programme === "A_LEVEL";
    const classOptions = workspace.classes.filter((item) => item.programme === programme).map((item) => item.name);
    const activeClass = classOptions.includes(selectedClass) ? selectedClass : classOptions[0];
    const classOfferings = workspace.offerings.filter((item) => !isALevel && item.className === activeClass);
    const visibleOfferings = classOfferings.filter((item) => selectedSubject === "all" || item.id === selectedSubject);
    const classLearners = workspace.learners.filter((learner) => learner.status === "Active" && learner.programme === (isALevel ? "A-Level" : "O-Level") && learner.className === activeClass);
    const streamOptions = [...new Set(classLearners.map((learner) => learner.stream).filter(Boolean))];
    const rows = visibleOfferings.flatMap((offering) => {
        const batch = workspace.batches.find((item) => item.offeringId === offering.id);
        if (stage === "moderated" && batch?.status !== "MODERATED")
            return [];
        return getOfferingLearners(offering, workspace.learners)
            .filter((learner) => selectedStream === "all" || learner.stream === selectedStream)
            .map((learner) => {
            const marks = workspace.getMarks(offering.id, learner.id);
            const preview = getMarksPreview(marks.continuousAssessment, marks.examination, marks.continuousAssessmentState, marks.examinationState);
            return {
                learner,
                offering,
                score: preview.state === "PRESENT" ? Number(preview.total) : null,
                grade: preview.grade,
                descriptor: preview.descriptor,
                state: preview.state,
                moderated: batch?.status === "MODERATED",
            };
        });
    });
    const completeRows = rows.filter((row) => row.score !== null);
    const average = completeRows.length ? completeRows.reduce((sum, row) => sum + (row.score ?? 0), 0) / completeRows.length : null;
    const moderatedCount = completeRows.filter((row) => row.moderated).length;
    const subjectSummaries = visibleOfferings
        .filter((offering) => stage === "draft" || workspace.batches.some((batch) => batch.offeringId === offering.id && batch.status === "MODERATED"))
        .map((offering) => {
        const subjectRows = rows.filter((row) => row.offering.id === offering.id);
        const scores = subjectRows.flatMap((row) => row.score === null ? [] : [row.score]);
        return { offering, total: subjectRows.length, complete: scores.length, average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null };
    });
    function exportDraftCsv() {
        const header = ["Learner ID", "Admission No.", "Learner", "Class", "Stream", "Subject", "Total %", "Grade", "Descriptor", "Mark state", "Moderation state"];
        const body = rows.map((row) => [row.learner.id, row.learner.admissionNumber, learnerDisplayName(row.learner), row.offering.className, row.learner.stream, row.offering.subjectName, row.score ?? "", row.score === null ? "" : row.grade, row.score === null ? "" : row.descriptor, row.state, row.moderated ? "Moderated in review" : "Not moderated"]);
        const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `review-analysis-${activeClass?.toLowerCase().replaceAll(" ", "-")}-${workspace.termId}.csv`;
        anchor.click();
        URL.revokeObjectURL(url);
    }
    return <>
    <header className="page-heading analysis-heading">
      <div><span className="eyebrow">RESULTS & REPORTING</span><h1>Results &amp; Analysis</h1><p>Explore saved results for {termName} {schoolContext.academicYearName}. These are review calculations, not approved or published school results.</p></div>
      {!isALevel && rows.length > 0 && <button type="button" className="secondary-button" onClick={exportDraftCsv}><Download size={17} aria-hidden="true"/> Export review CSV</button>}
    </header>

    <section className="panel analysis-filter-panel" aria-label="Analysis filters">
      <div className="analysis-filters">
        {!inOLevelWorkspace && <label><span>Programme</span><select value={programme} onChange={(event) => { const next = event.target.value; setProgramme(next); setSelectedClass(next === "A_LEVEL" ? "Senior 5" : "Senior 3"); setSelectedSubject("all"); setSelectedStream("all"); }}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label>}
        <label><span>Class</span><select value={activeClass ?? ""} onChange={(event) => { setSelectedClass(event.target.value); setSelectedSubject("all"); setSelectedStream("all"); }}><option value="" disabled>No configured class</option>{classOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Subject</span><select value={selectedSubject} disabled={isALevel || !classOfferings.length} onChange={(event) => setSelectedSubject(event.target.value)}><option value="all">All configured subjects</option>{classOfferings.map((offering) => <option value={offering.id} key={offering.id}>{offering.subjectName}</option>)}</select></label>
        <label><span>Stream</span><select value={streamOptions.includes(selectedStream) ? selectedStream : "all"} disabled={isALevel || !streamOptions.length} onChange={(event) => setSelectedStream(event.target.value)}><option value="all">All streams</option>{streamOptions.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Review stage</span><select value={stage} disabled={isALevel} onChange={(event) => setStage(event.target.value)}><option value="draft">All draft records</option><option value="moderated">Moderated only</option></select></label>
      </div>
    </section>

    {isALevel ? <section className="panel analysis-setup-state"><Settings2 size={28} aria-hidden="true"/><div><h2>A-Level analysis needs its own configuration</h2><p>Configure combinations, papers, assessment weights and a versioned A-Level grading scale before calculating Senior 5–6 results. O-Level rules are not reused.</p></div></section>
            : !classOfferings.length ? <section className="panel analysis-empty-state"><Info size={25} aria-hidden="true"/><div><h2>No offerings for this context</h2><p>Select a configured term and class to analyse saved marks.</p></div></section>
                : <>
          <p className="analysis-draft-notice"><Info size={18} aria-hidden="true"/> Averages and grade bands include completed saved marks only. Missing, absent and exempt marks are never counted as zero. Moderation here is a review state; approval and publication are not implemented.</p>
          <section className="analysis-summary" aria-label="Analysis summary">
            <article><span>Visible records</span><strong>{rows.length}</strong><small>Filtered learner–subject pairs</small></article>
            <article><span>Complete marks</span><strong>{completeRows.length}</strong><small>{rows.length ? `${Math.round(completeRows.length / rows.length * 100)}% of visible records` : "No visible records"}</small></article>
            <article><span>Mean of complete marks</span><strong>{formatNumber(average)}{average === null ? "" : "%"}</strong><small>Not a class final average</small></article>
            <article><span>Moderated records</span><strong>{moderatedCount}</strong><small>Still not approved or published</small></article>
          </section>

          <div className="analysis-sections">
            <section className="panel analysis-distribution"><div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><BarChart3 size={18} aria-hidden="true"/></div><div><h2>Competency distribution</h2><p>{completeRows.length} completed result{completeRows.length === 1 ? "" : "s"} · {activeOLLevelGradingConfiguration.name} v{activeOLLevelGradingConfiguration.version}</p></div></div></div>
              {completeRows.length ? <div className="analysis-band-list">{activeOLLevelGradingConfiguration.bands.map((band) => { const count = completeRows.filter((row) => getOLLevelGradingBand(row.score ?? -1)?.numericValue === band.numericValue).length; return <div className="analysis-band-row" key={band.numericValue}><span>{band.label} <small>{band.numericValue}</small></span><div className="analysis-band-track" role="img" aria-label={`${band.label}: ${count} of ${completeRows.length} completed results`}><span style={{ width: `${count / completeRows.length * 100}%` }}/></div><strong>{count}</strong></div>; })}</div> : <p className="analysis-no-data">{stage === "moderated" ? "No moderated results match this selection." : "Enter and save both required marks for a learner to see the distribution."}</p>}
            </section>

            <section className="panel analysis-subject-panel"><div className="panel-heading"><div><h2>Subject overview</h2><p>Completion and average by configured offering.</p></div></div><div className="table-wrapper"><table className="data-table analysis-subject-table"><thead><tr><th>Subject</th><th>Complete</th><th>Unresolved</th><th>Average</th><th>Workflow</th></tr></thead><tbody>{subjectSummaries.map(({ offering, total, complete, average: subjectAverage }) => { const status = workspace.batches.find((batch) => batch.offeringId === offering.id)?.status; return <tr key={offering.id}><td><strong>{offering.subjectName}</strong><small>{offering.teacher}</small></td><td>{complete} / {total}</td><td>{total - complete}</td><td>{formatNumber(subjectAverage)}{subjectAverage === null ? "" : "%"}</td><td>{status ? status.replaceAll("_", " ") : "Not submitted"}</td></tr>; })}{!subjectSummaries.length && <tr><td colSpan={5}>No moderated subjects match this selection.</td></tr>}</tbody></table></div></section>
          </div>

          <section className="panel analysis-results-panel"><div className="panel-heading"><div><h2>Learner result detail</h2><p>One row per expected learner and subject. A score appears only after both component marks are saved.</p></div><Link className="text-button" to="/marks/marksheet">View marksheet</Link></div><div className="table-wrapper"><table className="data-table analysis-results-table"><thead><tr><th>Learner</th><th>Stream</th><th>Subject</th><th>Total</th><th>Grade</th><th>Descriptor / mark state</th><th>Review</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.offering.id}:${row.learner.id}`}><td><strong>{learnerDisplayName(row.learner)}</strong><small>{row.learner.id}</small></td><td>{row.learner.stream || "—"}</td><td>{row.offering.subjectName}</td><td>{row.score === null ? "—" : `${row.score}%`}</td><td>{row.score === null ? "—" : row.grade}</td><td>{row.score === null ? row.state.replaceAll("_", " ") : row.descriptor}</td><td>{row.moderated ? "Moderated review" : "Not moderated"}</td><td><Link className="table-view-button" to={`/marks/entry?offering=${encodeURIComponent(row.offering.id)}`}>Open entry</Link></td></tr>)}{!rows.length && <tr><td colSpan={8}>No learner results match this selection. Choose “All draft records” or another class, subject or stream.</td></tr>}</tbody></table></div></section>
        </>}
  </>;
}
