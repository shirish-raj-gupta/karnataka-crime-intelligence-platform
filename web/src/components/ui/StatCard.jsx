import { useEffect, useRef, useState } from "react";
import Icon from "../Icon.jsx";

// Animated count-up for KPI numbers (respects reduced-motion).
function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const n = Number(target);
    if (!Number.isFinite(n)) { setVal(target); return; }
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setVal(n); return; }
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(n * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return val;
}

/**
 * StatCard — KPI tile with icon, animated count-up value, label, and an
 * optional trend hint. `cls` controls the accent (accent|warn|danger|ok).
 */
export default function StatCard({ cls = "accent", value, rawValue, label, icon, hint, delay = 0 }) {
  const numeric = typeof rawValue === "number" ? rawValue : (typeof value === "number" ? value : null);
  const counted = useCountUp(numeric ?? 0);
  const display = numeric !== null
    ? Number(counted).toLocaleString("en-IN")
    : value;
  return (
    <div className={`kpi ${cls}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="kpi-top">
        <div className="label">{label}</div>
        {icon && <div className="kpi-ic"><Icon name={icon} size={18} /></div>}
      </div>
      <div className="value">{display}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
