import { FileClock, ShieldCheck } from "lucide-react";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { useSchoolSettings } from "../settings/SchoolSettingsWorkspace";
import { useImportExportWorkspace } from "../importExport/ImportExportWorkspace";
export function AuditPage() {
    const workspace = useAcademicWorkspace();
    const settings = useSchoolSettings();
    const imports = useImportExportWorkspace();
    const events = [...workspace.auditEvents, ...settings.auditEvents, ...imports.auditEvents].sort((a, b) => b.at.localeCompare(a.at));
    return <div><header className="page-heading"><div><span className="eyebrow">ADMINISTRATION</span><h1>Audit</h1><p>School-scoped configuration, report, comment, initials and publication events.</p></div></header><section className="panel audit-panel"><div className="panel-heading"><div className="panel-title-group"><span className="panel-icon"><ShieldCheck size={18}/></span><div><h2>Current review-session events</h2><p>Production events are append-only and written by the secured API.</p></div></div><span className="approval-count">{events.length}</span></div>{events.length ? <div className="audit-event-list">{events.map((event, index) => <article key={`${event.at}-${event.type}-${index}`}><FileClock size={17}/><div><strong>{event.type.replaceAll("_", " ")}</strong><span>{event.detail}</span></div><time>{new Date(event.at).toLocaleString()}</time></article>)}</div> : <div className="report-archive-empty"><FileClock size={30}/><div><h2>No review events yet</h2><p>Profile, report-comment, preview, snapshot, initials and publication actions will appear here.</p></div></div>}</section></div>;
}
