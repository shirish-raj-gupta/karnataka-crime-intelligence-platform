"use strict";

/**
 * Crime Intelligence & Analytics API
 * Catalyst Advanced I/O function (Node.js + Express).
 *
 * Routes (all under the function base path /server/crime_api):
 *   GET  /health                 - liveness + data provenance
 *   GET  /overview               - state snapshot for dashboards
 *   GET  /districts              - district reference (with geo centroids)
 *   GET  /districts/rank         - ranked districts (?metric=&order=&limit=)
 *   GET  /hotspots               - statistical hotspots (?metric=&z=)
 *   GET  /risk-scores            - district composite risk index
 *   GET  /categories             - crime-head breakdown (?lawType=IPC|SLL|ALL)
 *   GET  /categories/detail      - sub-type drill-down (?query=murder)
 *   GET  /vulnerable             - crimes vs Women/Children/SC-ST (?group=)
 *   POST /ask                    - natural-language query { question }
 *
 * Security note: this function is intended to sit behind Catalyst API Gateway
 * (routing + throttling + auth) and Catalyst Authentication for role-based
 * access. CORS is permissive here for local development only.
 */

const express = require("express");
const cors = require("cors");

const A = require("./lib/analytics");
const NLQ = require("./lib/nlq");
const LLM = require("./lib/llm");
const { loadMeta, setRequestContext, warmAll, backendInfo } = require("./lib/store");
const CACHE = require("./lib/cache");
const SEC = require("./lib/security");

const app = express();

// --- Hardening middleware (defence-in-depth inside the function) ----------
app.disable("x-powered-by");
app.use(SEC.requestId());
app.use(SEC.securityHeaders());
// Origin-restricted CORS (env ALLOWED_ORIGINS; localhost always allowed in dev).
// Falls back to permissive only if explicitly opted in via CORS_OPEN=true.
app.use(process.env.CORS_OPEN === "true" ? cors() : SEC.corsPolicy());
// Cap JSON body size to limit abuse (overridable via MAX_BODY).
app.use(express.json({ limit: process.env.MAX_BODY || "256kb" }));
// Best-effort per-IP rate limiting (API Gateway is the authoritative throttle).
app.use(SEC.rateLimiter());

const ok = (res, payload) => res.status(200).json({ ok: true, ...payload });
const fail = (res, code, msg) => res.status(code).json({ ok: false, error: msg });

const router = express.Router();

// Per-request: set the SDK context and (when Data Store is enabled) warm the
// table cache so the synchronous analytics layer reads Data Store data.
router.use(async (req, res, next) => {
  try {
    setRequestContext(req);
    await warmAll();
  } catch (e) {
    // never block a request on warm-up; analytics falls back to CSV
  }
  next();
});

// Optional auth enforcement + audit. When ENFORCE_AUTH=true, requests to data
// endpoints must come from an authenticated Catalyst user. Admin endpoints have
// their own token check and are exempt here. Health stays public for probes.
const catalystSdkForAuth = (() => { try { return require("zcatalyst-sdk-node"); } catch (e) { return null; } })();

async function currentUser(req) {
  if (!catalystSdkForAuth) return null;
  try {
    const app = catalystSdkForAuth.initialize(req);
    const userMgmt = app.userManagement();
    const res = await userMgmt.getCurrentUser();
    return res || null;
  } catch (e) {
    return null;
  }
}

router.use(async (req, res, next) => {
  // Public + self-protected paths bypass enforcement.
  const open = req.path === "/health" || req.path.startsWith("/admin/");
  if (open || process.env.ENFORCE_AUTH !== "true") return next();
  const user = await currentUser(req);
  if (!user) return fail(res, 401, "authentication required");
  req.catalystUser = user; // available for audit logging
  next();
});

// Audit logging to NoSQL (governance: audit logs & traceability). Best-effort,
// enabled via AUDIT_ENABLED=true once the AuditLog NoSQL table exists.
const AUDIT = require("./lib/audit");
router.use(AUDIT.middleware());

