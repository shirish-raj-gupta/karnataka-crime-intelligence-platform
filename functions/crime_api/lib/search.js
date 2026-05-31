"use strict";

/**
 * Catalyst Search integration (#10 — full-text search within the Data Store).
 *
 * Catalyst maintains a full-text index over columns you mark as "searchable" in
 * the Data Store console. This module fronts `app.search().executeSearchQuery`
 * to give the platform a single unified search box over the crime catalogue:
 *   - CrimeHeads      (category, subtype)         -> IPC/SLL crime-head catalogue
 *   - Districts       (district, range_name)      -> jurisdiction lookup
 *   - SpecialCrimes   (victim_group, crime_type)  -> vulnerable-group offences
 *
 * If the Catalyst Search index is unavailable (local dev, or indexing not yet
 * enabled on the tables) it degrades gracefully to a substring scan over the
 * same columns of the bundled/processed tables, so the feature always returns
 * results and never hard-fails the app.
 */

const STORE = require("./store");

let catalystSdk = null;
try { catalystSdk = require("zcatalyst-sdk-node"); } catch (e) { catalystSdk = null; }

// Columns exposed to search, per Data Store table. These are Var Char mirror
// columns (suffix _s) that carry the Search Index constraint — Catalyst does
// NOT allow the Search Index on Text columns, so the real searchable values
// live in these mirrors, backfilled from the original Text columns.
const SEARCH_COLUMNS = {
  CrimeHeads: ["category_s", "subtype_s"],
  Districts: ["district_s", "range_name_s"],
  SpecialCrimes: ["victim_group_s", "crime_type_s"],
};

// Mirror map: Data Store table -> { sourceTextColumn: searchVarCharColumn }.
// Used by the backfill to copy Text values into the indexed Var Char columns.
const MIRROR_COLUMNS = {
  CrimeHeads: { category: "category_s", subtype: "subtype_s" },
  Districts: { district: "district_s", range_name: "range_name_s" },
  SpecialCrimes: { victim_group: "victim_group_s", crime_type: "crime_type_s" },
};

// Map Data Store table name -> logical CSV table name (for the fallback path).
const LOGICAL = {
  CrimeHeads: "crime_heads",
  Districts: "districts",
  SpecialCrimes: "special_crimes",
};

function available() {
  return !!catalystSdk && process.env.USE_DATASTORE === "true";
}

/**
 * Run a Catalyst full-text search across the indexed crime tables.
 * Returns { source: "catalyst_search" | "local", query, total, groups: {table: [rows]} }.
 */
async function search(req, query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) { const e = new Error("empty search query"); e.code = "EMPTY"; throw e; }

  const end = Number(opts.end) || 50;

  if (available() && req) {
    try {
      const app = catalystSdk.initialize(req);
      // Catalyst Search matches indexed columns. Append a trailing wildcard so
      // partial terms match (e.g. "murd" -> "murder"). Matches the documented
      // { search, search_table_columns } config exactly.
      const term = /[*?]/.test(q) ? q : q + "*";
      const searchObj = {
        search: term,
        search_table_columns: SEARCH_COLUMNS,
      };
      const data = await app.search().executeSearchQuery(searchObj);
      const shaped = normalizeCatalyst(data, end);
      // If the Search Index constraint isn't enabled on the columns yet, Catalyst
      // returns 0 hits. Fall back to the local scan so the feature still works,
      // and flag that indexing needs enabling.
      if (shaped.total === 0) {
        return { source: "local", query: q, note: "catalyst_search returned 0 (enable Search Index constraint on columns)", ...localScan(q, end) };
      }
      return { source: "catalyst_search", query: q, ...shaped };
    } catch (e) {
      // fall through to local scan
      return { source: "local", query: q, note: "catalyst_search_unavailable: " + e.message, ...localScan(q, end) };
    }
  }
  return { source: "local", query: q, ...localScan(q, end) };
}

