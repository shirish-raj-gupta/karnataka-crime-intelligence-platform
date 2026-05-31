// Central API client. The base path is identical in dev (via Vite proxy) and
// in production (Catalyst Web Client + Advanced I/O function on same origin).
const API_BASE = "/server/crime_api";

async function request(path, opts) {
  const res = await fetch(API_BASE + path, { credentials: "same-origin", ...opts });
  if (res.status === 401) {
    // Session expired — bounce to login (disabled in demo mode).
    const demo = window.__DEMO_MODE__ === true;
    if (!demo && typeof window !== "undefined" && !window.location.hostname.match(/^(localhost|127\.0\.0\.1)?$/)) {
      window.location.href = "/__catalyst/auth/login";
    }
    throw new Error("Not authenticated");
  }
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`);
  const json = await res.json();
  if (json.ok === false) throw new Error(json.error || "API error");
  return json.result !== undefined ? json.result : json;
}

export const api = {
  health: () => fetch(API_BASE + "/health", { credentials: "same-origin" }).then((r) => r.json()).then((j) => j.data),
  overview: () => request("/overview"),
  districts: () => request("/districts"),
  rank: (metric = "total", order = "desc", limit = 10) =>
    request(`/districts/rank?metric=${metric}&order=${order}&limit=${limit}`),
  hotspots: (metric = "total", z = 1.0) => request(`/hotspots?metric=${metric}&z=${z}`),
  riskScores: (limit = 40) => request(`/risk-scores?limit=${limit}`),
  categories: (lawType = "IPC", limit = 15) => request(`/categories?lawType=${lawType}&limit=${limit}`),
  categoryDetail: (query) => request(`/categories/detail?query=${encodeURIComponent(query)}`),
  vulnerable: (group) => request(`/vulnerable${group ? `?group=${encodeURIComponent(group)}` : ""}`),
  trendAlerts: (section, threshold = 25, minVolume = 10) =>
    request(`/trends/alerts?${section ? `section=${section}&` : ""}threshold=${threshold}&minVolume=${minVolume}`),
  categoryTrend: (query) => request(`/trends/category?query=${encodeURIComponent(query)}`),
  forecast: (section, limit = 15) =>
    request(`/forecast?${section ? `section=${section}&` : ""}limit=${limit}`),
  // Real 12-month series + forecast from the KSP monthly review files
  monthlySeries: (query, lawType) => {
    const q = new URLSearchParams();
    if (query) q.set("query", query);
    if (lawType) q.set("lawType", lawType);
    const s = q.toString();
    return request(`/monthly/series${s ? `?${s}` : ""}`);
  },
  monthlyForecast: (query, lawType, horizon = 3) => {
    const q = new URLSearchParams();
    if (query) q.set("query", query);
    if (lawType) q.set("lawType", lawType);
    q.set("horizon", horizon);
    return request(`/monthly/forecast?${q.toString()}`);
  },
  monthlyAlerts: (lawType, threshold = 20, minVolume = 10) => {
    const q = new URLSearchParams();
    if (lawType) q.set("lawType", lawType);
    q.set("threshold", threshold);
    q.set("minVolume", minVolume);
    return request(`/monthly/alerts?${q.toString()}`);
  },
  // Anomaly detection — behavioural-deviation call-outs (spatial + temporal)
  anomalies: (z = 1.5, limit = 20) => request(`/anomalies?z=${z}&limit=${limit}`),
  // Criminal network (synthetic demo data)
  netSummary: () => request("/network/summary"),
  netRepeatOffenders: (limit = 15) => request(`/network/repeat-offenders?limit=${limit}`),
  netRisk: (limit = 20) => request(`/network/risk?limit=${limit}`),
  netGraph: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/network/graph${q ? `?${q}` : ""}`);
  },
  netKeyPlayers: (limit = 10) => request(`/network/key-players?limit=${limit}`),
  netGangs: () => request("/network/gangs"),
  netMoneyTrail: (limit = 20) => request(`/network/money-trail?limit=${limit}`),
  netAssociations: (offender) => request(`/network/associations?offender=${encodeURIComponent(offender)}`),
  // Socio-economic correlation (real Census 2011 x KSP crime)
  socioCorrelations: () => request("/socio/correlations"),
  socioDistricts: (sortBy = "crime_rate") => request(`/socio/districts?sortBy=${sortBy}`),
  socioRiskFactors: (limit = 10) => request(`/socio/risk-factors?limit=${limit}`),
  // ML model — crime-risk classifier
  mlScoreDistricts: () => request("/ml/score-districts"),
  mlPredict: (body) => request("/ml/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  mlPredictAutoML: (body) => request("/ml/predict-automl", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
  // Police stations + spatiotemporal (synthetic, reconciles to real district totals)
  stationsSummary: () => request("/stations/summary"),
  stations: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/stations${q ? `?${q}` : ""}`);
  },
  stationsHourly: (district) => request(`/stations/hourly${district ? `?district=${encodeURIComponent(district)}` : ""}`),
  spatiotemporal: (limit = 15) => request(`/stations/spatiotemporal?limit=${limit}`),
  // REAL incident-level FIR analytics (1.67M FIRs, Apache-2.0 via Kaggle)
  firSummary: () => request("/fir/summary"),
  firHotspots: (limit = 800) => request(`/fir/hotspots?limit=${limit}`),
  firUnits: (limit = 600) => request(`/fir/units?limit=${limit}`),
  firGroups: (limit = 20) => request(`/fir/groups?limit=${limit}`),
  firOutcomes: (limit = 40) => request(`/fir/outcomes?limit=${limit}`),
  // Zia Services — text analytics on case notes
  ziaAnalyzeNotes: (text) => request("/zia/analyze-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }),
  ask: (question, lang = "en") =>
    request("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, lang }),
    }),

  // Catalyst Search — full-text search across Data Store crime catalogue (#10)
  search: (q, limit = 50) => request(`/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  // Translation via Catalyst QuickML LLM (#15 — translation)
  translate: (text, target = "kn") => request("/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, target }),
  }),

  // Returns the API base so report links / blob downloads can be built.
  base: () => API_BASE,

  // Server-side PDF (SmartBrowz). Returns a Blob; throws on failure so the
  // caller can fall back to client-side generation.
  conversationPdf: async (messages) => {
    const res = await fetch(API_BASE + "/report/conversation", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
    if (!res.ok) throw new Error("report API " + res.status);
    return res.blob();
  },
  intelligencePdf: async () => {
    const res = await fetch(API_BASE + "/report/intelligence", { credentials: "same-origin" });
    if (!res.ok) throw new Error("report API " + res.status);
    return res.blob();
  },
};

export const fmt = (n) =>
  n === null || n === undefined ? "–" : Number(n).toLocaleString("en-IN");

export const PALETTE = [
  "#4f9cff", "#7b61ff", "#3ddc97", "#ffb347", "#ff5c6c",
  "#52d6e2", "#c084fc", "#f472b6", "#a3e635", "#fbbf24",
];
