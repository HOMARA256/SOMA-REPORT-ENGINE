import { CalendarClock, CheckCircle2, ShieldCheck, UserRoundCog, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { useApprovalEngine } from "./ApprovalEngine";
const delegableTypes = ["FINAL_RESULTS_APPROVAL", "REPORT_CARD_PUBLICATION", "MARKS_MODERATION", "ASSESSMENT_CREATION", "TEACHER_ALLOCATION_OVERRIDE", "SUBJECT_ACTIVATION_EXCEPTION", "LEARNER_ADMISSION_EXCEPTION", "SCHOOL_USER_ROLE_CHANGE"];
export function ApprovalDelegationsPage() {
    const engine = useApprovalEngine();
    const eligible = engine.members.filter((member) => ["HEAD_TEACHER", "DEPUTY_HEAD_TEACHER", "DIRECTOR_OF_STUDIES"].includes(member.role));
    const [toUserId, setToUserId] = useState("");
    const [types, setTypes] = useState(["REPORT_CARD_PUBLICATION"]);
    const [start, setStart] = useState(() => new Date().toISOString().slice(0, 16));
    const [end, setEnd] = useState("");
    const [reason, setReason] = useState("");
    const [limit, setLimit] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [revokeId, setRevokeId] = useState("");
    const [revokeReason, setRevokeReason] = useState("");
    const fromMember = engine.members.find((member) => member.userId === engine.currentUserId);
    const activeDelegations = useMemo(() => engine.delegations.filter((item) => item.isActive && !item.revokedAt && new Date(item.endsAt) > new Date()), [engine.delegations]);
    function toggle(type) { setTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]); }
    async function submit(event) { event.preventDefault(); setNotice(""); if (!fromMember || !toUserId || !types.length || !end || !reason.trim())
        return; setBusy(true); const error = await engine.createDelegation({ fromUserId: fromMember.userId, toUserId, approvalTypes: types, maximumAmountMinor: limit ? Math.round(Number(limit) * 100) : null, startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), reason: reason.trim() }); setBusy(false); setNotice(error ?? "Delegation created and the delegate was notified."); if (!error) {
        setReason("");
        setLimit("");
    } }
    async function confirmRevoke() { if (!revokeId || !revokeReason.trim())
        return; setBusy(true); const error = await engine.revokeDelegation(revokeId, revokeReason.trim()); setBusy(false); setNotice(error ?? "Delegation revoked and recorded in the audit trail."); if (!error) {
        setRevokeId("");
        setRevokeReason("");
    } }
    return <>
    <header className="page-heading"><div><span className="eyebrow">GOVERNANCE &amp; APPROVALS</span><h1>Approval Delegation</h1><p>Configure time-bound delegated authority without transferring identity or bypassing separation of duties.</p></div><Link className="secondary-button" to="/results/approvals"><ShieldCheck size={17}/> Approval Centre</Link></header>
    {engine.error && <p className="form-error" role="alert">{engine.error}</p>}{notice && <p className="moderation-notice" role="status">{notice}</p>}
    <section className="approval-delegation-layout">
      <form className="panel delegation-form" onSubmit={submit}><div className="panel-heading"><div><h2>Create delegation</h2><p>Only active users in this school are eligible. Platform authority cannot be delegated here.</p></div><UserRoundCog /></div>
        <div className="form-grid"><label>Delegate from<input readOnly value={fromMember ? `${fromMember.name} · ${fromMember.role.replaceAll("_", " ")}` : "Current authorised user"}/></label><label>Delegate to<select required value={toUserId} onChange={(event) => setToUserId(event.target.value)}><option value="">Select eligible user</option>{eligible.filter((member) => member.userId !== engine.currentUserId).map((member) => <option value={member.userId} key={member.userId}>{member.name} · {member.role.replaceAll("_", " ")}</option>)}</select></label><label>Start date and time<input required type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)}/></label><label>End date and time<input required type="datetime-local" min={start} value={end} onChange={(event) => setEnd(event.target.value)}/></label><label>Maximum financial amount (UGX)<input type="number" min="0" step="1" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="Leave blank for non-financial delegation"/></label><label className="form-field-wide">Reason<textarea required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the absence, operational need, or escalation context"/></label></div>
        <fieldset className="delegation-types"><legend>Approval types</legend>{delegableTypes.map((type) => <label key={type}><input type="checkbox" checked={types.includes(type)} onChange={() => toggle(type)}/><span>{type.replaceAll("_", " ")}</span></label>)}</fieldset>
        {!eligible.some((member) => member.userId !== engine.currentUserId) && <p className="class-workspace-note">No eligible Head Teacher, Deputy Head Teacher, or Director of Studies account is currently assigned to this school. Assign one of these roles before creating a delegation.</p>}
        <div className="form-actions"><button className="primary-button" disabled={busy || engine.loading || !eligible.some((member) => member.userId !== engine.currentUserId)} type="submit"><CalendarClock size={17}/>{busy ? "Saving…" : "Activate Delegation"}</button></div>
      </form>
      <section className="panel"><div className="panel-heading"><div><h2>Active delegations</h2><p>Expired and revoked authority cannot be used for new decisions.</p></div><span className="approval-count">{activeDelegations.length} active</span></div>{activeDelegations.length ? <div className="delegation-list">{activeDelegations.map((item) => { const delegate = engine.members.find((member) => member.userId === item.delegateToUserId); return <article key={item.id}><span className="delegation-state"><CheckCircle2 size={18}/></span><div><strong>{delegate?.name ?? item.delegateToRole.replaceAll("_", " ")}</strong><small>{item.approvalTypes.map((type) => type.replaceAll("_", " ")).join(", ")}</small><small>{new Date(item.startsAt).toLocaleString()} → {new Date(item.endsAt).toLocaleString()}</small><p>{item.reason}</p></div><button className="table-view-button" type="button" onClick={() => setRevokeId(item.id)}><XCircle size={15}/> Revoke</button></article>; })}</div> : <div className="dashboard-empty"><strong>No active delegations</strong><p>Authority remains with each configured primary approver.</p></div>}</section>
    </section>
    <section className="panel approval-policy-panel"><div className="panel-heading"><div><h2>Effective approval matrix</h2><p>School-specific policy overrides platform defaults when configured.</p></div></div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Request type</th><th>Primary approver</th><th>Fallback</th><th>High-risk mode</th><th>Deadline</th><th>Financial limit</th></tr></thead><tbody>{engine.policies.map((policy) => <tr key={policy.requestType}><td><strong>{policy.requestType.replaceAll("_", " ")}</strong></td><td>{policy.primaryRole.replaceAll("_", " ")}</td><td>{policy.fallbackRole?.replaceAll("_", " ") ?? "None"}</td><td>{policy.highRiskMode.replaceAll("_", " ")}</td><td>{policy.deadlineHours} hours</td><td>{policy.maximumAmountMinor === null ? "Configured per delegation" : new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(policy.maximumAmountMinor / 100)}</td></tr>)}</tbody></table></div></section>
    <ConfirmDialog open={Boolean(revokeId)} title="Revoke this delegation?" confirmLabel="Revoke Delegation" destructive busy={busy} onConfirm={() => void confirmRevoke()} onCancel={() => { if (!busy) {
        setRevokeId("");
        setRevokeReason("");
    } }}><label className="approval-note-label">Revocation reason<textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} placeholder="Record why this delegated authority is ending early"/></label></ConfirmDialog>
  </>;
}
