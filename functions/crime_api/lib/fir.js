"use strict";

/**
 * REAL incident-level analytics from the Karnataka Police FIR dataset
 * (1.67M FIRs, Apache-2.0, via Kaggle). Unlike the aggregate KSP review data,
 * these records carry per-incident coordinates, police units, crime groups and
 * victim/accused/arrest/conviction outcomes — enabling genuine geospatial
 * hotspots, station-level drill-down and real outcome analytics.
 *
 * Data is pre-aggregated by etl/fir_incidents.py into compact CSVs:
 *   fir_hotspots.csv  lat/long grid cells + counts
 *   fir_units.csv     police-unit points + totals
 *   fir_groups.csv    crime-group breakdown
 *   fir_outcomes.csv  per-district victim/accused/arrest/conviction
 */

const fs = require("fs");
const path = require("path");
const { num } = require("./store");

const DATA_DIR = path.join(__dirname, "..", "data");
const _cache = {};

function loadCsv(name) {
  if (_cache[name]) return _cache[name];
  const file = path.join(DATA_DIR, `${name}.csv`);
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.length);
  const header = lines[0].split(",");
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const o = {};
    header.forEach((h, j) => { o[h.trim()] = (cells[j] || "").trim(); });
    rows.push(o);
  }
  _cache[name] = rows;
  return rows;
}

function meta() {
  if (_cache.__meta) return _cache.__meta;
  try {
    _cache.__meta = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "fir_meta.json"), "utf8"));
  } catch (e) {
    _cache.__meta = null;
  }
  return _cache.__meta;
}

/** Real lat/long hotspot grid cells (top by incident count). */
function hotspots({ limit = 800 } = {}) {
  const rows = loadCsv("fir_hotspots").map((r) => ({
    lat: num(r.lat), lng: num(r.lng), count: num(r.count),
  })).filter((r) => r.lat !== null && r.lng !== null);
  rows.sort((a, b) => b.count - a.count);
  const top = rows.slice(0, limit);
  const max = top.length ? top[0].count : 1;
  return {
    data_basis: "real (incident-level FIR coordinates)",
    source: meta(),
    max_count: max,
    cells: top,
  };
}

/** Real police-unit points for the station drill-down map layer. */
function units({ limit = 600 } = {}) {
  const rows = loadCsv("fir_units").map((r) => ({
    district: r.district,
    unit: r.unit,
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    total_crimes: num(r.total_crimes),
  })).filter((r) => r.latitude !== null && r.longitude !== null && r.total_crimes);
  rows.sort((a, b) => b.total_crimes - a.total_crimes);
  return {
    data_basis: "real (FIR incident coordinates aggregated per police unit)",
    count: rows.length,
    results: rows.slice(0, limit),
  };
}

/** Real crime-group breakdown across all FIRs. */
function groups({ limit = 20 } = {}) {
  const rows = loadCsv("fir_groups").map((r) => ({
    crime_group: r.crime_group, count: num(r.count),
  }));
  rows.sort((a, b) => b.count - a.count);
  const grand = rows.reduce((a, r) => a + r.count, 0) || 1;
  return {
    data_basis: "real (FIR crime-group counts)",
    grand_total: grand,
    results: rows.slice(0, limit).map((r) => ({ ...r, share_pct: +((r.count / grand) * 100).toFixed(2) })),
  };
}

/**
 * Real per-district outcome analytics: victims, accused, arrests, charge
 * sheets, convictions + derived rates. This is genuine record-level
 * "case outcome" intelligence the aggregate review data cannot provide.
 */
function outcomes({ limit = 40 } = {}) {
  const rows = loadCsv("fir_outcomes").map((r) => {
    const incidents = num(r.incidents) || 0;
    const accused = num(r.accused) || 0;
    const arrested = num(r.arrested) || 0;
    const chargesheeted = num(r.chargesheeted) || 0;
    const convictions = num(r.convictions) || 0;
    return {
      district: r.district,
      incidents,
      victims: num(r.victims) || 0,
      female_victims: (num(r.female) || 0) + (num(r.girl) || 0),
      accused,
      arrested,
      chargesheeted,
      convictions,
      arrest_rate_pct: accused ? +((arrested / accused) * 100).toFixed(1) : null,
      conviction_rate_pct: chargesheeted ? +((convictions / chargesheeted) * 100).toFixed(1) : null,
    };
  });
  rows.sort((a, b) => b.incidents - a.incidents);
  return {
    data_basis: "real (per-FIR victim/accused/arrest/conviction counts)",
    method: "arrest_rate = arrested/accused; conviction_rate = convictions/charge-sheeted",
    results: rows.slice(0, limit),
  };
}

function summary() {
  const m = meta();
  return {
    data_basis: "real (incident-level FIR dataset)",
    source: m,
    available: !!m,
  };
}

module.exports = { hotspots, units, groups, outcomes, summary, meta };
