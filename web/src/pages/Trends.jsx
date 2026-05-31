import { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, StatCard, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";
import { horizontalBar, lineOptions } from "../components/charts/chartOptions";

const SEVERITY_COLOR = {
  critical: "#ff5c6c",
  high: "#ffb347",
  elevated: "#4f9cff",
  watch: "#9bb0c9",
};

// Quick-pick categories for the real monthly series (matched server-side by substring).
const MONTHLY_PICKS = [
  { label: "All crime (state total)", q: "" },
  { label: "Theft", q: "theft" },
  { label: "Cheating", q: "cheating" },
  { label: "Hurt", q: "cases of hurt" },
  { label: "Murder", q: "murder" },
  { label: "Kidnapping & Abduction", q: "kidnapping" },
  { label: "Motor Vehicle Accidents (Fatal)", q: "accidents fatal" },
  { label: "Riots", q: "riots" },
];

export default function Trends() {
  const [section, setSection] = useState("IPC");
  const [monthlyPick, setMonthlyPick] = useState("");
  const alerts = useAsync(() => api.monthlyAlerts(section === "IPC" || section === "SLL" ? section : null, 20, 10), [section]);
  const fc = useAsync(() => api.forecast(section, 12), [section]);
  const monthly = useAsync(() => api.monthlyForecast(monthlyPick || null, null, 3), [monthlyPick]);
  const anomalies = useAsync(() => api.anomalies(1.5, 30), []);

  const sectionControl = (
    <div className="controls">
      <label>
        Section
        <select value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="IPC">IPC / BNS</option>
          <option value="SLL">Special Local Laws</option>
          <option value="Women">Crimes vs Women</option>
          <option value="Children">Crimes vs Children</option>
          <option value="SC/ST">Crimes vs SC/ST</option>
        </select>
      </label>
    </div>
  );

  const monthlyControl = (
    <div className="controls">
      <label>
        Category
        <select value={monthlyPick} onChange={(e) => setMonthlyPick(e.target.value)}>
          {MONTHLY_PICKS.map((p) => (
            <option key={p.label} value={p.q}>{p.label}</option>
          ))}
        </select>
      </label>
    </div>
  );

  return (
    <>
      <PageHead icon="trends" title="Trends &amp; Forecast"
        subtitle="Real month-by-month KSP data, emerging-spike alerts, anomaly detection, and transparent projections." />

      {/* KPI summary band */}
      <div className="kpi-row">
        <StatCard cls="accent" icon="trends"
          value={monthly.data?.found ? (monthly.data.trend ? monthly.data.trend[0].toUpperCase() + monthly.data.trend.slice(1) : "–") : "…"}
          label="State 12-month trend"
          hint={monthly.data?.found ? `${monthly.data.slope_per_month > 0 ? "+" : ""}${monthly.data.slope_per_month}/month` : ""} />
        <StatCard cls="warn" icon="alert"
          rawValue={alerts.data?.alerts ? alerts.data.alerts.length : 0}
          label="Emerging spike alerts" hint={`${section} · MoM ≥ 20%`} />
        <StatCard cls="danger" icon="radar"
          rawValue={anomalies.data?.summary ? anomalies.data.summary.total : 0}
          label="Behavioural anomalies" hint={anomalies.data?.summary ? `${anomalies.data.summary.critical || 0} critical` : ""} />
        <StatCard cls="ok" icon="doc"
          rawValue={monthly.data?.found ? monthly.data.history.reduce((a, p) => a + p.count, 0) : 0}
          label="12-month volume (scope)" hint={monthly.data?.found ? monthly.data.scope : ""} />
      </div>

      <Card title="Real 12-month trend & 3-month forecast (2025)" icon="trends" headRight={monthlyControl}>
        <p className="note">
          Actual month-by-month counts from the 12 KSP Monthly Crime Review files (Jan–Dec 2025),
          sourced via the Government Open Data Platform (data.gov.in). Dashed line is a transparent
          least-squares linear projection for the next 3 months — not a black-box model.
        </p>
        {monthly.loading && <Loading />}
        {monthly.error && <ErrorBanner message={monthly.error} />}
        {monthly.data && monthly.data.found && (() => {
          const hist = monthly.data.history;
          const fcst = monthly.data.forecast;
          const labels = [...hist.map((p) => p.month), ...fcst.map((p) => p.month)];
          const histData = [...hist.map((p) => p.count), ...fcst.map(() => null)];
          // connect the forecast line to the last history point
          const fcData = [
            ...hist.map((p, i) => (i === hist.length - 1 ? p.count : null)),
            ...fcst.map((p) => p.projected),
          ];
          return (
            <>
              <div className="chart-wrap tall">
                <Line
                  data={{
                    labels,
                    datasets: [
                      { label: "Actual (real KSP monthly data)", data: histData, borderColor: "#4f9cff", backgroundColor: "rgba(79,156,255,0.18)", fill: true, tension: 0.35, pointRadius: 3, spanGaps: false },
                      { label: "Forecast (linear trend)", data: fcData, borderColor: "#ff5c6c", borderDash: [6, 4], backgroundColor: "transparent", tension: 0.2, pointRadius: 3, spanGaps: true },
                    ],
                  }}
                  options={lineOptions}
                />
              </div>
              <p className="note">
                Scope: {monthly.data.scope} · trend: <b>{monthly.data.trend}</b> ({monthly.data.slope_per_month > 0 ? "+" : ""}{monthly.data.slope_per_month}/month).
              </p>
            </>
          );
        })()}
      </Card>

      <Card title="Emerging trend alerts (current month vs previous month & last year)" icon="alert" headRight={sectionControl}>
        <p className="note">
          Red-zone spike detection from the <b>real 12-month series</b>: categories whose latest
          month rises ≥20% versus the previous month (MoM). Source: KSP Monthly Crime Review (Jan–Dec 2025).
        </p>
        {alerts.loading && <Loading />}
        {alerts.error && <ErrorBanner message={alerts.error} />}
        {alerts.data && (
          !alerts.data.alerts || alerts.data.alerts.length === 0
            ? <p className="note">No categories crossed the spike threshold for this section.</p>
            : (
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="right">{alerts.data.latest_month || "Latest"}</th>
                    <th className="right">Prev</th>
                    <th className="right">MoM %</th>
                    <th>Signals</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.data.alerts.slice(0, 12).map((a, i) => (
                    <tr key={i}>
                      <td>{a.category.split("(")[0].trim()}</td>
                      <td className="right">{fmt(a.current_month)}</td>
                      <td className="right">{fmt(a.prev_month)}</td>
                      <td className="right">{a.mom_pct ?? "–"}</td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{(a.signals || []).join(", ")}</td>
                      <td>
                        <span className="band" style={{ background: `${SEVERITY_COLOR[a.severity]}22`, color: SEVERITY_COLOR[a.severity] }}>
                          {a.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        )}
      </Card>

      <Card title="Anomaly detection (behavioural deviation call-outs)" icon="radar">
        <p className="note">
          Statistical <b>anomaly detection</b> flagging incidents that deviate from standard patterns.
          Two transparent z-score methods: <b>spatial</b> (a district's total vs the state distribution)
          and <b>temporal</b> (a category's latest month vs its own 12-month baseline). Items at |z| ≥ 1.5σ
          are surfaced as behavioural anomalies for investigator follow-up.
        </p>
        {anomalies.loading && <Loading />}
        {anomalies.error && <ErrorBanner message={anomalies.error} />}
        {anomalies.data && (
          <>
            <div className="map-legend" style={{ marginTop: 4, marginBottom: 12 }}>
              <span className="pill pill-danger">{anomalies.data.summary.critical || 0} critical</span>
              <span className="pill pill-warn">{anomalies.data.summary.high || 0} high</span>
              <span className="pill pill-accent">{anomalies.data.summary.elevated || 0} elevated</span>
              <span className="pill pill-muted">{anomalies.data.summary.spatial} spatial · {anomalies.data.summary.temporal} temporal</span>
            </div>
            {(!anomalies.data.results || anomalies.data.results.length === 0)
              ? <p className="note">No deviations crossed the 1.5σ anomaly threshold.</p>
              : (
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Anomaly</th>
                      <th className="right">Observed</th>
                      <th className="right">Baseline</th>
                      <th className="right">σ (z)</th>
                      <th>Severity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.data.results.slice(0, 14).map((a, i) => (
                      <tr key={i} title={a.note}>
                        <td>
                          <span className="gsearch-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <Icon name={a.type === "spatial" ? "pin" : "clock"} size={11} />
                            {a.type}
                          </span>
                        </td>
                        <td>
                          {a.label}
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{a.context}</div>
                        </td>
                        <td className="right">{fmt(a.value)}</td>
                        <td className="right">{fmt(a.baseline_mean)}</td>
                        <td className="right" style={{ color: a.direction === "above" ? "var(--danger)" : "var(--ok)" }}>
                          {a.z_score > 0 ? "+" : ""}{a.z_score}
                        </td>
                        <td>
                          <span className="band" style={{ background: `${SEVERITY_COLOR[a.severity]}22`, color: SEVERITY_COLOR[a.severity] }}>
                            {a.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            <p className="note">{anomalies.data.method}</p>
          </>
        )}
      </Card>

      <Card title="Next-month projection (estimate)" icon="spark">
        <p className="note">
          Transparent weighted projection (0.7 recent momentum + 0.3 seasonal anchor). An honest
          estimate from available comparison points — not a black-box model.
        </p>
        {fc.loading && <Loading />}
        {fc.error && <ErrorBanner message={fc.error} />}
        {fc.data && (
          <div className="chart-wrap tall">
            <Bar
              data={{
                labels: fc.data.results.map((r) => r.category.split("(")[0].trim().slice(0, 24)),
                datasets: [
                  { label: "Current month", data: fc.data.results.map((r) => r.current_month), backgroundColor: "#4f9cff", borderRadius: 5 },
                  { label: "Projected next month", data: fc.data.results.map((r) => r.projected_next_month), backgroundColor: "#7b61ff", borderRadius: 5 },
                ],
              }}
              options={{ ...horizontalBar, plugins: { ...horizontalBar.plugins, legend: { display: true, position: "bottom", labels: { color: "#93a6c0", usePointStyle: true, padding: 14 } } } }}
            />
          </div>
        )}
      </Card>
    </>
  );
}
