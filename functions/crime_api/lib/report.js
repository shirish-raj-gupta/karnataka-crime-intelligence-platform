"use strict";

/**
 * Server-side PDF report generation via Catalyst SmartBrowz.
 *
 * Inside an Advanced I/O function the SmartBrowz SDK (app.smartbrowz()) is
 * authenticated with the project scope — no API key in code. If a key is ever
 * needed for an out-of-project call, it is read from process.env.SMARTBROWZ_API_KEY
 * (set as a function environment variable in the console), never hardcoded.
 *
 * Two report types:
 *   - "intelligence"  : a state crime intelligence briefing (overview, top
 *                       districts, hotspots, trend alerts)
 *   - "conversation"  : a transcript of a chat session passed from the client
 */

let catalystSdk = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
} catch (e) {
  catalystSdk = null;
}

const A = require("./analytics");
const { loadMeta } = require("./store");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

const num = (n) => (n == null ? "–" : Number(n).toLocaleString("en-IN"));

/** Collect a Node readable stream into a single Buffer. */
function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

const BASE_CSS = `
  * { font-family: Arial, Helvetica, sans-serif; }
  body { color: #1a2230; margin: 32px; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #1b2433; }
  .sub { color: #667; font-size: 12px; margin: 0 0 18px; }
  h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #4f9cff; padding-bottom: 4px; color: #1b2433; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #dde3ec; }
  th { background: #f2f5fa; color: #445; }
  .kpis { display: flex; gap: 12px; margin: 10px 0; }
  .kpi { flex: 1; border: 1px solid #dde3ec; border-radius: 8px; padding: 10px; }
  .kpi .v { font-size: 20px; font-weight: 700; color: #1b2433; }
  .kpi .l { font-size: 10px; color: #667; }
  .right { text-align: right; }
  .footer { margin-top: 24px; font-size: 10px; color: #889; border-top: 1px solid #dde3ec; padding-top: 8px; }
  .sev-critical { color: #d11; font-weight: 700; }
  .sev-high { color: #c80; font-weight: 700; }
`;

function intelligenceHtml() {
  const ov = A.overview();
  const top = A.rankDistricts({ metric: "total", limit: 10 }).results;
  const hot = A.hotspots({ metric: "total", z: 1.0 }).hotspots.slice(0, 8);
  const alerts = A.trendAlerts({ threshold: 25, minVolume: 10 }).alerts.slice(0, 10);
  const meta = loadMeta();
  const now = new Date().toLocaleString("en-IN");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <h1>Karnataka Crime Intelligence Briefing</h1>
    <p class="sub">State Crime Records Bureau · ${esc(ov.year)} · Generated ${esc(now)}</p>

    <div class="kpis">
      <div class="kpi"><div class="v">${num(ov.state_totals.total)}</div><div class="l">Total cognizable crimes</div></div>
      <div class="kpi"><div class="v">${num(ov.state_totals.ipc_bns_crimes)}</div><div class="l">IPC / BNS</div></div>
      <div class="kpi"><div class="v">${num(ov.state_totals.sll_crimes)}</div><div class="l">Special Local Laws</div></div>
      <div class="kpi"><div class="v">${num(ov.districts_count)}</div><div class="l">Districts / units</div></div>
    </div>

    <h2>Top districts by total crime</h2>
    <table><thead><tr><th>#</th><th>District</th><th>Range</th><th class="right">IPC/BNS</th><th class="right">SLL</th><th class="right">Total</th></tr></thead><tbody>
    ${top.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.district)}</td><td>${esc(r.range_name)}</td><td class="right">${num(r.ipc_bns_crimes)}</td><td class="right">${num(r.sll_crimes)}</td><td class="right">${num(r.total)}</td></tr>`).join("")}
    </tbody></table>

    <h2>Crime hotspots (statistical outliers)</h2>
    <table><thead><tr><th>District</th><th class="right">Total</th><th class="right">Z-score</th></tr></thead><tbody>
    ${hot.map((r) => `<tr><td>${esc(r.district)}</td><td class="right">${num(r.value)}</td><td class="right">${esc(r.z_score)}</td></tr>`).join("")}
    </tbody></table>

    <h2>Emerging trend alerts (current month vs previous month / last year)</h2>
    <table><thead><tr><th>Category</th><th class="right">This month</th><th>Signals</th><th>Severity</th></tr></thead><tbody>
    ${alerts.length ? alerts.map((a) => `<tr><td>${esc(a.category.split("(")[0].trim())}</td><td class="right">${num(a.current_month)}</td><td>${esc(a.signals.join(", "))}</td><td class="sev-${esc(a.severity)}">${esc(a.severity)}</td></tr>`).join("") : `<tr><td colspan="4">No categories crossed the spike threshold.</td></tr>`}
    </tbody></table>

    <div class="footer">Source: ${esc(meta.source)} (${esc(meta.license)}). Aggregate statistical data — no incident-level / PII. Generated by Karnataka Crime Intelligence Platform on Zoho Catalyst (SmartBrowz).</div>
  </body></html>`;
}

