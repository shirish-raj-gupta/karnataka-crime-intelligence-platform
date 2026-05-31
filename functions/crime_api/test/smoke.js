"use strict";
/* Quick local smoke test of the analytics + NLQ layers. Run: node test/smoke.js */

const assert = require("assert");
const A = require("../lib/analytics");
const NLQ = require("../lib/nlq");

let passed = 0;
function check(name, fn) {
  try { fn(); passed++; console.log("  PASS  " + name); }
  catch (e) { console.error("  FAIL  " + name + " :: " + e.message); process.exitCode = 1; }
}

console.log("Analytics:");
check("overview reconciles to state total", () => {
  const o = A.overview();
  assert.strictEqual(o.state_totals.ipc_bns_crimes, 138666);
  assert.strictEqual(o.state_totals.sll_crimes, 63867);
});

check("rankDistricts puts Bengaluru City first by total", () => {
  const r = A.rankDistricts({ metric: "total", limit: 5 });
  assert.strictEqual(r.results[0].district, "Bengaluru City");
  assert.ok(r.results[0].share_pct > 0);
});

check("hotspots flags at least Bengaluru City", () => {
  const h = A.hotspots({ metric: "total", z: 1.0 });
  assert.ok(h.hotspots.length >= 1);
  assert.ok(h.hotspots.some((x) => x.district === "Bengaluru City"));
});

check("category breakdown returns sorted IPC categories", () => {
  const c = A.categoryBreakdown({ lawType: "IPC", limit: 10 });
  assert.ok(c.results.length > 0);
  for (let i = 1; i < c.results.length; i++) {
    assert.ok(c.results[i - 1].count >= c.results[i].count);
  }
});

check("categoryDetail finds murder motives", () => {
  const d = A.categoryDetail({ query: "murder" });
  assert.ok(d.found);
  assert.ok(d.subtypes.length > 0);
});

check("risk scores produce bands", () => {
  const rs = A.districtRiskScores({ limit: 40 });
  assert.strictEqual(rs.results[0].risk_band, "Critical");
  assert.ok(rs.results.every((r) => r.risk_score >= 0 && r.risk_score <= 100));
});

check("vulnerable groups returns Women/Children/SC-ST", () => {
  const v = A.vulnerableGroups();
  const names = v.results.map((g) => g.victim_group);
  ["Women", "Children", "SC/ST"].forEach((g) => assert.ok(names.includes(g), "missing " + g));
});

check("trendAlerts returns scored alerts with severity", () => {
  const t = A.trendAlerts({ threshold: 25, minVolume: 10 });
  assert.ok(Array.isArray(t.alerts));
  if (t.alerts.length) {
    assert.ok(t.alerts[0].alert_score >= 0);
    assert.ok(["watch", "elevated", "high", "critical"].includes(t.alerts[0].severity));
  }
});

check("categoryTrend finds murder YoY/MoM", () => {
  const d = A.categoryTrend({ query: "murder" });
  assert.ok(d.found);
  assert.ok("yoy_pct" in d && "mom_pct" in d);
  assert.ok(Array.isArray(d.top_subtypes));
});

check("forecast produces projected_next_month", () => {
  const f = A.forecast({ limit: 5 });
  assert.ok(f.results.length > 0);
  assert.ok(f.results.every((r) => typeof r.projected_next_month === "number"));
});

const NET = require("../lib/network");
console.log("\nNetwork (synthetic):");
check("network summary reports counts", () => {
  const s = NET.summary();
  assert.strictEqual(s.data_basis, "synthetic");
  assert.ok(s.counts.offenders > 0 && s.counts.incidents > 0);
});
check("repeat offenders sorted by incident count", () => {
  const r = NET.repeatOffenders({ limit: 10 });
  assert.ok(r.results.length > 0);
  for (let i = 1; i < r.results.length; i++) {
    assert.ok(r.results[i - 1].incident_count >= r.results[i].incident_count);
  }
});
check("offender risk produces bands", () => {
  const r = NET.offenderRisk({ limit: 10 });
  assert.ok(["Critical", "High", "Moderate", "Low"].includes(r.results[0].risk_band));
});
check("graph returns nodes and edges", () => {
  const g = NET.graph({ maxNodes: 100 });
  assert.ok(g.nodes.length > 0 && g.edges.length > 0);
});
check("gangs detected with members", () => {
  const g = NET.gangs();
  assert.ok(g.results.length > 0);
  assert.ok(g.results[0].member_count > 0);
});
check("money trail ranks accounts", () => {
  const m = NET.moneyTrail({ limit: 10 });
  assert.ok(m.results.length > 0);
  assert.ok(m.results[0].suspicion >= (m.results[m.results.length - 1] || {}).suspicion);
});
check("associations returns ego network for a known offender", () => {
  const top = NET.repeatOffenders({ limit: 1 }).results[0];
  const a = NET.associations({ offenderId: top.offender_id });
  assert.ok(a.found);
  assert.ok(a.ego_network.nodes.length >= 1);
});

const SOCIO = require("../lib/socio");
console.log("\nSocio-economic:");
check("socio correlations computed for indicators", () => {
  const c = SOCIO.correlations();
  assert.ok(c.results.length >= 3);
  assert.ok(c.results.every((r) => typeof r.correlation === "number"));
});
check("socio districts have crime rate per 100k", () => {
  const d = SOCIO.districts();
  assert.ok(d.results.length > 0);
  assert.ok(d.results[0].crime_rate > 0);
});

