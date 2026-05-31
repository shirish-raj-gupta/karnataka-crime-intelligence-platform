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
  const firSummary = useAsync(() => api.firSummary(), []);
  const firGroups = useAsync(() => api.firGroups(8), []);
  const firOutcomes = useAsync(() => api.firOutcomes(100), []);

  if (ov.loading || rank.loading) {
    return (
      <>
        <PageHead icon="dashboard" title="State Crime Dashboard"
          subtitle="Karnataka headline figures from real Karnataka State Police data." />
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

  // Real FIR-derived state metrics (aggregate the per-district outcomes).
  const oc = firOutcomes.data?.results || [];
  const totAccused = oc.reduce((a, r) => a + (r.accused || 0), 0);
  const totArrested = oc.reduce((a, r) => a + (r.arrested || 0), 0);
  const totCharge = oc.reduce((a, r) => a + (r.chargesheeted || 0), 0);
  const totConv = oc.reduce((a, r) => a + (r.convictions || 0), 0);
  const stateArrestRate = totAccused ? ((totArrested / totAccused) * 100).toFixed(1) : null;
  const stateConvRate = totCharge ? ((totConv / totCharge) * 100).toFixed(1) : null;
  const firTotal = firSummary.data?.source?.total_firs || 0;
  const topGroup = firGroups.data?.results?.[0];

  const PdfBtn = (
    <button className="btn btn-primary" onClick={downloadBriefing} title="Generate a PDF intelligence briefing (SmartBrowz)">
      <Icon name="download" size={15} />
      Intelligence Briefing (PDF)
    </button>
  );

  return (
    <>
      <PageHead icon="dashboard" title="State Crime Dashboard"
        subtitle="Karnataka headline figures from real Karnataka State Police data."
        right={PdfBtn} />

      {/* Headline KPIs — aggregate KSP review (2025) */}
      <div className="section-label"><Icon name="shield" size={13} /> Statewide totals · KSP Monthly Crime Review 2025</div>
      <div className="kpi-row">
        <StatCard cls="accent" icon="shield" rawValue={t.total} label="Total cognizable crimes (2025)" hint="IPC/BNS + SLL" />
        <StatCard cls="warn" icon="patterns" rawValue={t.ipc_bns_crimes} label="IPC / BNS crimes" />
        <StatCard cls="ok" icon="doc" rawValue={t.sll_crimes} label="Special Local Law crimes" />
        <StatCard cls="danger" icon="map" rawValue={ov.data.districts_count} label="Districts / units tracked" />
      </div>

      {/* Real incident-level KPIs — FIR dataset (2016-2024) */}
      <div className="section-label"><Icon name="activity" size={13} /> Incident-level intelligence · Real FIR records (2016–2024)</div>
      <div className="kpi-row">
        <StatCard cls="accent" icon="doc" rawValue={firTotal} label="Real FIRs analysed" hint={firSummary.data ? `${fmt(firSummary.data.source.geo_valid_firs)} geo-tagged` : "loading…"} />
        <StatCard cls="warn" icon="patterns"
          value={topGroup ? (topGroup.crime_group.length > 18 ? topGroup.crime_group.slice(0, 17) + "…" : topGroup.crime_group) : "–"}
          label="Most frequent crime group" hint={topGroup ? `${fmt(topGroup.count)} FIRs` : ""} />
        <StatCard cls="ok" icon="shield" value={stateArrestRate ? `${stateArrestRate}%` : "–"} label="State arrest rate" hint="arrested ÷ accused" />
        <StatCard cls="danger" icon="risk" value={stateConvRate ? `${stateConvRate}%` : "–"} label="State conviction rate" hint="convictions ÷ charge-sheeted" />
      </div>

      <div className="grid-2">
        <Card title="Top districts by total crime (2025)" icon="trends">
          <div className="chart-wrap">
            <Bar
              data={{
                labels: top10.map((r) => r.district),
                datasets: [{ label: "Total crimes", data: top10.map((r) => r.total), backgroundColor: "#4f9cff", borderRadius: 5 }],
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
                datasets: [{ data: [t.ipc_bns_crimes, t.sll_crimes], backgroundColor: ["#7b61ff", "#3ddc97"], borderColor: "#141d29", borderWidth: 3 }],
              }}
              options={doughnutOptions}
            />
          </div>
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Range-wise crime distribution" icon="patterns">
          <div className="chart-wrap">
            <Bar
              data={{
                labels: rangeLabels,
                datasets: [{
                  label: "Total crimes by range",
                  data: rangeLabels.map((l) => byRange[l]),
                  backgroundColor: rangeLabels.map((_, i) => PALETTE[i % PALETTE.length]),
                  borderRadius: 5,
                }],
              }}
              options={noLegend}
            />
          </div>
        </Card>

        <Card title="Top crime groups — real FIR records" icon="activity">
          <p className="note">Actual crime-group frequency across {fmt(firTotal)} real FIRs (2016–2024).</p>
          {firGroups.loading && <Loading />}
          {firGroups.error && <ErrorBanner message={firGroups.error} />}
          {firGroups.data && (
            <div className="chart-wrap">
              <Bar
                data={{
                  labels: firGroups.data.results.map((g) => g.crime_group.length > 22 ? g.crime_group.slice(0, 20) + "…" : g.crime_group),
                  datasets: [{ label: "FIRs", data: firGroups.data.results.map((g) => g.count), backgroundColor: "#22d3ee", borderRadius: 5 }],
                }}
                options={horizontalBar}
              />
            </div>
          )}
        </Card>
      </div>

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

      {/* Data provenance footer strip */}
      <div className="source-strip">
        <span className="src-chip"><Icon name="doc" size={13} /> KSP Monthly Crime Review 2025 · data.gov.in (GODL)</span>
        <span className="src-chip"><Icon name="activity" size={13} /> Karnataka Police FIR dataset 2016–2024 · {fmt(firTotal)} records (Apache-2.0)</span>
      </div>
    </>
  );
}
