"use strict";

/**
 * Criminal network & offender-profiling analytics.
 *
 * IMPORTANT: operates on SYNTHETIC, clearly-labelled demo data (offenders /
 * incidents / financial links do not exist in the public KSP aggregate data).
 * The synthetic records are statistically grounded in the real district and
 * crime distributions so the analytics are realistic. Every response carries
 * data_basis = "synthetic".
 *
 * Implements (pure JS, no deps):
 *  - repeat-offender ranking (incident counts + recency + cross-jurisdiction)
 *  - offender risk profiling (composite score)
 *  - network graph (nodes/edges) for visualization
 *  - degree centrality + key-player identification
 *  - organized-group (gang) detection & summary
 *  - money-trail tracing (shared/ flagged financial accounts)
 *  - association lookup for a given offender (ego network)
 */

const { loadTable, num } = require("./store");

const DATA_BASIS = "synthetic";

function offenders() { return loadTable("network_offenders"); }
function incidents() { return loadTable("network_incidents"); }
function accounts() { return loadTable("network_accounts"); }
function links() { return loadTable("network_links"); }

/* --------------------------- helpers --------------------------- */
function incidentsByOffender() {
  const map = new Map();
  for (const inc of incidents()) {
    const id = inc.offender_id;
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(inc);
  }
  return map;
}

function offenderIndex() {
  const idx = new Map();
  for (const o of offenders()) idx.set(o.offender_id, o);
  return idx;
}

/* ---------------------- repeat offenders ----------------------- */
function repeatOffenders({ limit = 15 } = {}) {
  const byOff = incidentsByOffender();
  const idx = offenderIndex();
  const rows = [];
  for (const [oid, incs] of byOff.entries()) {
    const o = idx.get(oid);
    if (!o) continue;
    const districts = new Set(incs.map((i) => i.district));
    const mos = new Set(incs.map((i) => i.modus_operandi));
    rows.push({
      offender_id: oid,
      name: o.name,
      home_district: o.home_district,
      gang_id: o.gang_id || null,
      incident_count: incs.length,
      jurisdictions: districts.size,
      distinct_mo: mos.size,
      crime_types: [...new Set(incs.map((i) => i.crime_type))],
    });
  }
  rows.sort((a, b) => b.incident_count - a.incident_count || b.jurisdictions - a.jurisdictions);
  return { data_basis: DATA_BASIS, results: rows.slice(0, limit) };
}

/* --------------------- offender risk score --------------------- */
function offenderRisk({ limit = 20 } = {}) {
  const byOff = incidentsByOffender();
  const idx = offenderIndex();
  const degree = degreeMap();
  const rows = [];
  for (const o of offenders()) {
    const incs = byOff.get(o.offender_id) || [];
    const jurisdictions = new Set(incs.map((i) => i.district)).size;
    const distinctMo = new Set(incs.map((i) => i.modus_operandi)).size;
    const conn = degree.get(o.offender_id) || 0;
    // Composite, transparent: volume + spread + versatility + connectivity + gang.
    const score =
      incs.length * 5 +
      jurisdictions * 8 +
      distinctMo * 6 +
      conn * 3 +
      (o.gang_id ? 15 : 0);
    let band = "Low";
    if (score >= 90) band = "Critical";
    else if (score >= 55) band = "High";
    else if (score >= 25) band = "Moderate";
    rows.push({
      offender_id: o.offender_id,
      name: o.name,
      home_district: o.home_district,
      gang_id: o.gang_id || null,
      incidents: incs.length,
      jurisdictions,
      distinct_mo: distinctMo,
      connections: conn,
      risk_score: score,
      risk_band: band,
    });
  }
  rows.sort((a, b) => b.risk_score - a.risk_score);
  return {
    data_basis: DATA_BASIS,
    method:
      "composite: 5*incidents + 8*jurisdictions + 6*distinct_MO + 3*connections + 15 if gang member",
    results: rows.slice(0, limit),
  };
}

/* ------------------------- graph / degree ---------------------- */
function degreeMap() {
  const deg = new Map();
  for (const l of links()) {
    if (l.relation === "co_offender" || l.relation === "associate") {
      deg.set(l.source, (deg.get(l.source) || 0) + 1);
      deg.set(l.target, (deg.get(l.target) || 0) + 1);
    }
  }
  return deg;
}

/**
 * Build a graph for visualization. Optionally filter to a gang or an offender's
 * ego network. Returns nodes (offenders + accounts) and edges.
 */
function graph({ gang = null, offenderId = null, maxNodes = 150 } = {}) {
  const idx = offenderIndex();
  const accIdx = new Map(accounts().map((a) => [a.account_id, a]));
  const allLinks = links();

  let keepNodes = null; // null = all
  if (offenderId) {
    keepNodes = new Set([offenderId]);
    for (const l of allLinks) {
      if (l.source === offenderId) keepNodes.add(l.target);
      if (l.target === offenderId) keepNodes.add(l.source);
    }
  } else if (gang) {
    keepNodes = new Set(
      offenders().filter((o) => o.gang_id === gang).map((o) => o.offender_id)
    );
    // include accounts linked to those members
    for (const l of allLinks) {
      if (keepNodes.has(l.source) && l.target.startsWith("SYN-ACC")) keepNodes.add(l.target);
    }
  }

  const deg = degreeMap();
  const nodes = [];
  const edges = [];
  const nodeSet = new Set();

  function addNode(id) {
    if (nodeSet.has(id)) return;
    if (keepNodes && !keepNodes.has(id)) return;
    if (nodes.length >= maxNodes) return;
    nodeSet.add(id);
    if (id.startsWith("SYN-ACC")) {
      const a = accIdx.get(id);
      nodes.push({ id, type: "account", label: a ? `${a.bank}` : id, flagged: a ? a.flagged === "true" : false });
    } else {
      const o = idx.get(id);
      nodes.push({
        id, type: "offender",
        label: o ? o.name : id,
        gang_id: o ? o.gang_id || null : null,
        district: o ? o.home_district : null,
        degree: deg.get(id) || 0,
      });
    }
  }

  for (const l of allLinks) {
    if (keepNodes && !(keepNodes.has(l.source) && keepNodes.has(l.target))) continue;
    addNode(l.source);
    addNode(l.target);
    if (nodeSet.has(l.source) && nodeSet.has(l.target)) {
      edges.push({ source: l.source, target: l.target, relation: l.relation, weight: num(l.weight) || 1 });
    }
  }

  return { data_basis: DATA_BASIS, nodes, edges, node_count: nodes.length, edge_count: edges.length };
}

