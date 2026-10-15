import { useCallback, useEffect, useState } from "react";
import { Activity, CircleHelp, MailCheck, RefreshCw, Server } from "lucide-react";
import { platformSupabase } from "../../config/supabaseClient";

type DeliveryCounts = { total: number; sent: number; failed: number; pending: number; lastEventAt: string | null };
type WorkerHeartbeat = { workerName: string; startedAt: string; heartbeatAt: string; lastSweepAt: string | null; failureCount: number; capability: "HEARTBEAT_ONLY" | "PROCESSING" | "HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES" };
type OperationalStatus = { observedAt: string; deliveryWindowHours: number; notificationDeliveries: DeliveryCounts; teacherPasswordRecoveries: DeliveryCounts; worker: WorkerHeartbeat | null };

function timestamp(value: string | null | undefined) {
  if (!value) return "No recorded event";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : new Intl.DateTimeFormat("en-UG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function DeliveryRow({ title, detail, counts }: { title: string; detail: string; counts: DeliveryCounts }) {
  const status = counts.failed > 0 ? "degraded" : counts.total > 0 ? "observed" : "unknown";
  const label = counts.failed > 0 ? "Failures recorded" : counts.total > 0 ? "Records available" : "No records";
  return <article className="platform-health-row">
    <span className="platform-health-icon"><MailCheck size={19} aria-hidden="true" /></span>
    <div className="platform-health-copy"><strong>{title}</strong><p>{detail}</p><p className="platform-ops-counts">Past 24 hours: {counts.total} recorded · {counts.sent} sent to provider · {counts.failed} failed · {counts.pending} pending. Latest: {timestamp(counts.lastEventAt)}.</p></div>
    <span className={`platform-health-state platform-health-state-${status}`}>{label}</span>
  </article>;
}

export function PlatformOperationalStatusPanel() {
  const [status, setStatus] = useState<OperationalStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    if (!platformSupabase) { setStatus(null); setError("Supabase is not configured for this deployment."); setLoading(false); return; }
    const { data, error: requestError } = await (platformSupabase as any).rpc("get_platform_operational_status");
    if (requestError || !data?.observedAt) {
      setStatus(null);
      setError("Operational monitoring is unavailable. Apply the platform operational observability migration, then retry. No delivery or worker health is being assumed.");
    } else setStatus(data as OperationalStatus);
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const worker = status?.worker;
  const heartbeatAge = worker && status ? new Date(status.observedAt).getTime() - new Date(worker.heartbeatAt).getTime() : Number.NaN;
  const workerRecent = Number.isFinite(heartbeatAge) && heartbeatAge >= 0 && heartbeatAge <= 180_000;
  const workerState = !worker ? "unknown" : workerRecent ? "observed" : "degraded";
  const workerLabel = !worker ? "No heartbeat" : workerRecent ? "Heartbeat observed" : "Heartbeat stale";

  return <section className="panel platform-ops-panel" aria-label="Operational monitoring">
    <div className="panel-heading platform-ops-heading"><div><h2>Delivery and worker evidence</h2><p>Read-only records from the last 24 hours. A provider-accepted send is not proof that a message reached an inbox.</p></div><button className="secondary-button" type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={17} aria-hidden="true" />{loading ? "Checking…" : "Refresh evidence"}</button></div>
    {error && <p className="platform-ops-warning" role="alert"><CircleHelp size={18} aria-hidden="true" />{error}</p>}
    {!status && !error && <p className="platform-health-loading" role="status">Checking delivery and worker records…</p>}
    {status && <div className="platform-health-list">
      <DeliveryRow title="Notification delivery ledger" detail="Platform and school notifications recorded in the delivery ledger." counts={status.notificationDeliveries} />
      <DeliveryRow title="Teacher password-reset email" detail="School-initiated recovery attempts recorded by the server." counts={status.teacherPasswordRecoveries} />
      <article className="platform-health-row"><span className="platform-health-icon"><Server size={19} aria-hidden="true" /></span><div className="platform-health-copy"><strong>API worker process</strong><p>{worker ? `Last heartbeat: ${timestamp(worker.heartbeatAt)}. Process failures recorded: ${worker.failureCount}.` : "No worker heartbeat has been recorded."}</p><p className="platform-ops-counts">{worker?.capability === "HEARTBEAT_ONLY" ? "Heartbeat only: this worker does not yet execute the listed background jobs." : worker?.capability === "HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES" ? "School staff message notification retries are enabled; other listed background jobs are not verified by this heartbeat." : worker ? "A heartbeat does not verify individual job results." : "Job execution and queue processing cannot be inferred."}</p></div><span className={`platform-health-state platform-health-state-${workerState}`}><Activity size={15} aria-hidden="true" />{workerLabel}</span></article>
    </div>}
    <p className="platform-ops-caveat"><CircleHelp size={18} aria-hidden="true" />Not covered here: Supabase Auth self-service email, teacher activation emails, SMS provider delivery, individual job execution, and backup/restore results. These remain unverified until instrumented separately.</p>
    {status && <p className="platform-health-timestamp">Database snapshot: {timestamp(status.observedAt)}.</p>}
  </section>;
}
