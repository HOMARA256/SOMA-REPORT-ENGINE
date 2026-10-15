import { ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";
import { ANNUAL_PLAN, TERMLY_PLAN } from "./PlatformWorkspace";
import { MobileMoneyPaymentsPanel, MobileMoneyProviderReadinessCards } from "./MobileMoneyPaymentsPanel";
import { ContactPlatformSupportButton } from "../notifications/MessageCentreLink";
const money = (amount) => new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(amount);
const dateLabel = (value) => value ? new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(value)) : "—";
const daysUntil = (value) => { if (!value)
    return null; const today = new Date(); today.setUTCHours(0, 0, 0, 0); const end = new Date(`${value.slice(0, 10)}T00:00:00Z`); return Math.ceil((end.getTime() - today.getTime()) / 86400000); };
const label = (value) => value?.replaceAll("_", " ") ?? "—";
export function PlatformPaymentSettingsPage() {
    return <div className="production-billing-page"><header className="platform-page-heading"><div><span className="eyebrow">PLATFORM SETTINGS · PAYMENTS</span><h1>Payments & Mobile Money</h1><p>Platform-controlled merchant channels, verification, receipts, email delivery and reconciliation.</p></div></header>
    <section className="billing-security-banner"><ShieldCheck /><div><strong>No provider secret or Mobile Money PIN belongs in the browser.</strong><span>Merchant changes require Platform Administrator authorisation, re-authentication policy and audit.</span></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Authoritative subscription plans</h2><p>Invoices snapshot the active learner count and pricing version; historical financial records never change when rates change.</p></div><span className="status-badge status-active">ACTIVE</span></div><div className="platform-subscription-summary"><article><span>Annual</span><strong>{money(ANNUAL_PLAN.unitPrice)} / learner</strong><small>Minimum {money(ANNUAL_PLAN.amount)}</small></article><article><span>Termly</span><strong>{money(TERMLY_PLAN.unitPrice)} / learner</strong><small>Minimum {money(TERMLY_PLAN.amount)}</small></article><article><span>Accounts</span><strong>Unlimited</strong><small>No per-user charge</small></article><article><span>Census deadline</span><strong>21 days</strong><small>Configurable by Platform Admin</small></article></div></section>
    <MobileMoneyProviderReadinessCards />
  </div>;
}
export function ProductionSchoolSubscriptionPage() {
    const context = useSchoolContext();
    const [subscription, setSubscription] = useState(null);
    const [period, setPeriod] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async () => {
        if (!supabase || !context.schoolId) {
            setLoading(false);
            setError(context.error || "Select a school to load billing information.");
            return;
        }
        setLoading(true);
        setError("");
        try {
            const db = supabase;
            const [subResult, invoiceResult, attemptResult, receiptResult] = await Promise.all([
                db.from("school_subscriptions").select("id,status,starts_on,expires_on,grace_period_days").eq("school_id", context.schoolId).order("created_at", { ascending: false }).limit(1),
                db.from("subscription_invoices").select("id,invoice_number,payment_reference,plan_code,billing_cadence,academic_year,academic_term,amount_due,balance_minor,currency,status,issued_at,due_at,paid_at,subscription_period_id").eq("school_id", context.schoolId).order("issued_at", { ascending: false }).limit(20),
                db.from("platform_subscription_payment_attempts").select("id,invoice_id,provider,amount_minor,status,environment,payment_reference,created_at,receipt_id").eq("school_id", context.schoolId).order("created_at", { ascending: false }).limit(30),
                db.from("platform_subscription_receipts").select("id,receipt_number,invoice_id,payment_attempt_id,amount_minor,currency,status,generated_at,financial_snapshot").eq("school_id", context.schoolId).order("generated_at", { ascending: false }).limit(30),
            ]);
            if (subResult.error)
                throw subResult.error;
            if (invoiceResult.error)
                throw invoiceResult.error;
            if (attemptResult.error)
                throw attemptResult.error;
            if (receiptResult.error)
                throw receiptResult.error;
            const nextSub = (subResult.data?.[0] ?? null);
            const nextInvoices = (invoiceResult.data ?? []);
            setSubscription(nextSub);
            setInvoices(nextInvoices);
            setAttempts((attemptResult.data ?? []));
            setReceipts((receiptResult.data ?? []));
            const periodId = nextInvoices[0]?.subscription_period_id;
            if (periodId) {
                const result = await db.from("subscription_periods").select("id,starts_on,due_on,ends_on,status,subscription_id").eq("id", periodId).eq("school_id", context.schoolId).maybeSingle();
                if (result.error)
                    throw result.error;
                setPeriod((result.data ?? null));
            }
            else
                setPeriod(null);
        }
        catch (reason) {
            setError(`Billing records could not be loaded: ${reason instanceof Error ? reason.message : "Unexpected database error."}`);
        }
        finally {
            setLoading(false);
        }
    }, [context.schoolId, context.error]);
    useEffect(() => { void load(); }, [load]);
    const currentInvoice = invoices.find((invoice) => !['PAID', 'CANCELLED', 'WAIVED'].includes(invoice.status)) ?? invoices[0] ?? null;
    const remaining = currentInvoice ? (currentInvoice.balance_minor ?? currentInvoice.amount_due) : 0;
    const days = daysUntil(subscription?.expires_on);
    const totalDays = subscription ? Math.max(0, Math.ceil((new Date(`${subscription.expires_on}T00:00:00Z`).getTime() - new Date(`${subscription.starts_on}T00:00:00Z`).getTime()) / 86400000) + 1) : null;
    const usedDays = totalDays === null ? null : Math.min(totalDays, Math.max(0, totalDays - (days ?? 0)));
    return <div className="production-billing-page"><header className="page-heading"><div><span className="eyebrow">SCHOOL ACCOUNT · {context.schoolName || "TENANT BILLING"}</span><h1>Payments & Subscription</h1><p>Live school-scoped invoices, subscription periods, payment attempts, and verified receipts.</p></div><div className="session-row-actions"><ContactPlatformSupportButton category="SUBSCRIPTION_AND_BILLING"/><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> {loading ? "Refreshing…" : "Refresh"}</button></div></header>
    {error && <div className="form-error" role="alert">{error}</div>}
    <section className="platform-subscription-summary school-subscription-summary"><article><span>Current plan</span><strong>{currentInvoice?.plan_code ?? "Not assigned"}</strong><small>{currentInvoice?.billing_cadence ?? "Plan frequency on invoice"}</small></article><article><span>Subscription status</span><strong>{label(subscription?.status)}</strong><small>Period: {label(period?.status ?? currentInvoice?.status)}</small></article><article><span>Start date</span><strong>{dateLabel(subscription?.starts_on ?? period?.starts_on)}</strong><small>Current billing period</small></article><article><span>Expiry date</span><strong>{dateLabel(subscription?.expires_on ?? period?.ends_on)}</strong><small>{days === null ? "No expiry recorded" : days < 0 ? `${Math.abs(days)} days past expiry` : `${days} days remaining`}</small></article><article><span>Days used</span><strong>{usedDays === null ? "—" : usedDays}</strong><small>{totalDays === null ? "Duration unavailable" : `${totalDays} total days`}</small></article><article><span>Amount due</span><strong>{money(remaining)}</strong><small>{currentInvoice?.invoice_number ?? "No open invoice"}</small></article><article><span>Next payment due</span><strong>{dateLabel(currentInvoice?.due_at)}</strong><small>{currentInvoice?.academic_term ? `${label(currentInvoice.academic_term)} ${currentInvoice.academic_year}` : "No invoice period"}</small></article><article><span>Grace period</span><strong>{subscription?.grace_period_days ?? 0} days</strong><small>As configured by Platform Billing</small></article></section>
    {context.schoolId && <MobileMoneyPaymentsPanel schoolId={context.schoolId} schoolName={context.schoolName || "Selected school"} mode="school"/>}
    <section className="panel"><div className="panel-heading"><div><h2>Invoices</h2><p>Authoritative invoices shared with the Platform Control Centre. Amounts shown in UGX.</p></div><Link className="table-view-button" to="/subscription/receipts">View receipts</Link></div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Invoice</th><th>Academic period</th><th>Issued</th><th>Due</th><th>Amount</th><th>Balance</th><th>Status</th></tr></thead><tbody>{invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.invoice_number}</td><td>{label(invoice.academic_term)} {invoice.academic_year}</td><td>{dateLabel(invoice.issued_at)}</td><td>{dateLabel(invoice.due_at)}</td><td>{money(invoice.amount_due)}</td><td>{money(invoice.balance_minor ?? invoice.amount_due)}</td><td><span className={`status-badge ${invoice.status === "PAID" ? "status-active" : "status-pending"}`}>{label(invoice.status)}</span></td></tr>)}{!loading && !invoices.length && <tr><td colSpan={7} className="table-empty-state">No invoices have been issued for this school.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Payment history</h2><p>Only provider-confirmed results are treated as successful; sandbox records are marked and are not real-money transactions.</p></div></div><div className="table-wrapper"><table className="data-table"><thead><tr><th>Date</th><th>Provider</th><th>Reference</th><th>Amount</th><th>Environment</th><th>Status</th></tr></thead><tbody>{attempts.map((attempt) => <tr key={attempt.id}><td>{dateLabel(attempt.created_at)}</td><td>{label(attempt.provider)}</td><td>{attempt.payment_reference}</td><td>{money(attempt.amount_minor)}</td><td>{attempt.environment}</td><td>{label(attempt.status)}</td></tr>)}{!loading && !attempts.length && <tr><td colSpan={6} className="table-empty-state">No payment attempts recorded.</td></tr>}</tbody></table></div></section>
    <section className="panel"><div className="panel-heading"><div><h2>Verified receipts</h2><p>Receipts are created from verified payment results only.</p></div><Link className="table-view-button" to="/subscription/receipts">All receipts</Link></div>{receipts.length ? <p>{receipts.length} verified receipt{receipts.length === 1 ? "" : "s"} available. <Link to="/subscription/receipts">Open receipt register</Link></p> : <div className="table-empty-state"><ReceiptText /><p>No verified receipt is available for this school.</p></div>}</section>
  </div>;
}
export function SchoolReceiptsPage() {
    const context = useSchoolContext();
    const [receipts, setReceipts] = useState([]);
    const [attempts, setAttempts] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const load = useCallback(async () => { if (!supabase || !context.schoolId) {
        setLoading(false);
        setError(context.error || "Select a school to load receipts.");
        return;
    } setLoading(true); setError(""); try {
        const db = supabase;
        const [r, a, i] = await Promise.all([db.from("platform_subscription_receipts").select("id,receipt_number,invoice_id,payment_attempt_id,amount_minor,currency,status,generated_at,financial_snapshot").eq("school_id", context.schoolId).order("generated_at", { ascending: false }), db.from("platform_subscription_payment_attempts").select("id,invoice_id,provider,amount_minor,status,environment,payment_reference,created_at,receipt_id").eq("school_id", context.schoolId), db.from("subscription_invoices").select("id,academic_term,academic_year").eq("school_id", context.schoolId)]);
        if (r.error)
            throw r.error;
        if (a.error)
            throw a.error;
        if (i.error)
            throw i.error;
        setReceipts((r.data ?? []));
        setAttempts((a.data ?? []));
        setInvoices((i.data ?? []));
    }
    catch (reason) {
        setError(`Receipts could not be loaded: ${reason instanceof Error ? reason.message : "Unexpected database error."}`);
    }
    finally {
        setLoading(false);
    } }, [context.schoolId, context.error]);
    useEffect(() => { void load(); }, [load]);
    const invoiceById = useMemo(() => new Map(invoices.map((invoice) => [invoice.id, invoice])), [invoices]);
    const attemptById = useMemo(() => new Map(attempts.map((attempt) => [attempt.id, attempt])), [attempts]);
    return <div className="production-billing-page"><header className="page-heading"><div><span className="eyebrow">SUBSCRIPTION & BILLING · {context.schoolName || "SCHOOL"}</span><h1>Receipts</h1><p>Authenticated, tenant-scoped receipt records from verified payment results.</p></div><div className="platform-action-row"><button type="button" className="secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button><Link className="secondary-button" to="/subscription">Back to billing</Link></div></header>{error && <div className="form-error" role="alert">{error}</div>}<section className="panel"><div className="table-wrapper"><table className="data-table"><thead><tr><th>Receipt number</th><th>Date</th><th>Academic term</th><th>Provider</th><th>Amount</th><th>Status</th><th>Environment</th></tr></thead><tbody>{receipts.map((receipt) => { const payment = attemptById.get(receipt.payment_attempt_id); const invoice = invoiceById.get(receipt.invoice_id); return <tr key={receipt.id}><td>{receipt.receipt_number}</td><td>{dateLabel(receipt.generated_at)}</td><td>{invoice ? `${label(invoice.academic_term)} ${invoice.academic_year}` : "—"}</td><td>{label(payment?.provider ?? String(receipt.financial_snapshot.provider ?? "—"))}</td><td>{money(receipt.amount_minor)}</td><td>{label(receipt.status)}</td><td>{String(receipt.financial_snapshot.environment ?? payment?.environment ?? "LIVE")}</td></tr>; })}{!loading && !receipts.length && <tr><td colSpan={7} className="table-empty-state">No verified receipts are available for this school.</td></tr>}</tbody></table></div></section></div>;
}
