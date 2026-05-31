// Wrapper around the Catalyst Web SDK (v4) for Embedded Authentication + RBAC.
//
// On a Catalyst-hosted origin, window.catalyst is provided by catalystWebSDK.js
// and /__catalyst/sdk/init.js. Locally (Vite dev) the SDK is absent, so we run
// in a "dev bypass" mode that treats the user as a signed-in Analyst, keeping
// the app fully usable for development without a login server.

function sdk() {
  return typeof window !== "undefined" ? window.catalyst : undefined;
}

// DEMO MODE: when true, the app shows a lightweight credential login screen
// (no Catalyst Hosted Login needed) so reviewers can sign in with the demo
// accounts below and experience real role-based access. The backend runs with
// ENFORCE_AUTH=false so data still loads. All real Catalyst auth code stays
// intact — set DEMO_MODE = false (and ENFORCE_AUTH="true" on the function) to
// restore Hosted Login + server-side RBAC enforcement.
export const DEMO_MODE = true;

// Demo accounts (client-side only, for judging). Each maps to an RBAC role.
export const DEMO_ACCOUNTS = [
  { username: "supervisor", password: "scrb@2025", first_name: "SCRB", last_name: "Supervisor", role: "Supervisor" },
  { username: "analyst", password: "analyst@2025", first_name: "Crime", last_name: "Analyst", role: "Analyst" },
  { username: "investigator", password: "invest@2025", first_name: "Field", last_name: "Investigator", role: "Investigator" },
  { username: "policymaker", password: "policy@2025", first_name: "Policy", last_name: "Maker", role: "Policymaker" },
];

const DEMO_SESSION_KEY = "kci_demo_session";

function loadDemoSession() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DEMO_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

/**
 * Attempt a demo credential login. Returns { ok, user } | { ok:false, error }.
 * Persists the session for the tab so a refresh keeps the user signed in.
 */
export function demoLogin(username, password) {
  const u = (username || "").trim().toLowerCase();
  const acct = DEMO_ACCOUNTS.find((a) => a.username === u && a.password === password);
  if (!acct) return { ok: false, error: "Invalid username or password." };
  const user = {
    first_name: acct.first_name,
    last_name: acct.last_name,
    email_id: `${acct.username}@scrb.demo`,
    role_details: { role_name: acct.role },
    __demo: true,
  };
  try { window.sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user)); } catch (e) { /* noop */ }
  return { ok: true, user };
}

export function isCatalystAvailable() {
  return !!(sdk() && sdk().auth);
}

// In local dev (no SDK), bypass auth so the dashboards remain usable.
export function isDevBypass() {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1" || host === "";
  return local && !isCatalystAvailable();
}

const DEV_USER = {
  first_name: "Demo",
  last_name: "Analyst",
  email_id: "demo@local.dev",
  role_details: { role_name: "Analyst" },
  __dev: true,
};

/**
 * Resolve the current authenticated user.
 * Returns the user object on success, or null when not signed in.
 */
export async function checkAuth() {
  if (DEMO_MODE) return loadDemoSession();  // null until demoLogin() succeeds
  if (isDevBypass()) return DEV_USER;
  if (!isCatalystAvailable()) return null;
  try {
    const res = await sdk().auth.isUserAuthenticated();
    return res && res.content ? res.content : res;
  } catch (e) {
    return null;
  }
}

/**
 * Redirect to the Catalyst Hosted Login page. In dev bypass this is a no-op.
 */
export function goToLogin() {
  if (isDevBypass()) return;
  // Catalyst Hosted Login endpoint; it returns to the app after sign-in.
  window.location.href = "/__catalyst/auth/login";
}

/**
 * (Embedded mode helper, kept for compatibility.) Render the embedded login
 * widget into an element. With Hosted Login we instead redirect via goToLogin.
 */
export function renderLogin(elementId) {
  if (isDevBypass() || !isCatalystAvailable()) return;
  try {
    sdk().auth.signIn(elementId, { is_customize_forgot_password: false });
  } catch (e) {
    // If embedded signIn isn't applicable (hosted mode), fall back to redirect.
    goToLogin();
  }
}

export function signOut(redirectURL = "/app/index.html") {
  if (DEMO_MODE) {
    try { window.sessionStorage.removeItem(DEMO_SESSION_KEY); } catch (e) { /* noop */ }
    if (typeof window !== "undefined") window.location.reload();
    return;
  }
  if (isCatalystAvailable()) {
    try { sdk().auth.signOut(redirectURL); return; } catch (e) { /* noop */ }
  }
  // dev bypass: just reload
  if (typeof window !== "undefined") window.location.reload();
}

// Map a Catalyst role name to the platform's RBAC personas.
export function resolveRole(user) {
  const name = user?.role_details?.role_name || user?.role_name || "Analyst";
  const lc = String(name).toLowerCase();
  if (lc.includes("admin") || lc.includes("supervisor")) return "Supervisor";
  if (lc.includes("policy")) return "Policymaker";
  if (lc.includes("invest")) return "Investigator";
  return "Analyst";
}

// Which tabs each role may see, reflecting the persona's job:
//  - Supervisor: full oversight — everything
//  - Investigator: operational case work — map, patterns, risk, assistant
//  - Analyst: analytics focus — dashboard, patterns, trends, risk, assistant
//  - Policymaker: strategic view — dashboard, map, trends (no granular drill-downs)
const ROLE_TABS = {
  Supervisor: ["dashboard", "map", "patterns", "trends", "risk", "socio", "network", "assistant"],
  Investigator: ["dashboard", "map", "patterns", "risk", "network", "assistant"],
  Analyst: ["dashboard", "patterns", "trends", "risk", "socio", "assistant"],
  Policymaker: ["dashboard", "map", "trends", "socio"],
};

export function allowedTabs(role) {
  return ROLE_TABS[role] || ROLE_TABS.Analyst;
}

// Human-readable description of what each role can access (for UI hints).
export const ROLE_DESCRIPTIONS = {
  Supervisor: "Full oversight across all intelligence modules.",
  Investigator: "Operational case work: hotspots, patterns, risk, and the assistant.",
  Analyst: "Analytics focus: dashboards, patterns, trends, risk, and the assistant.",
  Policymaker: "Strategic view: state dashboards, hotspot maps, and trends.",
};
