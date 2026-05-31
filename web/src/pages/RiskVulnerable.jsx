import { useState } from "react";
import { Bar } from "react-chartjs-2";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";

export default function RiskVulnerable() {
  const [group, setGroup] = useState("Women");
  const risk = useAsync(() => api.riskScores(15), []);
  const vuln = useAsync(() => api.vulnerable(group), [group]);

  const groupControl = (
    <Segmented
      label="Group"
      value={group}
      onChange={setGroup}
      options={[{ value: "Women", label: "Women" }, { value: "Children", label: "Children" }, { value: "SC/ST", label: "SC / ST" }]}
    />
  );

  const items = vuln.data?.results?.[0]?.items?.slice(0, 10) || [];

  return (
    <>
      <PageHead icon="risk" title="Risk &amp; Vulnerable Groups"
        subtitle="Composite district risk index and crimes against women, children, and SC/ST communities." />
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
                  <td className="right">{r.risk_score}</td>
                  <td><span className={`band ${r.risk_band}`}>{r.risk_band}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Crimes against vulnerable groups" icon="shield" headRight={groupControl}>
        {vuln.loading && <Loading />}
        {vuln.error && <ErrorBanner message={vuln.error} />}
        {vuln.data && (
          <div className="chart-wrap tall">
            <Bar
              data={{
                labels: items.map((i) => i.crime_type.slice(0, 24)),
                datasets: [{ label: `Crimes against ${group}`, data: items.map((i) => i.count), backgroundColor: "#ff5c6c" }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }}
            />
          </div>
        )}
      </Card>
      </div>
    </>
  );
}
