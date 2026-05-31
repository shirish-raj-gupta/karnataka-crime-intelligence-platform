"use strict";

/**
 * Analytics layer for the Crime Intelligence Platform.
 *
 * Every function returns plain data plus the evidence (source rows / formulae)
 * used, so the API and the conversational layer can present transparent,
 * explainable results (Explainable AI requirement).
 *
 * Data granularity note: the KSP aggregate dataset is district-level (no
 * incident coordinates) and statewide for crime-head breakdowns. Functions are
 * written to that reality and labelled accordingly.
 */

const { loadTable, loadMeta, num } = require("./store");

function districts() {
  return loadTable("districts");
}

function districtSummary({ excludeState = true } = {}) {
  return loadTable("district_crime_summary").filter((r) =>
    excludeState ? r.district_id !== "STATE" : true
  );
}

function stateRow() {
  return loadTable("district_crime_summary").find((r) => r.district_id === "STATE");
}

/** Basic descriptive stats helper. */
function stats(values) {
  const v = values.filter((x) => x !== null && Number.isFinite(x));
  if (v.length === 0) return { n: 0, mean: 0, std: 0, min: 0, max: 0 };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const variance = v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length;
  return {
    n: v.length,
    mean,
    std: Math.sqrt(variance),
    min: Math.min(...v),
    max: Math.max(...v),
  };
}

/**
 * District ranking by a chosen metric: ipc_bns_crimes | sll_crimes | total.
 * Returns rows enriched with total + share of state.
 */
function rankDistricts({ metric = "total", limit = 10, order = "desc" } = {}) {
  const rows = districtSummary().map((r) => {
    const ipc = num(r.ipc_bns_crimes) || 0;
    const sll = num(r.sll_crimes) || 0;
    const total = ipc + sll;
    const value = metric === "ipc_bns_crimes" ? ipc : metric === "sll_crimes" ? sll : total;
    return {
      district_id: r.district_id,
      district: r.district,
      range_name: r.range_name,
      district_type: r.district_type,
      ipc_bns_crimes: ipc,
      sll_crimes: sll,
      total,
      value,
    };
  });
  const grandTotal = rows.reduce((a, b) => a + b.value, 0) || 1;
  rows.forEach((r) => { r.share_pct = +((r.value / grandTotal) * 100).toFixed(2); });
  rows.sort((a, b) => (order === "asc" ? a.value - b.value : b.value - a.value));
  return {
    metric,
    order,
    grand_total: grandTotal,
    results: rows.slice(0, limit),
    evidence: { table: "district_crime_summary", rows_considered: rows.length },
  };
}

/**
 * Hotspot detection: flag districts whose crime volume is a statistical
 * outlier (z-score) relative to the state distribution. District-level only.
 */
function hotspots({ metric = "total", z = 1.0 } = {}) {
  const ranked = rankDistricts({ metric, limit: 1000 }).results;
  const s = stats(ranked.map((r) => r.value));
  const flagged = ranked
    .map((r) => ({
      ...r,
      z_score: s.std ? +(((r.value - s.mean) / s.std)).toFixed(2) : 0,
    }))
    .filter((r) => r.z_score >= z)
    .sort((a, b) => b.z_score - a.z_score);
  return {
    metric,
    threshold_z: z,
    distribution: {
      mean: +s.mean.toFixed(1),
      std: +s.std.toFixed(1),
      n: s.n,
    },
    hotspots: flagged,
    method:
      "z-score over district totals; districts at or above the z threshold are flagged as hotspots",
    granularity: "district",
  };
}

/**
 * Crime category breakdown statewide. lawType: IPC | SLL | ALL.
 * Returns category totals (using subtotal/single rows only, never derived
 * totals or subtypes — avoids double counting).
 */
