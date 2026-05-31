import Icon from "../Icon.jsx";

/** Spinner loading state. */
export function Loading({ label = "Loading…" }) {
  return <p className="loading">{label}</p>;
}

/** Shimmer skeleton block. */
export function Skeleton({ w = "100%", h = 14, style }) {
  return <div className="skeleton" style={{ width: w, height: h, ...style }} />;
}

/** Skeleton grid of KPI tiles (used while a page loads). */
export function KpiSkeleton({ count = 4 }) {
  return (
    <div className="kpi-row">
      {Array.from({ length: count }).map((_, i) => (
        <div className="kpi" key={i}>
          <Skeleton w="55%" />
          <Skeleton w="80%" h={26} style={{ marginTop: 10 }} />
        </div>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="error-banner">
      <Icon name="alert" size={16} />
      <span>Could not load data: {message} (is the API running?)</span>
    </div>
  );
}

/** Empty / no-data state. */
export function EmptyState({ icon = "doc", title = "No data", hint }) {
  return (
    <div className="empty-state">
      <span className="empty-ic"><Icon name={icon} size={26} /></span>
      <div className="empty-title">{title}</div>
      {hint && <div className="empty-hint">{hint}</div>}
    </div>
  );
}

/** Small status pill / badge. tone: accent|ok|warn|danger|muted */
export function Badge({ tone = "muted", children, icon }) {
  return (
    <span className={`pill pill-${tone}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}
