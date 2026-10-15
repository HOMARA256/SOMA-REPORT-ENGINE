import { Download, FileSpreadsheet, Printer, Settings2 } from "lucide-react";
import { useState } from "react";
import { getOfferingLearners, learnerDisplayName, useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolContext } from "../context/SchoolContext";
import { getMarksPreview } from "./marksCalculation";
function performanceClass(mark) {
    if (mark === null)
        return "marksheet-empty";
    if (mark >= 80)
        return "marksheet-excellent";
    if (mark >= 70)
        return "marksheet-good";
    if (mark >= 60)
        return "marksheet-fair";
    return "marksheet-needs-support";
}
function csvCell(value) {
    return `"${String(value).replaceAll('"', '""')}"`;
}
export function MarksheetPage() {
    const workspace = useAcademicWorkspace();
    const schoolContext = useSchoolContext();
    const [programme, setProgramme] = useState("O_LEVEL");
    const [selectedClass, setSelectedClass] = useState("Senior 3");
    const isALevel = programme === "A_LEVEL";
    const classOptions = workspace.classes.filter((item) => item.programme === programme).map((item) => item.name);
    const activeClass = classOptions.includes(selectedClass) ? selectedClass : classOptions[0];
    const classOfferings = workspace.offerings.filter((item) => !isALevel && item.className === activeClass);
    const roster = classOfferings[0] ? getOfferingLearners(classOfferings[0], workspace.learners) : [];
    const termName = schoolContext.termName || "No term selected";
    function scoreFor(offering, learnerId) {
        const marks = workspace.getMarks(offering.id, learnerId);
        const preview = getMarksPreview(marks.continuousAssessment, marks.examination, marks.continuousAssessmentState, marks.examinationState);
        return preview.state === "PRESENT" ? Number(preview.total) : null;
    }
    function exportMarksheet() {
        if (!classOfferings.length)
            return;
        const headings = ["Learner ID", "Admission No.", "Learner name", ...classOfferings.map((item) => item.subjectName), "Total", "Average", "Status"];
        const rows = roster.map((learner) => {
            const scores = classOfferings.map((offering) => scoreFor(offering, learner.id));
            const complete = scores.every((score) => score !== null);
            const total = complete ? scores.reduce((sum, score) => sum + (score ?? 0), 0) : null;
            return [learner.id, learner.admissionNumber, learnerDisplayName(learner), ...scores.map((score) => score ?? ""), total ?? "", total === null ? "" : (total / scores.length).toFixed(1), complete ? "Complete" : "Incomplete"];
        });
        const csv = [headings, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
        const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `${activeClass?.toLowerCase().replaceAll(" ", "-")}-${termName.toLowerCase().replaceAll(" ", "-")}-${schoolContext.academicYearName || "year"}-review-marksheet.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }
    return <>
    <section className="page-heading marksheet-page-heading">
      <div><span className="eyebrow">ACADEMIC MANAGEMENT</span><h1>Marksheet</h1><p>Class results from saved marks in the selected academic context.</p></div>
      <div className="marksheet-context-selectors">
        <label className="marksheet-class-selector"><span>Programme</span><select value={programme} onChange={(event) => { const value = event.target.value; setProgramme(value); setSelectedClass(value === "A_LEVEL" ? "Senior 5" : "Senior 3"); }}><option value="O_LEVEL">O-Level</option><option value="A_LEVEL">A-Level</option></select></label>
        <label className="marksheet-class-selector"><span>Class</span><select value={activeClass ?? ""} onChange={(event) => setSelectedClass(event.target.value)}><option value="" disabled>No configured class</option>{classOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
    </section>

    <section className="marksheet-panel" aria-label={`${activeClass ?? "Selected class"} master marksheet`}>
      <header className="marksheet-banner">
        <div><span className="marksheet-kicker">{isALevel ? "A-LEVEL ASSESSMENT REVIEW" : "REVIEW MASTER MARK SHEET"}</span><h2>{schoolContext.schoolName} — {activeClass ?? "No configured class"}</h2><p>{termName} {schoolContext.academicYearName} · {roster.length} learners · {classOfferings.length} configured subjects</p></div>
        {!isALevel && classOfferings.length > 0 && <div className="marksheet-actions"><button type="button" className="marksheet-print-button" onClick={() => window.print()}><Printer size={18} aria-hidden="true"/> Print draft</button><button type="button" className="marksheet-export-button" onClick={exportMarksheet}><Download size={18} aria-hidden="true"/> Export CSV for Excel</button></div>}
      </header>

      {isALevel ? <div className="marksheet-awaiting-setup"><span className="marksheet-setup-icon"><Settings2 size={22} aria-hidden="true"/></span><div><h3>A-Level marksheet requires configuration</h3><p>Configure combinations, papers, component weights, competency evidence and a separate versioned A-Level grading scale before results are calculated.</p></div></div>
            : !classOfferings.length ? <p className="marksheet-empty-context">No O-Level subject offerings are configured for {activeClass ?? "this class"} in {termName}.</p>
                : <div className="table-wrapper marksheet-table-wrapper"><table className="marksheet-table"><thead><tr><th>Learner ID</th><th>Learner name</th>{classOfferings.map((offering) => <th key={offering.id} title={offering.subjectName}>{offering.subjectCode}</th>)}<th>Total</th><th>Avg</th><th>Status</th></tr></thead><tbody>
            {roster.map((learner) => {
                        const scores = classOfferings.map((offering) => scoreFor(offering, learner.id));
                        const complete = scores.every((score) => score !== null);
                        const total = complete ? scores.reduce((sum, score) => sum + (score ?? 0), 0) : null;
                        return <tr key={learner.id}><td className="marksheet-admission">{learner.id}</td><td className="marksheet-student">{learnerDisplayName(learner)}</td>{scores.map((score, index) => <td key={classOfferings[index].id} className={performanceClass(score)}>{score ?? "—"}</td>)}<td className="marksheet-total">{total === null ? "—" : total.toFixed(1)}</td><td className="marksheet-average">{total === null ? "—" : (total / scores.length).toFixed(1)}</td><td>{complete ? "Complete" : "Incomplete"}</td></tr>;
                    })}
          </tbody></table></div>}
      {!isALevel && <footer className="marksheet-footer"><FileSpreadsheet size={16} aria-hidden="true"/> Incomplete subjects are shown as — and excluded from a final total. This is a review draft, not an approved report.</footer>}
    </section>
  </>;
}