console.log("\nNLQ:");
const qs = [
  ["state overview", "overview"],
  ["show me crime hotspots", "hotspots"],
  ["top districts by crime", "rank_districts"],
  ["how many crimes in Mysuru City", "district_lookup"],
  ["what are the motives for murder", "category_detail"],
  ["crimes against women", "vulnerable_groups"],
  ["district risk scores", "risk_scores"],
  ["top IPC categories", "category_breakdown"],
  ["emerging crime spikes this month", "trend_alerts"],
  ["forecast crime for next month", "forecast"],
  ["murder trend year over year", "category_trend"],
  ["socio-economic correlation with crime", "socio_correlation"],
];
for (const [q, expected] of qs) {
  check(`"${q}" -> ${expected}`, () => {
    const a = NLQ.answer(q);
    assert.strictEqual(a.intent, expected, `got ${a.intent}`);
    assert.ok(a.answer && a.answer.length > 0);
    assert.ok(a.evidence);
  });
}

// --- Real monthly series (12 KSP monthly files) ---
console.log("\nMonthly series (real):");
check("monthlySeries state total reconciles across 12 months", () => {
  const m = A.monthlySeries({});
  assert.ok(m.found);
  assert.strictEqual(m.series.length, 12);
  assert.ok(m.total > 150000); // ~233k state total
});
check("monthlySeries for a category returns 12 points", () => {
  const m = A.monthlySeries({ query: "theft" });
  assert.ok(m.found);
  assert.strictEqual(m.series.length, 12);
});
check("monthlyForecast returns history + forecast + trend", () => {
  const f = A.monthlyForecast({ query: "cheating", horizon: 3 });
  assert.ok(f.found);
  assert.strictEqual(f.forecast.length, 3);
  assert.ok(["rising", "falling", "stable"].includes(f.trend));
});
check("monthlyAlerts detects MoM spikes with severity", () => {
  const al = A.monthlyAlerts({ threshold: 20, minVolume: 10 });
  assert.ok(al.found);
  assert.ok(Array.isArray(al.alerts));
  if (al.alerts.length) {
    assert.ok(al.alerts[0].mom_pct >= 20);
    assert.ok(["watch", "elevated", "high", "critical"].includes(al.alerts[0].severity));
  }
});
check("NLQ monthly_trend intent uses real series", () => {
  const a = NLQ.answer("monthly trend of theft");
  assert.strictEqual(a.intent, "monthly_trend");
  assert.ok(Array.isArray(a.data.series) && a.data.series.length === 12);
});

// --- Security middleware ---
console.log("\nSecurity middleware:");
const SEC = require("../lib/security");
function mockReqRes(over = {}) {
  const headers = {}; let statusCode = 200; let ended = false; let jsonBody = null;
  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    getHeader: (k) => headers[k.toLowerCase()],
    status(c) { statusCode = c; return this; },
    json(b) { jsonBody = b; ended = true; return this; },
    end() { ended = true; return this; },
    get headersSent() { return ended; },
  };
  const req = Object.assign({ method: "GET", path: "/overview", headers: {}, ip: "1.2.3.4" }, over);
  return { req, res, getStatus: () => statusCode, getJson: () => jsonBody, getHeaders: () => headers };
}

check("requestId assigns an X-Request-Id", () => {
  const m = mockReqRes();
  let nexted = false;
  SEC.requestId()(m.req, m.res, () => { nexted = true; });
  assert.ok(nexted);
  assert.ok(m.req.id && m.getHeaders()["x-request-id"]);
});

check("securityHeaders sets nosniff + frame options", () => {
  const m = mockReqRes();
  SEC.securityHeaders()(m.req, m.res, () => {});
  assert.strictEqual(m.getHeaders()["x-content-type-options"], "nosniff");
  assert.strictEqual(m.getHeaders()["x-frame-options"], "SAMEORIGIN");
});

check("corsPolicy reflects allow-listed origin only", () => {
  process.env.ALLOWED_ORIGINS = "https://good.example";
  const allow = mockReqRes({ headers: { origin: "https://good.example" } });
  SEC.corsPolicy()(allow.req, allow.res, () => {});
  assert.strictEqual(allow.getHeaders()["access-control-allow-origin"], "https://good.example");
  const deny = mockReqRes({ headers: { origin: "https://evil.example" } });
  SEC.corsPolicy()(deny.req, deny.res, () => {});
  assert.strictEqual(deny.getHeaders()["access-control-allow-origin"], undefined);
});

check("rateLimiter blocks after the limit", () => {
  process.env.RATE_LIMIT_MAX = "3";
  process.env.RATE_LIMIT_WINDOW_MS = "60000";
  const limiter = SEC.rateLimiter();
  let blocked = false;
  for (let i = 0; i < 5; i++) {
    const m = mockReqRes({ path: "/overview", ip: "9.9.9.9" });
    let passed2 = false;
    limiter(m.req, m.res, () => { passed2 = true; });
    if (!passed2 && m.getStatus() === 429) blocked = true;
  }
  assert.ok(blocked, "limiter should return 429 after threshold");
  delete process.env.RATE_LIMIT_MAX;
});

check("errorHandler returns standard envelope with request_id", () => {
  const m = mockReqRes();
  m.req.id = "test-id";
  SEC.errorHandler()(new Error("boom"), m.req, m.res, () => {});
  assert.strictEqual(m.getStatus(), 500);
  const b = m.getJson();
  assert.strictEqual(b.ok, false);
  assert.strictEqual(b.request_id, "test-id");
});

console.log(`\n${passed} checks passed.`);
