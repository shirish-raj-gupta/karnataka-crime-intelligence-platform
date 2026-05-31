"use strict";

/**
 * Audit logging to Catalyst NoSQL.
 *
 * Serves the challenge's governance requirement ("Secure handling of sensitive
 * data with audit logs and traceability"). Every data/report request can be
 * logged as a NoSQL item: who (user), what (path), when (timestamp), from where
 * (ip), and the role. NoSQL is the right store for high-write, semi-structured
 * append-only logs.
 *
 * Requires a NoSQL table named "AuditLog" with a partition key "log_id" (String)
 * and (optionally) a sort key "ts" (String). Enabled via AUDIT_ENABLED=true so
 * it stays off until the table exists.
 *
 * Best-effort: logging never blocks or fails the request.
 */

let catalystSdk = null;
let NoSQLItem = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
  NoSQLItem = require("zcatalyst-sdk-node/lib/no-sql").NoSQLItem;
} catch (e) { catalystSdk = null; }

const TABLE = "AuditLog";

function enabled() {
  return process.env.AUDIT_ENABLED === "true" && !!catalystSdk;
}

function newId() {
  return "LOG-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/**
 * Record an audit entry. Fire-and-forget; swallows all errors.
 * entry: { path, method, user, role, ip, status }
 */
function record(req, entry) {
  if (!enabled() || !req) return;
  // Don't await — never delay the response on audit writes.
  (async () => {
    try {
      const app = catalystSdk.initialize(req);
      const nosql = app.nosql();
      const table = nosql.table(TABLE);
      const plain = {
        log_id: newId(),
        ts: new Date().toISOString(),
        path: String(entry.path || ""),
        method: String(entry.method || ""),
        user: String(entry.user || "anonymous"),
        role: String(entry.role || "unknown"),
        ip: String(entry.ip || ""),
        status: Number(entry.status != null ? entry.status : 0),
      };
      const item = NoSQLItem ? NoSQLItem.from(plain) : plain;
      await table.insertItems({ item });
    } catch (e) {
      // best-effort: log to console only
      console.warn("[audit] write skipped:", e.message);
    }
  })();
}

/** Express middleware: logs each request. Awaits the write BEFORE the response
 *  completes, because serverless instances freeze after res.finish and would
 *  drop a fire-and-forget write. Kept fast and best-effort. */
function middleware() {
  return async (req, res, next) => {
    if (!enabled()) return next();
    try {
      const user = (req.catalystUser && (req.catalystUser.email_id || req.catalystUser.user_id)) || "anonymous";
      const role = (req.catalystUser && req.catalystUser.role_details && req.catalystUser.role_details.role_name) || "unknown";
      await writeEntry(req, {
        path: req.originalUrl || req.path,
        method: req.method,
        user,
        role,
        ip: req.headers["x-forwarded-for"] || req.ip || "",
        status: 0, // pre-response; status not yet known
      });
    } catch (e) { /* best-effort */ }
    next();
  };
}

/** Await-able single write used by the middleware. */
async function writeEntry(req, entry) {
  if (!enabled() || !req || !NoSQLItem) return;
  const app = catalystSdk.initialize(req);
  const table = app.nosql().table(TABLE);
  const item = NoSQLItem.from({
    log_id: newId(),
    ts: new Date().toISOString(),
    path: String(entry.path || ""),
    method: String(entry.method || ""),
    user: String(entry.user || "anonymous"),
    role: String(entry.role || "unknown"),
    ip: String(entry.ip || ""),
    status: Number(entry.status != null ? entry.status : 0),
  });
  await table.insertItems({ item });
}

/** Read recent audit entries (for an admin view). */
async function recent(req, { limit = 50 } = {}) {
  if (!catalystSdk || !req) { const e = new Error("SDK unavailable"); e.code = "NO_SDK"; throw e; }
  const app = catalystSdk.initialize(req);
  const zcql = app.zcql();
  // AuditLog lives in NoSQL; ZCQL is Data Store only. So read via NoSQL query.
  const nosql = app.nosql();
  const table = nosql.table(TABLE);
  const resp = await table.queryTable({ key_condition: undefined, limit });
  return resp;
}

module.exports = { record, middleware, recent, enabled };
