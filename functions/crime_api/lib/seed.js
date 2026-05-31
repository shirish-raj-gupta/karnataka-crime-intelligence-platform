"use strict";

/**
 * Data Store seeding.
 *
 * Reads the bundled processed CSVs and bulk-inserts them into the Catalyst
 * Data Store via the SDK. Runs inside the Catalyst function (no Stratus bucket
 * required), and is idempotent-ish: it can optionally clear a table first.
 *
 * Exposed through an admin endpoint in index.js so the tables can be populated
 * once after they are created in the console. Safe to re-run.
 */

let catalystSdk = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
} catch (e) {
  catalystSdk = null;
}

const { loadCsvDirect, TABLE_MAP, num } = require("./store");

// Which logical tables to seed and how to coerce numeric columns.
const NUMERIC_COLS = {
  district_crime_summary: ["ipc_bns_crimes", "sll_crimes", "year"],
  crime_heads: ["category_seq", "count", "year"],
  special_crimes: ["count", "year"],
  crime_temporal: ["ytd", "same_month_prev_year", "prev_month", "current_month",
                   "yoy_change", "mom_change"],
  districts: [],
};

function coerceRow(logicalName, row) {
  const out = {};
  const numCols = NUMERIC_COLS[logicalName] || [];
  for (const [k, v] of Object.entries(row)) {
    if (numCols.includes(k)) {
      const n = num(v);
      out[k] = n === null ? 0 : n;
    } else {
      out[k] = v === undefined || v === null ? "" : String(v);
    }
  }
  return out;
}

/** Insert rows in batches (Data Store bulk insert caps ~200/call). */
async function insertAll(datastore, tableName, rows) {
  const table = datastore.table(tableName);
  let inserted = 0;
  const BATCH = 25; // Data Store insertRows cap
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    // insertRows accepts an array of row objects
    await table.insertRows(chunk);
    inserted += chunk.length;
  }
  return inserted;
}

/** Delete all rows from a Data Store table (in batches). Returns count deleted. */
async function clearTable(app, tableName) {
  const zcql = app.zcql();
  let deleted = 0;
  // ZCQL DELETE clears all rows; do it in a loop until empty in case of caps.
  for (let i = 0; i < 100; i++) {
    const rows = await zcql.executeZCQLQuery(`SELECT ROWID FROM ${tableName} LIMIT 200`);
    if (!rows || rows.length === 0) break;
    const ids = rows.map((r) => (r[tableName] || r).ROWID).filter(Boolean);
    if (ids.length === 0) break;
    const table = app.datastore().table(tableName);
    for (const id of ids) {
      // deleteRow accepts a row id
      // eslint-disable-next-line no-await-in-loop
      await table.deleteRow(id);
      deleted++;
    }
  }
  return deleted;
}

/**
 * Seed one or all logical tables. Returns a per-table report.
 * options: { only?: string[], clear?: boolean }
 */
async function seed(req, options = {}) {
  if (!catalystSdk || !req) {
    const e = new Error("SDK/request unavailable");
    e.code = "NO_SDK";
    throw e;
  }
  const app = catalystSdk.initialize(req);
  const datastore = app.datastore();
  const report = {};

  const logicalNames = options.only && options.only.length
    ? options.only
    : Object.keys(TABLE_MAP);

  for (const logical of logicalNames) {
    const tableName = TABLE_MAP[logical];
    if (!tableName) { report[logical] = { error: "no table mapping" }; continue; }
    try {
      let cleared = 0;
      if (options.clear) {
        cleared = await clearTable(app, tableName);
      }
      const rows = loadCsvDirect(logical).map((r) => coerceRow(logical, r));
      const inserted = await insertAll(datastore, tableName, rows);
      report[logical] = { table: tableName, inserted, cleared };
    } catch (e) {
      report[logical] = { table: tableName, error: e.message };
    }
  }
  return report;
}

/** Count rows currently in each Data Store table (verification). */
async function counts(req) {
  if (!catalystSdk || !req) {
    const e = new Error("SDK/request unavailable");
    e.code = "NO_SDK";
    throw e;
  }
  const app = catalystSdk.initialize(req);
  const zcql = app.zcql();
  const out = {};
  for (const [logical, table] of Object.entries(TABLE_MAP)) {
    try {
      const rows = await zcql.executeZCQLQuery(`SELECT COUNT(ROWID) FROM ${table}`);
      out[logical] = { table, rows };
    } catch (e) {
      out[logical] = { table, error: e.message };
    }
  }
  return out;
}

module.exports = { seed, counts };