/** Shape the Catalyst Search response into { total, groups }. Maps the Var Char
 *  mirror columns (_s) back to their original names for a consistent UI shape. */
function normalizeCatalyst(data, limit) {
  const groups = {};
  let total = 0;
  // Catalyst returns one key per table, each an array of row objects.
  for (const table of Object.keys(data || {})) {
    let rows = Array.isArray(data[table]) ? data[table] : [];
    if (!rows.length) continue;
    if (limit) rows = rows.slice(0, limit);
    const mirror = MIRROR_COLUMNS[table] || {};
    groups[table] = rows.map((r) => {
      const row = r[table] || r; // unwrap {Table: {...}} envelopes
      // Surface original column names from the _s mirrors so the UI is uniform.
      for (const [src, dst] of Object.entries(mirror)) {
        if (row[dst] !== undefined && row[src] === undefined) row[src] = row[dst];
      }
      return row;
    });
    total += groups[table].length;
  }
  return { total, groups };
}

/** Substring fallback over the source columns of the bundled tables. */
function localScan(query, limit) {
  const needle = query.toLowerCase();
  const groups = {};
  let total = 0;
  for (const table of Object.keys(MIRROR_COLUMNS)) {
    const cols = Object.keys(MIRROR_COLUMNS[table]); // original source columns
    let rows = [];
    try { rows = STORE.loadTable(LOGICAL[table]) || []; } catch (e) { rows = []; }
    const hits = [];
    for (const row of rows) {
      const hit = cols.some((c) => String(row[c] || "").toLowerCase().includes(needle));
      if (hit) hits.push(row);
      if (hits.length >= limit) break;
    }
    if (hits.length) { groups[table] = hits; total += hits.length; }
  }
  return { total, groups };
}

/**
 * Backfill the Var Char mirror columns (_s) from the original Text columns, so
 * the Search Index has data to index. Idempotent: only writes rows whose mirror
 * value differs from the source. Returns a per-table report.
 *
 * Requires the mirror columns to already exist (created in the console as Var
 * Char with the Search Index constraint enabled).
 */
async function backfillMirrors(req, opts = {}) {
  if (!catalystSdk || !req) { const e = new Error("SDK/request unavailable"); e.code = "NO_SDK"; throw e; }
  const app = catalystSdk.initialize(req);
  const datastore = app.datastore();
  const only = opts.only && opts.only.length ? opts.only : Object.keys(MIRROR_COLUMNS);
  const report = {};

  for (const tableName of only) {
    const mirror = MIRROR_COLUMNS[tableName];
    if (!mirror) { report[tableName] = { error: "no mirror mapping" }; continue; }
    try {
      const table = datastore.table(tableName);
      const updates = [];
      // Iterate every row; build a PATCH payload {ROWID, <mirror cols>}.
      for await (const row of table.getIterableRows()) {
        const r = row[tableName] || row;
        const rowid = r.ROWID;
        if (!rowid) continue;
        const patch = { ROWID: rowid };
        let changed = false;
        for (const [src, dst] of Object.entries(mirror)) {
          const val = (r[src] === undefined || r[src] === null) ? "" : String(r[src]).slice(0, 255);
          if (String(r[dst] || "") !== val) { patch[dst] = val; changed = true; }
        }
        if (changed) updates.push(patch);
      }
      // updateRows in batches of 25.
      let updated = 0;
      const BATCH = 25;
      for (let i = 0; i < updates.length; i += BATCH) {
        await table.updateRows(updates.slice(i, i + BATCH));
        updated += Math.min(BATCH, updates.length - i);
      }
      report[tableName] = { mirrored: Object.values(mirror), rows_updated: updated };
    } catch (e) {
      report[tableName] = { error: e.message };
    }
  }
  return report;
}

module.exports = { search, available, backfillMirrors, SEARCH_COLUMNS, MIRROR_COLUMNS };