function categoryBreakdown({ lawType = "IPC", limit = 15 } = {}) {
  const rows = loadTable("crime_heads").filter((r) =>
    lawType === "ALL" ? true : r.law_type === lawType
  );
  const byCat = new Map();
  for (const r of rows) {
    const key = `${r.law_type}#${r.category_seq}`;
    if (!byCat.has(key)) {
      byCat.set(key, { law_type: r.law_type, category: r.category, total: null, subtypeSum: 0 });
    }
    const entry = byCat.get(key);
    const c = num(r.count);
    if (r.row_type === "subtotal" || r.row_type === "single") {
      if (c !== null) entry.total = c;
    } else if (r.row_type === "subtype" && c !== null) {
      entry.subtypeSum += c;
    }
  }
  const out = [...byCat.values()].map((e) => ({
    law_type: e.law_type,
    category: e.category,
    count: e.total !== null ? e.total : e.subtypeSum,
  }));
  out.sort((a, b) => b.count - a.count);
  const grand = out.reduce((a, b) => a + b.count, 0) || 1;
  out.forEach((r) => { r.share_pct = +((r.count / grand) * 100).toFixed(2); });
  return {
    law_type: lawType,
    grand_total: grand,
    results: out.slice(0, limit),
    granularity: "state",
    evidence: { table: "crime_heads", categories: out.length },
  };
}

/** Drill into one category's subtypes (e.g. motives for Murder). */
function categoryDetail({ query }) {
  const rows = loadTable("crime_heads");
  const q = (query || "").toLowerCase();
  const match = rows.find(
    (r) => r.category.toLowerCase().includes(q) && q.length > 0
  );
  if (!match) return { found: false, query };
  const seq = match.category_seq;
  const lawType = match.law_type;
  const subtypes = rows
    .filter((r) => r.category_seq === seq && r.law_type === lawType && r.row_type === "subtype")
    .map((r) => ({ subtype: r.subtype, count: num(r.count) }))
    .filter((r) => r.count !== null)
    .sort((a, b) => b.count - a.count);
  const subtotalRow = rows.find(
    (r) => r.category_seq === seq && r.law_type === lawType &&
      (r.row_type === "subtotal" || r.row_type === "single")
  );
  return {
    found: true,
    law_type: lawType,
    category: match.category,
    total: subtotalRow ? num(subtotalRow.count) : null,
    subtypes,
    granularity: "state",
  };
}

/** Crimes against vulnerable groups (Women / Children / SC-ST). */
function vulnerableGroups({ group } = {}) {
  let rows = loadTable("special_crimes");
  if (group) rows = rows.filter((r) => r.victim_group.toLowerCase() === group.toLowerCase());
  const groups = {};
  for (const r of rows) {
    const g = r.victim_group;
    groups[g] = groups[g] || { victim_group: g, total: null, items: [] };
    const c = num(r.count);
    if (String(r.is_total).toLowerCase() === "true") {
      if (c !== null) groups[g].total = c;
    } else if (c !== null) {
      groups[g].items.push({ crime_type: r.crime_type, count: c });
    }
  }
  Object.values(groups).forEach((g) => g.items.sort((a, b) => b.count - a.count));
  return { results: Object.values(groups), granularity: "state" };
}

/**
 * Offender / district risk scoring (composite index). Without record-level
 * offender data, this scores DISTRICTS on a 0-100 risk index combining crime
 * volume and concentration — a defensible proxy for resource prioritisation.
 */
function districtRiskScores({ limit = 40 } = {}) {
  const ranked = rankDistricts({ metric: "total", limit: 1000 }).results;
  const totals = ranked.map((r) => r.total);
  const s = stats(totals);
  const range = s.max - s.min || 1;
  const scored = ranked.map((r) => {
    const norm = (r.total - s.min) / range; // 0..1
    const z = s.std ? (r.total - s.mean) / s.std : 0;
    const score = +(norm * 100).toFixed(1);
    let band = "Low";
    if (score >= 75) band = "Critical";
    else if (score >= 50) band = "High";
    else if (score >= 25) band = "Moderate";
    return {
      district_id: r.district_id,
      district: r.district,
      range_name: r.range_name,
      total_crimes: r.total,
      risk_score: score,
      z_score: +z.toFixed(2),
      risk_band: band,
    };
  });
  scored.sort((a, b) => b.risk_score - a.risk_score);
  return {
    method:
      "min-max normalised crime volume scaled 0-100; bands Critical>=75, High>=50, Moderate>=25",
    granularity: "district",
    results: scored.slice(0, limit),
  };
}

/* ------------------------------------------------------------------ *
 *  Temporal analytics (Monthly Crime Review: YoY + MoM comparisons)   *
 * ------------------------------------------------------------------ */

