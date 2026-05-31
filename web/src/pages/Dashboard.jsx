import { Bar, Doughnut, Line } from "react-chartjs-2";
import { api, fmt, PALETTE } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, StatCard, Loading, ErrorBanner, PageHead, KpiSkeleton } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";
import { noLegend, horizontalBar, doughnutOptions, lineOptions } from "../components/charts/chartOptions";

async function downloadBriefing() {
  try {
    const blob = await api.intelligencePdf();
    const isPdf = blob && blob.type === "application/pdf";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isPdf ? "karnataka-crime-intelligence-briefing.pdf" : "briefing.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert("Could not generate the briefing: " + e.message);
  }
}

export default function Dashboard() {
  const ov = useAsync(() => api.overview(), []);
  const rank = useAsync(() => api.rank("total", "desc", 100), []);
  const monthly = useAsync(() => api.monthlySeries(), []);

  if (ov.loading || rank.loading) {
    return (
      <>
        <PageHead icon="dashboard" title="State Crime Dashboard"
          subtitle="Karnataka 2025 headline figures from the KSP Monthly Crime Review." />
        <KpiSkeleton count={4} />
        <Loading />
      </>
    );
  }
  if (ov.error) return <ErrorBanner message={ov.error} />;
  if (rank.error) return <ErrorBanner message={rank.error} />;

  const t = ov.data.state_totals;
  const top10 = rank.data.results.slice(0, 10);

  // Aggregate totals by police range for the distribution chart.
  const byRange = {};
  rank.data.results.forEach((r) => { byRange[r.range_name] = (byRange[r.range_name] || 0) + r.total; });
  const rangeLabels = Object.keys(byRange);

  return (
    <>
      <PageHead icon="dashboard" title="State Crime Dashboard"
        subtitle="Karnataka 2025 headline figures from the KSP Monthly Crime Review." />
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={downloadBriefing} title="Generate a PDF intelligence briefing (SmartBrowz)">
          <Icon name="download" size={15} />
          Download Intelligence Briefing (PDF)
        </button>
      </div>
      <div className="kpi-row">
        <StatCard cls="accent" icon="shield" rawValue={t.total} label="Total cognizable crimes (2025)" hint="IPC/BNS + SLL" />
        <StatCard cls="warn" icon="patterns" rawValue={t.ipc_bns_crimes} label="IPC / BNS crimes" />
        <StatCard cls="ok" icon="doc" rawValue={t.sll_crimes} label="Special Local Law crimes" />
        <StatCard cls="danger" icon="map" rawValue={ov.data.districts_count} label="Districts / units tracked" />
      </div>

      <div className="grid-2">
        <Card title="Top districts by total crime (2025)" icon="trends">
          <div className="chart-wrap">
            <Bar
              data={{
                labels: top10.map((r) => r.district),
                datasets: [{ label: "Total crimes", data: top10.map((r) => r.total), backgroundColor: "#4f9cff" }],
              }}
              options={horizontalBar}
            />
          </div>
        </Card>

        <Card title="IPC/BNS vs SLL share" icon="socio">
          <div className="chart-wrap">
            <Doughnut
              data={{
                labels: ["IPC / BNS", "Special Local Laws"],
                datasets: [{ data: [t.ipc_bns_crimes, t.sll_crimes], backgroundColor: ["#7b61ff", "#3ddc97"], borderColor: "#161f2c", borderWidth: 3 }],
              }}
              options={doughnutOptions}
            />
          </div>
        </Card>
      </div>

      <Card title="Range-wise crime distribution" icon="patterns">
        <div className="chart-wrap">
          <Bar
            data={{
              labels: rangeLabels,
              datasets: [{
                label: "Total crimes by range",
                data: rangeLabels.map((l) => byRange[l]),
                backgroundColor: rangeLabels.map((_, i) => PALETTE[i % PALETTE.length]),
              }],
            }}
            options={noLegend}
          />
        </div>
      </Card>

      <Card title="State crime volume — real monthly trend (2025)" icon="trends">
        <p className="note">
          Actual month-by-month cognizable-crime counts from the 12 KSP Monthly Crime Review files
          (Jan–Dec 2025), via the Government Open Data Platform (data.gov.in).
        </p>
        {monthly.loading && <Loading />}
        {monthly.error && <ErrorBanner message={monthly.error} />}
        {monthly.data && monthly.data.found && (
          <>
            <div className="chart-wrap">
              <Line
                data={{
                  labels: monthly.data.series.map((p) => p.month),
                  datasets: [{
                    label: "Total cognizable crimes",
                    data: monthly.data.series.map((p) => p.count),
                  borderColor: "#4f9cff",
                  backgroundColor: "rgba(79,156,255,0.15)",
                    fill: true,
                    tension: 0.35,
                    pointRadius: 3,
                  }],
                }}
                options={lineOptions}
              />
            </div>
            <p className="note">
              12-month total: <b>{fmt(monthly.data.total)}</b> · peak month: <b>{monthly.data.peak_month}</b>.
            </p>
          </>
        )}
      </Card>
    </>
  );
}
