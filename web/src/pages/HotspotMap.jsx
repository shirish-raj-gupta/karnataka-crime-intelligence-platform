import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, ZoomControl } from "react-leaflet";
import { Bar } from "react-chartjs-2";
import L from "leaflet";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";
import Icon from "../components/Icon.jsx";

function pulseIcon() {
  return L.divIcon({
    className: "redzone-pulse-wrap",
    html: '<span class="redzone-pulse"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Smooth 5-stop heat scale (cool -> hot) keyed on 0..1 intensity.
function heatColor(ratio) {
  if (ratio > 0.8) return "#ff3b5c";   // critical
  if (ratio > 0.6) return "#ff7849";   // high
  if (ratio > 0.4) return "#ffb347";   // elevated
  if (ratio > 0.2) return "#4f9cff";   // moderate
  return "#52d6e2";                     // low
}

export default function HotspotMap() {
  const [metric, setMetric] = useState("total");
  const [level, setLevel] = useState("district"); // district | station
  const districts = useAsync(() => api.districts(), []);
  const rank = useAsync(() => api.rank(metric, "desc", 100), [metric]);
  const hot = useAsync(() => api.hotspots(metric, 1.0), [metric]);
  const stations = useAsync(() => (level === "station" ? api.stations({ limit: 500 }) : Promise.resolve(null)), [level]);
  const hourly = useAsync(() => api.stationsHourly(), []);
  const spatio = useAsync(() => api.spatiotemporal(12), []);

  const headRight = (
    <div className="controls">
      <Segmented
        label="Level"
        value={level}
        onChange={setLevel}
        options={[{ value: "district", label: "District" }, { value: "station", label: "Police Station" }]}
      />
      <Segmented
        label="Metric"
        value={metric}
        onChange={setMetric}
        options={[{ value: "total", label: "Total" }, { value: "ipc_bns_crimes", label: "IPC/BNS" }, { value: "sll_crimes", label: "SLL" }]}
      />
    </div>
  );

  if (districts.loading) return <Loading />;
  if (districts.error) return <ErrorBanner message={districts.error} />;

  const valueById = {};
  let max = 1;
  let stateTotal = 0;
  if (rank.data) {
    rank.data.results.forEach((r) => { valueById[r.district_id] = r.value; });
    max = Math.max(...rank.data.results.map((r) => r.value)) || 1;
    stateTotal = rank.data.results.reduce((a, r) => a + r.value, 0);
  }
  const hotList = hot.data?.hotspots || [];
  const hotIds = new Set(hotList.map((h) => h.district_id));
  const topRanked = (rank.data?.results || []).slice(0, 5);

  const stationRows = stations.data?.results || [];
  const stMax = stationRows.length ? Math.max(...stationRows.map((s) => s.total_crimes)) : 1;

  const metricLabel = metric === "ipc_bns_crimes" ? "IPC/BNS" : metric === "sll_crimes" ? "SLL" : "Total";

  return (
    <>
      <PageHead icon="map" title="Crime Hotspot Map"
        subtitle="Geospatial hotspots with district & station drill-down and time-of-day clustering." />

      {/* KPI summary strip */}
      <div className="kpi-row">
        <div className="kpi accent">
          <div className="kpi-top"><span className="kpi-ic"><Icon name="map" size={18} /></span></div>
          <div className="value">{fmt(stateTotal)}</div>
          <div className="label">{metricLabel} crimes mapped</div>
        </div>
        <div className="kpi danger">
          <div className="kpi-top"><span className="kpi-ic"><Icon name="alert" size={18} /></span></div>
          <div className="value">{hotList.length}</div>
          <div className="label">Red-zone hotspots (z ≥ 1.0)</div>
        </div>
        <div className="kpi warn">
          <div className="kpi-top"><span className="kpi-ic"><Icon name="pin" size={18} /></span></div>
          <div className="value">{topRanked[0]?.district || "–"}</div>
          <div className="label">Top hotspot · {fmt(topRanked[0]?.value || 0)}</div>
        </div>
        <div className="kpi ok">
          <div className="kpi-top"><span className="kpi-ic"><Icon name="building" size={18} /></span></div>
          <div className="value">{level === "station" ? fmt(stationRows.length) : fmt((districts.data || []).length)}</div>
          <div className="label">{level === "station" ? "Police stations" : "Districts / units"}</div>
        </div>
      </div>

      <Card title="Crime hotspots map" icon="map" headRight={headRight}>
        <div className="map map-pro">
          <MapContainer center={[15.0, 76.0]} zoom={7} style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
            <ZoomControl position="bottomright" />

            {level === "district" && districts.data
              .filter((d) => d.latitude && d.longitude)
              .map((d) => {
                const v = valueById[d.district_id] || 0;
                const ratio = v / max;
                const radius = 7 + Math.sqrt(ratio) * 30; // area-proportional
                const color = heatColor(ratio);
                const isHot = hotIds.has(d.district_id);
                const share = stateTotal ? ((v / stateTotal) * 100).toFixed(1) : "0";
                return (
                  <div key={d.district_id}>
                    {isHot && <Marker position={[+d.latitude, +d.longitude]} icon={pulseIcon()} interactive={false} />}
                    <CircleMarker center={[+d.latitude, +d.longitude]} radius={radius}
                      className="hot-marker"
                      pathOptions={{ color: "#ffffff", weight: 1.2, fillColor: color, fillOpacity: 0.72 }}>
                      <Popup className="map-pop">
                        <div className="mp-title">{d.district} {isHot && <span className="mp-flag">RED ZONE</span>}</div>
                        <div className="mp-sub">{d.range_name}</div>
                        <div className="mp-row"><span>{metricLabel}</span><b>{fmt(v)}</b></div>
                        <div className="mp-row"><span>Share of state</span><b>{share}%</b></div>
                        <div className="mp-bar"><span style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} /></div>
                      </Popup>
                    </CircleMarker>
                  </div>
                );
              })}

            {level === "station" && stationRows.map((s) => {
              const ratio = s.total_crimes / stMax;
              const radius = 4 + Math.sqrt(ratio) * 18;
              const color = heatColor(ratio);
              return (
                <CircleMarker key={s.station_id} center={[s.latitude, s.longitude]} radius={radius}
                  className="hot-marker"
                  pathOptions={{ color: "#ffffff", weight: 0.8, fillColor: color, fillOpacity: 0.7 }}>
                  <Popup className="map-pop">
                    <div className="mp-title">{s.station_name}</div>
                    <div className="mp-sub">{s.district}</div>
                    <div className="mp-row"><span>Crimes</span><b>{fmt(s.total_crimes)}</b></div>
                    <div className="mp-bar"><span style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} /></div>
                  </Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>

          {/* Floating gradient legend overlay */}
          <div className="map-float-legend">
            <div className="mfl-title">{metricLabel} intensity</div>
            <div className="mfl-bar" />
            <div className="mfl-scale"><span>Low</span><span>High</span></div>
            <div className="mfl-redzone"><span className="dot redzone-pulse" /> Red-zone (z ≥ 1.0)</div>
          </div>
        </div>

        <p className="note">
          {level === "district"
            ? "District level: bubble size and colour scale with crime volume; pulsing red zones are statistical hotspots (z ≥ 1.0). Switch to Police Station for drill-down."
            : "Police-station drill-down (synthetic stations; totals reconcile to real district figures)."}
        </p>
      </Card>

      {/* Top hotspots leaderboard */}
      <div className="grid-2">
        <Card title={`Top hotspots · ${metricLabel}`} icon="alert">
          <p className="note">Highest-volume areas right now — the priority list for deployment.</p>
          {topRanked.length === 0 ? <Loading /> : (
            <div className="hot-board">
              {topRanked.map((r, i) => {
                const ratio = r.value / max;
                return (
                  <div className="hot-row" key={r.district_id}>
                    <span className="hot-rank">{i + 1}</span>
                    <div className="hot-meta">
                      <div className="hot-name">
                        {r.district}
                        {hotIds.has(r.district_id) && <span className="pill pill-danger" style={{ marginLeft: 8 }}>red zone</span>}
                      </div>
                      <div className="hot-track"><span style={{ width: `${ratio * 100}%`, background: heatColor(ratio) }} /></div>
                    </div>
                    <span className="hot-val">{fmt(r.value)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Time-of-day crime profile (spatiotemporal axis)" icon="clock">
          <p className="note">When crime peaks across the day — the temporal layer for hotspot deployment.</p>
          {hourly.loading && <Loading />}
          {hourly.error && <ErrorBanner message={hourly.error} />}
          {hourly.data && (
            <>
              <div className="chart-wrap">
                <Bar
                  data={{
                    labels: hourly.data.profile.map((h) => h.label),
                    datasets: [{ label: "Crimes by hour", data: hourly.data.profile.map((h) => h.crime_count), borderRadius: 5, backgroundColor: hourly.data.profile.map((h) => h.hour >= 18 || h.hour < 6 ? "#ff5c6c" : "#4f9cff") }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
              <p className="note">Peak hour: <b>{hourly.data.peak_hour}</b> · red bars = late-night/evening high-risk window.</p>
            </>
          )}
        </Card>
      </div>

      <Card title="Spatiotemporal hotspots (where + when)" icon="alert">
        <p className="note">Top station × time-band combinations for proactive resource deployment.</p>
        {spatio.loading && <Loading />}
        {spatio.error && <ErrorBanner message={spatio.error} />}
        {spatio.data && (
          <table>
            <thead><tr><th>Station</th><th>District</th><th>Time band</th><th className="right">Crimes</th></tr></thead>
            <tbody>
              {spatio.data.results.map((r, i) => (
                <tr key={i}>
                  <td>{r.station_name}</td>
                  <td>{r.district}</td>
                  <td><span className="band" style={{ background: r.time_band === "late_night" || r.time_band === "evening" ? "rgba(255,92,108,0.2)" : "rgba(79,156,255,0.18)", color: r.time_band === "late_night" || r.time_band === "evening" ? "#ff5c6c" : "#4f9cff" }}>{r.time_band}</span></td>
                  <td className="right">{fmt(r.crime_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
