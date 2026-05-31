"use strict";

/**
 * Data access layer.
 *
 * Two backends, selected automatically:
 *   1. Catalyst Data Store (ZCQL) — used when the function runs on Catalyst and
 *      the tables exist. This is the production path (satisfies the Data Store
 *      requirement). Results are cached in-process per cold start.
 *   2. Bundled processed CSVs — deterministic fallback for local development,
 *      demos, and resilience if a table is missing. Same shape as the ETL
 *      output that gets imported into the Data Store.
 *
 * All analytics code calls loadTable(name) and is storage-agnostic. To use the
 * Data Store, call setRequestContext(req) at the start of each request (done in
 * index.js) so the SDK can initialise with the request scope.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");

// Logical table name -> Catalyst Data Store table name.
const TABLE_MAP = {
  districts: "Districts",
  district_crime_summary: "DistrictCrimeSummary",
  crime_heads: "CrimeHeads",
  special_crimes: "SpecialCrimes",
  crime_temporal: "CrimeTemporal",
};

let catalystSdk = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
} catch (e) {
  catalystSdk = null; // not installed in this context
}

let _req = null;            // current request (for SDK init)
let _useDataStore = false;  // toggled on once a Data Store read succeeds
const _cache = {};

/** Called per request from index.js. Enables Data Store when configured. */
function setRequestContext(req) {
  _req = req;
  // Opt-in via env so local/demo stays on CSV unless explicitly enabled.
  if (process.env.USE_DATASTORE === "true" && catalystSdk && req) {
    _useDataStore = true;
  }
}

/* ----------------------------- CSV backend ----------------------------- */

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c === "\r") {
      // ignore
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function toObjects(rows) {
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === "") continue;
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] !== undefined ? r[idx] : "").trim(); });
    out.push(obj);
  }
  return out;
}

function loadCsv(name) {
  const file = path.join(DATA_DIR, `${name}.csv`);
  const text = fs.readFileSync(file, "utf8");
  return toObjects(parseCsv(text));
}

/** Uncached CSV read — always reads from the bundled file, never the cache or
 *  Data Store. Used by the seeder so it loads source rows, not warmed data. */
function loadCsvDirect(name) {
  return loadCsv(name);
}

/* -------------------------- Data Store backend ------------------------- */

async function loadFromDataStore(name) {
  const table = TABLE_MAP[name];
  if (!table) throw new Error(`No Data Store mapping for ${name}`);
  const app = catalystSdk.initialize(_req);
  const zcql = app.zcql();
  // ZCQL returns rows namespaced by table: [{ TableName: { col: val } }]
  const rows = await zcql.executeZCQLQuery(`SELECT * FROM ${table}`);
  return rows.map((r) => r[table] || r);
}

/* ------------------------------- Public -------------------------------- */

/** Synchronous load (CSV). Used by the synchronous analytics functions. */
function loadTable(name) {
  if (_cache[name]) return _cache[name];
  const data = loadCsv(name);
  _cache[name] = data;
  return data;
}

/**
 * Async load that prefers the Data Store when enabled, falling back to CSV.
 * Warms the same cache that loadTable() reads, so a single warm-up call makes
 * subsequent synchronous analytics use Data Store data transparently.
 */
async function ensureTable(name) {
  if (_cache[name]) return _cache[name];
  if (_useDataStore) {
    try {
      const data = await loadFromDataStore(name);
      if (Array.isArray(data) && data.length) {
        _cache[name] = data;
        return data;
      }
    } catch (e) {
      // fall through to CSV on any Data Store error
      console.warn(`[store] Data Store read failed for ${name}: ${e.message}; using CSV`);
    }
  }
  return loadTable(name);
}

/** Warm all tables once per request (no-op cost after first call). */
async function warmAll() {
  await Promise.all(Object.keys(TABLE_MAP).map((n) => ensureTable(n).catch(() => {})));
}

function backendInfo() {
  return {
    backend: _useDataStore ? "datastore" : "csv",
    tables: Object.keys(TABLE_MAP),
  };
}

function loadMeta() {
  if (_cache.__meta) return _cache.__meta;
  const text = fs.readFileSync(path.join(DATA_DIR, "meta.json"), "utf8");
  _cache.__meta = JSON.parse(text);
  return _cache.__meta;
}

const num = (v) => {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

module.exports = {
  loadTable,
  loadCsvDirect,
  ensureTable,
  warmAll,
  setRequestContext,
  backendInfo,
  loadMeta,
  num,
  TABLE_MAP,
};