function temporalRows() {
  try {
    return loadTable("crime_temporal");
  } catch (e) {
    return [];
  }
}

/** Roll subtype rows up to category level for a section (sum of measures). */
function temporalByCategory(section) {
  const rows = temporalRows().filter((r) =>
    (section ? r.section === section : true) && r.row_type === "subtype"
  );
  const map = new Map();
  for (const r of rows) {
    const key = `${r.section}#${r.category}`;
    if (!map.has(key)) {
      map.set(key, {
        section: r.section, category: r.category,
        current_month: 0, prev_month: 0, same_month_prev_year: 0, ytd: 0,
      });
    }
    const e = map.get(key);
    e.current_month += num(r.current_month) || 0;
    e.prev_month += num(r.prev_month) || 0;
    e.same_month_prev_year += num(r.same_month_prev_year) || 0;
    e.ytd += num(r.ytd) || 0;
  }
  const pct = (c, b) => (b ? +(((c - b) / b) * 100).toFixed(1) : null);
  return [...map.values()].map((e) => ({
    ...e,
    yoy_change: e.current_month - e.same_month_prev_year,
    yoy_pct: pct(e.current_month, e.same_month_prev_year),
    mom_change: e.current_month - e.prev_month,
    mom_pct: pct(e.current_month, e.prev_month),
  }));
}

/**
 * Emerging trend alerts: crime categories whose current-month volume rises
 * sharply versus the previous month AND/OR the same month last year. This is
 * the data-grounded version of the "red-zone" spike indicator.
 */
function trendAlerts({ section = null, minVolume = 10, threshold = 25 } = {}) {
  const cats = temporalByCategory(section).filter((c) => c.current_month >= minVolume);
  const alerts = cats
    .map((c) => {
      const signals = [];
      if (c.mom_pct !== null && c.mom_pct >= threshold) signals.push(`MoM +${c.mom_pct}%`);
      if (c.yoy_pct !== null && c.yoy_pct >= threshold) signals.push(`YoY +${c.yoy_pct}%`);
      const score = (c.mom_pct || 0) + (c.yoy_pct || 0);
      let severity = "watch";
      if (score >= 150) severity = "critical";
      else if (score >= 75) severity = "high";
      else if (score >= threshold) severity = "elevated";
      return { ...c, signals, alert_score: +score.toFixed(1), severity };
    })
    .filter((c) => c.signals.length > 0)
    .sort((a, b) => b.alert_score - a.alert_score);
  return {
    review_month: loadMeta().temporal_review_month || null,
    method:
      "category current-month volume vs previous month (MoM) and same month last year (YoY); flagged when either rise >= threshold%",
    threshold_pct: threshold,
    min_volume: minVolume,
    granularity: "state",
    alerts,
  };
}

/**
 * Trend summary for a single crime category (search by name).
 * Returns the YoY/MoM picture plus the leading sub-types driving the change.
 */
function categoryTrend({ query }) {
  const q = (query || "").toLowerCase();
  if (!q) return { found: false };
  const cats = temporalByCategory(null);
  const match = cats.find((c) => c.category.toLowerCase().includes(q));
  if (!match) return { found: false, query };
  const subs = temporalRows()
    .filter((r) => r.category === match.category && r.row_type === "subtype")
    .map((r) => ({
      subtype: r.subtype,
      current_month: num(r.current_month),
      mom_pct: r.mom_pct === "" ? null : num(r.mom_pct),
      yoy_pct: r.yoy_pct === "" ? null : num(r.yoy_pct),
      trend: r.trend,
    }))
    .sort((a, b) => (b.current_month || 0) - (a.current_month || 0));
  return { found: true, ...match, top_subtypes: subs.slice(0, 8), granularity: "state" };
}

/**
 * Naive next-month forecast per category using the available comparison
 * points (prev month, current month, same month last year). Without a full
 * monthly series we use a transparent weighted-average projection and report
 * it honestly as an estimate, not a black-box prediction.
 */
