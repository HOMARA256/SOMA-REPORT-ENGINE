import { Archive, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { getLearnerFullName } from "../learners/LearnerData";
export function ReportArchivePage() {
    const workspace = useAcademicWorkspace();
    const records = workspace.reportPublications.flatMap((publication) => {
        const snapshot = workspace.reportSnapshots.find((item) => item.id === publication.snapshotId);
        return snapshot ? [{ snapshot, publication }] : [];
    }).sort((a, b) => b.publication.publishedAt.localeCompare(a.publication.publishedAt));
    return <>
    <header className="page-heading"><div><span className="eyebrow">RESULTS &amp; REPORTING</span><h1>Report Archive</h1><p>Review report versions simulated in this review session.</p></div><Link className="secondary-button" to="/reports/cards"><FileText size={17} aria-hidden="true"/> Open report cards</Link></header>
    <p className="class-workspace-note">These records exist only in the current browser session. They are not durable, server-audited, verified or official published reports. A real archive must read immutable Supabase snapshots.</p>
    <section className="panel report-archive-panel"><div className="panel-heading"><div><h2>Review publication history</h2><p>Each entry points to the captured report version, not recalculated live marks.</p></div><span className="approval-count">{records.length} report{records.length === 1 ? "" : "s"}</span></div>{records.length ? <div className="table-wrapper"><table className="data-table report-archive-table"><thead><tr><th>Learner</th><th>Programme / Class</th><th>Context</th><th>Version</th><th>Review published</th><th>Action</th></tr></thead><tbody>{records.map(({ snapshot, publication }) => <tr key={snapshot.id}><td><strong>{getLearnerFullName(snapshot.learner)}</strong><small>{snapshot.learner.admissionNumber || snapshot.learner.id}</small></td><td>O-Level · {snapshot.className}</td><td>{snapshot.termName} {snapshot.yearName}</td><td>v{snapshot.version}</td><td>{new Date(publication.publishedAt).toLocaleString()}</td><td><Link className="table-view-button" to={`/reports/cards?class=${encodeURIComponent(snapshot.className)}&learner=${encodeURIComponent(snapshot.learner.id)}`}>View review copy</Link></td></tr>)}</tbody></table></div> : <div className="report-archive-empty"><Archive size={33} aria-hidden="true"/><div><h2>No review reports published</h2><p>Moderate and approve results, complete narratives, prepare a snapshot, then simulate publication from Report Cards.</p></div></div>}</section>
  </>;
}
