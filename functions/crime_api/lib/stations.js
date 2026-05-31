"use strict";

/**
 * Police-station drill-down + spatiotemporal (time-of-day) cluster analytics.
 *
 * Closes two challenge gaps the aggregate public data can't support directly:
 *   - District -> police-station drill-down
 *   - Spatiotemporal clusters: layering time-of-day with location to find
 *     "when + where" hotspots for proactive resource deployment.
 *
 * Operates on SYNTHETIC station/hourly data that is statistically grounded —
 * station totals reconcile EXACTLY to the real district crime totals, and the
 * hourly profile uses a realistic bimodal (late-night + evening) distribution.
 * Every response carries data_basis = "synthetic (reconciles to real district totals)".
 */

const { loadTable, num } = require("./store");

const BASIS = "synthetic (station totals reconcile to real district totals)";

function stations() { return loadTable("stations"); }
function hourly() { return loadTable("station_hourly"); }

/** Stations within a district (drill-down), sorted by volume. */
function byDistrict({ districtId, district }) {
  const rows = stations().filter((s) =>
    (districtId && s.district_id === districtId) ||
    (district && s.district.toLowerCase() === String(district).toLowerCase())
  ).map((s) => ({
    station_id: s.station_id,
    station_name: s.station_name,
    district: s.district,
    latitude: num(s.latitude),
    longitude: num(s.longitude),
    total_crimes: num(s.total_crimes),
  })).sort((a, b) => b.total_crimes - a.total_crimes);
  return { data_basis: BASIS, district: district || districtId, count: rows.length, results: rows };
}

/** All stations as map points (for the station-level map layer). */
function allStations({ limit = 500 } = {}) {
  const rows = stations().map((s) => ({
    station_id: s.station_id,
    station_name: s.station_name,
    district: s.district,
    range_name: s.range_name,
    latitude: num(s.latitude),
    longitude: num(s.longitude),
    total_crimes: num(s.total_crimes),
  })).sort((a, b) => b.total_crimes - a.total_crimes).slice(0, limit);
  return { data_basis: BASIS, results: rows };
}

/**
 * State-wide hourly profile (24 buckets) — the temporal axis of spatiotemporal
 * clustering. Identifies the peak crime hours.
 */
function hourlyProfile({ district = null } = {}) {
  const rows = hourly().filter((h) => !district || h.district.toLowerCase() === String(district).toLowerCase());
  const buckets = new Array(24).fill(0);
  for (const h of rows) buckets[num(h.hour)] += num(h.crime_count) || 0;
  const total = buckets.reduce((a, b) => a + b, 0) || 1;
  const profile = buckets.map((c, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    crime_count: c,
    share_pct: +((c / total) * 100).toFixed(2),
  }));
  const peak = [...profile].sort((a, b) => b.crime_count - a.crime_count)[0];
  return {
    data_basis: BASIS,
    scope: district || "state",
    peak_hour: peak ? peak.label : null,
    profile,
    bands: {
      "late_night(0-5)": buckets.slice(0, 6).reduce((a, b) => a + b, 0),
      "morning(6-11)": buckets.slice(6, 12).reduce((a, b) => a + b, 0),
      "afternoon(12-17)": buckets.slice(12, 18).reduce((a, b) => a + b, 0),
      "evening(18-23)": buckets.slice(18, 24).reduce((a, b) => a + b, 0),
    },
  };
}

/**
 * Spatiotemporal clusters: station x time-band matrix highlighting the
 * highest "where + when" combinations for proactive deployment.
 */
function spatiotemporalClusters({ limit = 15 } = {}) {
  const stIdx = new Map(stations().map((s) => [s.station_id, s]));
  // sum crime per (station, time-band)
  const BANDS = [
    ["late_night", 0, 6],
    ["morning", 6, 12],
    ["afternoon", 12, 18],
    ["evening", 18, 24],
  ];
  const cells = new Map();
  for (const h of hourly()) {
    const hr = num(h.hour);
    const band = BANDS.find((b) => hr >= b[1] && hr < b[2])[0];
    const key = `${h.station_id}#${band}`;
    cells.set(key, (cells.get(key) || 0) + (num(h.crime_count) || 0));
  }
  const out = [];
  for (const [key, count] of cells.entries()) {
    const [sid, band] = key.split("#");
    const s = stIdx.get(sid);
    if (!s) continue;
    out.push({
      station_id: sid,
      station_name: s.station_name,
      district: s.district,
      time_band: band,
      crime_count: count,
      latitude: num(s.latitude),
      longitude: num(s.longitude),
    });
  }
  out.sort((a, b) => b.crime_count - a.crime_count);
  return {
    data_basis: BASIS,
    method: "station x time-band crime matrix; top cells are spatiotemporal hotspots (where + when)",
    results: out.slice(0, limit),
  };
}

function summary() {
  return {
    data_basis: BASIS,
    note: "Synthetic police-station & time-of-day layer enabling station drill-down and spatiotemporal (when+where) hotspot analysis. Reconciles to real district crime totals.",
    counts: { stations: stations().length, hourly_rows: hourly().length },
  };
}

module.exports = { byDistrict, allStations, hourlyProfile, spatiotemporalClusters, summary };
