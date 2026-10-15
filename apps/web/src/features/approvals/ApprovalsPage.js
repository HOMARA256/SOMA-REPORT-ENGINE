import { CheckCircle2, ClipboardCheck, FileLock2, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useSchoolContext } from "../context/SchoolContext";
import { moderationStatusLabels } from "../marks/moderationData";
import { usePersistentMarks } from "../marks/PersistentMarks";
import { usePersistentModeration } from "../marks/PersistentModeration";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useApprovalEngine } from "./ApprovalEngine";
import { usePersistentResultScopes } from "./PersistentResultScopes";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
const approvalTabs = ["My Pending Approvals", "Delegated to Me", "Escalated Requests", "My Submitted Requests", "Approved", "Rejected", "Returned for Correction", "Expired"];
export function ApprovalsPage() {
    const school = useSchoolContext();
    const engine = useApprovalEngine();
    const marks = usePersistentMarks();
    const moderation = usePersistentModeration();
    const resultScopes = usePersistentResultScopes();
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("ALL");
    const [selectedId, setSelectedId] = useState("");
    const [approvalNote, setApprovalNote] = useState("");
    const [lockNote, setLockNote] = useState("");
    const [notice, setNotice] = useState("");
    const [noticeIsError, setNoticeIsError] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [busy, setBusy] = useState(false);
    const [activeTab, setActiveTab] = useState("My Pending Approvals");
    const [decisionNote, setDecisionNote] = useState("");
    const [decisionReason, setDecisionReason] = useState("");
    const [decisionBusy, setDecisionBusy] = useState("");
    const termName = school.termName || "No term selected";
    const batches = moderation.submissions.filter((batch) => batch.programme === "O_LEVEL" && marks.workspace.offerings.some((offering) => offering.id === batch.offeringId));
    const matchingBatches = batches.filter((batch) => {
        const searchText = [batch.id, batch.className, batch.subjectName, batch.teacherName, batch.submittedBy].join(" ").toLowerCase();
        return (status === "ALL" || batch.status === status) && searchText.includes(query.trim().toLowerCase());
    });
    const visible = matchingBatches.filter((batch) => {
        const offering = marks.workspace.offerings.find((candidate) => candidate.id === batch.offeringId);
        const scope = resultScopes.scopes.find((candidate) => candidate.classId === offering?.classId);
        const approved = scope?.status === "APPROVED";
        if (activeTab === "Approved")
            return approved;
        if (activeTab === "My Submitted Requests")
            return batch.submittedBy === engine.currentUserId;
        if (activeTab === "My Pending Approvals")
            return !approved;
        return false;
    });
    const selected = visible.find((batch) => batch.id === selectedId) ?? visible[0];
    const offering = marks.workspace.offerings.find((item) => item.id === selected?.offeringId);
    const classOfferings = offering ? marks.workspace.offerings.filter((item) => item.classId === offering.classId && item.programme === "O_LEVEL" && item.learners.length > 0) : [];
    const classBatches = classOfferings.map((item) => moderation.submissions.find((batch) => batch.offeringId === item.id));
    const incompleteMarks = classOfferings.reduce((count, item) => count + item.learners.filter((learner) => learner.aoiStatus === "MISSING" || learner.examStatus === "MISSING").length, 0);
    const moderatedCount = classBatches.filter((batch) => batch?.status === "MODERATED" && batch.unresolvedCount === 0).length;
    const allModerated = classOfferings.length > 0 && moderatedCount === classOfferings.length;
    const resultScope = resultScopes.scopes.find((item) => item.classId === offering?.classId);
    const isApproved = resultScope?.status === "APPROVED";
    const workflowLoading = moderation.loading || marks.loading || resultScopes.loading;
    const connectedRequests = engine.requests.filter((request) => {
        if (activeTab === "My Pending Approvals")
            return request.status === "PENDING_APPROVAL" && (!request.assignedApproverId || request.assignedApproverId === engine.currentUserId);
        if (activeTab === "Delegated to Me")
            return request.status === "PENDING_APPROVAL" && request.delegatedAuthority && request.assignedApproverId === engine.currentUserId;
        if (activeTab === "Escalated Requests")
            return request.status === "ESCALATED";
        if (activeTab === "My Submitted Requests")
            return request.requesterId === engine.currentUserId;
        if (activeTab === "Approved")
            return request.status === "APPROVED";
        if (activeTab === "Rejected")
            return request.status === "REJECTED";
        if (activeTab === "Returned for Correction")
            return request.status === "RETURNED";
        return request.status === "EXPIRED";
    });
    async function decideConnected(id, decision) {
        const reason = engine.reasons.find((item) => item.code === decisionReason);
        if (!reason || (reason.actionType !== "ANY" && reason.actionType !== decision)) {
            setNotice("Select a valid reason for this decision.");
            setNoticeIsError(true);
            return;
        }
        if (reason.requiresNote && !decisionNote.trim()) {
            setNotice("This reason requires a detailed note.");
            setNoticeIsError(true);
            return;
        }
        const request = engine.requests.find((item) => item.id === id);
        const conditions = [request && new Date(request.dueAt) < new Date() ? "APPROVAL_OVERDUE" : "AWAITING_AUTHORISED_DECISION"];
        setDecisionBusy(id);
        const error = await engine.decideRequest(id, decision, reason.code, decisionNote.trim(), conditions);
        setDecisionBusy("");
        setNotice(error ?? `Request ${decision.toLowerCase()} decision recorded and audited.`);
        setNoticeIsError(Boolean(error));
        if (!error) {
            setDecisionNote("");
            setDecisionReason("");
        }
    }
    async function confirmAction() {
        if (!pendingAction || busy)
            return;
        setBusy(true);
        setNotice("");
        try {
            const error = pendingAction === "LOCK"
                ? (offering ? await resultScopes.lock(offering.classId, lockNote) : "Select a class offering first.")
                : (resultScope ? await resultScopes.approve(resultScope.id, approvalNote) : "Lock this class before approving it.");
            if (error) {
                setNotice(error);
                setNoticeIsError(true);
            }
            else {
                setNotice(pendingAction === "LOCK"
                    ? `Results for ${offering?.className} were locked in Supabase and recorded in the audit trail.`
                    : `Results for ${offering?.className} were approved in Supabase and recorded in the audit trail.`);
                setNoticeIsError(false);
                if (pendingAction === "LOCK")
                    setLockNote("");
                else
                    setApprovalNote("");
            }
        }
        catch (error) {
            setNotice(error instanceof Error ? error.message : "The result decision could not be confirmed.");
            setNoticeIsError(true);
        }
        finally {
            setBusy(false);
            setPendingAction(null);
        }
    }
    return <>
    <header className="page-heading"><div><span className="eyebrow">GOVERNANCE &amp; APPROVALS</span><h1>Approval Centre</h1><p>Permission-controlled decisions, delegated authority and accountable escalation for {termName}.</p></div><div className="approval-heading-actions"><ContactPlatformSupportButton category="APPROVAL_OR_REPORT"/><Link className="secondary-button" to="/settings/approval-delegations"><ShieldCheck size={17}/> Delegation Settings</Link><Link className="secondary-button" to="/marks/moderation"><ClipboardCheck size={17} aria-hidden="true"/> Open moderation</Link></div></header>
    <p className="class-workspace-note">Final class result locks and approvals are loaded from Supabase. Server-side checks enforce mark completeness, moderation, school scope, role authority, separation of duties and the audit trail.</p>

    <nav className="approval-centre-tabs" aria-label="Approval queues">{approvalTabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? "active" : ""} aria-current={activeTab === tab ? "page" : undefined} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>

    <section className="panel connected-approval-queue"><div className="panel-heading"><div><h2>Connected approval requests</h2><p>Live, tenant-scoped requests from the approval service. Every decision is permission checked and audited.</p></div><span className="approval-count">{connectedRequests.length} shown</span></div>
      {engine.loading ? <p className="approval-empty">Loading secure approval queue…</p> : engine.error ? <p className="form-error" role="alert">{engine.error}</p> : connectedRequests.length ? <div className="connected-request-list">{connectedRequests.map((request) => <article key={request.id}><div><span className={`approval-request-priority priority-${request.priority.toLowerCase()}`}>{request.priority}</span><h3>{request.title}</h3><p>{request.reason}</p><small>{request.requestType.replaceAll("_", " ")} · Due {new Date(request.dueAt).toLocaleString()}</small></div>{request.status === "PENDING_APPROVAL" && request.requesterId !== engine.currentUserId ? <div className="connected-decision"><select aria-label="Decision reason" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)}><option value="">Select a controlled reason</option>{engine.reasons.map((reason) => <option key={reason.code} value={reason.code}>{reason.label}{reason.suggested ? " · Suggested" : ""}</option>)}</select><textarea aria-label="Decision note" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Additional note when required"/><div><button type="button" className="secondary-button" disabled={Boolean(decisionBusy)} onClick={() => void decideConnected(request.id, "RETURN")}>Return</button><button type="button" className="secondary-button" disabled={Boolean(decisionBusy)} onClick={() => void decideConnected(request.id, "REJECT")}>Reject</button><button type="button" className="primary-button" disabled={Boolean(decisionBusy)} onClick={() => void decideConnected(request.id, "APPROVE")}>{decisionBusy === request.id ? "Saving…" : "Approve"}</button></div></div> : <span className={`moderation-status moderation-status-${request.status.toLowerCase()}`}>{request.status.replaceAll("_", " ")}</span>}</article>)}</div> : <div className="dashboard-empty"><strong>No live requests in this queue</strong><p>Requests submitted through the connected workflow will appear here.</p></div>}
    </section>

    <section className="approval-summary" aria-label="Approval workflow summary">
      <article><ClipboardCheck aria-hidden="true"/><div><span>Persistent O-Level review batches</span><strong>{batches.length}</strong></div></article>
      <article><ShieldCheck aria-hidden="true"/><div><span>Moderated batches</span><strong>{batches.filter((batch) => batch.status === "MODERATED").length}</strong></div></article>
      <article><FileLock2 aria-hidden="true"/><div><span>Persistent class locks</span><strong>{resultScopes.scopes.length}</strong></div></article>
      <article><CheckCircle2 aria-hidden="true"/><div><span>Approved result scopes</span><strong>{resultScopes.scopes.filter((scope) => scope.status === "APPROVED").length}</strong></div></article>
    </section>

    {(moderation.error || marks.error || resultScopes.error) && <div className="form-error-message" role="alert">{[moderation.error, marks.error, resultScopes.error].filter(Boolean).join(" ")}</div>}
    {notice && <p className={noticeIsError ? "form-error-message" : "marks-entry-success"} role={noticeIsError ? "alert" : "status"}>{notice}</p>}
    <section className="panel approval-queue"><div className="panel-heading"><div><h2>Result approval queue</h2><p>Persistent O-Level offering submissions and class result scopes for {school.academicYearName} · {termName}.</p></div><span className="approval-count">{visible.length} shown</span></div><div className="approval-filters"><label className="approval-search"><Search size={17} aria-hidden="true"/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search class, subject, teacher or batch" aria-label="Search approval batches"/></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="HOD_REVIEW">HOD review</option><option value="READY">Ready for moderation</option><option value="MODERATED">Moderated</option><option value="RETURNED">Returned</option></select></label><button type="button" className="secondary-button" disabled={workflowLoading} onClick={() => { void moderation.reload(); void marks.reload(); void resultScopes.reload(); }}>Refresh</button></div><div className="table-wrapper approval-table-wrap"><table className="data-table approval-table"><thead><tr><th>Batch</th><th>Class / Subject</th><th>Teacher</th><th>Learners</th><th>Missing records</th><th>Review status</th><th>Action</th></tr></thead><tbody>{workflowLoading && <tr><td colSpan={7} className="approval-empty">Loading persistent academic records…</td></tr>}{visible.map((batch) => <tr key={batch.id} className={batch.id === selected?.id ? "approval-selected-row" : ""}><td><strong>{batch.id.slice(0, 12)}</strong><small>{new Date(batch.submittedAt).toLocaleString()}</small></td><td><strong>{batch.className}</strong><small>{batch.subjectCode} · {batch.subjectName}</small></td><td>{batch.teacherName ?? "Not assigned"}</td><td>{batch.learnerCount}</td><td>{batch.unresolvedCount ? <span className="approval-blocker">{batch.unresolvedCount} unresolved</span> : "None"}</td><td><span className={`moderation-status moderation-status-${batch.status.toLowerCase()}`}>{moderationStatusLabels[batch.status]}</span></td><td><button type="button" className="table-view-button" onClick={() => { setSelectedId(batch.id); setNotice(""); }}>Inspect</button></td></tr>)}{!workflowLoading && !visible.length && <tr><td colSpan={7} className="approval-empty">No O-Level submissions exist for this term yet. Enrol learners in an active O-Level class, enter and submit marks, then finish moderation for every offered subject before locking results. <Link to="/school/o-level/learners">Open O-Level learners</Link> · <Link to="/marks/entry">Open marks entry</Link></td></tr>}</tbody></table></div></section>

    {selected && offering ? <section className="panel approval-detail"><div className="panel-heading"><div><span className="eyebrow">BATCH {selected.id}</span><h2>{offering.className} · {offering.subjectName}</h2><p>{offering.teacherName ?? "Not assigned"} · {offering.learners.length} active learners · {termName}</p></div><span className={`moderation-status moderation-status-${selected.status.toLowerCase()}`}>{moderationStatusLabels[selected.status]}</span></div><div className="approval-detail-grid"><div><h3>Readiness checks · whole class</h3><ul className="approval-checks"><li><span className={allModerated ? "approval-check-pass" : "approval-check-wait"}>{allModerated ? <CheckCircle2 aria-hidden="true"/> : <ShieldAlert aria-hidden="true"/>}</span><div><strong>Offering moderation</strong><small>{classOfferings.length === 0 ? "No active learner subject offerings were found" : `${moderatedCount} of ${classOfferings.length} active learner subject offerings are moderated`}</small></div></li><li><span className={incompleteMarks === 0 && classOfferings.length > 0 ? "approval-check-pass" : "approval-check-wait"}>{incompleteMarks === 0 && classOfferings.length > 0 ? <CheckCircle2 aria-hidden="true"/> : <ShieldAlert aria-hidden="true"/>}</span><div><strong>Required marks</strong><small>{incompleteMarks ? `${incompleteMarks} learner subject marks remain missing` : "All active learner subject marks are present"}</small></div></li><li><span className={resultScope ? "approval-check-pass" : "approval-check-wait"}>{resultScope ? <CheckCircle2 aria-hidden="true"/> : <FileLock2 aria-hidden="true"/>}</span><div><strong>Class result lock</strong><small>{resultScope ? `Persisted ${new Date(resultScope.lockedAt).toLocaleString()} · ${resultScope.status}` : "Required before final approval"}</small></div></li><li><span className={isApproved ? "approval-check-pass" : "approval-check-wait"}>{isApproved ? <CheckCircle2 aria-hidden="true"/> : <ShieldAlert aria-hidden="true"/>}</span><div><strong>Final approval</strong><small>{isApproved ? `Approved ${new Date(resultScope.approvedAt ?? "").toLocaleString()} · audit recorded` : "Requires a different authorized Head Teacher or School Admin"}</small></div></li></ul><p className="class-muted">Persistent status and authorization are enforced by Supabase. This approval is not report publication; report snapshots and publication remain separate steps.</p></div><div className="approval-decision"><h3>Class decision · {offering.className}</h3><p>Submitted → Moderated → Locked → Approved → Report snapshot → Published.</p>{!resultScope && <><label className="approval-note-label">Lock reason<textarea value={lockNote} onChange={(event) => setLockNote(event.target.value)} placeholder="Record the review completed before locking"/></label><button type="button" className="primary-button" disabled={workflowLoading || busy || !allModerated || incompleteMarks > 0 || !lockNote.trim()} onClick={() => setPendingAction("LOCK")}><FileLock2 size={17} aria-hidden="true"/> Lock class results</button></>}{resultScope?.status === "LOCKED" && <><label className="approval-note-label">Approval reason<textarea value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Record what was reviewed and approved"/></label><button type="button" className="primary-button" disabled={workflowLoading || busy || !approvalNote.trim()} onClick={() => setPendingAction("APPROVE")}><ShieldCheck size={17} aria-hidden="true"/> Approve locked results</button></>}{isApproved && <p className="approval-complete">Approved in Supabase by {resultScope.approvedBy}. Continue with narratives and report snapshot preparation.</p>}</div></div><div className="session-row-actions"><Link className="secondary-button" to="/marks/moderation">Review moderation</Link><Link className="secondary-button" to="/reports/cards">Open report cards</Link></div></section> : <section className="panel approval-start"><FileLock2 aria-hidden="true"/><div><h2>{workflowLoading ? "Loading result scopes…" : "No persistent approval scope selected"}</h2><p>{workflowLoading ? "Reading moderation, mark, and result-scope records from Supabase." : "Save and submit O-Level marks, then complete moderation before a class can be locked."}</p></div><Link className="secondary-button" to="/marks/entry">Open marks entry</Link></section>}
    <ConfirmDialog open={pendingAction !== null} title={pendingAction === "LOCK" ? "Lock class results?" : "Approve class results?"} confirmLabel={pendingAction === "LOCK" ? "Lock Results" : "Approve Results"} busy={busy} onConfirm={() => void confirmAction()} onCancel={() => { if (!busy)
        setPendingAction(null); }} currentState={pendingAction === "LOCK" ? "Moderated, complete O-Level marks" : "Locked class result scope"} nextState={pendingAction === "LOCK" ? "Class scope locked in Supabase" : "Approval saved in Supabase"} impact={pendingAction === "LOCK" ? "Further mark saves will be rejected until an authorized reopen workflow exists." : "Adds an audited approval; does not publish reports."} reversible={false}><p>{pendingAction === "LOCK" ? <>Lock <strong>{offering?.className}</strong> after verifying all active learner subjects and moderation. This cannot be undone from this screen.</> : <>Approve <strong>{offering?.className}</strong> results. Supabase will enforce a different approver from the user who locked the class.</>}</p></ConfirmDialog>
  </>;
}
