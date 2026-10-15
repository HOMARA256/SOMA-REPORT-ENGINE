import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

type Tone = "blue" | "green" | "amber" | "red" | "slate";

export function DashboardMetric({ label, value, detail, icon: Icon, to, tone = "blue", loading = false, state, stateMessage, onRetry }: { label: string; value: string | number; detail: string; icon: LucideIcon; to?: string; tone?: Tone; loading?: boolean; state?: "ready" | "loading" | "empty" | "error" | "forbidden" | "not-ready"; stateMessage?: string; onRetry?: () => void }) {
  const currentState = state ?? (loading ? "loading" : "ready");
  const content = <><span className={`dashboard-metric-icon tone-${tone}`}><Icon size={22} aria-hidden="true" /></span><span className="dashboard-metric-copy"><span>{label}</span>{currentState === "loading" ? <span className="dashboard-value-skeleton" aria-label={`Loading ${label}`} /> : currentState === "ready" ? <strong>{value}</strong> : <span className={`dashboard-metric-state dashboard-metric-state--${currentState}`} role={currentState === "error" ? "alert" : "status"}>{stateMessage ?? (currentState === "empty" ? "No records" : currentState === "forbidden" ? "Not available for this role" : currentState === "not-ready" ? "Select an academic period" : "Could not load")}{currentState === "error" && onRetry ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRetry(); }}>Retry</button> : null}</span>}<small>{currentState === "loading" ? "Loading live data…" : currentState === "ready" ? detail : currentState === "empty" ? detail : ""}</small></span></>;
  return to && currentState === "ready" ? <Link className="dashboard-metric" to={to}>{content}</Link> : <article className="dashboard-metric" aria-busy={currentState === "loading"}>{content}</article>;
}

export function DashboardPanel({ title, subtitle, action, className = "", children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return <section className={`panel dashboard-panel ${className}`.trim()}><header><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</section>;
}

export function DashboardEmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="dashboard-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

export function DashboardQuickActions({ items }: { items: Array<{ label: string; to: string; icon: LucideIcon }> }) {
  return <nav className="dashboard-quick-actions" aria-label="Quick actions">{items.map(({ label, to, icon: Icon }) => <Link key={to} to={to}><Icon size={19} aria-hidden="true"/><span>{label}</span></Link>)}</nav>;
}

export function DashboardStatistics({ classProgress, completionPercent, recordedMarks, resolvedMarks, missingMarks, subjectProgress, termName, mostAtRiskClass, awaitingModeration }: { classProgress: Array<{ name: string; progress: number }>; completionPercent: number; recordedMarks: number; resolvedMarks: number; missingMarks: number; subjectProgress: Array<{ name: string; progress: number; recorded: number; resolved: number; total: number }>; termName: string; mostAtRiskClass?: { name: string; progress: number }; awaitingModeration: number }) {
  return <>
    <section className="dashboard-analytics-grid" aria-label="Academic statistics">
    <DashboardPanel title="Marks completion by class" subtitle={`Entered, absent, or exempt components · ${termName}`}>
      {classProgress.length ? <div className="dashboard-bar-chart" role="img" aria-label={`Marks completion by class. Overall completion is ${completionPercent} percent.`}>
        {classProgress.map((item) => <div className="dashboard-bar-column" key={item.name}>
          <strong>{item.progress}%</strong>
          <span className="dashboard-bar-track"><span className="dashboard-bar-value" style={{ height: `${Math.max(item.progress, 4)}%` }} /></span>
          <small>{item.name}</small>
        </div>)}
      </div> : <DashboardEmptyState title="No class data yet" detail="Configure an O-Level class and its offerings to see completion statistics." />}
    </DashboardPanel>

    <DashboardPanel title="Assessment readiness" subtitle="A compact view of marks still needing attention">
      <div className="dashboard-readiness">
        <div className="dashboard-donut" style={{ background: `conic-gradient(var(--success) ${completionPercent}%, #e7edf5 0)` }} aria-hidden="true"><span><strong>{completionPercent}%</strong><small>complete</small></span></div>
        <dl>
          <div><dt><span className="chart-legend chart-legend-complete" />Resolved</dt><dd>{resolvedMarks}</dd></div>
          <div><dt><span className="chart-legend chart-legend-complete" />Marks entered</dt><dd>{recordedMarks}</dd></div>
          <div><dt><span className="chart-legend chart-legend-pending" />Still missing</dt><dd>{missingMarks}</dd></div>
        </dl>
      </div>
    </DashboardPanel>
    </section>

    <section className="dashboard-analytics-grid dashboard-intelligence-grid" aria-label="Academic intelligence">
      <DashboardPanel title="Subject performance" subtitle={`Lowest completion first · ${termName}`}>
        {subjectProgress.length ? <div className="subject-performance-list">{subjectProgress.slice(0, 6).map((subject) => <div className="subject-performance-row" key={subject.name}><div><strong>{subject.name}</strong><small>{subject.resolved} of {subject.total} resolved · {subject.recorded} entered</small></div><span className="subject-performance-track" aria-hidden="true"><span style={{ width: `${subject.progress}%` }} /></span><b>{subject.progress}%</b></div>)}</div> : <DashboardEmptyState title="No subject data yet" detail="Subject completion appears after active offerings and assessment components are configured." />}
        {subjectProgress.length > 6 && <Link className="text-button dashboard-chart-link" to="/results/analysis">View all subject analysis</Link>}
      </DashboardPanel>

      <DashboardPanel title="Term comparison & actions" subtitle="Prioritize what needs a school-admin decision">
        <div className="term-comparison" aria-label={`${termName} completion is ${completionPercent} percent. Prior-term comparison is unavailable until historical results are connected.`}>
          <div><span>{termName}</span><strong>{completionPercent}%</strong><small>completion</small></div>
          <div className="term-comparison-previous"><span>Previous term</span><strong>—</strong><small>Connect historic results to compare</small></div>
        </div>
        <div className="dashboard-insight-list">
          {missingMarks > 0 && <Link to="/marks/missing"><span className="insight-status insight-status-amber" />{missingMarks} marks still need entry <small>Open missing marks</small></Link>}
          {mostAtRiskClass && mostAtRiskClass.progress < 100 && <Link to="/marks/entry"><span className="insight-status insight-status-blue" />{mostAtRiskClass.name} is at {mostAtRiskClass.progress}% completion <small>Open marks entry</small></Link>}
          {awaitingModeration > 0 && <Link to="/moderation"><span className="insight-status insight-status-green" />{awaitingModeration} batch{awaitingModeration === 1 ? "" : "es"} ready for moderation <small>Review batches</small></Link>}
          {!missingMarks && (!mostAtRiskClass || mostAtRiskClass.progress === 100) && !awaitingModeration && <DashboardEmptyState title="No actions need attention" detail="Configure classes and assessment work to generate actionable academic insights." />}
        </div>
      </DashboardPanel>
    </section>
  </>;
}
