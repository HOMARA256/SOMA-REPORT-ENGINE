import http from "node:http";
import { log, productionConfig, sendJson, supabaseReady } from "./runtime.mjs";

const port = Number(process.env.PORT || process.env.API_PORT || 3000);
const config = productionConfig();
if (!config.ok) { log("error", "startup_configuration_invalid", { missing: config.missing }); process.exit(1); }

const server = http.createServer(async (request, response) => {
  const path = new URL(request.url || "/", "http://localhost").pathname;
  if (request.method !== "GET") return sendJson(response, 405, { error: "method_not_allowed" });
  if (path === "/health/live") return sendJson(response, 200, { status: "alive" });
  if (path === "/health/ready" || path === "/health") {
    const database = await supabaseReady();
    const ready = config.ok && database;
    return sendJson(response, ready ? 200 : 503, { status: ready ? "ready" : "degraded", configuration: config.ok, database });
  }
  if (path === "/api/health") return sendJson(response, 200, { service: "ourschool-api", status: "ok" });
  return sendJson(response, 404, { error: "not_found" });
});
server.listen(port, "0.0.0.0", () => log("info", "application_started", { port }));
function shutdown(signal) { log("info", "application_shutdown", { signal }); server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 10000).unref(); }
process.on("SIGTERM", () => shutdown("SIGTERM")); process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => { log("error", "unhandled_server_error", { message: error.message }); shutdown("uncaughtException"); });
