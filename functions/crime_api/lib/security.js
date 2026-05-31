"use strict";

/**
 * Security & hardening middleware for the Crime Intelligence API.
 *
 * Provides (all dependency-free, Express-compatible):
 *   - requestId       : assigns/propagates an X-Request-Id for tracing.
 *   - securityHeaders : sensible security response headers.
 *   - corsPolicy      : origin-restricted CORS (env ALLOWED_ORIGINS), with a
 *                       safe localhost allowance for dev; reflects the request
 *                       origin only when allow-listed.
 *   - rateLimiter     : lightweight in-memory fixed-window per-IP limiter
 *                       (best-effort; API Gateway is the primary throttle).
 *   - errorHandler    : terminal Express error handler returning the standard
 *                       { ok:false, error } envelope and logging with the id.
 *
 * These complement Catalyst API Gateway (routing/throttle/auth) — they are a
 * defence-in-depth layer inside the function itself.
 */

const crypto = require("crypto");

function requestId() {
  return (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    req.id = (typeof incoming === "string" && incoming.length <= 100)
      ? incoming
      : crypto.randomBytes(8).toString("hex");
    res.setHeader("X-Request-Id", req.id);
    next();
  };
}

function securityHeaders() {
  return (req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-XSS-Protection", "0"); // modern browsers; rely on CSP/escaping
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(self), camera=()");
    next();
  };
}

/** Parse ALLOWED_ORIGINS env (comma list). Empty => same-origin only. */
function allowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || "");
}

/**
 * Origin-restricted CORS. Reflects the Origin header only when it is in the
 * allow-list (or a localhost origin in any environment, for dev tooling).
 * Same-origin requests (no Origin header) always pass. Credentials enabled.
 */
function corsPolicy() {
  const list = allowedOrigins();
  return (req, res, next) => {
    const origin = req.headers.origin;
    res.setHeader("Vary", "Origin");
    if (origin && (list.includes(origin) || isLocalOrigin(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-token, x-request-id");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.status(204).end();
    next();
  };
}

/**
 * In-memory fixed-window rate limiter. Keyed by client IP. Defaults: 120 req
 * per 60s window. Tune via RATE_LIMIT_MAX / RATE_LIMIT_WINDOW_MS. Disabled if
 * RATE_LIMIT_MAX=0. Note: per-instance (best-effort) — Catalyst API Gateway is
 * the authoritative global throttle.
 */
function rateLimiter() {
  const max = parseInt(process.env.RATE_LIMIT_MAX, 10);
  const limit = Number.isFinite(max) ? max : 120;
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000;
  const hits = new Map(); // ip -> { count, resetAt }

  // Opportunistic cleanup to bound memory.
  function sweep(now) {
    if (hits.size < 5000) return;
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }

  return (req, res, next) => {
    if (limit <= 0) return next();
    if (req.path === "/health") return next();
    const ip =
      (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
      req.ip || req.connection?.remoteAddress || "unknown";
    const now = Date.now();
    let e = hits.get(ip);
    if (!e || e.resetAt <= now) { e = { count: 0, resetAt: now + windowMs }; hits.set(ip, e); }
    e.count++;
    const remaining = Math.max(0, limit - e.count);
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(e.resetAt / 1000)));
    if (e.count > limit) {
      sweep(now);
      res.setHeader("Retry-After", String(Math.ceil((e.resetAt - now) / 1000)));
      return res.status(429).json({ ok: false, error: "rate limit exceeded; slow down" });
    }
    next();
  };
}

/** Terminal error handler — standard envelope + structured log with req id. */
function errorHandler() {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    const id = req && req.id ? req.id : "-";
    const status = err && err.status && Number.isInteger(err.status) ? err.status : 500;
    // Body-parser JSON errors surface as SyntaxError with status 400.
    const isBadJson = err && err.type === "entity.parse.failed";
    const code = isBadJson ? 400 : status;
    console.error(`[err][${id}] ${req ? req.method + " " + req.path : ""} -> ${code}: ${err && err.message}`);
    if (res.headersSent) return;
    res.status(code).json({
      ok: false,
      error: isBadJson ? "invalid JSON body" : (code === 500 ? "internal error" : (err && err.message) || "error"),
      request_id: id,
    });
  };
}

module.exports = { requestId, securityHeaders, corsPolicy, rateLimiter, errorHandler };