function conversationHtml(messages) {
  const now = new Date().toLocaleString("en-IN");
  const rows = (messages || []).map((m) => {
    const who = m.role === "user" ? "Investigator" : "Assistant";
    const ev = m.evidence ? `<div style="font-size:10px;color:#889;margin-top:3px">Evidence: ${esc(JSON.stringify(m.evidence))}</div>` : "";
    return `<div style="margin:10px 0"><b style="color:${m.role === "user" ? "#1e5ac8" : "#4a4a4a"}">${who}:</b><div>${esc(m.text)}</div>${ev}</div>`;
  }).join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>
    <h1>Crime Intelligence — Conversation Log</h1>
    <p class="sub">Generated ${esc(now)} · Source: KSP Monthly Crime Review (Public Domain)</p>
    ${rows || "<p>No conversation content.</p>"}
    <div class="footer">Generated by Karnataka Crime Intelligence Platform on Zoho Catalyst (SmartBrowz).</div>
  </body></html>`;
}

/**
 * Generate a PDF buffer using SmartBrowz. Returns { buffer, filename }.
 * Throws if SmartBrowz isn't available (caller falls back to sending HTML).
 */
async function generatePdf({ type = "intelligence", messages = [], req }) {
  if (!catalystSdk || !req) {
    const e = new Error("SmartBrowz SDK unavailable in this context");
    e.code = "NO_SDK";
    throw e;
  }
  const html = type === "conversation" ? conversationHtml(messages) : intelligenceHtml();
  let app;
  try {
    app = catalystSdk.initialize(req);
  } catch (initErr) {
    const e = new Error("SmartBrowz init failed: " + initErr.message);
    e.code = "NO_SDK";
    throw e;
  }
  const smartbrowz = app.smartbrowz();
  let data;
  try {
    // Use the minimal option shape proven to work via the diagnostic call.
    data = await smartbrowz.convertToPdf(html, { pdf_options: { scale: 1.0 } });
  } catch (err) {
    console.error("[report] convertToPdf rejected:", err && err.message);
    const e = new Error("SmartBrowz unavailable: " + (err && err.message));
    e.code = "NO_SDK";
    throw e;
  }

  // convertToPdf resolves with a Node readable stream (IncomingMessage) in
  // SDK 3.x. Collect it into a Buffer. Also handle Buffer/base64 just in case.
  let buffer;
  if (Buffer.isBuffer(data)) {
    buffer = data;
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data);
  } else if (data && (typeof data.pipe === "function" || data._readableState)) {
    buffer = await streamToBuffer(data);
  } else if (data && data.data) {
    buffer = Buffer.isBuffer(data.data) ? data.data : Buffer.from(data.data);
  } else if (typeof data === "string") {
    buffer = Buffer.from(data, "base64");
  } else {
    buffer = Buffer.from(data);
  }
  if (!buffer || buffer.length === 0) {
    const e = new Error("SmartBrowz returned empty PDF");
    e.code = "NO_SDK";
    throw e;
  }
  const filename = type === "conversation"
    ? "crime-intelligence-conversation.pdf"
    : "karnataka-crime-intelligence-briefing.pdf";
  return { buffer, filename };
}

module.exports = { generatePdf, intelligenceHtml, conversationHtml, diagnose, archiveToStratus };

/**
 * Archive a generated PDF buffer to Catalyst Stratus (object storage).
 * Best-effort; enabled via STRATUS_BUCKET env var pointing at an existing bucket.
 * Returns the object key on success, or null if archival is not configured.
 */
async function archiveToStratus(req, buffer, filename) {
  const bucketName = process.env.STRATUS_BUCKET;
  if (!bucketName || !catalystSdk || !req) return null;
  try {
    const app = catalystSdk.initialize(req);
    const stratus = app.stratus();
    const bucket = stratus.bucket(bucketName);
    const key = `reports/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${filename}`;
    await bucket.putObject(key, buffer, { overwrite: true });
    return key;
  } catch (e) {
    console.warn("[report] Stratus archive skipped:", e.message);
    return null;
  }
}

/**
 * Diagnostic helper: attempts a tiny SmartBrowz PDF and reports the raw result
 * shape or error, so we can tell whether the component is provisioned.
 */
async function diagnose(req) {
  const info = { sdk: !!catalystSdk, hasReq: !!req };
  if (!catalystSdk || !req) {
    info.error = "no sdk/req";
    return info;
  }
  let app;
  try {
    app = catalystSdk.initialize(req);
    info.initialized = true;
  } catch (e) {
    info.error = "init: " + e.message;
    return info;
  }
  try {
    const sb = app.smartbrowz();
    info.hasSmartbrowz = typeof sb.convertToPdf === "function";
    const data = await Promise.race([
      sb.convertToPdf("<h1>diag</h1>", { pdf_options: { scale: 1.0 } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout 12s")), 12000)),
    ]);
    info.resultType = Object.prototype.toString.call(data);
    info.isBuffer = Buffer.isBuffer(data);
    info.isStream = !!(data && (typeof data.pipe === "function" || data._readableState));
    if (info.isStream) {
      const buf = await streamToBuffer(data);
      info.streamBytes = buf.length;
      info.firstBytes = buf.slice(0, 8).toString("ascii");
    } else {
      info.length = data && data.length;
    }
  } catch (e) {
    info.smartbrowzError = e.message;
    info.errorDetail = e.response && e.response.data ? e.response.data : (e.toString ? e.toString().slice(0, 300) : undefined);
  }
  return info;
}