function forecast({ section = null, limit = 15 } = {}) {
  const cats = temporalByCategory(section).filter((c) => c.current_month + c.prev_month > 0);
  const results = cats.map((c) => {
    // Weighted blend: recent momentum (current vs prev) + seasonal anchor (YoY).
    const momentum = c.current_month + (c.current_month - c.prev_month) * 0.5;
    const seasonal = c.same_month_prev_year || c.current_month;
    const projected = Math.max(0, Math.round(momentum * 0.7 + seasonal * 0.3));
    const direction = projected > c.current_month ? "up" : projected < c.current_month ? "down" : "flat";
    return {
      section: c.section, category: c.category,
      current_month: c.current_month, prev_month: c.prev_month,
      projected_next_month: projected, direction,
    };
  });
  results.sort((a, b) => b.projected_next_month - a.projected_next_month);
  return {
    method:
      "transparent weighted projection (0.7 recent momentum + 0.3 seasonal anchor); estimate only, not a trained model",
    granularity: "state",
    review_month: loadMeta().temporal_review_month || null,
    results: results.slice(0, limit),
  };
}

/* ------------------------------------------------------------------ *
 *  REAL monthly series (from the 12 KSP monthly review files)         *
 *  data/monthly_series.csv: law_type, category, month_idx, month_name, *
 *  current_month, ytd, same_month_prev_year, prev_month               *
 * ------------------------------------------------------------------ */

function monthlyRows() {
  try { return loadTable("monthly_series"); } catch (e) { return []; }
}

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Real 12-month series. With no args: total IPC+SLL per month (state).
 * With { query }: the matching category's real monthly counts.
 * With { lawType }: that law-type's monthly total.
 */
function monthlySeries({ query = null, lawType = null } = {}) {
  const rows = monthlyRows();
  if (!rows.length) return { found: false, reason: "monthly_series not available" };

  let matchCategory = null;
  let filtered = rows;
  if (query) {
    const q = String(query).toLowerCase();
    const hit = rows.find((r) => String(r.category).toLowerCase().includes(q));
    if (!hit) return { found: false, query };
    matchCategory = hit.category;
    filtered = rows.filter((r) => r.category === matchCategory);
  } else if (lawType) {
    filtered = rows.filter((r) => String(r.law_type).toUpperCase() === String(lawType).toUpperCase());
  }

  const byMonth = new Map();
  for (let m = 1; m <= 12; m++) byMonth.set(m, 0);
  for (const r of filtered) {
    const m = num(r.month_idx);
    if (m >= 1 && m <= 12) byMonth.set(m, byMonth.get(m) + (num(r.current_month) || 0));
  }
  const series = [...byMonth.entries()].map(([m, v]) => ({
    month_idx: m, month: MONTH_NAMES[m], count: v,
  }));
  const total = series.reduce((s, p) => s + p.count, 0);
  const peak = series.reduce((a, b) => (b.count > a.count ? b : a), series[0]);

  return {
    found: true,
    scope: matchCategory ? `category: ${matchCategory}` : (lawType ? `law_type: ${lawType}` : "state total (IPC+SLL)"),
    granularity: "state",
    months: 12,
    year: 2025,
    series,
    total,
    peak_month: peak.month,
    source: "KSP Monthly Crime Review 2025 — 12 monthly files (real per-month counts)",
  };
}

/**
 * Forecast next 3 months using a least-squares linear trend on the REAL
 * 12-month series (transparent, not a black box). Returns history + forecast.
 */
function monthlyForecast({ query = null, lawType = null, horizon = 3 } = {}) {
  const ms = monthlySeries({ query, lawType });
  if (!ms.found) return ms;
  const ys = ms.series.map((p) => p.count);
  const n = ys.length;
  // Linear regression y = a + b*x, x = 1..n
  const xs = ys.map((_, i) => i + 1);
  const sx = xs.reduce((s, v) => s + v, 0);
  const sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0);
  const sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  const denom = n * sxx - sx * sx;
  const b = denom ? (n * sxy - sx * sy) / denom : 0;
  const a = (sy - b * sx) / n;
  const h = Math.min(Math.max(parseInt(horizon, 10) || 3, 1), 6);
  const forecast = [];
  for (let k = 1; k <= h; k++) {
    const x = n + k;
    const idx = ((12 + k - 1) % 12) + 1; // wrap into next year months
    forecast.push({ month: MONTH_NAMES[idx] + " (+" + k + ")", projected: Math.max(0, Math.round(a + b * x)) });
  }
  const trend = b > 0.5 ? "rising" : b < -0.5 ? "falling" : "stable";
  return {
    found: true,
    scope: ms.scope,
    history: ms.series,
    forecast,
    trend,
    slope_per_month: +b.toFixed(1),
    method: "least-squares linear trend on the real 12-month series; transparent estimate",
    source: ms.source,
  };
}

