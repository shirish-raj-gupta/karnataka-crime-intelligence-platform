// Barrel re-export for backwards compatibility. The real components now live
// in components/ui/. Existing imports `from "../components/Common.jsx"` keep
// working; new code can import from "../components/ui/...".
import Card from "./ui/Card.jsx";
import StatCard from "./ui/StatCard.jsx";
import PageHead from "./ui/PageHead.jsx";
import { Loading, ErrorBanner, EmptyState, Badge, Skeleton, KpiSkeleton } from "./ui/Feedback.jsx";
import Icon from "./Icon.jsx";

// Legacy Kpi (kept; StatCard is the upgraded animated version).
function Kpi({ cls, value, label, icon }) {
  return (
    <div className={`kpi ${cls}`}>
      <div className="kpi-top">
        <div className="label">{label}</div>
        {icon && <div className="kpi-ic"><Icon name={icon} size={17} /></div>}
      </div>
      <div className="value">{value}</div>
    </div>
  );
}

export { Card, StatCard, PageHead, Kpi, Loading, ErrorBanner, EmptyState, Badge, Skeleton, KpiSkeleton };
