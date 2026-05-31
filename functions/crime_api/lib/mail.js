"use strict";

/**
 * Transactional email via Catalyst Mail (app.email().sendMail).
 *
 * Sends a crime-intelligence alert email summarising the current emerging
 * trend spikes. Used by an admin/cron trigger so SCRB supervisors get proactive
 * notifications (challenge: "Emerging Trend Alerts").
 *
 * from_email MUST be a verified sender configured in Catalyst Mail. Set it via
 * the ALERT_FROM_EMAIL env var; recipients via ALERT_TO_EMAIL (comma list) or
 * passed in the request.
 */

let catalystSdk = null;
try { catalystSdk = require("zcatalyst-sdk-node"); } catch (e) { catalystSdk = null; }

const A = require("./analytics");

function buildAlertHtml() {
  const alerts = A.trendAlerts({ threshold: 25, minVolume: 10 }).alerts.slice(0, 10);
  const ov = A.overview();
  const rows = alerts.length
    ? alerts.map((a) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${a.category.split("(")[0].trim()}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${a.current_month}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${a.signals.join(", ")}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${a.severity}</td></tr>`).join("")
    : `<tr><td colspan="4" style="padding:8px">No categories crossed the spike threshold.</td></tr>`;
  return `
  <div style="font-family:Arial,sans-serif;color:#1a2230">
    <h2 style="color:#1b2433">Karnataka Crime Intelligence — Emerging Trend Alert</h2>
    <p style="color:#667">State total ${ov.year}: ${ov.state_totals.total.toLocaleString("en-IN")} cognizable crimes.</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px">
      <thead><tr style="background:#f2f5fa">
        <th style="text-align:left;padding:6px 8px">Category</th>
        <th style="text-align:right;padding:6px 8px">This month</th>
        <th style="text-align:left;padding:6px 8px">Signals</th>
        <th style="text-align:left;padding:6px 8px">Severity</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#889;font-size:11px;margin-top:16px">
      Automated alert from the Karnataka Crime Intelligence Platform (Zoho Catalyst).
      Source: KSP Monthly Crime Review (Public Domain).
    </p>
  </div>`;
}

async function sendAlert(req, { to } = {}) {
  if (!catalystSdk || !req) {
    const e = new Error("SDK/request unavailable"); e.code = "NO_SDK"; throw e;
  }
  const from = process.env.ALERT_FROM_EMAIL;
  const recipients = to || process.env.ALERT_TO_EMAIL;
  if (!from) { const e = new Error("ALERT_FROM_EMAIL not configured (verified sender required)"); e.code = "NO_SENDER"; throw e; }
  if (!recipients) { const e = new Error("no recipient (set ALERT_TO_EMAIL or pass 'to')"); e.code = "NO_RECIPIENT"; throw e; }

  const app = catalystSdk.initialize(req);
  const email = app.email();
  const toArr = String(recipients).split(",").map((s) => s.trim()).filter(Boolean);
  const result = await email.sendMail({
    from_email: from,
    to_email: toArr,
    subject: "Crime Intelligence Alert — Emerging Trend Spikes (Karnataka 2025)",
    content: buildAlertHtml(),
    html_mode: true,
  });
  return { sent_to: toArr, from, result_ok: true, raw: result ? true : false };
}

module.exports = { sendAlert, buildAlertHtml };
