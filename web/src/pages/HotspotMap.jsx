import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker, ZoomControl, useMap } from "react-leaflet";
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

// Smoothly fit the map to the points currently shown.
function FitBounds({ points }) {
  const map = useMap();
  if (points && points.length) {
    try {
      const b = L.latLngBounds(points);
      if (b.isValid()) map.flyToBounds(b, { padding: [40, 40], duration: 0.6, maxZoom: 12 });
    } catch (e) { /* noop */ }
  }
  return null;
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
  const [level, setLevel] = useState("district"); // district | station | incidents
  const districts = useAsync(() => api.districts(), []);
  const rank = useAsync(() => api.rank(metric, "desc", 100), [metric]);
  const hot = useAsync(() => api.hotspots(metric, 1.0), [metric]);
  const stations = useAsync(() => (level === "station" ? api.firUnits(600) : Promise.resolve(null)), [level]);
  const incidents = useAsync(() => (level === "incidents" ? api.firHotspots(800) : Promise.resolve(null)), [level]);
  const firSummary = useAsync(() => api.firSummary(), []);
  const firGroups = useAsync(() => api.firGroups(10), []);
  const hourly = useAsync(() => api.stationsHourly(), []);
  const spatio = useAsync(() => api.spatiotemporal(12), []);

  const headRight = (
    <div className="controls">
      <Segmented
        label="Level"
        value={level}
        onChange={setLevel}
        options={[
          { value: "district", label: "District" },
          { value: "station", label: "Police Station" },
          { value: "incidents", label: "Live Incidents" },
        ]}
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

  const incidentCells = incidents.data?.cells || [];
  const incMax = incidents.data?.max_count || 1;
  const firTotal = firSummary.data?.source?.total_firs || 0;
  const firGeo = firSummary.data?.source?.geo_valid_firs || 0;

  // Points to auto-fit the map to, per active layer.
  let fitPoints = null;
  if (level === "incidents" && incidentCells.length) fitPoints = incidentCells.slice(0, 200).map((c) => [c.lat, c.lng]);
  else if (level === "station" && stationRows.length) fitPoints = stationRows.slice(0, 200).map((s) => [s.latitude, s.longitude]);

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
          <div className="value">{firTotal ? fmt(firTotal) : "–"}</div>
          <div className="label">Real FIRs analysed (2016–2024)</div>
        </div>
      </div>

      {firTotal > 0 && (
        <div className="synthetic-banner" style={{ background: "rgba(61,220,151,0.08)", borderColor: "rgba(61,220,151,0.4)", color: "#9fe7c4" }}>
          <span className="sb-ic" style={{ color: "var(--ok)" }}><Icon name="map" size={18} /></span>
          <span><b style={{ color: "var(--ok)" }}>Real incident-level data:</b> the <b>Live Incidents</b> and <b>Police Station</b> layers
          plot {fmt(firGeo)} geo-tagged FIRs from {fmt(firTotal)} real Karnataka Police records (2016–2024, Apache-2.0).
          Switch the Level control to explore actual incident coordinates.</span>
        </div>
      )}

      <Card title="Crime hotspots map" icon="map" headRight={headRight}>
        <div className="map map-pro">
          <MapContainer center={[15.0, 76.0]} zoom={7} style={{ height: "100%" }} scrollWheelZoom zoomControl={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />
            <ZoomControl position="bottomright" />
            <FitBounds points={fitPoints} />

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

            {level === "station" && stationRows.map((s, i) => {
              const ratio = s.total_crimes / stMax;
              const radius = 4 + Math.sqrt(ratio) * 18;
              const color = heatColor(ratio);
              return (
                <CircleMarker key={i} center={[s.latitude, s.longitude]} radius={radius}
                  className="hot-marker"
                  pathOptions={{ color: "#ffffff", weight: 0.8, fillColor: color, fillOpacity: 0.7 }}>
                  <Popup className="map-pop">
                    <div className="mp-title">{s.unit}</div>
                    <div className="mp-sub">{s.district}</div>
                    <div className="mp-row"><span>FIRs (geo-tagged)</span><b>{fmt(s.total_crimes)}</b></div>
                    <div className="mp-bar"><span style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} /></div>
                  </Popup>
                </CircleMarker>
              );
            })}

            {level === "incidents" && incidentCells.map((c, i) => {
              const ratio = c.count / incMax;
              const radius = 3 + Math.sqrt(ratio) * 16;
              const color = heatColor(ratio);
              return (
                <CircleMarker key={i} center={[c.lat, c.lng]} radius={radius}
                  className="hot-marker"
                  pathOptions={{ color, weight: 0.4, fillColor: color, fillOpacity: 0.55 }}>
                  <Popup className="map-pop">
                    <div className="mp-title">Incident cluster</div>
                    <div className="mp-sub">{c.lat.toFixed(2)}, {c.lng.toFixed(2)} · ~1 km cell</div>
                    <div className="mp-row"><span>FIRs in cell</span><b>{fmt(c.count)}</b></div>
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
            ? "District level: bubble size and colour scale with crime volume; pulsing red zones are statistical hotspots (z ≥ 1.0). Switch to Police Station or Live Incidents for real FIR drill-down."
            : level === "station"
              ? "Police-unit drill-down — each point is a real police station plotted at the mean coordinate of its geo-tagged FIRs (real incident data, 2016–2024)."
              : "Live incident clusters — each circle is a ~1 km grid cell coloured by the number of real geo-tagged FIRs that occurred there (2016–2024)."}
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

      <Card title="Crime group breakdown (real FIR records)" icon="patterns">
        <p className="note">Actual crime-group distribution across {fmt(firTotal)} real Karnataka Police FIRs (2016–2024).</p>
        {firGroups.loading && <Loading />}
        {firGroups.error && <ErrorBanner message={firGroups.error} />}
        {firGroups.data && (
          <div className="chart-wrap tall">
            <Bar
              data={{
                labels: firGroups.data.results.map((g) => g.crime_group.length > 26 ? g.crime_group.slice(0, 24) + "…" : g.crime_group),
                datasets: [{ label: "FIRs", data: firGroups.data.results.map((g) => g.count), borderRadius: 5, backgroundColor: "#4f9cff" }],
              }}
              options={{ responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } } }}
            />
          </div>
        )}
      </Card>

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
