export function StatCard({ label, value, detail, icon: Icon, status = "default", }) {
    return (<article className={`stat-card stat-${status}`}>
      <div className="stat-card-header">
        <span className="stat-label">{label}</span>

        <span className={`stat-icon stat-icon-${status}`} aria-hidden="true">
          <Icon size={20} strokeWidth={1.8}/>
        </span>
      </div>

      <strong className="stat-value">{value}</strong>

      <span className="stat-detail">{detail}</span>
    </article>);
}
