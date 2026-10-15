import { AlertTriangle, FileClock, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

type AuditEvent = { id: string; type: string; detail: string; actor: string; at: string; source: string };
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
function readableDetail(value: unknown) {
  if (typeof value === "string") return value;
  const data = record(value);
  const summary = data.summary ?? data.reason ?? data.note ?? data.detail ?? data.name;
  if (typeof summary === "string" && summary.trim()) return summary;
  const compact = Object.entries(data).filter(([key]) => !/(school_id|token|secret|password)/i.test(key)).slice(0, 5);
  return compact.length ? compact.map(([key, item]) => `${key.replaceAll("_", " ")}: ${typeof item === "string" || typeof item === "number" ? item : JSON.stringify(item)}`).join(" · ") : "No additional details recorded.";
}
function message(error: unknown) { return error instanceof Error ? error.message : "The audit history could not be loaded."; }

export function AuditPage() {
  const school = useSchoolContext();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (school.loading) return;
    if (school.error) { setEvents([]); setError(school.error); setLoading(false); return; }
    if (!school.schoolId) { setEvents([]); setError("Select an active school to view its audit history."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const client = supabase as any;
      if (!client) throw new Error("Supabase is not configured.");
      const [reports, imports, approvals] = await Promise.all([
        client.from("report_audit_events").select("id,actor_user_id,event_type,event_data,created_at,learner_id,report_snapshot_id").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(250),
        client.from("import_export_audit_events").select("id,actor_user_id,actor_role,event_type,context_json,affected_record_count,result_status,created_at").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(250),
        client.from("approval_audit_events").select("id,actor_user_id,actor_role,action,note,from_status,to_status,metadata,created_at").eq("school_id", school.schoolId).order("created_at", { ascending: false }).limit(250),
      ]);
      const failed = [reports, imports, approvals].find((result) => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      const reportEvents: AuditEvent[] = (reports.data ?? []).map((item: any) => ({
        id: `report:${item.id}`, type: item.event_type, detail: readableDetail(item.event_data), actor: item.actor_user_id ?? "System", at: item.created_at, source: "Reports",
      }));
      const importEvents: AuditEvent[] = (imports.data ?? []).map((item: any) => ({
        id: `import:${item.id}`, type: item.event_type, detail: `${readableDetail(item.context_json)} · ${item.affected_record_count} record(s) · ${item.result_status.replaceAll("_", " ")}`, actor: `${item.actor_role} · ${item.actor_user_id}`, at: item.created_at, source: "Imports & exports",
      }));
      const approvalEvents: AuditEvent[] = (approvals.data ?? []).map((item: any) => ({
        id: `approval:${item.id}`, type: item.action, detail: [item.note, item.from_status && `From ${item.from_status.replaceAll("_", " ")}`, item.to_status && `To ${item.to_status.replaceAll("_", " ")}`, Object.keys(record(item.metadata)).length ? readableDetail(item.metadata) : ""].filter(Boolean).join(" · "), actor: `${item.actor_role} · ${item.actor_user_id}`, at: item.created_at, source: "Approvals",
      }));
      setEvents([...reportEvents, ...importEvents, ...approvalEvents].sort((a, b) => b.at.localeCompare(a.at)));
    } catch (loadError) {
      setEvents([]); setError(`Audit history could not be loaded: ${message(loadError)}`);
    } finally { setLoading(false); }
  }, [school.loading, school.error, school.schoolId]);

  useEffect(() => { void load(); }, [load]);

  return <div><header className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Audit</h1><p>Persistent, school-scoped report, import/export and approval events for {school.schoolName || "the selected school"}.</p></div><button type="button" className="secondary-button" disabled={loading || school.loading} onClick={() => void load()}><RefreshCw size={16} aria-hidden="true" className={loading ? "spin" : undefined} /> Refresh audit history</button></header>
    <section className="panel audit-panel"><div className="panel-heading"><div className="panel-title-group"><span className="panel-icon"><ShieldCheck size={18} aria-hidden="true" /></span><div><h2>Persisted audit events</h2><p>Events are read from the selected school’s protected audit records. The history is read-only.</p></div></div><span className="approval-count">{loading ? "…" : events.length}</span></div>
      {error ? <div className="report-archive-empty" role="alert"><AlertTriangle size={28} /><div><h2>Audit history unavailable</h2><p>{error}</p><button type="button" className="secondary-button" disabled={loading} onClick={() => void load()}>Try again</button></div></div>
        : loading ? <div className="report-archive-empty" role="status"><RefreshCw size={25} className="spin" /><div><h2>Loading audit history</h2><p>Fetching persisted events for the selected school.</p></div></div>
          : events.length ? <div className="audit-event-list">{events.map((event) => <article key={event.id}><FileClock size={17} aria-hidden="true" /><div><strong>{event.type.replaceAll("_", " ")}</strong><span>{event.detail}</span><small>{event.source} · {event.actor}</small></div><time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time></article>)}</div>
            : <div className="report-archive-empty"><FileClock size={30} aria-hidden="true" /><div><h2>No persisted events for this school yet</h2><p>Report publication or review, import/export, and approval actions will appear here when recorded. Temporary browser review events are not presented as permanent audit history.</p></div></div>}
    </section></div>;
}
