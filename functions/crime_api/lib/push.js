"use strict";

/**
 * Catalyst Push Notifications — Web Push (#25).
 *
 * Server side of the high-severity trend alert: pushes a short text notification
 * to subscribed supervisor browsers via
 *   app.pushNotification().web().sendNotification(message, recipients)
 *
 * `recipients` is an array of Catalyst project-user email addresses that have
 * opted in (registered via the Web SDK `enableNotification()` on the client).
 * Recipients come from the request body or the PUSH_RECIPIENTS env var.
 *
 * The message summarises the current top emerging-trend spike so a supervisor
 * gets a one-line, actionable heads-up even when not on the dashboard.
 */

let catalystSdk = null;
try { catalystSdk = require("zcatalyst-sdk-node"); } catch (e) { catalystSdk = null; }

const A = require("./analytics");

/** Build a concise one-line alert message from the current spike analytics. */
function buildAlertMessage() {
  let top = null;
  try {
    const alerts = A.trendAlerts({ threshold: 25, minVolume: 10 }).alerts || [];
    top = alerts[0] || null;
  } catch (e) { /* fall back to generic */ }

  if (top) {
    const cat = String(top.category || "").split("(")[0].trim();
    const sig = Array.isArray(top.signals) ? top.signals.join(", ") : "";
    return `⚠ Emerging crime spike: ${cat} (${sig}). Severity: ${top.severity}. Open the dashboard for details.`;
  }
  return "Karnataka Crime Intelligence: a new emerging-trend alert is available. Open the dashboard for details.";
}

/**
 * Send a web push notification to the given recipients (or PUSH_RECIPIENTS).
 * options: { message?, to? (string|array) }
 */
async function sendWebPush(req, options = {}) {
  if (!catalystSdk || !req) { const e = new Error("SDK/request unavailable"); e.code = "NO_SDK"; throw e; }

  const message = options.message || buildAlertMessage();
  const raw = options.to || process.env.PUSH_RECIPIENTS || "";
  const recipients = Array.isArray(raw)
    ? raw
    : String(raw).split(",").map((s) => s.trim()).filter(Boolean);

  if (!recipients.length) {
    const e = new Error("no recipients (set PUSH_RECIPIENTS or pass 'to'); recipients must be opted-in project users");
    e.code = "NO_RECIPIENT";
    throw e;
  }

  const app = catalystSdk.initialize(req);
  const web = app.pushNotification().web();
  const result = await web.sendNotification(message, recipients);
  return { sent_to: recipients, message, raw: result ? true : false };
}

module.exports = { sendWebPush, buildAlertMessage };
