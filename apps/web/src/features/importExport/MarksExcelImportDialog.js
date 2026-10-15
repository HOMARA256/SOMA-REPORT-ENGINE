import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, X } from "lucide-react";
import { useRef, useState } from "react";
import { parseMarksWorkbook } from "./excelWorkbooks";
export function MarksExcelImportDialog({ context, roster, getMarks, locked, onCommit, onClose }) {
    const inputRef = useRef(null);
    const [fileName, setFileName] = useState("");
    const [template, setTemplate] = useState({ id: "", version: "" });
    const [rows, setRows] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [acknowledged, setAcknowledged] = useState(false);
    const errors = rows.filter((row) => row.validation === "ERROR").length;
    const warnings = rows.filter((row) => row.validation === "WARNING").length;
    async function selectFile(file) {
        if (!file)
            return;
        setBusy(true);
        setError("");
        setRows([]);
        setAcknowledged(false);
        setFileName(file.name);
        try {
            const parsed = await parseMarksWorkbook(file, context, roster, getMarks, locked);
            setRows(parsed.rows);
            setTemplate({ id: parsed.templateId, version: parsed.templateVersion });
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "The workbook could not be validated.");
        }
        finally {
            setBusy(false);
        }
    }
    function commit() {
        const failure = onCommit(rows, fileName, template.id, template.version);
        if (failure)
            setError(failure);
        else
            onClose();
    }
    return <div className="import-dialog-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="marks-import-title">
    <header><div><span className="eyebrow">CONTROLLED EXCEL IMPORT</span><h2 id="marks-import-title">Import marks from Excel</h2><p>{context.className} {context.stream} · {context.offering.subjectName} · {context.termName} {context.yearName}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close marks import"><X size={19}/></button></header>
    <ol className="import-wizard-steps" aria-label="Import progress"><li className="is-complete">1 Upload</li><li className={rows.length ? "is-complete" : busy ? "is-active" : ""}>2 Validate</li><li className={rows.length ? "is-active" : ""}>3 Preview</li><li>4 Confirm</li><li>5 Complete</li></ol>
    {!rows.length && <div className="import-upload-zone"><FileSpreadsheet size={35}/><strong>{busy ? "Validating workbook…" : "Upload the completed SOMA REPORT ENGINE .xlsx template"}</strong><p>Template identity, school, term, allocation, learners, statuses, marks, record versions and locks are checked before any change.</p><input ref={inputRef} type="file" accept=".xlsx" onChange={(event) => void selectFile(event.target.files?.[0])}/><button type="button" className="primary-button" disabled={busy} onClick={() => inputRef.current?.click()}><Upload size={16}/> Browse files</button></div>}
    {error && <p className="import-error" role="alert"><AlertTriangle size={17}/> {error}</p>}
    {!!rows.length && <><div className="import-preview-summary"><div><span>Total learners</span><strong>{rows.length}</strong></div><div><span>Ready</span><strong>{rows.filter((row) => row.validation === "READY").length}</strong></div><div><span>Warnings</span><strong>{warnings}</strong></div><div><span>Errors</span><strong>{errors}</strong></div></div>
      {errors > 0 && <p className="import-error"><AlertTriangle size={17}/> {errors} invalid record{errors === 1 ? "" : "s"} block this import. Correct the original workbook and upload it again.</p>}
      <div className="table-wrapper import-preview-table"><table><thead><tr><th>Learner</th><th>Admission No.</th><th>Current AoI</th><th>Imported AoI</th><th>Current Exam</th><th>Imported Exam</th><th>Status</th><th>Validation</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.rowNumber}-${row.learnerId}`}><td><strong>{row.learnerName}</strong><small>Row {row.rowNumber}</small></td><td>{row.admissionNumber || "—"}</td><td>{row.currentAoI || "—"}</td><td>{row.importedAoI || "—"} · {row.aoiStatus}</td><td>{row.currentExam || "—"}</td><td>{row.importedExam || "—"} · {row.examStatus}</td><td><span className={`import-row-status import-row-${row.validation.toLowerCase()}`}>{row.validation === "READY" || row.validation === "UNCHANGED" ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>}{row.validation}</span></td><td>{row.messages.length ? row.messages.join(" ") : "Validated"}</td></tr>)}</tbody></table></div>
      {warnings > 0 && <label className="import-warning-ack"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)}/> I reviewed {warnings} existing-mark change{warnings === 1 ? "" : "s"} and authorise the controlled update.</label>}
    </>}
    <footer><button type="button" className="secondary-button" onClick={onClose}>Cancel</button>{rows.length > 0 && <button type="button" className="primary-button" disabled={errors > 0 || (warnings > 0 && !acknowledged)} onClick={commit}>Confirm import</button>}</footer>
  </section></div>;
}
export function buildMarksTemplateContext(values) {
    return { ...values, templateId: crypto.randomUUID() };
}
