"use strict";

/**
 * Karnataka Crime Open-Data API — Catalyst AppSail service (#2/#3).
 *
 * A standalone Node.js (managed-runtime) microservice, deployed on Catalyst
 * AppSail — separate from the Advanced I/O `crime_api` function. It exposes a
 * lightweight, public, read-only OPEN DATA API over the headline KSP 2025
 * figures (district IPC/SLL totals), suitable for third-party / civic-tech
 * consumers and as the "full web app in a managed runtime" capability.
 *
 * Zero external dependencies (Node core http only) so the managed runtime
 * starts instantly and the deploy is bulletproof. Data is bundled as JSON.
 *
 * Routes:
 *   GET /              -> service banner + route list
 *   GET /health        -> liveness
 *   GET /api/state     -> state totals (IPC + SLL)
 *   GET /api/districts -> all districts with totals (optional ?sort=&limit=)
 *   GET /api/districts/:id -> one district by id (e.g. D01) or name
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT || 3000;

// Load bundled data once at startup.
let DISTRICTS = [];
try {
  const raw = fs.readFileSync(path.join(__dirname, "data", "district_totals.json"), "utf8");
  DISTRICTS = JSON.parse(raw);
} catch (e) {
  console.error("[appsail] failed to load district data:", e.message);
}

const STATE = DISTRICTS.find((d) => d.district_id === "STATE") || null;
const REAL_DISTRICTS = DISTRICTS.filter((d) => d.district_id !== "STATE");

function json(res, code, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "public, max-age=300",
  });
  res.end(body);
}

function withTotals(d) {
  const ipc = Number(d.ipc_bns_crimes) || 0;
  const sll = Number(d.sll_crimes) || 0;
  return { ...d, ipc_bns_crimes: ipc, sll_crimes: sll, total: ipc + sll };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const parts = url.pathname.split("/").filter(Boolean);

  // GET / — banner
  if (url.pathname === "/" || url.pathname === "") {
    return json(res, 200, {
      service: "Karnataka Crime Open-Data API",
      runtime: "Catalyst AppSail (Node.js managed runtime)",
      year: STATE ? STATE.year : 2025,
      source: "KSP Monthly Crime Review 2025 (Public Domain)",
      routes: ["/health", "/api/state", "/api/districts", "/api/districts/:id"],
      district_count: REAL_DISTRICTS.length,
    });
  }

  if (url.pathname === "/health") {
    return json(res, 200, { status: "healthy", districts_loaded: REAL_DISTRICTS.length });
  }

  if (url.pathname === "/api/state") {
    if (!STATE) return json(res, 503, { error: "state totals unavailable" });
    return json(res, 200, { result: withTotals(STATE) });
  }

  if (url.pathname === "/api/districts") {
    const sort = url.searchParams.get("sort") || "total";
    const limit = Math.min(parseInt(url.searchParams.get("limit"), 10) || 50, 50);
    let rows = REAL_DISTRICTS.map(withTotals);
    rows.sort((a, b) => (b[sort] || 0) - (a[sort] || 0));
    return json(res, 200, { count: rows.length, result: rows.slice(0, limit) });
  }

  if (parts[0] === "api" && parts[1] === "districts" && parts[2]) {
    const key = decodeURIComponent(parts[2]).toLowerCase();
    const d = REAL_DISTRICTS.find(
      (x) => x.district_id.toLowerCase() === key || String(x.district).toLowerCase() === key
    );
    if (!d) return json(res, 404, { error: "district not found", hint: "use id like D01 or a district name" });
    return json(res, 200, { result: withTotals(d) });
  }

  json(res, 404, { error: "not found", path: url.pathname });
});

server.listen(PORT, () => {
  console.log(`[appsail] Karnataka Crime Open-Data API listening on ${PORT}`);
});
