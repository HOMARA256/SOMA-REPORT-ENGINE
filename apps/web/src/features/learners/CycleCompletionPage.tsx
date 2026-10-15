import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, RotateCw } from "lucide-react";
import { currentUser } from "../../config/currentUser";
import { supabase } from "../../config/supabaseClient";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useSchoolContext } from "../context/SchoolContext";
import { Link } from "react-router-dom";

type Candidate = {
  learnerId: string;
  admissionNumber: string;
  learnerName: string;
  enrolmentId: string;
  academicYearId: string;
  academicYearName: string;
  academicYearEndsOn: string;
  programme: "O_LEVEL" | "A_LEVEL";
  classLevel: number;
  className: string;
  streamName: string | null;
  completionType: "COMPLETED_O_LEVEL" | "COMPLETED_A_LEVEL";
};
type GraduationCandidate = {
  completionId: string;
  learnerId: string;
  admissionNumber: string;
  learnerName: string;
  academicYearName: string;
  className: string;
  completedOn: string;
  completionType: "COMPLETED_A_LEVEL";
};
type CompletionHistory = {
  completionId: string;
  learnerId: string;
  admissionNumber: string;
  learnerName: string;
  academicYearName: string;
  className: string;
  completionType: string;
  lifecycleStatus: string;
  completedOn: string;
  graduatedAt: string | null;
};
type Register = { candidates: Candidate[]; awaitingGraduation: GraduationCandidate[]; history: CompletionHistory[] };
type Intent = { kind: "complete"; record: Candidate } | { kind: "graduate"; record: GraduationCandidate } | { kind: "exit"; record: Candidate };
const emptyRegister: Register = { candidates: [], awaitingGraduation: [], history: [] };
export function CycleCompletionPage() {
  const { schoolId, schoolName, academicYearId, academicYearName } = useSchoolContext();
  const canManage = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("academics.manage");
  const [register, setRegister] = useState<Register>(emptyRegister);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [reason, setReason] = useState("");
  const [exitType, setExitType] = useState("TRANSFERRED_OUT");
  const [exitDate, setExitDate] = useState("");

  const load = useCallback(async () => {
    if (!schoolId || !academicYearId || !canManage) { setRegister(emptyRegister); setLoading(false); return; }
    setLoading(true); setError("");
    const result = await (supabase as any).rpc("get_school_cycle_completion_register", {
      p_school_id: schoolId,
      p_academic_year_id: academicYearId,
    });
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setRegister({
      candidates: result.data?.candidates ?? [],
      awaitingGraduation: result.data?.awaitingGraduation ?? [],
      history: result.data?.history ?? [],
    });
  }, [academicYearId, canManage, schoolId]);

  useEffect(() => { void load(); }, [load]);

  const dialogTitle = intent?.kind === "graduate" ? "Approve S6 graduation?" : intent?.kind === "exit" ? "Record transfer or withdrawal?" : "Confirm cycle completion?";
  const confirmLabel = intent?.kind === "graduate" ? "Approve graduation" : intent?.kind === "exit" ? "Record learner exit" : intent?.record.completionType === "COMPLETED_O_LEVEL" ? "Confirm O-Level completion" : "Confirm A-Level completion";
  const nextState = intent?.kind === "graduate" ? "Graduated (S6 only)" : intent?.kind === "exit" ? exitType.replaceAll("_", " ") : intent?.record.completionType === "COMPLETED_O_LEVEL" ? "Completed O-Level Cycle" : "Completed A-Level Cycle; awaiting graduation approval";
  const dialogOnCancel = useCallback(() => { if (!busy) { setIntent(null); setReason(""); } }, [busy]);

  async function confirmAction() {
    if (!intent || !schoolId || !reason.trim() || (intent.kind === "exit" && !exitDate)) return;
    setBusy(true); setError(""); setNotice("");
    if (intent.kind === "exit") {
      const result = await (supabase as any).rpc("record_school_learner_cycle_exit", { p_school_id: schoolId, p_enrolment_id: intent.record.enrolmentId, p_exit_type: exitType, p_effective_to: exitDate, p_reason: reason.trim() });
      setBusy(false);
      if (result.error) { setError(result.error.message); return; }
      setNotice(intent.record.learnerName + "'s " + exitType.replaceAll("_", " ").toLowerCase() + " has been recorded.");
      setIntent(null); setReason("");
      await load();
      return;
    }
    const result = intent.kind === "complete"
      ? await (supabase as any).rpc("complete_school_learner_cycle", {
        p_school_id: schoolId,
        p_enrolment_id: intent.record.enrolmentId,
        p_reason: reason.trim(),
      })
      : await (supabase as any).rpc("approve_school_learner_graduation", {
        p_school_id: schoolId,
        p_completion_id: intent.record.completionId,
        p_reason: reason.trim(),
      });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    const learnerName = intent.record.learnerName;
    setNotice(intent.kind === "graduate" ? `${learnerName} has been marked as graduated.` : `${learnerName} has been recorded as ${intent.record.completionType === "COMPLETED_O_LEVEL" ? "Completed O-Level Cycle" : "Completed A-Level Cycle"}.`);
    setIntent(null); setReason("");
    await load();
  }

  const completionRows = useMemo(() => register.candidates, [register.candidates]);
  if (!canManage) return <section className="panel cycle-permission-message" role="alert"><h1>School administrator access required</h1><p>Only an authorised school administrator can confirm cycle completion or approve graduation.</p></section>;

  return <div className="cycle-completion-page">
    <header className="page-heading">
      <div><span className="eyebrow">LEARNER PROGRESSION · {schoolName || "SELECTED SCHOOL"}</span><h1>Promotion &amp; Progression</h1><p>S4 completes the O-Level cycle; S6 completes A-Level, then may be graduated after a separate authorised approval.</p></div>
      <button className="secondary-button" type="button" onClick={() => void load()} disabled={loading || busy}><RotateCw size={16} aria-hidden="true" /> Refresh</button>
    </header>
    {notice && <p className="form-success-message" role="status">{notice}</p>}
    {error && <p className="form-error-message" role="alert">{error}</p>}
    {!schoolId || !academicYearId ? <section className="panel"><h2>Select a school and academic year</h2><p>The progression register follows the school and year selected in the workspace header.</p></section> : <>
      <section className="panel cycle-policy-note"><div className="cycle-policy-icon"><GraduationCap size={20} aria-hidden="true" /></div><div><h2>{academicYearName} completion rules</h2><p>S4 and S6 do not use SOMA internal end-of-year exam or report-card workflows. Completion closes the enrolment on the academic-year end date and preserves the learner’s academic and audit history. No national-examination data is requested or stored.</p></div></section>
      <section className="panel cycle-section"><div className="panel-heading"><div><h2>Completion candidates</h2><p>Only active S4 and S6 enrolments in {academicYearName} are listed.</p></div><span className="approval-count">{completionRows.length} learners</span></div>
        {loading ? <p className="cycle-empty-state" role="status">Loading progression records…</p> : completionRows.length ? <div className="cycle-candidate-grid">{completionRows.map((candidate) => <article className="cycle-candidate-card" key={candidate.enrolmentId}>
          <div className="cycle-candidate-main"><span className="cycle-level-tag">{candidate.className} · S{candidate.classLevel}</span><h3>{candidate.learnerName}</h3><p>{candidate.admissionNumber}{candidate.streamName ? ` · ${candidate.streamName}` : ""}</p></div>
          <p className="cycle-candidate-info">{candidate.completionType === "COMPLETED_O_LEVEL" ? "Completing the O-Level cycle; this learner will not be promoted to S5." : "Completing the A-Level cycle; graduation requires a separate approval."}<br /><span>Enrolment closes {candidate.academicYearEndsOn}.</span></p>
          <div className="cycle-candidate-actions"><button className="primary-button" type="button" onClick={() => { setIntent({ kind: "complete", record: candidate }); setReason(""); setError(""); }}>
            {candidate.completionType === "COMPLETED_O_LEVEL" ? "Confirm O-Level Completion" : "Confirm A-Level Completion"}
          </button>
          <button className="secondary-button" type="button" onClick={() => { setIntent({ kind: "exit", record: candidate }); setReason(""); setExitType("TRANSFERRED_OUT"); setExitDate(candidate.academicYearEndsOn); setError(""); }}>Record transfer or withdrawal</button>
          <Link className="secondary-button" to={"/learners/" + candidate.learnerId}>Open learner history</Link></div>
        </article>)}</div> : <p className="cycle-empty-state">No active S4 or S6 learners are awaiting cycle completion for this year.</p>}
      </section>
      <section className="panel cycle-section"><div className="panel-heading"><div><h2>S6 graduation approvals</h2><p>Graduation is available only after A-Level completion; S4 learners can never be graduated.</p></div><span className="approval-count">{register.awaitingGraduation.length} awaiting</span></div>
        {loading ? <p className="cycle-empty-state" role="status">Loading graduation approvals…</p> : register.awaitingGraduation.length ? <div className="cycle-candidate-grid">{register.awaitingGraduation.map((candidate) => <article className="cycle-candidate-card" key={candidate.completionId}>
          <div className="cycle-candidate-main"><span className="cycle-level-tag">A-Level completed</span><h3>{candidate.learnerName}</h3><p>{candidate.admissionNumber} · {candidate.className}</p></div>
          <p className="cycle-candidate-info">Completed on {candidate.completedOn} in {candidate.academicYearName}. Approving graduation preserves the completion and enrolment history.</p>
          <button className="primary-button" type="button" onClick={() => { setIntent({ kind: "graduate", record: candidate }); setReason(""); setError(""); }}>Approve Graduation</button>
        </article>)}</div> : <p className="cycle-empty-state">No S6 learners are awaiting graduation approval for this year.</p>}
      </section>
      <section className="panel cycle-section"><div className="panel-heading"><div><h2>Completion history</h2><p>Recorded decisions remain visible for audit and learner history.</p></div></div>
        {loading ? <p className="cycle-empty-state" role="status">Loading completion history…</p> : <div className="table-wrapper"><table className="data-table cycle-history-table"><thead><tr><th>Learner</th><th>Class</th><th>Cycle</th><th>Status</th><th>Completed</th><th>Graduated</th></tr></thead><tbody>{register.history.map((row) => <tr key={row.completionId}><td><strong>{row.learnerName}</strong><small>{row.admissionNumber}</small></td><td>{row.className}</td><td>{row.completionType === "COMPLETED_O_LEVEL" ? "O-Level" : "A-Level"}</td><td><span className={`status-badge ${row.lifecycleStatus === "GRADUATED" ? "status-active" : "status-inactive"}`}>{row.lifecycleStatus.replaceAll("_", " ")}</span></td><td>{row.completedOn}</td><td>{row.graduatedAt ? new Date(row.graduatedAt).toLocaleDateString() : "—"}</td></tr>)}{!register.history.length && <tr><td colSpan={6}>No completion decisions recorded for this academic year.</td></tr>}</tbody></table></div>}
      </section>
    </>}
    <ConfirmDialog open={Boolean(intent)} title={dialogTitle} confirmLabel={confirmLabel} busy={busy} confirmDisabled={!reason.trim()} error={error} description="Verify the learner and record the authorised decision with a reason." currentState={intent?.kind === "complete" ? `${intent.record.className} · ${intent.record.learnerName}` : intent ? `Completed A-Level · ${intent.record.learnerName}` : undefined} nextState={nextState} impact="The active class enrolment closes on the academic-year end date. The learner is removed from future active rosters and promotion lists." preserved="Learner profile, subject selections, continuous-assessment records, documents, enrolment history and audit history." reversible={false} destination={intent?.kind === "complete" && intent.record.completionType === "COMPLETED_O_LEVEL" ? "No automatic S5 promotion; a later S5 entry must be a separate A-Level admission." : undefined} onCancel={dialogOnCancel} onConfirm={() => void confirmAction()}>
      {intent?.kind === "exit" && <><label className="form-field cycle-reason-field"><span>Exit decision</span><select value={exitType} onChange={(event) => setExitType(event.target.value)}><option value="TRANSFERRED_OUT">Transferred out</option><option value="WITHDRAWN">Withdrawn</option><option value="LEFT_SCHOOL">Left school</option></select></label><label className="form-field cycle-reason-field"><span>Effective date</span><input type="date" required value={exitDate} onChange={(event) => setExitDate(event.target.value)} /></label></>}
      <label className="form-field cycle-reason-field"><span>Reason for {intent?.kind === "graduate" ? "graduation approval" : intent?.kind === "exit" ? "learner exit" : "completion"}</span><textarea value={reason} maxLength={500} required onChange={(event) => setReason(event.target.value)} placeholder="Record the school’s authorised decision and supporting reason." /></label>
      {intent?.kind === "complete" && <p className="cycle-dialog-warning">This does not create an internal end-of-year exam or report. No national examination details are part of this workflow.</p>}
    </ConfirmDialog>
  </div>;
}
