const secretNames = /password|secret|token|service.role|authorization|pin/i;

export function log(level, event, details = {}) {
  const safe = Object.fromEntries(Object.entries(details).filter(([key]) => !secretNames.test(key)));
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, event, ...safe })}\n`);
}

export function productionConfig() {
  const required = ["APP_URL", "API_URL", "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET"];
  const missing = process.env.NODE_ENV === "production" ? required.filter((key) => !process.env[key]) : [];
  return { missing, ok: missing.length === 0 };
}

export async function supabaseReady() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: process.env.SUPABASE_ANON_KEY }, signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch { return false; }
}

export function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}
