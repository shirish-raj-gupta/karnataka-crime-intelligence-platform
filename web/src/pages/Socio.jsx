import { useState } from "react";
import { Bar, Scatter } from "react-chartjs-2";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";

const STRENGTH_COLOR = { strong: "#ff5c6c", moderate: "#ffb347", weak: "#4f9cff", negligible: "#9bb0c9" };
const BAND_COLOR = { Critical: "#ff5c6c", High: "#ffb347", Moderate: "#4f9cff", Low: "#3ddc97" };

export default function Socio() {
  const corr = useAsync(() => api.socioCorrelations(), []);
  const dists = useAsync(() => api.socioDistricts("crime_rate"), []);
  const ml = useAsync(() => api.mlScoreDistricts(), []);
  const [form, setForm] = useState({ population: 2000000, literacy_pct: 75, urban_pct: 35, density: 400 });
  const [automl, setAutoml] = useState({ loading: false, error: null, data: null });

  async function runAutoML() {
    setAutoml({ loading: true, error: null, data: null });
    try {
      const r = await api.mlPredictAutoML({
        population: Number(form.population), literacy_pct: Number(form.literacy_pct),
        urban_pct: Number(form.urban_pct), density: Number(form.density),
      });
      setAutoml({ loading: false, error: null, data: r });
    } catch (e) {
      setAutoml({ loading: false, error: e.message, data: null });
    }
  }

  return (
    <>
      <PageHead icon="socio" title="Socio-Economic Correlation"
        subtitle="The 'why' behind the 'where' — Census 2011 indicators correlated with crime, plus the ML risk model." />
      <Card title="Why behind the where — socio-economic correlation" icon="socio">
        <p className="note">
          Pearson correlation between each district's crime rate (per 100k population) and its
          socio-economic indicators. Source: Census of India 2011 (public domain) joined to KSP 2025 crime totals.
        </p>
        {corr.loading && <Loading />}
        {corr.error && <ErrorBanner message={corr.error} />}
        {corr.data && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Indicator</th><th className="right">Correlation (r)</th><th>Strength</th><th>Direction</th></tr></thead>
            <tbody>
              {corr.data.results.map((r) => (
                <tr key={r.key}>
                  <td>{r.indicator}</td>
                  <td className="right">{r.correlation}</td>
                  <td><span className="band" style={{ background: `${STRENGTH_COLOR[r.strength]}22`, color: STRENGTH_COLOR[r.strength] }}>{r.strength}</span></td>
                  <td>{r.direction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid-2">
        <Card title="Crime rate per 100k by district">
          {dists.loading && <Loading />}
          {dists.error && <ErrorBanner message={dists.error} />}
          {dists.data && (
            <div className="chart-wrap tall">
              <Bar
                data={{
                  labels: dists.data.results.slice(0, 15).map((d) => d.district),
                  datasets: [{ label: "Crime rate / 100k", data: dists.data.results.slice(0, 15).map((d) => d.crime_rate), backgroundColor: "#4f9cff" }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }}
              />
            </div>
          )}
        </Card>

        <Card title="Density vs crime rate (scatter)">
          {dists.data && (
            <div className="chart-wrap tall">
              <Scatter
                data={{
                  datasets: [{
                    label: "Districts",
                    data: dists.data.results.map((d) => ({ x: d.density, y: d.crime_rate })),
                    backgroundColor: "#7b61ff",
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { title: { display: true, text: "Population density (/sq.km)" } },
                    y: { title: { display: true, text: "Crime rate / 100k" } },
                  },
                }}
              />
            </div>
          )}
        </Card>
      </div>

      <Card title="Highest crime-rate districts with socio-economic profile">
        {dists.data && (
          <table>
            <thead><tr><th>District</th><th className="right">Crime rate/100k</th><th className="right">Population</th><th className="right">Urban %</th><th className="right">Literacy %</th><th className="right">Density</th></tr></thead>
            <tbody>
              {dists.data.results.slice(0, 12).map((d) => (
                <tr key={d.district_id}>
                  <td>{d.district}</td>
                  <td className="right">{d.crime_rate}</td>
                  <td className="right">{fmt(d.population)}</td>
                  <td className="right">{d.urban_pct}</td>
                  <td className="right">{d.literacy_pct}</td>
                  <td className="right">{fmt(d.density)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="AI/ML predictive risk model — crime-risk band classifier" icon="spark">
        <p className="note">
          Supervised <b>k-NN classifier</b> trained on district socio-economic features
          (population, literacy %, urban %, density) to predict a crime-risk band. The same
          labelled dataset is deployable to Catalyst QuickML / Zia AutoML as a no-code hosted model.
        </p>
        {ml.loading && <Loading />}
        {ml.error && <ErrorBanner message={ml.error} />}
        {ml.data && (
          <>
            <p className="note">Model: {ml.data.model} · trained on {ml.data.trained_on} · features: {ml.data.features.join(", ")}</p>
            <table style={{ marginTop: 10 }}>
              <thead><tr><th>District</th><th>Predicted band</th><th className="right">Confidence</th><th className="right">Actual rate/100k</th></tr></thead>
              <tbody>
                {ml.data.results.slice(0, 15).map((r) => (
                  <tr key={r.district}>
                    <td>{r.district}</td>
                    <td><span className="band" style={{ background: `${BAND_COLOR[r.predicted_band]}22`, color: BAND_COLOR[r.predicted_band] }}>{r.predicted_band}</span></td>
                    <td className="right">{Math.round(r.confidence * 100)}%</td>
                    <td className="right">{r.actual_crime_rate ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card title="Live prediction — Catalyst Zia AutoML (trained model)" icon="spark">
        <p className="note">
          Enter a district profile; the request is scored by the <b>hosted Catalyst Zia AutoML
          multi-class model</b> (trained on 2,000 grounded samples) and returns a risk-band
          probability distribution. Falls back to the in-function k-NN if the model is offline.
        </p>
        <div className="controls" style={{ marginTop: 10, flexWrap: "wrap" }}>
          {[["population", "Population"], ["literacy_pct", "Literacy %"], ["urban_pct", "Urban %"], ["density", "Density /km²"]].map(([k, label]) => (
            <label key={k}>{label}
              <input type="text" value={form[k]} style={{ minWidth: 110 }}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </label>
          ))}
          <button className="btn btn-primary" onClick={runAutoML} disabled={automl.loading}><Icon name="spark" size={14} />Predict</button>
        </div>
        {automl.loading && <Loading label="Scoring with Zia AutoML…" />}
        {automl.error && <ErrorBanner message={automl.error} />}
        {automl.data && (
          <div style={{ marginTop: 12 }}>
            <p className="note">
              Source: <b>{automl.data.source === "zia_automl" ? "Catalyst Zia AutoML (hosted)" : automl.data.source}</b>
              {automl.data.model_id ? ` · model ${automl.data.model_id}` : ""}
            </p>
            {automl.data.prediction?.classification_result && (
              <table>
                <thead><tr><th>Risk band</th><th className="right">Probability</th></tr></thead>
                <tbody>
                  {Object.entries(automl.data.prediction.classification_result)
                    .sort((a, b) => b[1] - a[1])
                    .map(([band, p]) => (
                      <tr key={band}>
                        <td><span className="band" style={{ background: `${BAND_COLOR[band] || "#9bb0c9"}22`, color: BAND_COLOR[band] || "#9bb0c9" }}>{band}</span></td>
                        <td className="right">{Number(p).toFixed(2)}%</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
