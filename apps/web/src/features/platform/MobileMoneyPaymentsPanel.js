import { AlertTriangle, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { platformSupabase, supabase } from "../../config/supabaseClient";
const activeStatuses = new Set(["DRAFT", "PENDING", "AWAITING_PAYER_APPROVAL", "PROCESSING", "RECONCILIATION_REQUIRED"]);
const money = (amount) => new Intl.NumberFormat("en-UG", { style: "currency", currency: "UGX", maximumFractionDigits: 0 }).format(amount);
const dateLabel = (value) => new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeZone: "Africa/Kampala" }).format(new Date(value));
const providerName = (provider) => provider === "MTN_MOMO_UG" ? "MTN Mobile Money Uganda" : "Airtel Money Uganda";
const statusText = (status) => status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
export function MobileMoneyProviderReadinessCards() {
    const [providers, setProviders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        if (!platformSupabase) {
            setError("Platform billing is not connected.");
            setLoading(false);
            return;
        }
        let active = true;
        void platformSupabase.functions.invoke("mobile-money-payments", { body: { action: "readiness" } }).then(({ data, error: invokeError }) => {
            if (!active)
                return;
            if (invokeError)
                setError("Secure provider readiness could not be loaded.");
            else
                setProviders((data?.providers ?? []));
            setLoading(false);
        });
        return () => { active = false; };
    }, []);
    return <section className="billing-provider-readiness"><header><h2>Mobile Money Uganda · UGX</h2><p>Live payment buttons are enabled only when every merchant and settlement control and the server credentials are verified.</p></header>{error && <div className="form-error" role="alert">{error}</div>}{loading ? <p>Checking provider readiness…</p> : providers.map((provider) => <article className="panel billing-provider-card" key={provider.provider}><div><CreditCard aria-hidden="true"/><span><strong>{providerName(provider.provider)}</strong><small>{provider.is_available ? "Production collection is ready" : "Live collections remain unavailable"}</small></span></div><dl><div><dt>Merchant onboarding</dt><dd>{statusText(provider.onboarding_status)}</dd></div>{provider.provider === "MTN_MOMO_UG" && <><div><dt>Collection number</dt><dd>{provider.collection_number_masked ?? "Not configured"}</dd></div><div><dt>Expected account holder</dt><dd>{provider.expected_account_holder ?? "Not configured"}</dd></div><div><dt>Provider-verified holder</dt><dd>{provider.provider_verified_account_holder ?? "Not verified"}</dd></div><div><dt>Provider verification</dt><dd>{statusText(provider.merchant_verification_status)}</dd></div></>}<div><dt>Mode</dt><dd>{statusText(provider.mode)}</dd></div><div><dt>Currency</dt><dd>UGX</dd></div><div><dt>Callback</dt><dd>{statusText(provider.callback_status)}</dd></div><div><dt>Reconciliation</dt><dd>{statusText(provider.reconciliation_status)}</dd></div><div><dt>Settlement</dt><dd>{statusText(provider.settlement_status)}</dd></div></dl><div className={provider.is_available ? "billing-payment-notice" : "billing-unavailable"}>{provider.is_available ? <CheckCircle2 aria-hidden="true"/> : <AlertTriangle aria-hidden="true"/>}<span>{provider.is_available ? "Live collection is enabled." : provider.provider === "MTN_MOMO_UG" && provider.mode === "SANDBOX" ? "Sandbox configured. Live payment initiation is unavailable until MTN merchant onboarding, KYC, provider verification, signed callbacks, reconciliation, settlement, and production credentials are verified." : provider.unavailable_reason ?? "Provider onboarding is not connected. Live Airtel payment initiation is unavailable until merchant onboarding, KYC, production credentials, signed callback, reconciliation, and settlement verification are completed."}</span></div></article>)}</section>;
}
export function MobileMoneyPaymentsPanel({ schoolId, schoolName, mode }) {
    const client = (mode === "platform" ? platformSupabase : supabase);
    const [invoices, setInvoices] = useState([]);
    const [subscription, setSubscription] = useState(null);
    const [attempts, setAttempts] = useState([]);
    const [providers, setProviders] = useState([]);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [viewInvoice, setViewInvoice] = useState(null);
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [payerPhone, setPayerPhone] = useState("");
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const refresh = useCallback(async (quiet = false) => {
        if (!client || !schoolId) {
            setLoading(false);
            setError("Billing is not connected for this school yet.");
            return;
        }
        if (!quiet)
            setLoading(true);
        try {
            const db = client;
            const [invoiceResult, attemptResult, subscriptionResult, readinessResult] = await Promise.all([
                db.from("subscription_invoices").select("id,invoice_number,payment_reference,plan_code,billing_cadence,academic_year,academic_term,amount_due,balance_minor,currency,status,due_at").eq("school_id", schoolId).order("issued_at", { ascending: false }).limit(30),
                db.from("platform_subscription_payment_attempts").select("id,invoice_id,provider,amount_minor,status,environment,payment_reference,payer_phone_masked,created_at,receipt_id").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(50),
                db.from("school_subscriptions").select("status,starts_on,expires_on").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(1),
                client.functions.invoke("mobile-money-payments", { body: { action: "readiness", schoolId } }),
            ]);
            if (invoiceResult.error)
                throw invoiceResult.error;
            if (attemptResult.error)
                throw attemptResult.error;
            if (subscriptionResult.error)
                throw subscriptionResult.error;
            if (readinessResult.error)
                throw new Error("Secure provider readiness could not be loaded.");
            setInvoices((invoiceResult.data ?? []));
            setSubscription(((subscriptionResult.data ?? [])[0] ?? null));
            setAttempts((attemptResult.data ?? []));
            setProviders((readinessResult.data?.providers ?? []));
            setError("");
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message : "Billing information could not be loaded.");
        }
        finally {
            setLoading(false);
        }
    }, [client, schoolId]);
    useEffect(() => { void refresh(); }, [refresh]);
    const activeByInvoice = useMemo(() => new Map(attempts.filter((attempt) => activeStatuses.has(attempt.status)).map((attempt) => [attempt.invoice_id, attempt])), [attempts]);
    const latestAttemptByInvoice = useMemo(() => new Map(attempts.map((attempt) => [attempt.invoice_id, attempt])), [attempts]);
    useEffect(() => {
        if (!client)
            return;
        const pending = attempts.filter((attempt) => activeStatuses.has(attempt.status) && attempt.environment === "LIVE");
        if (!pending.length)
            return;
        const interval = window.setInterval(async () => {
            for (const attempt of pending) {
                const { data, error: invokeError } = await client.functions.invoke("mobile-money-payments", { body: { action: "status", schoolId, attemptId: attempt.id } });
                if (!invokeError && data?.attempt?.status && data.attempt.status !== attempt.status) {
                    setNotice(data.attempt.status === "SUCCESSFUL" ? `Payment confirmed. Invoice payment is complete.` : `Payment status: ${statusText(data.attempt.status)}.`);
                    await refresh(true);
                }
            }
        }, 12000);
        return () => window.clearInterval(interval);
    }, [attempts, client, refresh, schoolId]);
    async function initiate() {
        if (busyRef.current || !client || !selectedInvoice || !selectedProvider)
            return;
        const digits = payerPhone.replace(/\D/g, "");
        const normalized = digits.startsWith("0") ? `256${digits.slice(1)}` : digits;
        if (!/^2567\d{8}$/.test(normalized)) {
            setError("Enter a valid Uganda mobile number, for example 07XXXXXXXX or +2567XXXXXXXX.");
            return;
        }
        if (!crypto?.randomUUID) {
            setError("This browser cannot create a secure request id. Update the browser and try again.");
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: invokeError } = await client.functions.invoke("mobile-money-payments", { body: { action: "initiate", schoolId, invoiceId: selectedInvoice.id, provider: selectedProvider, payerPhone: normalized, idempotencyKey: crypto.randomUUID() } });
            if (invokeError || data?.error)
                throw new Error(data?.error ?? "Payment request could not be started.");
            setNotice(`Payment request sent to ${data.attempt.maskedPhone}. Waiting for payer authorization on their phone.`);
            setSelectedInvoice(null);
            setSelectedProvider(null);
            setPayerPhone("");
            await refresh(true);
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message.replaceAll("_", " ") : "Payment could not be initiated. Check the payer number or try later.");
        }
        finally {
            busyRef.current = false;
            setBusy(false);
        }
    }
    async function sendReminder(invoice) {
        if (!client || mode !== "platform" || busyRef.current)
            return;
        busyRef.current = true;
        setBusy(true);
        setError("");
        setNotice("");
        try {
            const { data, error: invokeError } = await client.functions.invoke("mobile-money-payments", { body: { action: "reminder", schoolId, invoiceId: invoice.id } });
            if (invokeError || data?.error)
                throw new Error(data?.error ?? "Payment reminder could not be sent.");
            const count = Number(data?.reminder?.recipientCount ?? 0);
            setNotice(count ? `In-app payment reminder sent to ${count} school administrator${count === 1 ? "" : "s"}. Email reminders are not configured.` : "No new reminder was sent. There may be no active School Administrator recipient, or a reminder was already sent today.");
        }
        catch (reason) {
            setError(reason instanceof Error ? reason.message.replaceAll("_", " ") : "Payment reminder could not be sent.");
        }
        finally {
            busyRef.current = false;
            setBusy(false);
        }
    }
    const payable = (invoice) => !["PAID", "CANCELLED", "WAIVED", "REFUNDED"].includes(invoice.status) && (invoice.balance_minor ?? invoice.amount_due) > 0;
    const currentInvoice = invoices.find(payable) ?? null;
    const daysRemaining = subscription ? Math.ceil((new Date(`${subscription.expires_on.slice(0, 10)}T00:00:00Z`).getTime() - new Date().setUTCHours(0, 0, 0, 0)) / 86400000) : null;
    return <section className="panel mobile-money-panel" aria-labelledby={`billing-payments-${schoolId}`}>
    <div className="panel-heading"><div><h2 id={`billing-payments-${schoolId}`}>{mode === "platform" ? "School Billing & Payment Initiation" : "Payment options"}</h2><p>{mode === "platform" ? `Authorized platform billing for ${schoolName}. The payer must approve the prompt on their phone.` : "Payments require payer approval on the selected phone. SOMA never asks for a mobile-money PIN."}</p></div><button type="button" className="secondary-button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} aria-hidden="true"/> {loading ? "Refreshing…" : "Refresh"}</button></div>
    {error && <div className="form-error" role="alert">{error}</div>}{notice && <div className={`billing-payment-notice ${notice.startsWith("Payment confirmed") ? "is-success" : "is-pending"}`} role="status">{notice.startsWith("Payment confirmed") ? <CheckCircle2 size={18} aria-hidden="true"/> : <Clock3 size={18} aria-hidden="true"/>}{notice}</div>}
    <div className="platform-subscription-summary mobile-money-subscription-summary"><article><span>School</span><strong>{schoolName}</strong><small>{mode === "platform" ? "Platform-managed billing" : "Your school account"}</small></article><article><span>Subscription status</span><strong>{statusText(subscription?.status ?? "NOT_ASSIGNED")}</strong><small>Plan: {currentInvoice?.plan_code ?? "No current invoice"}</small></article><article><span>Start date</span><strong>{subscription ? dateLabel(subscription.starts_on) : "—"}</strong><small>Current subscription</small></article><article><span>Expiry date</span><strong>{subscription ? dateLabel(subscription.expires_on) : "—"}</strong><small>{daysRemaining === null ? "No expiry recorded" : daysRemaining < 0 ? `${Math.abs(daysRemaining)} days past expiry` : `${daysRemaining} days remaining`}</small></article><article><span>Unpaid invoice</span><strong>{currentInvoice?.invoice_number ?? "None"}</strong><small>{currentInvoice ? `${currentInvoice.academic_term} ${currentInvoice.academic_year}` : "No payment due"}</small></article><article><span>Amount due</span><strong>{currentInvoice ? money(currentInvoice.balance_minor ?? currentInvoice.amount_due) : money(0)}</strong><small>{currentInvoice ? `Due ${dateLabel(currentInvoice.due_at)}` : "UGX"}</small></article></div>
    <div className="billing-provider-readiness" aria-label="Mobile money provider availability">{providers.map((provider) => <article key={provider.provider} className="billing-provider-status"><div><CreditCard size={18} aria-hidden="true"/><strong>{providerName(provider.provider)}</strong></div><span className={provider.is_available ? "status-badge status-active" : "status-badge status-pending"}>{provider.is_available ? "LIVE · VERIFIED" : provider.mode === "SANDBOX" ? "SANDBOX · NOT FOR LIVE PAYMENTS" : "UNAVAILABLE"}</span><p>{provider.is_available ? "Production collection is ready." : provider.unavailable_reason ?? "Provider onboarding is incomplete."}</p><dl><div><dt>Merchant onboarding</dt><dd>{statusText(provider.onboarding_status)}</dd></div><div><dt>KYC / verification</dt><dd>{statusText(provider.merchant_verification_status)}</dd></div><div><dt>Callbacks</dt><dd>{statusText(provider.callback_status)}</dd></div><div><dt>Reconciliation</dt><dd>{statusText(provider.reconciliation_status)}</dd></div><div><dt>Settlement</dt><dd>{statusText(provider.settlement_status)}</dd></div><div><dt>Currency</dt><dd>UGX</dd></div></dl></article>)}{!providers.length && !loading && <p className="platform-info-note">No mobile-money providers are configured.</p>}</div>
    <div className="mobile-money-invoice-list"><h3>{mode === "platform" ? "Issued invoices" : "Open invoices"}</h3>{invoices.map((invoice) => {
            const outstanding = invoice.balance_minor ?? invoice.amount_due;
            const attempt = activeByInvoice.get(invoice.id);
            const previous = latestAttemptByInvoice.get(invoice.id);
            const canPay = payable(invoice) && !attempt;
            return <article className="mobile-money-invoice" key={invoice.id}><div className="mobile-money-invoice-main"><strong>{invoice.invoice_number}</strong><span>{invoice.plan_code} · {invoice.academic_term} {invoice.academic_year}</span><small>Due {dateLabel(invoice.due_at)} · {statusText(invoice.status)}</small></div><div className="mobile-money-invoice-amount"><strong>{money(outstanding)}</strong><small>{invoice.currency} · amount due</small></div>{attempt ? <div className="mobile-money-attempt-status" role="status"><Clock3 size={16} aria-hidden="true"/><span>Payment {statusText(attempt.status)} · {attempt.payer_phone_masked || "payer number hidden"}</span></div> : canPay ? <div className="mobile-money-actions">{providers.map((provider) => { const retry = previous?.provider === provider.provider && ["FAILED", "REJECTED", "EXPIRED", "CANCELLED"].includes(previous.status); const action = provider.provider === "MTN_MOMO_UG" ? retry ? "Retry MTN Payment" : "Initiate MTN MoMo Payment" : retry ? "Retry Airtel Payment" : "Initiate Airtel Money Payment"; return <button key={provider.provider} type="button" className={provider.provider === "MTN_MOMO_UG" ? "primary-button" : "secondary-button"} disabled={!provider.is_available} title={provider.is_available ? `Start ${providerName(provider.provider)} payment` : provider.unavailable_reason ?? "Provider unavailable"} onClick={() => { setSelectedInvoice(invoice); setSelectedProvider(provider.provider); setError(""); }} aria-label={`${action} for invoice ${invoice.invoice_number}`}>{action}</button>; })}{mode === "platform" && <><button type="button" className="table-view-button" onClick={() => setViewInvoice(invoice)}>View Invoice</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void sendReminder(invoice)}>Send Payment Reminder</button></>}</div> : <span className={`status-badge ${invoice.status === "PAID" ? "status-active" : "status-pending"}`}>{statusText(invoice.status)}</span>}</article>;
        })}{!loading && !invoices.length && <p className="table-empty-state">No subscription invoices are available for {schoolName}.</p>}{currentInvoice && mode === "platform" && <p className="platform-info-note">Payment reminders are deduplicated per invoice per day and delivered in-app to active School Administrators. External email is not claimed as sent.</p>}</div>
    {attempts.length > 0 && <div className="mobile-money-history"><h3>Payment attempts</h3><ul>{attempts.slice(0, 8).map((attempt) => <li key={attempt.id}><span>{attempt.payment_reference} · {providerName(attempt.provider)}</span><span>{money(attempt.amount_minor)} · {statusText(attempt.status)}</span></li>)}</ul></div>}
    {selectedInvoice && selectedProvider && <div className="mobile-money-dialog-backdrop"><section className="mobile-money-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-money-confirm-title" aria-describedby="mobile-money-confirm-description"><div className="mobile-money-dialog-heading"><ShieldCheck size={22} aria-hidden="true"/><div><h3 id="mobile-money-confirm-title">Confirm payment request</h3><p id="mobile-money-confirm-description">A payment prompt will be sent to the number below. Only the payer can authorize it.</p></div></div><dl className="mobile-money-summary"><div><dt>School</dt><dd>{schoolName}</dd></div><div><dt>Invoice</dt><dd>{selectedInvoice.invoice_number}</dd></div><div><dt>Subscription plan</dt><dd>{selectedInvoice.plan_code}</dd></div><div><dt>Billing period</dt><dd>{selectedInvoice.academic_term} {selectedInvoice.academic_year}</dd></div><div><dt>Amount</dt><dd>{money(selectedInvoice.balance_minor ?? selectedInvoice.amount_due)} UGX</dd></div><div><dt>Network</dt><dd>{providerName(selectedProvider)}</dd></div></dl><label className="mobile-money-phone-field">Payer mobile number<input autoFocus type="tel" inputMode="tel" autoComplete="tel" value={payerPhone} onChange={(event) => setPayerPhone(event.target.value)} placeholder="07XXXXXXXX or +2567XXXXXXXX" aria-describedby="mobile-money-phone-help"/><small id="mobile-money-phone-help">Uganda mobile number. No PIN or password is required.</small></label><p className="mobile-money-approval-note"><AlertTriangle size={17} aria-hidden="true"/>Confirm only if you are authorized to request this invoice payment. The payer approves the charge on their phone.</p>{error && <div className="form-error" role="alert">{error}</div>}<div className="platform-action-row"><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedInvoice(null); setSelectedProvider(null); }}>Cancel</button><button type="button" className="primary-button" disabled={busy || !payerPhone.trim()} onClick={() => void initiate()}>{busy ? "Sending request…" : "Confirm Payment Request"}</button></div></section></div>}
    {viewInvoice && <div className="mobile-money-dialog-backdrop"><section className="mobile-money-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-money-invoice-title"><h3 id="mobile-money-invoice-title">Invoice {viewInvoice.invoice_number}</h3><dl className="mobile-money-summary"><div><dt>School</dt><dd>{schoolName}</dd></div><div><dt>Plan</dt><dd>{viewInvoice.plan_code}</dd></div><div><dt>Billing period</dt><dd>{viewInvoice.academic_term} {viewInvoice.academic_year}</dd></div><div><dt>Invoice reference</dt><dd>{viewInvoice.payment_reference}</dd></div><div><dt>Due date</dt><dd>{dateLabel(viewInvoice.due_at)}</dd></div><div><dt>Status</dt><dd>{statusText(viewInvoice.status)}</dd></div><div><dt>Amount due</dt><dd>{money(viewInvoice.balance_minor ?? viewInvoice.amount_due)} UGX</dd></div></dl><div className="platform-action-row"><button type="button" className="primary-button" onClick={() => setViewInvoice(null)}>Close invoice</button></div></section></div>}
  </section>;
}