/**
 * Emerging-spike alerts computed from the REAL monthly series (last month vs
 * the month before, per category). This is the data-grounded red-zone detector
 * built on actual month-by-month KSP counts, not the single-month snapshot.
 */
function monthlyAlerts({ lawType = null, minVolume = 10, threshold = 20 } = {}) {
  const rows = monthlyRows();
  if (!rows.length) return { found: false, alerts: [] };

  // Group by category -> month_idx -> current_month.
  const byCat = new Map();
  for (const r of rows) {
    if (lawType && String(r.law_type).toUpperCase() !== String(lawType).toUpperCase()) continue;
    const key = r.category;
    if (!byCat.has(key)) byCat.set(key, { category: key, law_type: r.law_type, months: {} });
    byCat.get(key).months[num(r.month_idx)] = num(r.current_month) || 0;
  }

  // Determine the latest month present.
  const latest = Math.max(...rows.map((r) => num(r.month_idx) || 0));
  const prev = latest - 1;
  const pct = (c, b) => (b ? +(((c - b) / b) * 100).toFixed(1) : null);

  const alerts = [];
  for (const c of byCat.values()) {
    const cur = c.months[latest] || 0;
    const before = c.months[prev] || 0;
    if (cur < minVolume) continue;
    const momPct = pct(cur, before);
    if (momPct === null || momPct < threshold) continue;
    // Also compute the 3-month momentum for context.
    const m3 = c.months[latest - 2] || 0;
    const signals = [`MoM +${momPct}%`];
    let score = momPct;
    if (before > m3 && m3 > 0) { signals.push("rising 3-mo"); score += 15; }
    let severity = "watch";
    if (score >= 100) severity = "critical";
    else if (score >= 50) severity = "high";
    else if (score >= threshold) severity = "elevated";
    alerts.push({
      category: c.category, law_type: c.law_type,
      current_month: cur, prev_month: before, mom_pct: momPct,
      signals, alert_score: +score.toFixed(1), severity,
    });
  }
  alerts.sort((a, b) => b.alert_score - a.alert_score);
  return {
    found: true,
    method: "latest month vs previous month from the REAL 12-month KSP series; flagged when MoM rise >= threshold%",
    threshold_pct: threshold, min_volume: minVolume,
    latest_month: MONTH_NAMES[latest], granularity: "state-monthly",
    alerts,
  };
}

/* ------------------------------------------------------------------ *
 *  Anomaly detection (behavioural deviation call-outs)                *
 *  Two complementary statistical methods, both transparent:           *
 *   (1) Spatial: districts whose total volume deviates from the state  *
 *       distribution (|z| over district totals).                       *
 *   (2) Temporal: categories whose LATEST month breaks from their own   *
 *       12-month baseline (|z| over that category's monthly series).    *
 *  This is the data-grounded version of "visual call-outs for          *
 *  incidents that deviate from standard behavioural patterns".         *
 * ------------------------------------------------------------------ */
