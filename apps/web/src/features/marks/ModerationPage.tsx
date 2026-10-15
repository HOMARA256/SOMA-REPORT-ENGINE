import { AlertTriangle, ClipboardCheck, RefreshCw, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useSchoolContext } from "../context/SchoolContext";
import { usePersistentModeration } from "./PersistentModeration";
import { moderationStatusLabels, type ModerationStatus } from "./moderationData";

export function ModerationPage() {
  const school = useSchoolContext();
  const moderation = usePersistentModeration();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | ModerationStatus>("ALL");
  const [selectedId, setSelectedId] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const matching = useMemo(() => moderation.submissions.filter((submission) => {
    const query = search.trim().toLowerCase();
    return (status === "ALL" || submission.status === status)
      && (!query || [submission.id, submission.className, submission.subjectName, submission.teacherName, submission.submittedBy].some((value) => value?.toLowerCase().includes(query)));
  }), [moderation.submissions, search, status]);
  const selected = matching.find((submission) => submission.id === selectedId) ?? matching[0];

  async function decide(nextStatus: "READY" | "MODERATED" | "RETURNED") {
    if (!selected) return;
    setBusy(true);
    setNotice("");
    const error = await moderation.decide(selected.id, nextStatus, reviewNote);
    setBusy(false);
    if (error) { setNotice(error); return; }
    setReviewNote("");
    setNotice(`${moderationStatusLabels[nextStatus]} saved to Supabase and recorded in the audit trail.`);
    setSelectedId(selected.id);
  }

  return <>
    <section className="page-heading"><div><span className="eyebrow">PERSISTENT ACADEMIC WORKFLOW</span><h1>Moderation</h1><p>Review submitted offerings for {school.termName || "the selected academic term"} {school.academicYearName}.</p></div><button type="button" className="secondary-button" disabled={moderation.loading} onClick={() => void moderation.reload()}><RefreshCw size={16} /> Refresh queue</button></section>
    <section className="moderation-summary" aria-label="Moderation queue summary">
      <article><ClipboardCheck aria-hidden="true" /><div><span>HOD review</span><strong>{moderation.submissions.filter((item) => item.status === "HOD_REVIEW").length}</strong></div></article>
      <article><AlertTriangle aria-hidden="true" /><div><span>Ready for moderation</span><strong>{moderation.submissions.filter((item) => item.status === "READY").length}</strong></div></article>
      <article><ShieldCheck aria-hidden="true" /><div><span>Moderated</span><strong>{moderation.submissions.filter((item) => item.status === "MODERATED").length}</strong></div></article>
    </section>
    {moderation.error && <div className="form-error-message" role="alert">{moderation.error}</div>}
    {notice && <p className={notice.includes("saved to Supabase") ? "marks-entry-success" : "form-error-message"} role={notice.includes("saved to Supabase") ? "status" : "alert"}>{notice}</p>}
    <section className="panel moderation-queue">
      <div className="moderation-queue-heading"><div><h2>Submission queue</h2><p>Live submissions for the selected school, academic year and term.</p></div><span>{matching.length} submission{matching.length === 1 ? "" : "s"}</span></div>
      <div className="moderation-filters"><label className="moderation-search"><Search size={17} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search class, subject, teacher or submitter" aria-label="Search moderation submissions" /></label><label><span>Workflow status</span><select value={status} onChange={(event) => setStatus(event.target.value as "ALL" | ModerationStatus)}><option value="ALL">All statuses</option><option value="HOD_REVIEW">HOD review</option><option value="READY">Ready for moderation</option><option value="MODERATED">Moderated</option><option value="RETURNED">Returned to teacher</option></select></label></div>
      <div className="table-wrapper moderation-table-scroll"><table className="data-table moderation-table"><thead><tr><th>Submitted</th><th>Programme</th><th>Class / Subject</th><th>Teacher</th><th>Submitter</th><th>Learners</th><th>Unresolved</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {matching.map((submission) => <tr key={submission.id} className={submission.id === selected?.id ? "moderation-selected-row" : ""}><td><strong>{new Date(submission.submittedAt).toLocaleString()}</strong><small>{submission.id.slice(0, 8)}</small></td><td>{submission.programme.replaceAll("_", " ")}</td><td><strong>{submission.className}</strong><small>{submission.subjectCode} · {submission.subjectName}</small></td><td>{submission.teacherName ?? "Not assigned"}</td><td>{submission.submittedBy}</td><td>{submission.learnerCount}</td><td>{submission.unresolvedCount ? <span className="moderation-exception-blocked">{submission.unresolvedCount} unresolved</span> : "None"}</td><td><span className={`moderation-status moderation-status-${submission.status.toLowerCase()}`}>{moderationStatusLabels[submission.status]}</span></td><td><button type="button" className="table-view-button" onClick={() => { setSelectedId(submission.id); setReviewNote(""); setNotice(""); }}>Review</button></td></tr>)}
        {!moderation.loading && !matching.length && <tr><td colSpan={9} className="moderation-empty">No submitted offerings match this selection. Save complete marks in Marks Entry and submit the offering to begin review.</td></tr>}
        {moderation.loading && <tr><td colSpan={9} className="moderation-empty">Loading persistent submissions…</td></tr>}
      </tbody></table></div>
    </section>
    {selected && <section className="panel moderation-detail" aria-label={`Review details for ${selected.id}`}>
      <div className="moderation-detail-heading"><div><span className="moderation-detail-kicker">SELECTED SUBMISSION · {selected.id}</span><h2>{selected.className} · {selected.subjectName}</h2><p>{school.termName} · {selected.teacherName ?? "No teacher assigned"} · {selected.learnerCount} learners · submitted by {selected.submittedBy}</p></div><span className={`moderation-status moderation-status-${selected.status.toLowerCase()}`}>{moderationStatusLabels[selected.status]}</span></div>
      <div className="moderation-detail-grid"><div><h3>Review checks</h3><ul className="moderation-checklist"><li><ShieldCheck aria-hidden="true" /> Submission saved to the school database</li><li className={selected.unresolvedCount ? "moderation-check-pending" : ""}>{selected.unresolvedCount ? <AlertTriangle aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />} {selected.unresolvedCount ? `${selected.unresolvedCount} learners have incomplete marks` : "Every eligible learner has complete mark states"}</li></ul><h3>Latest review note</h3><p className="moderation-no-issues">{selected.reviewNote || "No reviewer note recorded yet."}</p></div>
        <div className="moderation-decision"><h3>Review decision</h3><p>Each transition requires an authenticated reviewer and a note. The submitter cannot review their own submission.</p><label htmlFor="moderation-note">Reviewer note</label><textarea id="moderation-note" value={reviewNote} onChange={(event) => { setReviewNote(event.target.value); setNotice(""); }} disabled={busy || selected.status === "MODERATED"} placeholder="Describe the evidence checked or the correction required…" />
          <div className="moderation-actions">
            {selected.status === "HOD_REVIEW" && <button type="button" className="primary-button" disabled={busy || selected.unresolvedCount > 0 || !reviewNote.trim()} onClick={() => void decide("READY")}>{busy ? "Saving…" : <><ShieldCheck size={17} aria-hidden="true" /> Record HOD review</>}</button>}
            {selected.status === "READY" && <><button type="button" className="moderation-return-button" disabled={busy || !reviewNote.trim()} onClick={() => void decide("RETURNED")}><RotateCcw size={17} aria-hidden="true" /> Return to teacher</button><button type="button" className="primary-button" disabled={busy || selected.unresolvedCount > 0 || !reviewNote.trim()} onClick={() => void decide("MODERATED")}>{busy ? "Saving…" : <><ShieldCheck size={17} aria-hidden="true" /> Complete moderation</>}</button></>}
            {selected.status === "RETURNED" && <p className="moderation-readonly">Returned to the teacher for correction. Once corrected and resubmitted, it will re-enter HOD review.</p>}
            {selected.status === "MODERATED" && <p className="moderation-readonly">Moderation is complete and persisted. The class-level result lock and approval workflow remains the next stage.</p>}
          </div>
        </div>
      </div>
    </section>}
  </>;
}
