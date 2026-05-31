import { useState } from "react";
import { Bar } from "react-chartjs-2";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, StatCard, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import Icon from "../components/Icon.jsx";
import { horizontalBar } from "../components/charts/chartOptions";

export default function RiskVulnerable() {
  const [group, setGroup] = useState("Women");
  const risk = useAsync(() => api.riskScores(15), []);
  const vuln = useAsync(() => api.vulnerable(group), [group]);
  const outcomes = useAsync(() => api.firOutcomes(100), []);

  const groupControl = (
    <Segmented
      label="Group"
      value={group}
      onChange={setGroup}
      options={[{ value: "Women", label: "Women" }, { value: "Children", label: "Children" }, { value: "SC/ST", label: "SC / ST" }]}
    />
  );

  const items = vuln.data?.results?.[0]?.items?.slice(0, 10) || [];

  // Risk summary
  const riskRows = risk.data?.results || [];
  const topRisk = riskRows[0];
  const criticalCount = riskRows.filter((r) => r.risk_band === "Critical").length;

  // Real FIR outcomes — state aggregates
  const oc = outcomes.data?.results || [];
  const totAccused = oc.reduce((a, r) => a + (r.accused || 0), 0);
  const totArrested = oc.reduce((a, r) => a + (r.arrested || 0), 0);
  const totCharge = oc.reduce((a, r) => a + (r.chargesheeted || 0), 0);
  const totConv = oc.reduce((a, r) => a + (r.convictions || 0), 0);
  const totFemale = oc.reduce((a, r) => a + (r.female_victims || 0), 0);
  const stateArrestRate = totAccused ? ((totArrested / totAccused) * 100).toFixed(1) : null;
  const stateConvRate = totCharge ? ((totConv / totCharge) * 100).toFixed(1) : null;

  // Top districts by female victims (real)
  const byFemale = [...oc].sort((a, b) => (b.female_victims || 0) - (a.female_victims || 0)).slice(0, 10);

  return (
    <>
      <PageHead icon="risk" title="Risk &amp; Vulnerable Groups"
        subtitle="Composite district risk index, vulnerable-group crime profiles, and real case-outcome accountability." />

      {/* KPI summary band */}
      <div className="kpi-row">
        <StatCard cls="danger" icon="risk"
          value={topRisk ? topRisk.district : "…"}
          label="Highest-risk district"
          hint={topRisk ? `score ${topRisk.risk_score} · ${topRisk.risk_band}` : ""} />
        <StatCard cls="warn" icon="alert"
          rawValue={criticalCount}
          label="Critical-band districts" hint="risk score ≥ 75" />
        <StatCard cls="accent" icon="shield"
          value={stateArrestRate ? `${stateArrestRate}%` : "…"}
          label="State arrest rate" hint="real FIRs · arrested ÷ accused" />
        <StatCard cls="ok" icon="users"
          rawValue={totFemale}
          label="Female + girl victims" hint="real FIR records (2016–2024)" />
      </div>

      <div className="section-label"><Icon name="risk" size={13} /> District risk &amp; vulnerable-group profiles · KSP review</div>
      <div className="grid-2">
        <Card title="District risk scores" icon="risk">
          <p className="note">Composite 0–100 index from crime volume. Bands: Critical ≥75, High ≥50, Moderate ≥25.</p>
          {risk.loading && <Loading />}
          {risk.error && <ErrorBanner message={risk.error} />}
          {risk.data && (
            <table style={{ marginTop: 10 }}>
              <thead>
                <tr><th>District</th><th className="right">Crimes</th><th className="right">Score</th><th>Band</th></tr>
              </thead>
              <tbody>
                {risk.data.results.map((r) => (
                  <tr key={r.district_id}>
                    <td>{r.district}</td>
                    <td className="right">{fmt(r.total_crimes)}</td>
                    <td className="right">
                      <div className="hot-track" style={{ display: "inline-block", width: 54, verticalAlign: "middle", marginRight: 8 }}>
                        <span style={{ width: `${r.risk_score}%`, background: r.risk_score >= 75 ? "#ff5c6c" : r.risk_score >= 50 ? "#ffb347" : "#4f9cff" }} />
                      </div>
                      {r.risk_score}
                    </td>
                    <td><span className={`band ${r.risk_band}`}>{r.risk_band}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Crimes against vulnerable groups" icon="shield" headRight={groupControl}>
          <p className="note">Crime-type breakdown for the selected vulnerable community (KSP Special-Crimes review).</p>
          {vuln.loading && <Loading />}
          {vuln.error && <ErrorBanner message={vuln.error} />}
          {vuln.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: items.map((i) => i.crime_type.slice(0, 24)),
                  datasets: [{ label: `Crimes against ${group}`, data: items.map((i) => i.count), backgroundColor: "#ff5c6c", borderRadius: 5 }],
                }}
                options={horizontalBar}
              />
            </div>
          )}
        </Card>
      </div>

      <div className="section-label"><Icon name="activity" size={13} /> Case-outcome accountability · Real FIR records (2016–2024)</div>

      <div className="grid-2">
        <Card title="Districts by female + girl victims (real FIRs)" icon="users">
          <p className="note">Where crimes affecting women and girls concentrate, from real incident records.</p>
          {outcomes.loading && <Loading />}
          {outcomes.error && <ErrorBanner message={outcomes.error} />}
          {outcomes.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: byFemale.map((r) => r.district),
                  datasets: [{ label: "Female + girl victims", data: byFemale.map((r) => r.female_victims), backgroundColor: "#f472b6", borderRadius: 5 }],
                }}
                options={horizontalBar}
              />
            </div>
          )}
        </Card>

        <Card title="Conviction-rate gap (real FIRs)" icon="risk">
          <p className="note">
            State arrest rate <b>{stateArrestRate ?? "–"}%</b> · conviction rate <b>{stateConvRate ?? "–"}%</b>.
            The gap between charges and convictions highlights where case follow-through needs attention.
          </p>
          {outcomes.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: oc.slice(0, 10).map((r) => r.district),
                  datasets: [
                    { label: "Arrest %", data: oc.slice(0, 10).map((r) => r.arrest_rate_pct), backgroundColor: "#4f9cff", borderRadius: 5 },
                    { label: "Conviction %", data: oc.slice(0, 10).map((r) => r.conviction_rate_pct), backgroundColor: "#ff5c6c", borderRadius: 5 },
                  ],
                }}
                options={{ ...horizontalBar, plugins: { ...horizontalBar.plugins, legend: { display: true, position: "bottom", labels: { color: "#93a6c0", usePointStyle: true, padding: 14 } } } }}
              />
            </div>
          )}
        </Card>
      </div>

      <Card title="Case outcomes by district — arrest & conviction (real FIR data)" icon="shield">
        <p className="note">
          Real per-district outcomes from the Karnataka Police FIR dataset: arrest rate
          (arrested ÷ accused) and conviction rate (convictions ÷ charge-sheeted) — a genuine
          record-level accountability metric the aggregate review data cannot provide.
        </p>
        {outcomes.loading && <Loading />}
        {outcomes.error && <ErrorBanner message={outcomes.error} />}
        {outcomes.data && (
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>District</th>
                <th className="right">Incidents</th>
                <th className="right">Accused</th>
                <th className="right">Arrest %</th>
                <th className="right">Conviction %</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.data.results.slice(0, 20).map((r, i) => (
                <tr key={i}>
                  <td>{r.district}</td>
                  <td className="right">{fmt(r.incidents)}</td>
                  <td className="right">{fmt(r.accused)}</td>
                  <td className="right">{r.arrest_rate_pct ?? "–"}</td>
                  <td className="right">
                    <span className="band" style={{
                      background: (r.conviction_rate_pct ?? 0) < 15 ? "rgba(255,92,108,0.2)" : (r.conviction_rate_pct ?? 0) < 35 ? "rgba(255,179,71,0.2)" : "rgba(61,220,151,0.2)",
                      color: (r.conviction_rate_pct ?? 0) < 15 ? "#ff5c6c" : (r.conviction_rate_pct ?? 0) < 35 ? "#ffb347" : "#3ddc97",
                    }}>{r.conviction_rate_pct ?? "–"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
