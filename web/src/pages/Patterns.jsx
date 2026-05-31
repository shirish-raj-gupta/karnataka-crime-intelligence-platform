import { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { api, fmt, PALETTE } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import Icon from "../components/Icon.jsx";
import { horizontalBar, noLegend } from "../components/charts/chartOptions";

export default function Patterns() {
  const [law, setLaw] = useState("IPC");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [monthly, setMonthly] = useState(null); // real 12-month series for the drilled category

  const cats = useAsync(() => api.categories(law, 12), [law]);
  const firGroups = useAsync(() => api.firGroups(15), []);

  async function drill(query) {
    if (!query) return;
    setDetail("loading");
    setDetailErr(null);
    setMonthly(null);
    try {
      const d = await api.categoryDetail(query);
      setDetail(d);
      if (d && d.found) {
        api.monthlySeries(query).then((m) => { if (m && m.found) setMonthly(m); }).catch(() => {});
      }
    } catch (e) {
      setDetail(null);
      setDetailErr(e.message);
    }
  }

  const lawControl = (
    <Segmented
      label="Law"
      value={law}
      onChange={setLaw}
      options={[{ value: "IPC", label: "IPC / BNS" }, { value: "SLL", label: "Special Local Laws" }]}
    />
  );

  const groups = firGroups.data?.results || [];
  const groupGrand = firGroups.data?.grand_total || 0;
  const topGroups = groups.slice(0, 6);

  return (
    <>
      <PageHead icon="patterns" title="Crime Patterns &amp; Categories"
        subtitle="Aggregate crime-head breakdown plus real FIR crime-group frequency, with click-through drill-down." />

      {/* Real FIR crime-group highlight band */}
      <div className="section-label"><Icon name="activity" size={13} /> Real crime-group frequency · {fmt(groupGrand)} FIRs (2016–2024)</div>
      <div className="kpi-row">
        {topGroups.map((g, i) => (
          <div className={`kpi ${["accent", "warn", "danger", "ok", "accent", "warn"][i]}`} key={g.crime_group}>
            <div className="kpi-top">
              <div className="label" style={{ minHeight: 30 }}>{g.crime_group.length > 30 ? g.crime_group.slice(0, 28) + "…" : g.crime_group}</div>
            </div>
            <div className="value" style={{ fontSize: 22 }}>{fmt(g.count)}</div>
            <div className="kpi-hint">{g.share_pct}% of all FIRs</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <Card title="Crime categories (KSP review)" icon="patterns" headRight={lawControl}>
          <p className="note">Aggregate {law} crime-head totals. Click a bar to drill into sub-types &amp; the real monthly trend.</p>
          {cats.loading && <Loading />}
          {cats.error && <ErrorBanner message={cats.error} />}
          {cats.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: cats.data.results.map((r) => r.category.split("(")[0].trim().slice(0, 28)),
                  datasets: [{ label: `${law} crimes`, data: cats.data.results.map((r) => r.count), backgroundColor: "#7b61ff", borderRadius: 5 }],
                }}
                options={{
                  ...horizontalBar,
                  onClick: (evt, items) => { if (items.length) drill(cats.data.results[items[0].index].category); },
                }}
              />
            </div>
          )}
        </Card>

        <Card title="Crime-group distribution (real FIRs)" icon="activity">
          <p className="note">Actual frequency of crime groups across real incident records.</p>
          {firGroups.loading && <Loading />}
          {firGroups.error && <ErrorBanner message={firGroups.error} />}
          {firGroups.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: groups.map((g) => g.crime_group.length > 24 ? g.crime_group.slice(0, 22) + "…" : g.crime_group),
                  datasets: [{ label: "FIRs", data: groups.map((g) => g.count), backgroundColor: groups.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 5 }],
                }}
                options={horizontalBar}
              />
            </div>
          )}
        </Card>
      </div>

      <Card title="Sub-type drill-down" icon="search">
        <p className="note">Click a category bar above, or search a crime head.</p>
        <div className="controls" style={{ marginTop: 10 }}>
          <input
            type="text"
            placeholder="e.g. murder, theft, rape…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") drill(search); }}
          />
          <button className="btn btn-primary" onClick={() => drill(search)}><Icon name="search" size={14} />Drill down</button>
        </div>

        {detail === "loading" && <Loading />}
        {detailErr && <ErrorBanner message={detailErr} />}
        {detail && detail !== "loading" && !detail.found && (
          <p className="note">No category matched "{search}".</p>
        )}
        {detail && detail !== "loading" && detail.found && (
          <>
            <h3 style={{ marginTop: 16 }}>{detail.category} — total {fmt(detail.total)}</h3>

            {monthly && monthly.found && (
              <div style={{ margin: "10px 0 18px" }}>
                <p className="note" style={{ marginTop: 0 }}>
                  <Icon name="trends" size={13} /> Real month-by-month trend (2025) · peak {monthly.peak_month}
                </p>
                <div className="chart-wrap" style={{ height: 220 }}>
                  <Line
                    data={{
                      labels: monthly.series.map((p) => p.month),
                      datasets: [{
                        label: "Monthly count",
                        data: monthly.series.map((p) => p.count),
                        borderColor: "#3ddc97",
                        backgroundColor: "rgba(61,220,151,0.15)",
                        fill: true, tension: 0.35, pointRadius: 3,
                      }],
                    }}
                    options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                  />
                </div>
              </div>
            )}

            <table>
              <thead><tr><th>Sub-type</th><th className="right">Count</th><th className="right">Share</th></tr></thead>
              <tbody>
                {detail.subtypes.slice(0, 15).map((s, i) => {
                  const share = detail.total ? ((s.count / detail.total) * 100).toFixed(1) : "0";
                  return (
                    <tr key={i}>
                      <td>{s.subtype}</td>
                      <td className="right">{fmt(s.count)}</td>
                      <td className="right" style={{ width: 120 }}>
                        <div className="hot-track" style={{ display: "inline-block", width: 70, verticalAlign: "middle", marginRight: 8 }}>
                          <span style={{ width: `${Math.min(100, share)}%`, background: "#7b61ff" }} />
                        </div>
                        {share}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}
