import http from "node:http";
import { log, productionConfig, sendJson, supabaseReady } from "./runtime.mjs";

const plannedJobs = ["subscription_invoice_generation", "payment_status_checks", "payment_reconciliation", "notification_delivery", "email_delivery_retries", "sms_delivery_retries", "invitation_expiry", "password_reset_expiry", "report_generation", "data_export_processing", "backup_checks", "audit_retention_cleanup"];
const state = { startedAt: new Date().toISOString(), lastSweepAt: null, lastHeartbeatAt: null, failures: 0, capability: "HEARTBEAT_AND_SCHOOL_MESSAGE_NOTICES", lastMessageNoticeDelivery: null };
const config = productionConfig();
if (!config.ok) { log("error", "worker_configuration_invalid", { missing: config.missing }); process.exit(1); }

async function publishHeartbeat() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const heartbeatAt = new Date().toISOString();
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/platform_worker_heartbeats?on_conflict=worker_name`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ worker_name: "api-worker", started_at: state.startedAt, heartbeat_at: heartbeatAt, last_sweep_at: state.lastSweepAt, failure_count: state.failures, capability: state.capability }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error(`Heartbeat write returned HTTP ${response.status}`);
  state.lastHeartbeatAt = heartbeatAt;
}

async function sweep() {
  state.lastSweepAt = new Date().toISOString();
  await publishHeartbeat();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("School message notification delivery requires Supabase service credentials");
  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/deliver_school_teacher_message_notices`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_limit: 100 }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`School message notification delivery returned HTTP ${response.status}`);
  const result = await response.json();
  state.lastMessageNoticeDelivery = new Date().toISOString();
  log("info", "worker_sweep", { capability: state.capability, plannedJobCount: plannedJobs.length, executedJobs: ["school_teacher_message_notifications"], result });
}
await sweep().catch((error) => { state.failures += 1; log("error", "worker_heartbeat_failed", { message: error.message }); });
const timer = setInterval(() => void sweep().catch((error) => { state.failures += 1; log("error", "critical_background_job_failure", { message: error.message }); }), 60000);
const healthPort = Number(process.env.WORKER_HEALTH_PORT || 3001);
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (path === "/health/live") return sendJson(response, 200, { status: "alive", ...state });
  if (path === "/health/ready") { const database = await supabaseReady(); const heartbeatPublished = Boolean(state.lastHeartbeatAt && Date.now() - new Date(state.lastHeartbeatAt).getTime() <= 180000); const ready = database && heartbeatPublished; return sendJson(response, ready ? 200 : 503, { status: ready ? "ready" : "degraded", database, heartbeatPublished, ...state }); }
  return sendJson(response, 404, { error: "not_found" });
});
server.listen(healthPort, "0.0.0.0", () => log("info", "worker_started", { healthPort, plannedJobs: plannedJobs.length, capability: state.capability }));
function shutdown() { clearInterval(timer); server.close(() => process.exit(0)); }
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
