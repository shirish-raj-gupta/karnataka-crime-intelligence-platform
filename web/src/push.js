// Crime-intelligence alerts — client side (#25).
//
// Two delivery paths, chosen automatically:
//  1. Catalyst Web Push (native) — used when a real Catalyst user session exists.
//     Registers via window.catalyst.notification.enableNotification() and the
//     server pushes through app.pushNotification().web().sendNotification().
//  2. Live in-app alerter (demo/public mode) — Catalyst push registration needs
//     an authenticated user, which the login-bypass demo does not have. So we
//     fall back to the browser Notification API driven by the platform's own
//     live spike analytics (/trends/alerts), polled periodically. This delivers
//     real, data-backed alerts to any visitor with zero login.

import { api } from "./api";

function sdk() {
  return typeof window !== "undefined" ? window.catalyst : undefined;
}

export function notificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function catalystPushAvailable() {
  return !!(sdk() && sdk().notification && notificationSupported());
}

// Track what we've already alerted on so we don't repeat every poll.
const _seen = new Set();
let _pollTimer = null;

/** Request browser notification permission. Returns true if granted. */
async function ensurePermission() {
  if (!notificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  try {
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch (e) {
    return false;
  }
}

/** Show a notification (browser Notification API, with in-page toast fallback). */
function notify(title, body) {
  try {
    if (notificationSupported() && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/app/favicon.ico" });
      return;
    }
  } catch (e) { /* fall through to toast */ }
  showToast(`${title}: ${body}`);
}

/**
 * Enable alerts. Tries Catalyst native push first; on failure (demo/no session)
 * starts the live in-app alerter. Returns { ok, mode } | { ok:false, reason }.
 */
export async function enablePush() {
  const granted = await ensurePermission();
  if (!granted) return { ok: false, reason: "Browser notification permission denied. Allow notifications and retry." };

  // Try Catalyst native web push when the SDK + a user session are present.
  if (catalystPushAvailable()) {
    try {
      await sdk().notification.enableNotification();
      sdk().notification.messageHandler = (msg) => {
        const text = typeof msg === "string" ? msg : (msg && (msg.message || msg.text)) || "New crime-intelligence alert";
        notify("Karnataka Crime Intelligence", text);
      };
      return { ok: true, mode: "catalyst" };
    } catch (e) {
      // Demo/public mode: no authenticated user → registration 401s. Fall back.
    }
  }

  // Fallback: live in-app alerter driven by real spike analytics.
  await startLiveAlerter({ firstRun: true });
  return { ok: true, mode: "live" };
}

/**
 * Poll the platform's emerging-trend analytics and raise a browser notification
 * for high-severity spikes. Runs immediately, then every 90s.
 */
async function startLiveAlerter({ firstRun = false } = {}) {
  if (_pollTimer) clearInterval(_pollTimer);

  const run = async (announceQuiet) => {
    try {
      const data = await api.trendAlerts(null, 25, 10);
      const alerts = (data && data.alerts) ? data.alerts : [];
      const high = alerts.filter((a) => a.severity === "high" || a.severity === "critical");
      const fresh = high.filter((a) => !_seen.has(a.category));
      if (fresh.length) {
        fresh.slice(0, 3).forEach((a) => {
          _seen.add(a.category);
          const cat = String(a.category || "").split("(")[0].trim();
          const sig = Array.isArray(a.signals) ? a.signals.join(", ") : "";
          notify("⚠ Emerging crime spike", `${cat} — ${sig} (severity: ${a.severity}).`);
        });
      } else if (announceQuiet) {
        const top = alerts[0];
        if (top) {
          const cat = String(top.category || "").split("(")[0].trim();
          notify("🔔 Alerts enabled", `Monitoring ${alerts.length} active trend signals. Top: ${cat}.`);
        } else {
          notify("🔔 Alerts enabled", "You will be notified of emerging crime spikes.");
        }
      }
    } catch (e) { /* network hiccup — try again next interval */ }
  };

  await run(firstRun);          // immediate
  _pollTimer = setInterval(() => run(false), 90000); // then every 90s
}

export function stopLiveAlerter() {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
}

// Minimal in-page toast fallback (used if the Notification constructor is blocked).
function showToast(text) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "push-toast";
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => { el.classList.add("show"); }, 50);
  setTimeout(() => { el.classList.remove("show"); }, 8000);
  setTimeout(() => { el.remove(); }, 8400);
}