function anomalies({ z = 1.5, limit = 20 } = {}) {
  const zt = Math.max(parseFloat(z) || 1.5, 0.5);

  // (1) Spatial anomalies — district totals vs the state distribution.
  const ranked = rankDistricts({ metric: "total", limit: 1000 }).results;
  const s = stats(ranked.map((r) => r.value));
  const spatial = ranked
    .map((r) => {
      const zscore = s.std ? (r.value - s.mean) / s.std : 0;
      return {
        type: "spatial",
        scope: "district",
        label: r.district,
        context: r.range_name,
        value: r.value,
        baseline_mean: +s.mean.toFixed(1),
        z_score: +zscore.toFixed(2),
        direction: zscore >= 0 ? "above" : "below",
        severity: Math.abs(zscore) >= 2.5 ? "critical" : Math.abs(zscore) >= 2 ? "high" : "elevated",
        note: `District crime volume is ${Math.abs(zscore).toFixed(1)}σ ${zscore >= 0 ? "above" : "below"} the state mean`,
      };
    })
    .filter((r) => Math.abs(r.z_score) >= zt)
    .sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));

  // (2) Temporal anomalies — latest month vs each category's own baseline.
  const mrows = monthlyRows();
  const temporal = [];
  if (mrows.length) {
    const byCat = new Map();
    for (const r of mrows) {
      const key = r.category;
      if (!byCat.has(key)) byCat.set(key, { category: key, law_type: r.law_type, months: {} });
      byCat.get(key).months[num(r.month_idx)] = (byCat.get(key).months[num(r.month_idx)] || 0) + (num(r.current_month) || 0);
    }
    const latest = Math.max(...mrows.map((r) => num(r.month_idx) || 0));
    for (const c of byCat.values()) {
      const seriesVals = [];
      for (let m = 1; m <= 12; m++) if (c.months[m] !== undefined) seriesVals.push(c.months[m]);
      if (seriesVals.length < 4) continue;
      const cur = c.months[latest];
      if (cur === undefined) continue;
      // Baseline = the other months (exclude the latest so it can stand out).
      const baseline = seriesVals.filter((_, i) => i !== seriesVals.length - 1);
      const bs = stats(baseline);
      if (bs.mean < 5) continue; // ignore tiny-volume noise
      const zscore = bs.std ? (cur - bs.mean) / bs.std : 0;
      if (Math.abs(zscore) < zt) continue;
      temporal.push({
        type: "temporal",
        scope: "category-month",
        label: c.category.split("(")[0].trim(),
        context: `${MONTH_NAMES[latest]} 2025 vs 11-month baseline`,
        value: cur,
        baseline_mean: +bs.mean.toFixed(1),
        z_score: +zscore.toFixed(2),
        direction: zscore >= 0 ? "above" : "below",
        severity: Math.abs(zscore) >= 2.5 ? "critical" : Math.abs(zscore) >= 2 ? "high" : "elevated",
        note: `${MONTH_NAMES[latest]} count deviates ${Math.abs(zscore).toFixed(1)}σ ${zscore >= 0 ? "above" : "below"} this category's monthly baseline`,
      });
    }
    temporal.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
  }

  const all = [...spatial, ...temporal].sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score));
  const counts = { critical: 0, high: 0, elevated: 0 };
  all.forEach((a) => { counts[a.severity] = (counts[a.severity] || 0) + 1; });

  return {
    method:
      "z-score deviation. Spatial: district totals vs state distribution. Temporal: latest month vs each category's own 12-month baseline (mean ± σ). Items with |z| ≥ threshold are flagged as behavioural anomalies.",
    threshold_z: zt,
    granularity: "district + category-month",
    summary: { total: all.length, spatial: spatial.length, temporal: temporal.length, ...counts },
    spatial: spatial.slice(0, limit),
    temporal: temporal.slice(0, limit),
    results: all.slice(0, limit),
    source: "KSP district summary + 12-month Monthly Crime Review (2025)",
  };
}

/** Top-level state snapshot for dashboards. */
function overview() {
  const st = stateRow();
  const ds = districtSummary();
  const ipcTop = rankDistricts({ metric: "ipc_bns_crimes", limit: 5 }).results;
  const meta = loadMeta();
  return {
    year: meta.year,
    source: meta.source,
    license: meta.license,
    state_totals: {
      ipc_bns_crimes: num(st.ipc_bns_crimes),
      sll_crimes: num(st.sll_crimes),
      total: num(st.ipc_bns_crimes) + num(st.sll_crimes),
    },
    districts_count: ds.length,
    top_districts_by_ipc: ipcTop.map((r) => ({ district: r.district, ipc_bns_crimes: r.ipc_bns_crimes })),
    has_temporal: temporalRows().length > 0,
    notes: [
      "Aggregate statistical data (no incident-level / PII).",
      "Hotspots are district-level; temporal trends from the Monthly Crime Review.",
    ],
  };
}

module.exports = {
  districts,
  districtSummary,
  stateRow,
  rankDistricts,
  hotspots,
  categoryBreakdown,
  categoryDetail,
  vulnerableGroups,
  districtRiskScores,
  trendAlerts,
  categoryTrend,
  forecast,
  monthlySeries,
  monthlyForecast,
  monthlyAlerts,
  anomalies,
  temporalByCategory,
  overview,
  _stats: stats,
};
