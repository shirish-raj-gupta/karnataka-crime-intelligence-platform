"use strict";

/**
 * Response caching for expensive aggregate endpoints.
 *
 * Uses Catalyst Cache (app.cache().getSegment().put/get) when running on
 * Catalyst, with an in-process LRU-ish fallback for local dev. Values are JSON
 * strings with a TTL. Caching read-only aggregates (overview, rankings,
 * hotspots) cuts repeated compute and demonstrates the Catalyst Cache service.
 */

let catalystSdk = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
} catch (e) {
  catalystSdk = null;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const _mem = new Map(); // key -> { value, expires }

function _memGet(key) {
  const hit = _mem.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) { _mem.delete(key); return null; }
  return hit.value;
}

function _memPut(key, value, ttlMs) {
  if (_mem.size > 200) _mem.clear(); // crude bound
  _mem.set(key, { value, expires: Date.now() + ttlMs });
}

/**
 * Get-or-compute. Tries Catalyst Cache first (when req provided), then the
 * in-memory fallback, otherwise computes via producerFn and stores the result.
 */
async function remember(req, key, ttlMs, producerFn) {
  ttlMs = ttlMs || DEFAULT_TTL_MS;

  // In-process cache (fast path, also covers local dev).
  const local = _memGet(key);
  if (local !== null) return { value: local, cached: "memory" };

  // Catalyst Cache (shared across instances) when available.
  let cacheSeg = null;
  if (catalystSdk && req && process.env.USE_CACHE === "true") {
    try {
      const app = catalystSdk.initialize(req);
      cacheSeg = app.cache().segment();
      const item = await cacheSeg.getValue(key);
      if (item) {
        const parsed = JSON.parse(item);
        _memPut(key, parsed, ttlMs);
        return { value: parsed, cached: "catalyst" };
      }
    } catch (e) {
      cacheSeg = null; // fall through to compute
    }
  }

  const value = await producerFn();
  _memPut(key, value, ttlMs);
  if (cacheSeg) {
    try {
      // Catalyst Cache TTL is in hours; use a minimum of 1.
      const ttlHours = Math.max(1, Math.round(ttlMs / 3600000));
      await cacheSeg.put(key, JSON.stringify(value), ttlHours);
    } catch (e) { /* non-fatal */ }
  }
  return { value, cached: "miss" };
}

function clearLocal() { _mem.clear(); }

module.exports = { remember, clearLocal };
