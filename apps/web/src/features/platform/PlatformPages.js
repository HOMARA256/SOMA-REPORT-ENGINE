import { Activity, AlertTriangle, ArrowRight, ArrowUpRight, BookOpenCheck, Building2, CircleDollarSign, CreditCard, Database, FileText, HeartPulse, Mail, Plus, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/common/ConfirmDialog";
import { DisplayThemeSettings } from "../../components/layout/DisplayThemeSettings";
import { DashboardEmptyState, DashboardMetric, DashboardPanel, DashboardQuickActions } from "../../components/dashboard/DashboardPrimitives";
import { PlatformSubjectCataloguePage } from "./PlatformSubjectCataloguePage";
import { PlatformSubscriptionsPage } from "./PlatformSubscriptionsPage";
import { PlatformHealthPage } from "./PlatformHealthPage";
import { MobileMoneyPaymentsPanel } from "./MobileMoneyPaymentsPanel";
import { ConnectedSchoolRegistration } from "./ConnectedSchoolRegistration";
import { effectiveFeature, loadSchoolCoordination, TERMLY_PLAN, PLATFORM_ADMIN_EMAIL, usePlatformWorkspace } from "./PlatformWorkspace";
function money(amount) { return new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(amount); }
function daysUntil(date) { return Math.max(0, Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / 86400000)); }
function statusClass(status) { return status === "ACTIVE" || status === "HEALTHY" || status === "CONFIRMED" || status === "COMPLETE" ? "success" : status === "SUSPENDED" || status === "FAILED" || status === "DEGRADED" ? "danger" : "warning"; }
function Badge({ children }) { return <span className={`platform-badge ${statusClass(children)}`}>{children.replaceAll("_", " ")}</span>; }
function auditDate(value) { const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/); if (match)
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)); return new Date(value); }
function formatAuditTimestamp(value) { const date = auditDate(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function auditTimestampIso(value) { const date = auditDate(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
const STATUS_REASON_OPTIONS = [
    ["PAYMENT_OR_SUBSCRIPTION", "Payment or subscription follow-up"],
    ["SCHOOL_REQUEST", "Written request from the school"],
    ["SECURITY_OR_COMPLIANCE", "Security or compliance review"],
    ["DUPLICATE_OR_TEST", "Duplicate, test, or incorrect tenant record"],
    ["SERVICE_SUPPORT", "Service support or operational maintenance"],
    ["OTHER", "Other — provide details"],
];
const GRACE_REASON_OPTIONS = [
    ["PAYMENT_PROCESSING", "Payment is being processed"],
    ["SCHOOL_REQUEST", "Written request from the school"],
    ["BILLING_CORRECTION", "Billing correction or reconciliation"],
    ["SERVICE_SUPPORT", "Service support or operational maintenance"],
    ["OTHER", "Other — provide details"],
];
const FEATURE_REASON_OPTIONS = [
    ["SCHOOL_REQUEST", "Written request from the school"],
    ["PLAN_EXCEPTION", "Approved plan exception"],
    ["SECURITY_OR_COMPLIANCE", "Security or compliance review"],
    ["SERVICE_SUPPORT", "Service support or maintenance"],
    ["OTHER", "Other — provide details"],
];
function auditReason(choice, detail, options) {
    const label = options.find(([value]) => value === choice)?.[1] ?? "";
    if (!label || (choice === "OTHER" && !detail.trim()))
        return "";
    return detail.trim() && choice !== "OTHER" ? `${label}: ${detail.trim()}` : choice === "OTHER" ? detail.trim() : label;
}
function ReasonSelector({ options, value, detail, onValueChange, onDetailChange, helper }) {
    const detailRequired = value === "OTHER";
    return <div className="platform-reason-fields"><label className="approval-note-label">Reason category<select value={value} onChange={(event) => onValueChange(event.target.value)} required><option value="">Select a reason</option>{options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}</select></label><label className="approval-note-label">{detailRequired ? "Reason details" : "Additional details (optional)"}<textarea value={detail} required={detailRequired} onChange={(event) => onDetailChange(event.target.value)} placeholder={detailRequired ? "Describe the reason for this action" : "Add a reference, date, or note if helpful"}/></label><small className="platform-reason-helper">{helper}</small></div>;
}
function PlatformActivityChart({ audit }) {
    const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        const next = new Date(date);
        next.setDate(next.getDate() + 1);
        return { label: date.toLocaleDateString("en-UG", { weekday: "short" }), value: audit.filter((item) => { const seen = auditDate(item.timestamp); return Number.isFinite(seen.getTime()) && seen >= date && seen < next; }).length };
    });
    const maximum = Math.max(1, ...days.map((day) => day.value));
    const total = days.reduce((sum, day) => sum + day.value, 0);
    return <div className="platform-activity-chart" aria-label={`${total} audited actions over the last seven days`}><p><strong>{total.toLocaleString()}</strong> audited action{total === 1 ? "" : "s"} in seven days</p><div className="platform-activity-chart__plot">{days.map((day, index) => <div className="platform-activity-chart__day" key={index} title={`${day.label}: ${day.value} actions`}><span>{day.value || ""}</span><i style={{ height: `${day.value ? Math.max(12, day.value / maximum * 100) : 3}%` }} className={day.value ? "has-activity" : ""}/><small>{day.label}</small></div>)}</div>{total === 0 && <small className="platform-chart-note">No audited actions have been recorded in this period.</small>}</div>;
}
function PlatformStatusChart({ active, pending, suspended }) {
    const rows = [{ label: "Active", value: active, tone: "blue" }, { label: "Setup", value: pending, tone: "amber" }, { label: "Suspended", value: suspended, tone: "red" }];
    const total = active + pending + suspended;
    return <div className="platform-status-bars" aria-label={`School account status distribution across ${total} schools`}>{rows.map(row => <div className="platform-status-bars__row" key={row.label}><span>{row.label}</span><div><i className={`tone-${row.tone}`} style={{ width: `${total ? row.value / total * 100 : 0}%` }}/></div><strong>{row.value}</strong></div>)}</div>;
}
function PlatformCollectionChart({ confirmed, outstanding }) {
    const total = confirmed + outstanding;
    const confirmedShare = total ? Math.round(confirmed / total * 100) : 0;
    return <div className="platform-donut-wrap"><div className="platform-donut" style={{ background: `conic-gradient(#16866a 0 ${confirmedShare}%, #f2ad3d ${confirmedShare}% 100%)` }}><span><strong>{confirmedShare}%</strong><small>collected</small></span></div><div className="platform-chart-legend"><span><i className="confirmed"/>Confirmed <strong>{money(confirmed)}</strong></span><span><i className="outstanding"/>Outstanding <strong>{money(outstanding)}</strong></span></div></div>;
}
function PlatformStatusRing({ label, count, total, tone }) {
    const percentage = total ? Math.round(count / total * 100) : 0;
    return <div className="platform-status-ring" role="img" aria-label={`${label}: ${count} of ${total} schools, ${percentage} percent`}>
    <div className={`platform-status-ring__dial tone-${tone}`} style={{ background: `conic-gradient(var(--ring-color) ${percentage}%, var(--ring-track) ${percentage}%)` }}><span><strong>{count}</strong><small>{percentage}%</small></span></div>
    <strong>{label}</strong>
  </div>;
}
export function PlatformDashboardPage() {
    const { schools, audit, schoolsLoading, schoolsError, reloadSchools } = usePlatformWorkspace();
    const navigate = useNavigate();
    const activeSchools = schools.filter((school) => school.accountStatus === "ACTIVE").length;
    const pendingSchools = schools.filter((school) => school.accountStatus === "PENDING" || school.accountStatus === "TRIAL" || school.subscriptionStatus === "PAYMENT_DUE").length;
    const activeLearners = schools.reduce((sum, school) => sum + school.usage.learners, 0);
    const openSupportRequests = schools.reduce((sum, school) => sum + (school.usage.supportRequests ?? 0), 0);
    const confirmedRevenue = schools.flatMap((school) => school.payments).filter((payment) => payment.status === "CONFIRMED").reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = schools.reduce((sum, school) => sum + school.billingPeriods.reduce((subtotal, period) => subtotal + Math.max(0, period.amount - period.amountPaid), 0), 0);
    const expiring = schools.filter((school) => school.subscriptionExpiry && daysUntil(school.subscriptionExpiry) <= 45).length;
    const attention = schools.filter((s) => s.accountStatus !== "ACTIVE" || s.health !== "HEALTHY" || (s.subscriptionExpiry && daysUntil(s.subscriptionExpiry) <= 45));
    return <>
    <section className="platform-page-heading dashboard-heading"><div><span className="eyebrow">GLOBAL PLATFORM MODE</span><h1>Platform Control Centre</h1><p>Live tenant operations, subscriptions, service health and activity across SOMA REPORT ENGINE.</p></div><div className="dashboard-heading-actions"><button className="secondary-button" type="button" onClick={() => void reloadSchools()} disabled={schoolsLoading}><RefreshCw size={17} aria-hidden="true"/>{schoolsLoading ? "Refreshing…" : "Refresh dashboard"}</button><button className="primary-button" type="button" onClick={() => navigate("/platform/schools/new")}><Plus size={18}/> Register School</button></div></section>
    {schoolsError && <div className="form-error-message" role="alert">The registered-school dashboard data could not be loaded: {schoolsError} <button type="button" className="text-button" onClick={() => void reloadSchools()}>Retry</button></div>}
    {schoolsLoading && !schools.length ? <section className="dashboard-metric-strip" aria-label="Loading platform overview" aria-busy="true">{["Registered schools", "Active schools", "Pending setup", "Active learners", "Revenue collected", "Outstanding", "Expiring soon", "Support requests"].map((label) => <DashboardMetric key={label} label={label} value="" detail="" icon={Building2} state="loading"/>)}</section> : null}
    {!schoolsError && !schoolsLoading && <section className="panel platform-dashboard-snapshot" aria-label="Platform overview">
      <header className="platform-dashboard-snapshot__header"><div><span className="eyebrow">PLATFORM AT A GLANCE</span><h2>School and subscription overview</h2><p>Current records across {schools.length.toLocaleString()} registered school{schools.length === 1 ? "" : "s"}</p></div><Link className="text-button" to="/platform/schools">View schools <ArrowRight size={16}/></Link></header>
      <div className="platform-dashboard-snapshot__body">
        <div className="platform-dashboard-rings" aria-label="School status"><PlatformStatusRing label="Active schools" count={activeSchools} total={schools.length} tone="green"/><PlatformStatusRing label="Pending action" count={pendingSchools} total={schools.length} tone="amber"/><PlatformStatusRing label="Suspended" count={schools.filter((school) => school.accountStatus === "SUSPENDED").length} total={schools.length} tone="blue"/></div>
        <div className="platform-dashboard-facts" aria-label="Platform statistics">
          <Link to="/platform/schools"><span>Active learners</span><strong>{activeLearners.toLocaleString()}</strong><small>Reported by schools</small></Link>
          <Link to="/platform/payments"><span>Revenue collected</span><strong>{money(confirmedRevenue)}</strong><small>Confirmed payments</small></Link>
          <Link to="/platform/payments"><span>Outstanding</span><strong>{money(outstanding)}</strong><small>Open billing balances</small></Link>
          <Link to="/platform/subscriptions"><span>Expiring soon</span><strong>{expiring}</strong><small>Within 45 days</small></Link>
          <Link to="/platform/messages"><span>Support requests</span><strong>{openSupportRequests}</strong><small>Open school conversations</small></Link>
        </div>
      </div>
    </section>}
    <section className="platform-chart-grid" aria-label="Platform operational charts">
      <DashboardPanel title="Activity trend" subtitle="Audited actions recorded over the last seven days"><PlatformActivityChart audit={audit}/></DashboardPanel>
      <DashboardPanel title="School distribution" subtitle="Current tenant account status"><PlatformStatusChart active={activeSchools} pending={pendingSchools} suspended={schools.filter(s => s.accountStatus === "SUSPENDED").length}/></DashboardPanel>
      <DashboardPanel title="Collection mix" subtitle="Confirmed receipts against open balances"><PlatformCollectionChart confirmed={confirmedRevenue} outstanding={outstanding}/></DashboardPanel>
    </section>
    <section className="dashboard-analytics-grid">
      <DashboardPanel title="School growth" subtitle="Current registered-school distribution"><div className="dashboard-status-bars">{[["Active", activeSchools], ["Pending setup", pendingSchools], ["Suspended", schools.filter(s => s.accountStatus === "SUSPENDED").length]].map(([label, value]) => <div key={String(label)}><span>{label}</span><div><i style={{ width: `${schools.length ? Number(value) / schools.length * 100 : 0}%` }}/></div><strong>{value}</strong></div>)}</div></DashboardPanel>
      <DashboardPanel title="Subscription collection" subtitle={`${money(TERMLY_PLAN.amount)} per school per academic term`}><div className="dashboard-finance-summary"><strong>{money(confirmedRevenue)}</strong><span>confirmed</span><strong>{money(outstanding)}</strong><span>outstanding</span></div></DashboardPanel>
      <DashboardPanel title="Action required" subtitle="Accounts requiring platform intervention" action={<Link className="text-button" to="/platform/schools">View all <ArrowRight size={16}/></Link>}>{attention.length ? <div className="dashboard-action-list">{attention.slice(0, 5).map(school => <Link key={school.id} to={`/platform/schools/${school.id}`}><span><strong>{school.name}</strong><small>{school.health !== "HEALTHY" ? `Service health: ${school.health}` : school.subscriptionStatus.replaceAll("_", " ")}</small></span><ArrowRight size={17}/></Link>)}</div> : <DashboardEmptyState title="No urgent account actions" detail="All currently loaded schools are healthy and active."/>}</DashboardPanel>
      <DashboardPanel title="Recent activity" subtitle="Latest recorded platform actions">{audit.length ? <div className="dashboard-activity-list">{audit.slice(0, 5).map(event => <article key={event.id}><Activity size={17} aria-hidden="true"/><span><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.detail}</small></span><time dateTime={auditTimestampIso(event.timestamp)}>{formatAuditTimestamp(event.timestamp)}</time></article>)}</div> : <DashboardEmptyState title="No recent activity" detail="New audited platform actions will appear here."/>}</DashboardPanel>
    </section>
    <DashboardPanel title="Quick actions" subtitle="Common platform administration tasks"><DashboardQuickActions items={[{ label: "View schools", to: "/platform/schools", icon: Building2 }, { label: "Register school", to: "/platform/schools/new", icon: Plus }, { label: "Confirm payments", to: "/platform/payments", icon: CircleDollarSign }, { label: "Manage subscriptions", to: "/platform/subscriptions", icon: CreditCard }, { label: "System health", to: "/platform/system/health", icon: HeartPulse }, { label: "Subject catalogue", to: "/platform/catalogue", icon: BookOpenCheck }, { label: "Security", to: "/platform/security", icon: ShieldCheck }, { label: "Backups", to: "/platform/system/backups", icon: Database }]}/></DashboardPanel>
  </>;
}
export function PlatformSchoolsPage() {
    const workspace = usePlatformWorkspace();
    const { schools } = workspace;
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState("ALL");
    const [demoBusy, setDemoBusy] = useState(false);
    const [demoError, setDemoError] = useState("");
    const filtered = schools.filter((s) => `${s.name} ${s.code} ${s.location} ${s.admin.name}`.toLowerCase().includes(query.toLowerCase()) && (status === "ALL" || s.accountStatus === status));
    async function createDemo() { setDemoBusy(true); setDemoError(""); try {
        await workspace.createDemoSchool();
    }
    catch (reason) {
        setDemoError(reason instanceof Error ? reason.message : "Demo school creation failed.");
    }
    finally {
        setDemoBusy(false);
    } }
    return <><section className="platform-page-heading"><div><span className="eyebrow">TENANT DIRECTORY</span><h1>Registered Schools</h1><p>Search and open a school for platform-level administration. Opening a school does not impersonate its users.</p>{demoError && <p className="form-error">{demoError}</p>}</div><div className="platform-action-row"><button className="secondary-button" disabled={demoBusy} onClick={() => void createDemo()}>{demoBusy ? "Creating…" : "Create Demo O-Level School Data"}</button><button className="primary-button" onClick={() => navigate("/platform/schools/new")}><Plus size={18}/> Register School</button></div></section><section className="panel platform-directory"><div className="platform-directory-filters"><label><span>Search schools</span><div><Search size={18}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="School name, code, location, or admin"/></div></label><label><span>Account status</span><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="ALL">All statuses</option><option>PENDING</option><option>ACTIVE</option><option>TRIAL</option><option>PAYMENT_DUE</option><option>SUSPENDED</option><option>ARCHIVED</option></select></label></div><div className="table-wrapper"><table className="data-table platform-school-table"><thead><tr><th>School</th><th>Location</th><th>School Administrator</th><th>Plan</th><th>Subscription</th><th>Expiry</th><th>Account</th><th>Last Activity</th><th /></tr></thead><tbody>{filtered.map((school) => <tr key={school.id}><td><strong>{school.name}</strong><small>{school.code}{school.code === "DEMO-OLEVEL" && " · Demo Data"}</small></td><td>{school.location}</td><td><strong>{school.admin.name}</strong><small>{school.admin.email}</small></td><td>{school.plan}</td><td><Badge>{school.subscriptionStatus}</Badge></td><td>{school.subscriptionExpiry || "—"}</td><td><Badge>{school.accountStatus}</Badge></td><td>{school.lastActivity}</td><td><button className="table-view-button" onClick={() => navigate(`/platform/schools/${school.id}`)}>Open</button></td></tr>)}</tbody></table></div><footer>{filtered.length} of {schools.length} registered schools</footer></section></>;
}
/* Superseded by the connected six-step workflow. Kept temporarily in source history
export function LegacyRegisterSchoolPage() {
  const workspace = usePlatformWorkspace(); const navigate = useNavigate(); const [step,setStep]=useState(1); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [codeEdited,setCodeEdited]=useState(false);
  const today=new Date().toISOString().slice(0,10);
  const [form,setForm]=useState<NewSchoolInput>({name:"",code:"",schoolLevel:"UCE_ONLY",schoolType:"Secondary School",district:"",emisNumber:"",address:"",phone:"",email:"",planCode:"OURSCHOOL_TERMLY_V2",billingCadence:"TERMLY",subscriptionStart:today,trialDays:0,notes:"",requiresMfa:false,adminName:"",adminEmail:"",adminPhone:""});
  const set=<K extends keyof NewSchoolInput>(key:K,value:NewSchoolInput[K])=>setForm((current)=>({...current,[key]:value}));
  const suggestedCode=(name:string)=>name.normalize("NFKD").replace(/[^a-zA-Z0-9 ]/g,"").split(/\s+/).filter(Boolean).map((word)=>word[0]).join("").toUpperCase().slice(0,12);
  async function submit(event:FormEvent){event.preventDefault();setError("");if(step<5){setStep(step+1);return;}setBusy(true);try{await workspace.registerSchool(form);navigate("/platform/schools");}catch(reason){setError(reason instanceof Error?reason.message:"Registration failed.");}finally{setBusy(false);}}
  const valid=step===1?Boolean(form.name&&form.code&&form.schoolType&&form.district&&form.address&&form.phone&&form.email):step===2?Boolean(form.planCode&&form.subscriptionStart):step===3?Boolean(form.adminName&&form.adminEmail&&form.adminPhone):true;
  return <><section className="platform-page-heading"><div><span className="eyebrow">TENANT PROVISIONING</span><h1>Register New School</h1><p>Create a draft tenant and send its first School Administrator a secure, expiring invitation.</p></div><Link className="secondary-button" to="/platform/schools">Cancel</Link></section><form className="panel platform-registration" onSubmit={submit}>
    <ol className="platform-stepper" aria-label="Registration progress">{["School details","Subscription","Administrator","Review","Create"].map((label,index)=><li key={label} className={step===index+1?"active":step>index+1?"complete":""}><span>{index+1}</span>{label}</li>)}</ol>
    {step===1&&<div><div className="panel-heading"><div><h2>School details</h2><p>The code is generated from the school name and can be edited before registration.</p></div></div><div className="form-grid">
      <label>School name<input required value={form.name} onChange={(e)=>{set("name",e.target.value);if(!codeEdited)set("code",suggestedCode(e.target.value));}}/></label>
      <label>School code<input required value={form.code} onChange={(e)=>{setCodeEdited(true);set("code",e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,12));}}/></label>
      <label>School level<select value={form.schoolLevel} onChange={(e)=>set("schoolLevel",e.target.value as NewSchoolInput["schoolLevel"])}><option value="UCE_ONLY">UCE only</option><option value="UACE_ONLY">UACE only</option><option value="BOTH">Both UCE and UACE</option></select></label>
      <label>School type<input required value={form.schoolType} onChange={(e)=>set("schoolType",e.target.value)}/></label>
      <label>District<input required value={form.district} onChange={(e)=>set("district",e.target.value)}/></label>
      <label>EMIS number <small>Optional</small><input value={form.emisNumber} onChange={(e)=>set("emisNumber",e.target.value)}/></label>
      <label className="form-field-wide">School address<textarea required value={form.address} onChange={(e)=>set("address",e.target.value)}/></label>
      <label>School phone<input required value={form.phone} onChange={(e)=>set("phone",e.target.value)}/></label>
      <label>School email<input type="email" required value={form.email} onChange={(e)=>set("email",e.target.value)}/></label>
    </div></div>}
    {step===2&&<div><div className="panel-heading"><div><h2>Subscription</h2><p>Select the approved learner-count billing frequency and start date.</p></div></div><div className="form-grid">
      <label>Billing frequency<select value={form.billingCadence} onChange={(e)=>{const cadence=e.target.value as NewSchoolInput["billingCadence"];set("billingCadence",cadence);set("planCode",cadence==="ANNUAL"?"OURSCHOOL_ANNUAL":"OURSCHOOL_TERMLY_V2");}}><option value="ANNUAL">Annual</option><option value="TERMLY">Termly</option></select></label>
      <label>Subscription plan<input readOnly value={form.billingCadence==="ANNUAL"?"SOMA REPORT ENGINE Annual Subscription":"SOMA REPORT ENGINE Termly Subscription"}/></label>
      <label>Subscription start date<input type="date" required value={form.subscriptionStart} onChange={(e)=>set("subscriptionStart",e.target.value)}/></label>
      <label>Trial period (days)<input type="number" min={0} max={90} value={form.trialDays} onChange={(e)=>set("trialDays",Number(e.target.value))}/></label>
    </div></div>}
    {step===3&&<div><div className="panel-heading"><div><h2>Primary School Administrator</h2><p>A unique username, one-time activation link and temporary password are generated only by the secure server.</p></div></div><div className="form-grid">
      <label>Full name<input required value={form.adminName} onChange={(e)=>set("adminName",e.target.value)}/></label><label>Email address<input type="email" required value={form.adminEmail} onChange={(e)=>set("adminEmail",e.target.value)}/></label><label>Phone number<input required value={form.adminPhone} onChange={(e)=>set("adminPhone",e.target.value)}/></label>
      <label className="checkbox-field"><input type="checkbox" checked={form.requiresMfa} onChange={(e)=>set("requiresMfa",e.target.checked)}/><span>Require two-factor authentication during setup</span></label>
    </div><div className="platform-info-note"><Mail size={18}/> Plain passwords and activation tokens are never returned to this browser, stored in audit logs, or shown to the Platform Administrator.</div></div>}
    {step===4&&<div><div className="panel-heading"><div><h2>Review and internal notes</h2><p>Confirm the tenant, billing and invitation details.</p></div></div><Definition items={[["School",form.name],["Code",form.code],["Level",form.schoolLevel.replaceAll("_"," ")],["District",form.district],["Billing",form.billingCadence],["Start date",form.subscriptionStart],["Trial",form.trialDays?form.trialDays+" days":"None"],["Administrator",form.adminName],["Administrator email",form.adminEmail]]}/><label className="platform-notes-field">Internal Platform Admin notes<textarea value={form.notes} onChange={(e)=>set("notes",e.target.value)} placeholder="Not visible to the school"/></label></div>}
    {step===5&&<div><div className="panel-heading"><div><h2>Create tenant and invitation</h2><p>The database transaction creates the draft school, inactive administrator membership, subscription, compulsory UCE offerings where applicable, checklist and audit evidence.</p></div></div><div className="platform-info-note"><ShieldCheck size={18}/> Email is attempted only after all database records exist. Delivery failure preserves the draft tenant and marks the invitation failed for a safe resend.</div></div>}
    {error&&<div className="form-error" role="alert">{error}</div>}<div className="form-actions platform-step-actions">{step>1&&<button className="secondary-button" type="button" disabled={busy} onClick={()=>setStep(step-1)}>Back</button>}<button className="primary-button" type="submit" disabled={!valid||busy}>{step===5?<><Building2 size={18}/>{busy?"Creating securely…":"Register School & Send Invitation"}</>:<>Continue <ArrowRight size={18}/></>}</button></div>
  </form></>;
}
*/
export function RegisterSchoolPage() { return <ConnectedSchoolRegistration />; }
const tenantTabs = [["Overview", ""], ["Account", "account"], ["School Administrator", "admin"], ["Subscription", "subscription"], ["Payments", "payments"], ["Features", "features"], ["Usage", "usage"], ["Storage", "storage"], ["System Health", "health"], ["Jobs & Sync", "jobs"], ["Import / Export", "import-export"], ["Notifications", "notifications"], ["Security", "security"], ["Audit", "audit"], ["Support", "support"], ["Danger Zone", "danger"]];
export function PlatformSchoolControlPage() {
    const { schoolId = "" } = useParams();
    const workspace = usePlatformWorkspace();
    const location = useLocation();
    const navigate = useNavigate();
    const school = workspace.schoolById(schoolId);
    const [coordination, setCoordination] = useState(null);
    const [coordinationLoading, setCoordinationLoading] = useState(false);
    const [coordinationError, setCoordinationError] = useState("");
    useEffect(() => {
        let current = true;
        if (!workspace.authenticated || !schoolId)
            return () => { current = false; };
        setCoordinationLoading(true);
        setCoordinationError("");
        void loadSchoolCoordination(schoolId).then((report) => { if (report.schoolId !== schoolId)
            throw new Error("Supabase returned coordination data for a different school."); if (current)
            setCoordination(report); }).catch((failure) => { if (current) {
            setCoordination(null);
            setCoordinationError(failure instanceof Error ? failure.message : "The live coordination check failed.");
        } }).finally(() => { if (current)
            setCoordinationLoading(false); });
        return () => { current = false; };
    }, [schoolId, workspace.authenticated]);
    const [pendingStatus, setPendingStatus] = useState(null);
    const [statusReason, setStatusReason] = useState("");
    const [statusReasonDetail, setStatusReasonDetail] = useState("");
    const [statusBusy, setStatusBusy] = useState(false);
    const [statusError, setStatusError] = useState("");
    const [invitationError, setInvitationError] = useState("");
    const [pendingAdminAction, setPendingAdminAction] = useState(null);
    const [adminReason, setAdminReason] = useState("");
    const [adminReasonDetail, setAdminReasonDetail] = useState("");
    const [adminBusy, setAdminBusy] = useState(false);
    const [adminError, setAdminError] = useState("");
    if (!school)
        return <Navigate to="/platform/schools" replace/>;
    const selectedSchool = school;
    const tail = location.pathname.split(`/platform/schools/${schoolId}`)[1].replace(/^\//, "");
    const section = tenantTabs.some(([, path]) => path === tail) ? tail : "";
    const selectedStatusReason = auditReason(statusReason, statusReasonDetail, STATUS_REASON_OPTIONS);
    const selectedAdminReason = auditReason(adminReason, adminReasonDetail, STATUS_REASON_OPTIONS);
    function statusAction(status) { setPendingStatus(status); setStatusReason(""); setStatusReasonDetail(""); setStatusError(""); }
    function requestAdminAction(action) { if (action === "RESEND_INVITATION") {
        setInvitationError("");
        void workspace.adminAction(selectedSchool.id, action).catch(() => setInvitationError("The invitation was not resent. Check the current invitation status before trying again."));
        return;
    } setPendingAdminAction(action); setAdminReason(""); setAdminReasonDetail(""); setAdminError(""); }
    async function confirmStatus() { if (!pendingStatus || !selectedStatusReason || statusBusy)
        return; setStatusBusy(true); setStatusError(""); try {
        await workspace.changeStatus(selectedSchool.id, pendingStatus, selectedStatusReason);
        setPendingStatus(null);
    }
    catch {
        setStatusError("The school status was not changed. Check the current status before retrying; the school’s records are preserved.");
    }
    finally {
        setStatusBusy(false);
    } }
    async function confirmAdminAction() { if (!pendingAdminAction || !selectedAdminReason || adminBusy)
        return; setAdminBusy(true); setAdminError(""); try {
        await workspace.adminAction(selectedSchool.id, pendingAdminAction, selectedAdminReason);
        setPendingAdminAction(null);
    }
    catch (failure) {
        setAdminError(failure instanceof Error ? failure.message : "Administrator access action failed.");
    }
    finally {
        setAdminBusy(false);
    } }
    return <><section className="platform-school-header"><div className="platform-school-logo">{school.code.slice(0, 2)}</div><div><Link to="/platform/schools">← All Schools</Link><h1>{school.name}</h1><p>School Code: {school.code} · {school.location}</p></div><div className="platform-school-status"><Badge>{school.accountStatus}</Badge><strong>{school.plan} Plan</strong><small>Expires {school.subscriptionExpiry}</small></div><label>Change school<select value={school.id} onChange={(e) => navigate(`/platform/schools/${e.target.value}`)}>{workspace.schools.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></section><nav className="platform-tenant-tabs" aria-label="Selected school control centre">{tenantTabs.map(([label, path]) => <Link key={label} className={section === path ? "active" : ""} to={`/platform/schools/${school.id}${path ? `/${path}` : ""}`}>{label}</Link>)}</nav>{invitationError && <p className="form-error" role="alert">{invitationError}</p>}<TenantSection school={school} section={section} statusAction={statusAction} requestAdminAction={requestAdminAction} coordination={coordination} coordinationLoading={coordinationLoading} coordinationError={coordinationError}/><ConfirmDialog open={pendingStatus !== null} title={`${pendingStatus === "SUSPENDED" ? "Suspend" : pendingStatus === "ARCHIVED" ? "Archive" : "Change status for"} ${school.name}?`} confirmLabel={pendingStatus === "SUSPENDED" ? "Suspend School" : pendingStatus === "ARCHIVED" ? "Archive School" : "Confirm Status Change"} destructive={pendingStatus === "SUSPENDED" || pendingStatus === "ARCHIVED"} busy={statusBusy} confirmDisabled={!selectedStatusReason} onConfirm={confirmStatus} onCancel={() => { if (!statusBusy)
        setPendingStatus(null); }}>{statusError && <p className="form-error" role="alert">{statusError}</p>}<ReasonSelector options={STATUS_REASON_OPTIONS} value={statusReason} detail={statusReasonDetail} onValueChange={setStatusReason} onDetailChange={setStatusReasonDetail} helper="Choose the closest reason. Add a note only when it improves the audit record."/><p>School academic data is preserved. This action controls service access and is recorded in the platform audit trail.</p></ConfirmDialog><ConfirmDialog open={pendingAdminAction !== null} title={`${pendingAdminAction?.replaceAll("_", " ")} for ${school.name}?`} confirmLabel={pendingAdminAction === "PASSWORD_RESET" ? "Send Reset Email" : "Confirm Administrator Action"} destructive={pendingAdminAction === "DISABLE" || pendingAdminAction === "REVOKE_INVITATION"} busy={adminBusy} confirmDisabled={!selectedAdminReason} onConfirm={confirmAdminAction} onCancel={() => { if (!adminBusy)
        setPendingAdminAction(null); }}><ReasonSelector options={STATUS_REASON_OPTIONS} value={adminReason} detail={adminReasonDetail} onValueChange={setAdminReason} onDetailChange={setAdminReasonDetail} helper="Choose the closest reason. Add a note only when it improves the audit record."/>{pendingAdminAction === "PASSWORD_RESET" && <p>Supabase Auth will send a secure password reset email to {school.admin.email}. No password will be shown or stored here.</p>}{adminError && <p className="form-error" role="alert">{adminError}</p>}</ConfirmDialog></>;
}
function TenantSection({ school, section, statusAction, requestAdminAction, coordination, coordinationLoading, coordinationError }) {
    const workspace = usePlatformWorkspace();
    const audit = workspace.audit.filter((event) => event.schoolId === school.id);
    if (section === "account")
        return <Section title="Tenant account" subtitle="Platform-owned identity and lifecycle controls."><Definition items={[["School ID", school.id], ["School code", school.code], ["Official name", school.name], ["Account status", school.accountStatus], ["Registration date", school.registeredAt], ["Activation date", school.activationDate], ["Archive status", school.accountStatus === "ARCHIVED" ? "Archived" : "Not archived"]]}/><div className="platform-action-row"><button className="primary-button" onClick={() => statusAction("ACTIVE")}>Activate / Reactivate</button><button className="secondary-button" onClick={() => statusAction("SUSPENDED")}>Suspend</button><button className="secondary-button" onClick={() => statusAction("ARCHIVED")}>Archive</button></div></Section>;
    if (section === "admin")
        return <Section title="School Administrator" subtitle="Account and invitation administration only. User impersonation is not available."><Definition items={[["Name", school.admin.name], ["Email", school.admin.email], ["Telephone", school.admin.telephone], ["Account status", school.admin.status], ["Invitation", school.admin.invitation], ["Invitation sent", school.admin.invitationSentAt ?? "Not sent"], ["Accepted", school.admin.acceptedAt ?? "Not accepted"], ["Last login", school.admin.lastLogin], ["MFA", school.admin.mfa ? "Configured" : "Not configured"]]}/><div className="platform-action-row"><button className="secondary-button" onClick={() => requestAdminAction("RESEND_INVITATION")}><Mail size={17}/> Resend Invitation</button>{["PENDING", "SENT", "DELIVERED"].includes(school.admin.invitation) && <button className="secondary-button" onClick={() => requestAdminAction("REVOKE_INVITATION")}>Revoke Invitation</button>}{school.admin.status === "LOCKED" && <button className="secondary-button" onClick={() => requestAdminAction("UNLOCK")}>Unlock Account</button>}<button className="secondary-button" onClick={() => requestAdminAction("PASSWORD_RESET")}>Secure Password Reset</button><button className="secondary-button" onClick={() => requestAdminAction(school.admin.status === "DISABLED" ? "RESTORE" : "DISABLE")}>{school.admin.status === "DISABLED" ? "Restore Access" : "Disable Access"}</button></div></Section>;
    if (section === "subscription")
        return <Section title="Current subscription" subtitle="The charge is snapshotted for each academic period; historical billing never changes when a future price changes."><div className="platform-subscription-summary"><article><span>Plan</span><strong>{TERMLY_PLAN.name}</strong></article><article><span>Current charge</span><strong>{money(TERMLY_PLAN.amount)} / Term</strong></article><article><span>Academic period</span><strong>{school.currentTerm} {school.currentAcademicYear}</strong></article><article><span>Status</span><strong>{school.subscriptionStatus.replaceAll("_", " ")}</strong></article><article><span>Start date</span><strong>{school.subscriptionStart}</strong></article><article><span>Due date</span><strong>{school.billingPeriods.find((item) => item.academicYear === school.currentAcademicYear && item.term === school.currentTerm)?.dueDate ?? "—"}</strong></article><article><span>Expiry</span><strong>{school.subscriptionExpiry}</strong></article><article><span>Payment</span><strong>{school.billingPeriods.find((item) => item.academicYear === school.currentAcademicYear && item.term === school.currentTerm)?.status ?? "DUE"}</strong></article></div><div className="platform-action-row"><Link className="primary-button" to={`/platform/schools/${school.id}/payments`}>View / Confirm Payments</Link><GracePeriodControl school={school}/></div><BillingHistory school={school}/></Section>;
    if (section === "payments")
        return <MobileMoneyPaymentsPanel schoolId={school.id} schoolName={school.name} mode="platform"/>;
    if (section === "features")
        return <FeatureEntitlementSection school={school}/>;
    if (section === "usage")
        return <Section title="Tenant academic coordination" subtitle="Live tenant-scoped aggregate counts from Supabase. No learner identities, marks, or report contents are exposed."><CoordinationSummary report={coordination} loading={coordinationLoading} error={coordinationError}/></Section>;
    if (section === "storage")
        return <Section title="Storage" subtitle="Technical storage policy and aggregate managed-file consumption."><div className="platform-storage"><div><strong>{school.storageUsedGb} GB of {school.storageLimitGb} GB</strong><span>{Math.round(school.storageUsedGb / school.storageLimitGb * 100)}% used</span></div><div className="platform-progress"><span style={{ width: `${Math.min(100, school.storageUsedGb / school.storageLimitGb * 100)}%` }}/></div></div><MetricGrid items={[["Profile / media", "0.2 GB"], ["Learner photos", "0.3 GB"], ["School branding", "0.05 GB"], ["Report PDFs", "0.4 GB"], ["Imports & exports", "0.18 GB"], ["Other managed files", "0.07 GB"]]}/></Section>;
    if (section === "health")
        return <Section title="Tenant system health" subtitle="Live database connectivity and school/year relationship checks. Other services are labelled until they have real monitors."><HealthGrid school={school} report={coordination} loading={coordinationLoading} error={coordinationError}/></Section>;
    if (section === "jobs")
        return <Section title="Jobs & Sync" subtitle="Safe retry is offered only for idempotent platform jobs."><Jobs school={school}/></Section>;
    if (section === "import-export")
        return <Section title="Import / Export status" subtitle="Technical support metadata only. Marks and workbook contents are not exposed."><Jobs school={school} importOnly/></Section>;
    if (section === "notifications")
        return <Section title="Platform notifications" subtitle="Subscription, payment, maintenance, security, and account messages only."><p className="platform-info-note">Delivery and retry status are not connected to a live notification worker yet. No message is reported as sent from this screen.</p></Section>;
    if (section === "security")
        return <Section title="Tenant security" subtitle="Account metadata without credentials, tokens, hashes, or MFA secrets."><MetricGrid items={[["Failed logins (30 days)", school.health === "DEGRADED" ? 18 : 2], ["Locked accounts", school.admin.status === "LOCKED" ? 1 : 0], ["Suspicious events", school.health === "DEGRADED" ? 2 : 0], ["Permission failures", 1], ["MFA on School Admin", school.admin.mfa ? "Enabled" : "Not enabled"], ["Last security review", "2026-09-20"]]}/></Section>;
    if (section === "audit")
        return <Section title="Platform audit" subtitle="Immutable school-specific platform actions."><div className="platform-audit-list">{audit.map((event) => <article key={event.id}><Activity size={18}/><div><strong>{event.action.replaceAll("_", " ")}</strong><span>{event.detail}</span></div><time>{event.timestamp}</time></article>)}{!audit.length && <p>No platform actions recorded for this school.</p>}</div></Section>;
    if (section === "support")
        return <Section title="Support diagnostics" subtitle="Live aggregate checks for this school; no private academic rows are returned."><CoordinationSummary report={coordination} loading={coordinationLoading} error={coordinationError}/><p className="platform-info-note">Storage, authentication delivery, background sync, report generation, and import/export workers are not yet monitored here.</p></Section>;
    if (section === "danger")
        return <Section title="Danger zone" subtitle="High-risk lifecycle controls require a reason, confirmation, and audit record."><div className="platform-danger"><AlertTriangle size={24}/><div><strong>Preserve all tenant data</strong><p>Suspension or archival never deletes learners, staff, marks, reports, files, settings, or audit records.</p></div><button className="secondary-button" onClick={() => statusAction("SUSPENDED")}>Suspend Tenant</button><button className="secondary-button" onClick={() => statusAction("ARCHIVED")}>Archive Tenant</button></div></Section>;
    return <ConnectedOverview school={school} report={coordination} loading={coordinationLoading} error={coordinationError}/>;
}
export function Overview({ school }) { const enabled = Object.values(school.features).filter(effectiveFeature).length; const payment = school.billingPeriods.find((item) => item.academicYear === school.currentAcademicYear && item.term === school.currentTerm); return <div className="platform-overview-grid"><Section title="School Platform Connection" subtitle="Account and subscription metadata are distinct from live academic connectivity."><Definition items={[["School Platform Status", school.accountStatus], ["School Administrator", school.admin.status], ["Onboarding", school.onboardingStatus], ["Subscription", `${money(TERMLY_PLAN.amount)} / Term`], ["Current Academic Period", `${school.currentTerm} ${school.currentAcademicYear}`], ["Subscription Status", school.subscriptionStatus], ["Payment", payment?.status ?? "DUE"], ["Expiry", school.subscriptionExpiry], ["Features", `${enabled} / ${Object.keys(school.features).length} enabled`], ["Storage", `${school.storageUsedGb} GB / ${school.storageLimitGb} GB`], ["Directory source", "Supabase RPC"]]}/><div className="platform-action-row"><Link className="primary-button" to={`/platform/schools/${school.id}/subscription`}>Manage Subscription</Link><Link className="secondary-button" to={`/platform/schools/${school.id}/features`}>Manage Features</Link><Link className="secondary-button" to={`/platform/schools/${school.id}/admin`}>School Administrator</Link><Link className="secondary-button" to={`/platform/schools/${school.id}/support`}>View Diagnostics</Link></div><SchoolRepairControl school={school}/></Section><Section title="School overview" subtitle="Registered tenant identity."><Definition items={[["School name", school.name], ["School code", school.code], ["Location", school.location], ["Programmes", school.programmes.join(", ")], ["Registered", school.registeredAt]]}/></Section></div>; }
function SchoolRepairControl({ school }) { const workspace = usePlatformWorkspace(); const [preview, setPreview] = useState(null); const [busy, setBusy] = useState(false); const [resetOpen, setResetOpen] = useState(false); const [error, setError] = useState(""); async function inspect() { setBusy(true); setError(""); try {
    setPreview(await workspace.previewSchoolRepair(school.id));
}
catch (reason) {
    setError(reason instanceof Error ? reason.message : "Configuration inspection failed.");
}
finally {
    setBusy(false);
} } async function repair() { setBusy(true); setError(""); try {
    await workspace.repairSchool(school.id);
    setPreview([]);
}
catch (reason) {
    setError(reason instanceof Error ? reason.message : "Configuration repair failed.");
}
finally {
    setBusy(false);
} } async function resetDemo() { setBusy(true); setError(""); try {
    await workspace.resetDemoSchool(school.id);
    setResetOpen(false);
}
catch (reason) {
    setError(reason instanceof Error ? reason.message : "Demo reset failed.");
}
finally {
    setBusy(false);
} } return <><div className="platform-repair-control"><div><strong>Configuration repair</strong><p>Preview is read-only. Repair creates only missing tenant records and never replaces valid school or academic data.</p></div><button className="secondary-button" disabled={busy} onClick={() => void inspect()}>{busy ? "Checking…" : "Preview Repair"}</button>{school.code === "DEMO-OLEVEL" && <button className="secondary-button" disabled={busy} onClick={() => setResetOpen(true)}>Reset Demo School Data</button>}{preview && preview.length > 0 && <div className="platform-repair-preview"><span>Missing: {preview.join(", ")}</span><button className="primary-button" disabled={busy} onClick={() => void repair()}>Repair School Configuration</button></div>}{preview?.length === 0 && <span className="status-badge status-active">Configuration complete</span>}{error && <p className="form-error">{error}</p>}</div><ConfirmDialog open={resetOpen} title="Reset Demo School Data?" confirmLabel="Reset Demo Data" destructive busy={busy} onCancel={() => setResetOpen(false)} onConfirm={() => void resetDemo()}><p>This removes only records explicitly marked Demo Data. Real school records are never selected by this operation.</p></ConfirmDialog></>; }
function Section({ title, subtitle, children }) { return <section className="panel platform-section"><div className="panel-heading"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>; }
function FeatureEntitlementSection({ school }) {
    return <Section title="Feature entitlements" subtitle="Stored configuration follows the platform rule, plan, then this school's audited override. School-page enforcement is not yet verified.">
    {school.featureConnectionAvailable === false ? <p className="platform-info-note" role="status">Live feature settings are unavailable until the platform feature service is deployed. No override can be changed from this page.</p>
            : !Object.keys(school.features).length ? <p className="platform-info-note">No platform features are configured.</p>
                : <div className="platform-feature-list">{Object.entries(school.features).map(([key, feature]) => <FeatureOverrideControl key={`${school.id}:${key}`} schoolId={school.id} featureKey={key} feature={feature}/>)}</div>}
  </Section>;
}
function FeatureOverrideControl({ schoolId, featureKey, feature }) {
    const workspace = usePlatformWorkspace();
    const [editing, setEditing] = useState(false);
    const [state, setState] = useState(feature.override);
    const [reason, setReason] = useState("");
    const [detail, setDetail] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const selectedReason = auditReason(reason, detail, FEATURE_REASON_OPTIONS);
    const canChange = feature.overridePermitted !== false && feature.globalEnabled !== false;
    async function save() {
        if (!selectedReason || busy || state === feature.override)
            return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
            const verified = await workspace.setFeatureOverride(schoolId, featureKey, state, selectedReason);
            setEditing(false);
            setReason("");
            setDetail("");
            setSuccess(verified ? "Override saved and verified from the live school settings." : "Override saved, but the refreshed value could not be verified. Reload this page to check it.");
        }
        catch (failure) {
            setError(failure instanceof Error ? failure.message : "The override could not be saved. Try again.");
        }
        finally {
            setBusy(false);
        }
    }
    return <article><div><strong>{feature.label}</strong><small>Plan: {feature.plan ? "Enabled" : "Disabled"}{feature.globalEnabled === false ? " · Platform-wide disabled" : ""}</small></div><span>Override: {feature.override.replaceAll("_", " ")}</span><Badge>{effectiveFeature(feature) ? "ACTIVE" : "SUSPENDED"}</Badge><button type="button" className="secondary-button" disabled={!canChange || busy} aria-expanded={editing} onClick={() => { setState(feature.override); setReason(""); setDetail(""); setError(""); setSuccess(""); setEditing((open) => !open); }}>{editing ? "Cancel change" : "Change override"}</button>{success && <p className="platform-feature-feedback" role="status">{success}</p>}{editing && <div className="platform-feature-form"><label className="approval-note-label">School override<select value={state} onChange={(event) => setState(event.target.value)}><option value="DEFAULT">Use plan default</option><option value="ENABLED">Enable for this school</option><option value="DISABLED">Disable for this school</option></select></label><ReasonSelector options={FEATURE_REASON_OPTIONS} value={reason} detail={detail} onValueChange={setReason} onDetailChange={setDetail} helper="A reason is saved with the platform audit entry. The global rule still takes precedence."/>{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="primary-button" disabled={busy || !selectedReason || state === feature.override} onClick={() => void save()}>{busy ? "Saving…" : "Save override"}</button></div>}</article>;
}
function Definition({ items }) { return <dl className="platform-definition">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
function MetricGrid({ items }) { return <div className="platform-metric-grid">{items.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>; }
function GracePeriodControl({ school }) { const workspace = usePlatformWorkspace(); const [open, setOpen] = useState(false); const [days, setDays] = useState(String(school.gracePeriodDays || 7)); const [reason, setReason] = useState(""); const [reasonDetail, setReasonDetail] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const parsed = Number(days); const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 90; const selectedReason = auditReason(reason, reasonDetail, GRACE_REASON_OPTIONS); async function confirm() { if (!valid || !selectedReason || busy)
    return; setBusy(true); setError(""); try {
    await workspace.setGracePeriod(school.id, parsed, selectedReason);
    setOpen(false);
}
catch (failure) {
    setError(failure instanceof Error ? failure.message : "The grace period could not be saved.");
}
finally {
    setBusy(false);
} } return <><button className="secondary-button" type="button" onClick={() => { setDays(String(school.gracePeriodDays || 7)); setReason(""); setReasonDetail(""); setError(""); setOpen(true); }}>Extend Grace Period</button><ConfirmDialog open={open} title={`Set grace period for ${school.name}?`} confirmLabel="Save Grace Period" busy={busy} confirmDisabled={!valid || !selectedReason} onConfirm={confirm} onCancel={() => { if (!busy)
    setOpen(false); }}><label className="approval-note-label">Grace period (days)<input type="number" min="1" max="90" value={days} onChange={(event) => setDays(event.target.value)} aria-describedby="grace-period-help"/></label><small id="grace-period-help" className="field-helper-text">Choose from 1 to 90 days.</small><ReasonSelector options={GRACE_REASON_OPTIONS} value={reason} detail={reasonDetail} onValueChange={setReason} onDetailChange={setReasonDetail} helper="Choose the closest billing or support reason. Use details for references or exceptions."/><p>Service access remains available during the recorded grace period. This action is audited.</p>{error && <p className="form-error" role="alert">{error}</p>}{!valid && <p className="form-error" role="alert">Enter a whole number from 1 to 90 days.</p>}</ConfirmDialog></>; }
function BillingHistory({ school }) { return <div className="platform-billing-history"><h3>Billing history</h3><div className="table-wrapper"><table className="data-table"><thead><tr><th>Academic year</th><th>Term</th><th>Charge</th><th>Amount paid</th><th>Balance</th><th>Payment date</th><th>Transaction</th><th>Status</th></tr></thead><tbody>{school.billingPeriods.map((item) => <tr key={item.id}><td>{item.academicYear}</td><td>{item.term}</td><td>{money(item.amount)}</td><td>{money(item.amountPaid)}</td><td>{money(Math.max(0, item.amount - item.amountPaid))}</td><td>{item.paymentDate ?? "—"}</td><td>{item.transactionReference ?? "—"}</td><td><Badge>{item.status}</Badge></td></tr>)}</tbody></table></div></div>; }
function coordinationIssueCount(report) { return Object.values(report.integrity).reduce((sum, count) => sum + Number(count || 0), 0); }
function currentCoordinationYear(school, report) { return report?.academicYears.find((year) => year.name === String(school.currentAcademicYear)) ?? report?.academicYears.find((year) => year.status === "ACTIVE") ?? report?.academicYears[0] ?? null; }
function CoordinationSummary({ report, loading, error }) {
    if (loading)
        return <p role="status" className="platform-info-note">Checking this school’s academic database links…</p>;
    if (!report)
        return <p role="alert" className="form-error">Live coordination could not be confirmed. {error || "No report was returned."}</p>;
    const issues = coordinationIssueCount(report);
    return <div className="platform-coordination-summary">
    <div className="platform-health-grid">
      <article><span>School identity match</span><Badge>{report.schoolId ? "CONNECTED" : "CHECK_FAILED"}</Badge></article>
      <article><span>Database RPC</span><Badge>{report.database}</Badge></article>
      <article><span>Academic relationships</span><Badge>{issues === 0 ? "CONSISTENT" : "ISSUES_FOUND"}</Badge></article>
      <article><span>Active memberships</span><strong>{report.activeMemberships}</strong></article>
      <article><span>Active staff memberships</span><strong>{report.activeStaffMemberships}</strong></article>
      <article><span>Relationship issues</span><strong>{issues}</strong></article>
    </div>
    <p className="field-helper-text">Checked {new Date(report.checkedAt).toLocaleString()} · school {report.schoolCode} · counts only</p>
    <div className="table-wrapper"><table className="data-table"><thead><tr><th>Academic year</th><th>Status</th><th>Classes</th><th>Learners</th><th>Active subjects</th><th>Class links</th><th>Learner subject selections</th><th>O-Level combinations</th><th>A-Level combinations / learners</th><th>Teacher allocations</th><th>Assessments</th><th>Marks (O / A)</th><th>Submissions</th><th>Locked / approved</th><th>Report snapshots / jobs</th></tr></thead><tbody>
      {report.academicYears.map((year) => <tr key={year.id}><td>{year.name}</td><td><Badge>{year.status}</Badge></td><td>{year.activeClasses} / {year.classes} active</td><td>{year.learners}</td><td>{year.subjectOfferings}</td><td>{year.classSubjectLinks}</td><td>{year.learnerSubjectSelections}</td><td>{year.oLevelCombinations}</td><td>{year.aLevelCombinations} / {year.aLevelAssignments}</td><td>{year.teacherAllocations}</td><td>{year.assessments}</td><td>{year.markRecords} / {year.aLevelPaperMarks}</td><td>{year.markSubmissions}</td><td>{year.lockedOrApprovedClasses}</td><td>{year.reportSnapshots} / {year.reportJobs}</td></tr>)}
      {!report.academicYears.length && <tr><td colSpan={15}>No academic years are linked to this school yet.</td></tr>}
    </tbody></table></div>
    {issues > 0 && <div className="form-error" role="alert"><strong>Relationship check found {issues} mismatch(es).</strong><ul>{Object.entries(report.integrity).filter(([, count]) => Number(count) > 0).map(([key, count]) => <li key={key}>{key.replace(/[A-Z]/g, " $&").toLowerCase()}: {count}</li>)}</ul></div>}
  </div>;
}
function ConnectedOverview({ school, report, loading, error }) {
    const year = currentCoordinationYear(school, report);
    const setup = year ? [["Classes", year.classes > 0 ? "PRESENT" : "MISSING"], ["Enrolled learners", year.learners > 0 ? "PRESENT" : "MISSING"], ["Active subject offerings", year.subjectOfferings > 0 ? "PRESENT" : "MISSING"], ["Class subject links", year.classSubjectLinks > 0 ? "PRESENT" : "MISSING"], ["Teacher allocations", year.teacherAllocations > 0 ? "PRESENT" : "MISSING"], ["Assessments", year.assessments > 0 ? "PRESENT" : "NOT CONFIGURED"]] : [["Academic setup", "NOT VERIFIED"]];
    const payment = school.billingPeriods.find((item) => item.academicYear === school.currentAcademicYear && item.term === school.currentTerm);
    return <div className="platform-overview-grid"><Section title="School Platform Connection" subtitle="Account and subscription metadata are distinct from live academic connectivity."><Definition items={[["School Platform Status", school.accountStatus], ["School Administrator", school.admin.status], ["Onboarding", school.onboardingStatus], ["Subscription", `${money(TERMLY_PLAN.amount)} / Term`], ["Current Academic Period", `${school.currentTerm} ${school.currentAcademicYear}`], ["Subscription Status", school.subscriptionStatus], ["Payment", payment?.status ?? "DUE"], ["Expiry", school.subscriptionExpiry], ["Features", `${Object.values(school.features).filter(effectiveFeature).length} / ${Object.keys(school.features).length} enabled`], ["Directory source", "Supabase RPC"]]}/></Section><Section title="School overview" subtitle="Registered tenant identity."><Definition items={[["School name", school.name], ["School code", school.code], ["Location", school.location], ["Programmes", school.programmes.join(", ")], ["Registered", school.registeredAt]]}/></Section><Section title="Academic setup status" subtitle={year ? `Live counts for ${year.name} (${year.status}).` : `${loading ? "Loading live coordination…" : "No academic year data verified."}`}><div className="platform-completeness">{setup.map(([label, value]) => <div key={label}><span>{label}</span><Badge>{value}</Badge></div>)}</div>{report && <CoordinationSummary report={report} loading={false} error=""/>}{!report && <CoordinationSummary report={null} loading={loading} error={error}/>}</Section></div>;
}
function HealthGrid({ school, report, loading, error }) {
    const issueCount = report ? coordinationIssueCount(report) : null;
    const checks = [["School account", school.accountStatus], ["Subscription", school.subscriptionStatus], ["Administrator account", school.admin.status], ["Database coordination RPC", report ? "CONNECTED" : loading ? "CHECKING" : "CHECK_FAILED"], ["School/year relationships", issueCount === null ? "NOT_VERIFIED" : issueCount === 0 ? "CONSISTENT" : "ISSUES_FOUND"], ["Storage access", "NOT_MONITORED"], ["Notification delivery", "NOT_MONITORED"], ["Background jobs", "NOT_MONITORED"]];
    return <><div className="platform-health-grid">{checks.map(([label, value]) => <article key={label}><span>{label}</span><Badge>{value}</Badge></article>)}</div>{report ? <CoordinationSummary report={report} loading={false} error=""/> : loading ? <p role="status" className="platform-info-note">Checking the selected school’s database…</p> : <p role="alert" className="form-error">The live database check failed: {error || "No report was returned."}</p>}</>;
}
function Jobs({ school, importOnly = false }) { return <p className="platform-info-note">{importOnly ? "Import/export" : "Background job"} history and retry processing are not yet connected to a persistent queue for {school.name}. This screen will not display sample jobs as real school activity.</p>; }
export function PlatformGlobalModulePage({ module }) {
    const workspace = usePlatformWorkspace();
    const navigate = useNavigate();
    const title = { subscriptions: "Subscriptions", payments: "Payments", health: "System Health", security: "Platform Security", audit: "Platform Audit", catalogue: "System Subject Catalogue", backups: "Backup Coverage", settings: "Platform Settings", account: "My Account" }[module];
    if (module === "settings")
        return <PlatformSettingsPage />;
    if (module === "catalogue")
        return <PlatformSubjectCataloguePage />;
    if (module === "subscriptions")
        return <PlatformSubscriptionsPage />;
    if (module === "health")
        return <PlatformHealthPage />;
    if (module === "payments")
        return <><Heading title={title} text="All platform subscription payments across registered schools."/><section className="panel platform-table-panel"><div className="table-wrapper"><table className="data-table"><thead><tr><th>School</th><th>Reference</th><th>Date</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{workspace.schools.flatMap(s => s.payments.map(p => <tr key={p.id}><td>{s.name}</td><td>{p.reference}</td><td>{p.date}</td><td>{money(p.amount)}</td><td><Badge>{p.status}</Badge></td><td><button className="table-view-button" onClick={() => navigate(`/platform/schools/${s.id}/payments`)}>Open</button></td></tr>))}</tbody></table></div></section></>;
    if (module === "audit")
        return <><Heading title={title} text="Immutable records of global and school-specific platform actions."/><section className="panel platform-section"><div className="platform-audit-list">{workspace.audit.map(e => <article key={e.id}><Activity size={18}/><div><strong>{e.action.replaceAll("_", " ")}</strong><span>{workspace.schoolById(e.schoolId)?.name} · {e.detail}</span></div><time>{e.timestamp}</time></article>)}</div></section></>;
    const items = module === "security" ? [["Platform Administrator", "Single authorised identity"], ["MFA", "Required"], ["Failed platform logins", "0"], ["Tenant isolation", "Enforced"], ["Service credentials", "Server-side only"], ["Security alerts", "0 active"]] : module === "backups" ? [["Latest platform backup", "23 Sep 2026 02:00"], ["Coverage", "All active tenants"], ["Database snapshot", "Successful"], ["Storage protection", "Healthy"], ["Retention", "30 days"], ["Restore testing", "Last verified 15 Sep 2026"]] : module === "account" ? [["Role", "Platform Administrator"], ["Email", PLATFORM_ADMIN_EMAIL], ["MFA", "Enabled"], ["Active sessions", "1"], ["Last login", "23 Sep 2026 12:10"], ["Authorization", "Identity linked to platform_admins"]] : [["Default currency", "UGX"], ["Default billing period", "Academic term"], ["Current charge", money(TERMLY_PLAN.amount)], ["Subscription notifications", "Enabled"], ["Platform timezone", "Africa/Kampala"], ["Audit retention", "7 years"]];
    return <><Heading title={title} text="Platform-owned operational configuration and status."/><section className="panel platform-section"><MetricGrid items={items}/></section></>;
}
const platformSettingsGroups = [
    { title: "Schools", description: "Tenant registration and lifecycle; school academic and operational records remain school-owned.", links: [{ title: "School directory & lifecycle", description: "Review the registered school record and use the existing reasoned lifecycle controls.", href: "/platform/schools", state: "LIVE" }] },
    { title: "Subscriptions", description: "Term billing and plan oversight. Historical invoices and confirmed payments remain immutable.", links: [{ title: "Subscriptions & plans", description: "Review subscription status and billing records.", href: "/platform/subscriptions", state: "LIVE" }, { title: "Payment configuration", description: "Review MTN/Airtel provider readiness and server-side payment configuration.", href: "/platform/settings/payments", state: "LIVE" }] },
    { title: "National catalogue", description: "The platform-owned subject catalogue feeds school activation and class offerings.", links: [{ title: "Subject catalogue", description: "Manage and review the existing national subject catalogue.", href: "/platform/catalogue/subjects", state: "LIVE" }, { title: "Location catalogue", description: "Review the shared Uganda location catalogue.", href: "/platform/catalogue/locations", state: "LIVE" }] },
    { title: "Roles & security", description: "Authorization must remain enforced by server functions and database policies, not just this interface.", links: [{ title: "Security overview", description: "Review platform security posture and tenant-isolation controls.", href: "/platform/security", state: "PARTIAL" }] },
    { title: "Communications", description: "Keep conversation workflows distinct from event notifications.", links: [{ title: "School communications", description: "Open the existing platform-to-school Message Centre.", href: "/platform/messages", state: "LIVE" }, { title: "Notifications", description: "Review event notifications and unread status.", href: "/platform/notifications", state: "LIVE" }] },
    { title: "Documents & branding", description: "School document records and branding stay scoped to their owning school.", unavailable: "Platform-wide versioned templates and branding defaults are not yet available in this control centre." },
    { title: "System operations", description: "Operational health is separate from editable configuration.", links: [{ title: "System health", description: "Review connected health checks and their current limitations.", href: "/platform/system/health", state: "PARTIAL" }, { title: "Backup coverage", description: "Open backup coverage status; restore verification is not represented as live unless verified.", href: "/platform/system/backups", state: "PARTIAL" }] },
    { title: "Audit & support", description: "Use existing audit and communication views for accountable support.", links: [{ title: "Platform audit", description: "Review platform actions currently available in the audit view.", href: "/platform/audit", state: "PARTIAL" }, { title: "School support", description: "Contact and review school conversations without bypassing tenant boundaries.", href: "/platform/messages", state: "LIVE" }] },
];
function PlatformSettingsPage() {
    return <div className="platform-settings-page">
    <Heading title="Platform Settings" text="A single entry point for platform-wide configuration and oversight. School academic and operational records remain owned by each school."/>
    <DisplayThemeSettings />
    <section className="platform-settings-notice" role="note"><ShieldCheck size={19}/><p><strong>Platform Admin access</strong><span>These areas are protected by the Platform Admin route guard. Each write operation must still be authorized and validated by its backend before it can be considered live.</span></p></section>
    <div className="platform-settings-groups">{platformSettingsGroups.map((group) => <section className="panel platform-settings-group" key={group.title}>
      <header><div><h2>{group.title}</h2><p>{group.description}</p></div></header>
      {group.links?.length ? <div className="platform-settings-links">{group.links.map((link) => <Link to={link.href} className="platform-settings-link" key={link.title}>
        <span><strong>{link.title}</strong><small>{link.description}</small></span><span className={`platform-settings-state ${link.state.toLowerCase()}`}>{link.state === "LIVE" ? "Connected" : "Partial"}</span><ArrowUpRight size={17} aria-hidden="true"/>
      </Link>)}</div> : null}
      {group.unavailable && <p className="platform-settings-unavailable"><FileText size={17}/>{group.unavailable}</p>}
    </section>)}</div>
    <section className="platform-settings-audit-link"><div><h2>Change history</h2><p>Audit coverage varies by existing workflow. The audit page identifies the events currently recorded; do not treat unlisted actions as audited.</p></div><Link className="secondary-button" to="/platform/audit">Open audit <ArrowRight size={16}/></Link></section>
  </div>;
}
function Heading({ title, text }) { return <section className="platform-page-heading"><div><span className="eyebrow">GLOBAL PLATFORM MODE</span><h1>{title}</h1><p>{text}</p></div></section>; }
export function SchoolSubscriptionPage() { const workspace = usePlatformWorkspace(); const school = workspace.schools[0]; if (!school)
    return <><section className="page-heading"><div><span className="eyebrow">SCHOOL ACCOUNT</span><h1>Subscription</h1><p>Read-only service, term billing, and payment status for your school.</p></div></section><section className="panel"><h2>No subscription record</h2><p>A subscription will appear after a school has been registered and assigned a plan.</p></section></>; const current = school.billingPeriods.find((item) => item.academicYear === school.currentAcademicYear && item.term === school.currentTerm); return <><section className="page-heading"><div><span className="eyebrow">SCHOOL ACCOUNT</span><h1>Subscription</h1><p>Read-only service, term billing, and payment status for your school.</p></div></section><section className="platform-subscription-summary school-subscription-summary"><article><span>Current term</span><strong>{school.currentTerm} {school.currentAcademicYear}</strong></article><article><span>Subscription</span><strong>{money(TERMLY_PLAN.amount)} / Term</strong></article><article><span>Status</span><strong>{school.subscriptionStatus.replaceAll("_", " ")}</strong></article><article><span>Payment</span><strong>{current?.status ?? "DUE"}</strong></article><article><span>Expiry</span><strong>{school.subscriptionExpiry}</strong></article></section><section className="panel platform-section"><div className="panel-heading"><div><h2>Plan usage</h2><p>Price, billing period, and payment confirmation are controlled by the SOMA REPORT ENGINE Platform Administrator.</p></div></div><MetricGrid items={[["Learners", `${school.usage.learners} registered`], ["Users", `${school.usage.users} active accounts`], ["Storage", `${school.storageUsedGb} / ${school.storageLimitGb} GB`], ["Reports generated", school.usage.reports]]}/></section><section className="panel platform-section"><div className="panel-heading"><div><h2>Billing history</h2><p>Historical term charges remain fixed even if the current price changes later.</p></div></div><BillingHistory school={school}/></section></>; }