/* ---------------------- key players --------------------------- */
function keyPlayers({ limit = 10 } = {}) {
  const deg = degreeMap();
  const idx = offenderIndex();
  const rows = [...deg.entries()]
    .map(([id, d]) => {
      const o = idx.get(id);
      return o ? { offender_id: id, name: o.name, gang_id: o.gang_id || null, connections: d } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.connections - a.connections);
  return {
    data_basis: DATA_BASIS,
    method: "degree centrality over co-offender/associate links",
    results: rows.slice(0, limit),
  };
}

/* ------------------- organized groups (gangs) ------------------ */
function gangs() {
  const byOff = incidentsByOffender();
  const groups = {};
  for (const o of offenders()) {
    if (!o.gang_id) continue;
    const g = o.gang_id;
    groups[g] = groups[g] || { gang_id: g, members: [], incidents: 0, districts: new Set(), mos: new Set() };
    groups[g].members.push({ offender_id: o.offender_id, name: o.name });
    const incs = byOff.get(o.offender_id) || [];
    groups[g].incidents += incs.length;
    incs.forEach((i) => { groups[g].districts.add(i.district); groups[g].mos.add(i.modus_operandi); });
  }
  // flagged accounts shared within gang => money-pooling signal
  const acctLinks = links().filter((l) => l.relation === "uses_account" || l.relation === "controls_account");
  const memberToGang = {};
  for (const g of Object.values(groups)) g.members.forEach((m) => (memberToGang[m.offender_id] = g.gang_id));
  const gangAccounts = {};
  for (const l of acctLinks) {
    const g = memberToGang[l.source];
    if (!g) continue;
    gangAccounts[g] = gangAccounts[g] || new Set();
    gangAccounts[g].add(l.target);
  }
  const out = Object.values(groups).map((g) => ({
    gang_id: g.gang_id,
    member_count: g.members.length,
    total_incidents: g.incidents,
    jurisdictions: g.districts.size,
    distinct_mo: g.mos.size,
    shared_accounts: gangAccounts[g.gang_id] ? gangAccounts[g.gang_id].size : 0,
    members: g.members,
  }));
  out.sort((a, b) => b.total_incidents - a.total_incidents);
  return { data_basis: DATA_BASIS, results: out };
}

/* ---------------------- money trail --------------------------- */
function moneyTrail({ limit = 20 } = {}) {
  const accIdx = new Map(accounts().map((a) => [a.account_id, a]));
  const idx = offenderIndex();
  const acctLinks = links().filter((l) => l.target.startsWith("SYN-ACC"));
  const byAcct = new Map();
  for (const l of acctLinks) {
    if (!byAcct.has(l.target)) byAcct.set(l.target, []);
    byAcct.get(l.target).push(l.source);
  }
  const rows = [];
  for (const [acc, srcs] of byAcct.entries()) {
    const a = accIdx.get(acc);
    const uniqueOff = [...new Set(srcs)];
    rows.push({
      account_id: acc,
      bank: a ? a.bank : null,
      flagged: a ? a.flagged === "true" : false,
      linked_offenders: uniqueOff.length,
      offenders: uniqueOff.slice(0, 8).map((id) => (idx.get(id) ? idx.get(id).name : id)),
      suspicion: (a && a.flagged === "true" ? 50 : 0) + uniqueOff.length * 10,
    });
  }
  rows.sort((a, b) => b.suspicion - a.suspicion);
  return {
    data_basis: DATA_BASIS,
    method: "accounts ranked by flagged status + number of linked offenders (shared-account = money-pooling signal)",
    results: rows.slice(0, limit),
  };
}

/* --------------------- ego network lookup --------------------- */
function associations({ offenderId }) {
  const idx = offenderIndex();
  const o = idx.get(offenderId);
  if (!o) return { data_basis: DATA_BASIS, found: false, offender_id: offenderId };
  const g = graph({ offenderId, maxNodes: 60 });
  const byOff = incidentsByOffender();
  const incs = byOff.get(offenderId) || [];
  return {
    data_basis: DATA_BASIS,
    found: true,
    offender: {
      offender_id: o.offender_id, name: o.name, age: num(o.age), gender: o.gender,
      home_district: o.home_district, gang_id: o.gang_id || null,
      primary_mo: o.primary_mo, mo_tags: o.mo_tags.split("|"),
      incident_count: incs.length,
    },
    ego_network: g,
  };
}

function summary() {
  return {
    data_basis: DATA_BASIS,
    note: "Synthetic record-level data (grounded in real district/crime distributions). Demonstrates the network/profiling capability that the public aggregate dataset cannot support.",
    counts: {
      offenders: offenders().length,
      incidents: incidents().length,
      accounts: accounts().length,
      links: links().length,
      gangs: gangs().results.length,
    },
  };
}

module.exports = {
  repeatOffenders, offenderRisk, graph, keyPlayers, gangs,
  moneyTrail, associations, summary,
};
