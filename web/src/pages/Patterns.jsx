import { useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead, EmptyState } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import Icon from "../components/Icon.jsx";

export default function Patterns() {
  const [law, setLaw] = useState("IPC");
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [monthly, setMonthly] = useState(null); // real 12-month series for the drilled category

  const cats = useAsync(() => api.categories(law, 12), [law]);

  async function drill(query) {
    if (!query) return;
    setDetail("loading");
    setDetailErr(null);
    setMonthly(null);
    try {
      const d = await api.categoryDetail(query);
      setDetail(d);
      // Fetch the real 12-month series for this category in parallel (best-effort).
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

  return (
    <>
      <PageHead icon="patterns" title="Crime Patterns &amp; Categories"
        subtitle="Crime-head breakdown with click-through sub-type drill-down and real monthly trends." />
      <Card title="Crime categories" icon="patterns" headRight={lawControl}>
        {cats.loading && <Loading />}
        {cats.error && <ErrorBanner message={cats.error} />}
        {cats.data && (
          <div className="chart-wrap tall">
            <Bar
              data={{
                labels: cats.data.results.map((r) => r.category.split("(")[0].trim().slice(0, 28)),
                datasets: [{ label: `${law} crimes`, data: cats.data.results.map((r) => r.count), backgroundColor: "#7b61ff" }],
              }}
              options={{
                responsive: true, maintainAspectRatio: false, indexAxis: "y",
                plugins: { legend: { display: false } },
                onClick: (evt, items) => { if (items.length) drill(cats.data.results[items[0].index].category); },
              }}
            />
          </div>
        )}
      </Card>

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
          <button className="btn" onClick={() => drill(search)}><Icon name="search" size={14} />Drill down</button>
        </div>

        {detail === "loading" && <Loading />}
        {detailErr && <ErrorBanner message={detailErr} />}
        {detail && detail !== "loading" && !detail.found && (
          <p className="note">No category matched "{search}".</p>
        )}
        {detail && detail !== "loading" && detail.found && (
          <>
            <h3>{detail.category} — total {fmt(detail.total)}</h3>

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
              <thead><tr><th>Sub-type</th><th className="right">Count</th></tr></thead>
              <tbody>
                {detail.subtypes.slice(0, 15).map((s, i) => (
                  <tr key={i}><td>{s.subtype}</td><td className="right">{fmt(s.count)}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </>
  );
}