router.get("/health", (req, res) => {
  const meta = loadMeta();
  ok(res, { status: "healthy", data: meta, backend: backendInfo() });
});

router.get("/overview", async (req, res) => {
  try {
    const { value, cached } = await CACHE.remember(req, "overview", null, async () => A.overview());
    res.setHeader("X-Cache", cached);
    ok(res, { result: value });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/districts", (req, res) => {
  try { ok(res, { result: A.districts() }); }
  catch (e) { fail(res, 500, e.message); }
});

router.get("/districts/rank", (req, res) => {
  try {
    const metric = req.query.metric || "total";
    const order = req.query.order || "desc";
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    ok(res, { result: A.rankDistricts({ metric, order, limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/hotspots", async (req, res) => {
  try {
    const metric = req.query.metric || "total";
    const z = parseFloat(req.query.z) || 1.0;
    const { value, cached } = await CACHE.remember(req, `hotspots:${metric}:${z}`, null, async () => A.hotspots({ metric, z }));
    res.setHeader("X-Cache", cached);
    ok(res, { result: value });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/risk-scores", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 100);
    ok(res, { result: A.districtRiskScores({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/categories", (req, res) => {
  try {
    const lawType = (req.query.lawType || "IPC").toUpperCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 200);
    ok(res, { result: A.categoryBreakdown({ lawType, limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/categories/detail", (req, res) => {
  try {
    const query = req.query.query || "";
    if (!query) return fail(res, 400, "query parameter required");
    ok(res, { result: A.categoryDetail({ query }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/vulnerable", (req, res) => {
  try {
    const group = req.query.group || null;
    ok(res, { result: A.vulnerableGroups(group ? { group } : {}) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/trends/alerts", (req, res) => {
  try {
    const section = req.query.section || null;
    const threshold = parseFloat(req.query.threshold) || 25;
    const minVolume = parseInt(req.query.minVolume, 10) || 10;
    ok(res, { result: A.trendAlerts({ section, threshold, minVolume }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/trends/category", (req, res) => {
  try {
    const query = req.query.query || "";
    if (!query) return fail(res, 400, "query parameter required");
    ok(res, { result: A.categoryTrend({ query }) });
  } catch (e) { fail(res, 500, e.message); }
});

router.get("/forecast", (req, res) => {
  try {
    const section = req.query.section || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 100);
    ok(res, { result: A.forecast({ section, limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

// Real 12-month series from the KSP monthly review files (#A — real monthly data).
router.get("/monthly/series", (req, res) => {
  try {
    ok(res, { result: A.monthlySeries({ query: req.query.query || null, lawType: req.query.lawType || null }) });
  } catch (e) { fail(res, 500, e.message); }
});

// 3-month linear-trend forecast on the real monthly series.
router.get("/monthly/forecast", (req, res) => {
  try {
    const horizon = parseInt(req.query.horizon, 10) || 3;
    ok(res, { result: A.monthlyForecast({ query: req.query.query || null, lawType: req.query.lawType || null, horizon }) });
  } catch (e) { fail(res, 500, e.message); }
});

// Emerging-spike alerts from the REAL monthly series (latest vs previous month).
router.get("/monthly/alerts", (req, res) => {
  try {
    const lawType = req.query.lawType || null;
    const threshold = parseFloat(req.query.threshold) || 20;
    const minVolume = parseInt(req.query.minVolume, 10) || 10;
    ok(res, { result: A.monthlyAlerts({ lawType, threshold, minVolume }) });
  } catch (e) { fail(res, 500, e.message); }
});

// Anomaly detection — behavioural-deviation call-outs (#3 anomaly detection).
// Spatial (district z-score) + temporal (category vs its own 12-month baseline).
router.get("/anomalies", async (req, res) => {
  try {
    const z = parseFloat(req.query.z) || 1.5;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const { value, cached } = await CACHE.remember(req, `anomalies:${z}:${limit}`, null, async () => A.anomalies({ z, limit }));
    res.setHeader("X-Cache", cached);
    ok(res, { result: value });
  } catch (e) { fail(res, 500, e.message); }
});

// --- Criminal network & offender profiling (SYNTHETIC demo data) ----------
const NET = require("./lib/network");

router.get("/network/summary", (req, res) => {
  try { ok(res, { result: NET.summary() }); } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/repeat-offenders", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 100);
    ok(res, { result: NET.repeatOffenders({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/risk", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    ok(res, { result: NET.offenderRisk({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/graph", (req, res) => {
  try {
    const gang = req.query.gang || null;
    const offenderId = req.query.offender || null;
    const maxNodes = Math.min(parseInt(req.query.maxNodes, 10) || 150, 400);
    ok(res, { result: NET.graph({ gang, offenderId, maxNodes }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/key-players", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    ok(res, { result: NET.keyPlayers({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/gangs", (req, res) => {
  try { ok(res, { result: NET.gangs() }); } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/money-trail", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    ok(res, { result: NET.moneyTrail({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/network/associations", (req, res) => {
  try {
    const offenderId = req.query.offender;
    if (!offenderId) return fail(res, 400, "offender query param required");
    ok(res, { result: NET.associations({ offenderId }) });
  } catch (e) { fail(res, 500, e.message); }
});

// --- Socio-economic correlation (real Census 2011 x KSP crime) ------------
const SOCIO = require("./lib/socio");

router.get("/socio/correlations", (req, res) => {
  try { ok(res, { result: SOCIO.correlations() }); } catch (e) { fail(res, 500, e.message); }
});
router.get("/socio/districts", (req, res) => {
  try {
    const sortBy = req.query.sortBy || "crime_rate";
    ok(res, { result: SOCIO.districts({ sortBy }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/socio/risk-factors", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
    ok(res, { result: SOCIO.riskFactors({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

// --- ML model: crime-risk classifier (kNN; QuickML/Zia AutoML companion) ---
const ML = require("./lib/mlmodel");

router.get("/ml/score-districts", (req, res) => {
  try { ok(res, { result: ML.scoreAllDistricts() }); } catch (e) { fail(res, 500, e.message); }
});
router.post("/ml/predict", (req, res) => {
  try {
    const b = req.body || {};
    const features = [
      Number(b.population), Number(b.literacy_pct), Number(b.urban_pct), Number(b.density),
    ];
    if (features.some((x) => !Number.isFinite(x))) {
      return fail(res, 400, "provide numeric population, literacy_pct, urban_pct, density");
    }
    const k = Math.min(Math.max(parseInt(b.k, 10) || 5, 1), 15);
    ok(res, { result: ML.predict(features, { k }) });
  } catch (e) { fail(res, 500, e.message); }
});

// Zia AutoML-backed prediction (#13). Uses hosted Zia model when configured,
// else falls back to the in-function k-NN classifier.
router.post("/ml/predict-automl", async (req, res) => {
  try {
    const b = req.body || {};
    const features = [
      Number(b.population), Number(b.literacy_pct), Number(b.urban_pct), Number(b.density),
    ];
    if (features.some((x) => !Number.isFinite(x))) {
      return fail(res, 400, "provide numeric population, literacy_pct, urban_pct, density");
    }
    ok(res, { result: await ML.predictZiaAutoML(req, features) });
  } catch (e) { fail(res, 500, e.message); }
});

// --- Police-station drill-down + spatiotemporal clusters (synthetic) -------
const STATIONS = require("./lib/stations");

router.get("/stations/summary", (req, res) => {
  try { ok(res, { result: STATIONS.summary() }); } catch (e) { fail(res, 500, e.message); }
});
router.get("/stations", (req, res) => {
  try {
    if (req.query.district || req.query.districtId) {
      return ok(res, { result: STATIONS.byDistrict({ district: req.query.district, districtId: req.query.districtId }) });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
    ok(res, { result: STATIONS.allStations({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/stations/hourly", (req, res) => {
  try {
    ok(res, { result: STATIONS.hourlyProfile({ district: req.query.district || null }) });
  } catch (e) { fail(res, 500, e.message); }
});
router.get("/stations/spatiotemporal", (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 15, 100);
    ok(res, { result: STATIONS.spatiotemporalClusters({ limit }) });
  } catch (e) { fail(res, 500, e.message); }
});

// --- Zia Services: text analytics on case notes + OCR (#14) ---------------
const ZIA = require("./lib/zia");

router.post("/zia/analyze-notes", async (req, res) => {
  try {
    const text = (req.body && req.body.text) || "";
    if (!text || text.trim().length < 5) return fail(res, 400, "provide 'text' (case notes) of at least 5 chars");
    const result = await ZIA.analyzeText(req, text);
    ok(res, { result });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

router.post("/zia/ocr", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.image_base64) return fail(res, 400, "provide 'image_base64'");
    const result = await ZIA.ocrBase64(req, b.image_base64, b.ext || "png");
    ok(res, { result });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

// --- Catalyst Search: full-text search across Data Store tables (#10) ------
const SEARCH = require("./lib/search");

router.get("/search", async (req, res) => {
  try {
    const q = req.query.q || req.query.query || "";
    if (!q || String(q).trim().length < 2) {
      return fail(res, 400, "provide ?q= search term (min 2 chars)");
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const result = await SEARCH.search(req, q, { start: 1, end: limit });
    ok(res, { result });
  } catch (e) {
    fail(res, e.code === "EMPTY" ? 400 : 500, e.message);
  }
});

// --- Translation via Catalyst QuickML LLM (#15 — translation) -------------
router.post("/translate", async (req, res) => {
  try {
    const b = req.body || {};
    const text = b.text || "";
    const target = (b.target || "kn").toLowerCase();
    if (!text || text.trim().length < 1) return fail(res, 400, "provide 'text'");
    const translated = await LLM.translate(req, { text, target });
    if (translated === null) return fail(res, 503, "translation unavailable (LLM disabled or failed)");
    ok(res, { result: { target, translated, source: "Catalyst QuickML LLM (Qwen 2.5)" } });
  } catch (e) {
    fail(res, 500, e.message);
  }
});

router.post("/ask", async (req, res) => {
  try {
    const question = (req.body && req.body.question) || req.query.question;
    if (!question) return fail(res, 400, "question required in body or query");
    const lang = (req.body && req.body.lang) || req.query.lang || "en";

    // 1. Deterministic retrieval: grounded data + a baseline answer.
    const result = NLQ.answer(question);

    // 2. Optional LLM generation grounded in the retrieved data (RAG-style).
    if (LLM.enabled() && result.intent !== "unknown") {
      const llmText = await LLM.generate(req, {
        question,
        context: { intent: result.intent, answer: result.answer, data: result.data, evidence: result.evidence },
        lang,
      });
      if (llmText) {
        result.answer_llm = llmText;       // natural-language, model-generated
        result.llm_model = "qwen2.5-14b-instruct";
      }
    }
    ok(res, { result });
  } catch (e) { fail(res, 500, e.message); }
});

// SmartBrowz-powered PDF reports. Falls back to HTML if SmartBrowz is not
// available (e.g. local dev), so the endpoint always returns something useful.
const REPORT = require("./lib/report");
const SEED = require("./lib/seed");

// --- Admin: Data Store seeding (one-time after tables are created) ---------
// Protected by a token. Set ADMIN_TOKEN as a function env var; the request must
// pass ?token= or header x-admin-token matching it.
function adminAuthorized(req) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return false; // disabled unless explicitly configured
  const got = req.headers["x-admin-token"] || req.query.token;
  return got === expected;
}

router.post("/admin/seed", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    const only = req.body && Array.isArray(req.body.only) ? req.body.only : undefined;
    const clear = !!(req.body && req.body.clear);
    const report = await SEED.seed(req, { only, clear });
    ok(res, { result: report });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

// Admin: backfill the Var Char search-index mirror columns (_s) from the
// original Text columns. Run once after creating the indexed columns in the
// Data Store console. Idempotent. (#10 Catalyst Search)
router.post("/admin/search-backfill", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    const only = req.body && Array.isArray(req.body.only) ? req.body.only : undefined;
    const report = await SEARCH.backfillMirrors(req, { only });
    ok(res, { result: report });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

router.get("/admin/counts", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    ok(res, { result: await SEED.counts(req) });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

// Admin: NoSQL audit write diagnostic — performs one write and returns the
// raw outcome/error so audit issues can be pinpointed.
router.get("/admin/audit-test", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  const out = { enabled: AUDIT.enabled() };
  try {
    const catalyst = require("zcatalyst-sdk-node");
    const { NoSQLItem } = require("zcatalyst-sdk-node/lib/no-sql");
    out.hasNoSQLItem = !!NoSQLItem;
    const app = catalyst.initialize(req);
    const nosql = app.nosql();
    out.hasNosql = !!nosql;
    const table = nosql.table("AuditLog");
    const plain = {
      log_id: "TEST-" + Date.now(),
      ts: new Date().toISOString(),
      path: "/admin/audit-test", method: "GET",
      user: "admin-test", role: "test", ip: "0.0.0.0", status: 200,
    };
    const item = NoSQLItem ? NoSQLItem.from(plain) : plain;
    const result = await table.insertItems({ item });
    out.write_ok = true;
    out.result_type = Object.prototype.toString.call(result);
    // Read back the exact row we just wrote, using a key condition on log_id.
    try {
      const nosqlMod = require("zcatalyst-sdk-node/lib/no-sql");
      const fetched = await table.queryTable({
        key_condition: {
          attribute: "log_id",
          operator: nosqlMod.NoSQLOperator ? nosqlMod.NoSQLOperator.EQUALS : "equals",
          value: nosqlMod.NoSQLMarshall ? nosqlMod.NoSQLMarshall.makeString(plain.log_id) : plain.log_id,
        },
        limit: 1,
      });
      out.query_ok = true;
      out.row_count = fetched && fetched.get ? fetched.get.length : 0;
      out.row_found = out.row_count > 0;
    } catch (qe) {
      out.query_error = qe.message;
    }
  } catch (e) {
    out.error = e.message;
    out.stack = (e.stack || "").split("\n").slice(0, 3).join(" | ");
  }
  ok(res, { result: out });
});

// Admin: Stratus write diagnostic — archives a tiny test object to the bucket.
router.get("/admin/stratus-test", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  const out = { bucket: process.env.STRATUS_BUCKET || null };
  try {
    const buf = Buffer.from("%PDF-1.4 stratus test " + new Date().toISOString());
    // Inline the Stratus call here so we can surface the real error.
    const catalyst = require("zcatalyst-sdk-node");
    const app = catalyst.initialize(req);
    const stratus = app.stratus();
    out.has_stratus = !!stratus;
    const bucket = stratus.bucket(process.env.STRATUS_BUCKET);
    out.has_bucket = !!bucket;
    const key = `reports/test/${Date.now()}-stratus-test.pdf`;
    const putRes = await bucket.putObject(key, buf, { overwrite: true });
    out.archived_key = key;
    out.archived = true;
    out.put_res_type = Object.prototype.toString.call(putRes);
  } catch (e) {
    out.error = e.message;
    out.stack = (e.stack || "").split("\n").slice(0, 3).join(" | ");
  }
  ok(res, { result: out });
});

// Admin: LLM diagnostic — runs one grounded generation and returns the output.
router.get("/admin/llm-test", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  const out = { enabled: LLM.enabled() };
  try {
    const q = req.query.q || "Which districts have the highest crime in Karnataka?";
    const base = NLQ.answer(q);
    const t0 = Date.now();
    const text = await LLM.generate(req, { question: q, context: { intent: base.intent, data: base.data }, lang: req.query.lang || "en" });
    out.ms = Date.now() - t0;
    out.intent = base.intent;
    out.llm_answer = text;
    out.fell_back = text === null;
  } catch (e) {
    out.error = e.message;
    out.stack = (e.stack || "").split("\n").slice(0, 3).join(" | ");
  }
  ok(res, { result: out });
});
// so it can't be used as a spam vector. Recipients from body.to or ALERT_TO_EMAIL.
const MAIL = require("./lib/mail");
router.post("/admin/send-alert", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    const to = req.body && req.body.to ? req.body.to : null;
    const result = await MAIL.sendAlert(req, { to });
    ok(res, { result });
  } catch (e) {
    const code = e.code === "NO_SENDER" || e.code === "NO_RECIPIENT" ? 400 : (e.code === "NO_SDK" ? 503 : 500);
    fail(res, code, e.message);
  }
});

// Web Push notification (#25). Pushes a one-line emerging-trend alert to opted-in
// supervisor browsers. Recipients from body.to or PUSH_RECIPIENTS env var.
const PUSH = require("./lib/push");
router.post("/admin/send-push", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    const to = req.body && req.body.to ? req.body.to : null;
    const message = req.body && req.body.message ? req.body.message : null;
    const result = await PUSH.sendWebPush(req, { to, message });
    ok(res, { result });
  } catch (e) {
    const code = e.code === "NO_RECIPIENT" ? 400 : (e.code === "NO_SDK" ? 503 : 500);
    fail(res, code, e.message);
  }
});

// Admin: insert one throwaway row into CrimeHeads to fire the Signals "Row
// Insert" event (#21), then delete it so the table stays clean. Returns the
// inserted/deleted ROWID so we can correlate with Signals logs.
router.post("/admin/trigger-event", async (req, res) => {
  if (!adminAuthorized(req)) return fail(res, 403, "forbidden");
  try {
    const catalyst = require("zcatalyst-sdk-node");
    const app = catalyst.initialize(req);
    const table = app.datastore().table("CrimeHeads");
    const marker = "SIGNALS-TEST-" + Date.now();
    const inserted = await table.insertRow({
      law_type: "TEST", category_seq: 0, source_sl: marker,
      category: marker, row_type: "signal_test", subtype: "event trigger",
      count: 0, year: 2025,
    });
    const rowid = inserted && (inserted.ROWID || inserted.rowid);
    let deleted = false;
    if (rowid) {
      // brief delay so the insert event is emitted before we remove the row
      await new Promise((r) => setTimeout(r, 1500));
      try { deleted = await table.deleteRow(rowid); } catch (e) { /* leave note */ }
    }
    ok(res, { result: { triggered: "CrimeHeads row_inserted", rowid, marker, cleaned_up: !!deleted } });
  } catch (e) {
    fail(res, e.code === "NO_SDK" ? 503 : 500, e.message);
  }
});

router.get("/report/intelligence", async (req, res) => {
  try {
    const { buffer, filename } = await REPORT.generatePdf({ type: "intelligence", req });
    // Best-effort archival to Stratus object storage.
    const key = await REPORT.archiveToStratus(req, buffer, filename);
    if (key) res.setHeader("X-Archived-Key", key);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (e) {
    if (e.code === "NO_SDK") {
      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(REPORT.intelligenceHtml());
    }
    return fail(res, 500, e.message);
  }
});

router.post("/report/conversation", async (req, res) => {
  try {
    const messages = (req.body && req.body.messages) || [];
    const { buffer, filename } = await REPORT.generatePdf({ type: "conversation", messages, req });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  } catch (e) {
    if (e.code === "NO_SDK") {
      const messages = (req.body && req.body.messages) || [];
      res.setHeader("Content-Type", "text/html");
      return res.status(200).send(REPORT.conversationHtml(messages));
    }
    return fail(res, 500, e.message);
  }
});

// Catalyst serves Advanced I/O functions under /server/<function_name>.
app.use("/server/crime_api", router);
// Also mount at root so the function works under local `catalyst serve`.
app.use("/", router);

// 404 for any unmatched route (consistent envelope).
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "not found", path: req.path, request_id: req.id });
});

// Terminal error handler — standard { ok:false, error, request_id } envelope.
app.use(SEC.errorHandler());

module.exports = app;
