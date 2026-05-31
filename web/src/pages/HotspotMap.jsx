import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, Marker } from "react-leaflet";
import { Bar } from "react-chartjs-2";
import L from "leaflet";
import { api, fmt } from "../api";
import { useAsync } from "../hooks/useAsync";
import { Card, Loading, ErrorBanner, PageHead } from "../components/Common.jsx";
import Segmented from "../components/ui/Segmented.jsx";

function pulseIcon() {
  return L.divIcon({
    className: "redzone-pulse-wrap",
    html: '<span class="redzone-pulse"></span>',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
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
  if (rank.data) {
    rank.data.results.forEach((r) => { valueById[r.district_id] = r.value; });
    max = Math.max(...rank.data.results.map((r) => r.value)) || 1;
  }
  const hotIds = new Set((hot.data?.hotspots || []).map((h) => h.district_id));

  const stationRows = stations.data?.results || [];
  const stMax = stationRows.length ? Math.max(...stationRows.map((s) => s.total_crimes)) : 1;

  return (
    <>
      <PageHead icon="map" title="Crime Hotspot Map"
        subtitle="Geospatial hotspots with district & station drill-down and time-of-day clustering." />
      <Card title="Crime hotspots map" icon="map" headRight={headRight}>
        <div className="map">
          <MapContainer center={[15.0, 76.0]} zoom={7} style={{ height: "100%", borderRadius: 10 }} scrollWheelZoom>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />

            {level === "district" && districts.data
              .filter((d) => d.latitude && d.longitude)
              .map((d) => {
                const v = valueById[d.district_id] || 0;
                const ratio = v / max;
                const radius = 8 + ratio * 34;
                const color = ratio > 0.66 ? "#ff5c6c" : ratio > 0.33 ? "#ffb347" : "#4f9cff";
                const isHot = hotIds.has(d.district_id);
                return (
                  <div key={d.district_id}>
                    {isHot && <Marker position={[+d.latitude, +d.longitude]} icon={pulseIcon()} interactive={false} />}
                    <CircleMarker center={[+d.latitude, +d.longitude]} radius={radius}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.55, weight: 1.5 }}>
                      <Popup><b>{d.district}</b>{isHot ? " 🔴 RED ZONE" : ""}<br />{d.range_name}<br />{metric}: <b>{fmt(v)}</b></Popup>
                    </CircleMarker>
                  </div>
                );
              })}

            {level === "station" && stationRows.map((s) => {
              const ratio = s.total_crimes / stMax;
              const radius = 4 + ratio * 22;
              const color = ratio > 0.66 ? "#ff5c6c" : ratio > 0.33 ? "#ffb347" : "#52d6e2";
              return (
                <CircleMarker key={s.station_id} center={[s.latitude, s.longitude]} radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.5, weight: 1 }}>
                  <Popup><b>{s.station_name}</b><br />{s.district}<br />Crimes: <b>{fmt(s.total_crimes)}</b></Popup>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <p className="note">
          {level === "district"
            ? "District level: pulsing red zones are statistical hotspots (z ≥ 1.0). Switch to Police Station for drill-down."
            : "Police-station drill-down (synthetic stations; totals reconcile to real district figures)."}
        </p>
        <div className="map-legend">
          <span className="lg"><span className="dot" style={{ background: "#ff5c6c" }}></span> High</span>
          <span className="lg"><span className="dot" style={{ background: "#ffb347" }}></span> Medium</span>
          <span className="lg"><span className="dot" style={{ background: "#4f9cff" }}></span> Lower</span>
          <span className="lg"><span className="dot redzone-pulse" style={{ width: 12, height: 12 }}></span> Red-zone (z ≥ 1.0)</span>
        </div>
      </Card>

      <div className="grid-2">
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
                    datasets: [{ label: "Crimes by hour", data: hourly.data.profile.map((h) => h.crime_count), backgroundColor: hourly.data.profile.map((h) => h.hour >= 18 || h.hour < 6 ? "#ff5c6c" : "#4f9cff") }],
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
                />
              </div>
              <p className="note">Peak hour: <b>{hourly.data.peak_hour}</b> · red bars = late-night/evening high-risk window.</p>
            </>
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
      </div>
    </>
  );
}
