"use strict";

/**
 * Lightweight natural-language query router.
 *
 * This is an intent + entity matcher that maps a plain-language question to a
 * structured analytics call and returns a grounded answer (data + evidence).
 *
 * In production this layer is augmented by Catalyst QuickML (LLM Serving / RAG)
 * for free-form phrasing and Catalyst Zia for Kannada<->English translation and
 * voice. The deterministic router here guarantees an explainable, data-backed
 * answer for the common intents and serves as the RAG tool/function schema.
 */

const A = require("./analytics");
const SOCIO = require("./socio");

const STOP = new Set(["the", "in", "of", "for", "a", "an", "is", "are", "to", "and", "me", "show", "what", "which", "how", "many", "list", "give"]);

function tokens(text) {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

function has(text, ...words) {
  const t = " " + text.toLowerCase() + " ";
  return words.some((w) => t.includes(w));
}

/** Try to find a district name mentioned in the text. */
function matchDistrict(text) {
  const lc = text.toLowerCase();
  const ds = A.districts();
  let best = null;
  for (const d of ds) {
    const name = d.district.toLowerCase();
    if (lc.includes(name)) {
      if (!best || name.length > best.district.toLowerCase().length) best = d;
    }
  }
  return best;
}

/** Detect a law type hint. */
function matchLawType(text) {
  if (has(text, "sll", "special local", "special law", "excise", "arms act", "ndps")) return "SLL";
  if (has(text, "ipc", "bns")) return "IPC";
  return "IPC";
}

function answer(question) {
  const text = question || "";
  const lc = text.toLowerCase();

  // Resolve a named district up front; a specific district reference should
  // win over the generic state-overview intent.
  const namedDistrict = matchDistrict(lc);
  if (namedDistrict && has(lc, "crime", "crimes", "ipc", "sll", "total", "how many", "registered")) {
    const row = A.districtSummary().find((r) => r.district_id === namedDistrict.district_id);
    const ipc = Number(row.ipc_bns_crimes) || 0;
    const sll = Number(row.sll_crimes) || 0;
    return {
      intent: "district_lookup",
      answer: `${namedDistrict.district} registered ${ipc.toLocaleString()} IPC/BNS crimes and ${sll.toLocaleString()} SLL crimes in 2025 (total ${(ipc + sll).toLocaleString()}).`,
      data: { district: namedDistrict.district, range_name: namedDistrict.range_name, ipc_bns_crimes: ipc, sll_crimes: sll, total: ipc + sll },
      evidence: { table: "district_crime_summary", district_id: namedDistrict.district_id },
    };
  }

  // Intent: overview / summary
  if (has(lc, "overview", "summary", "snapshot", "state total", "how many crimes")) {
    const data = A.overview();
    return {
      intent: "overview",
      answer: `In ${data.year}, Karnataka registered ${data.state_totals.ipc_bns_crimes.toLocaleString()} IPC/BNS crimes and ${data.state_totals.sll_crimes.toLocaleString()} SLL crimes across ${data.districts_count} districts/units.`,
      data,
      evidence: { source: data.source, table: "district_crime_summary" },
    };
  }

  // Intent: hotspots
  if (has(lc, "hotspot", "hot spot", "high risk area", "cluster", "red zone")) {
    const data = A.hotspots({ metric: "total", z: 1.0 });
    const names = data.hotspots.slice(0, 5).map((h) => h.district).join(", ");
    return {
      intent: "hotspots",
      answer: `Crime hotspots (district-level, z-score >= 1.0): ${names || "none above threshold"}.`,
      data,
      evidence: { method: data.method, table: "district_crime_summary" },
    };
  }

  // Intent: risk scoring
  if (has(lc, "risk score", "risk scoring", "risk band", "prioriti", "most dangerous")) {
    const data = A.districtRiskScores({ limit: 10 });
    return {
      intent: "risk_scores",
      answer: `Top districts by composite risk score: ${data.results.slice(0, 5).map((r) => `${r.district} (${r.risk_score}, ${r.risk_band})`).join("; ")}.`,
      data,
      evidence: { method: data.method, table: "district_crime_summary" },
    };
  }

  // Intent: vulnerable groups
  if (has(lc, "women", "woman", "children", "child", "sc/st", "scheduled caste", "scheduled tribe", "dowry", "pocso")) {
    let group = null;
    if (has(lc, "women", "woman", "dowry")) group = "Women";
    else if (has(lc, "children", "child", "pocso")) group = "Children";
    else if (has(lc, "sc/st", "scheduled caste", "scheduled tribe")) group = "SC/ST";
    const data = A.vulnerableGroups(group ? { group } : {});
    const g = data.results[0];
    return {
      intent: "vulnerable_groups",
      answer: g
        ? `Crimes against ${g.victim_group}${g.total !== null ? ` totalled ${g.total.toLocaleString()}` : ""}. Top: ${g.items.slice(0, 3).map((i) => `${i.crime_type} (${i.count})`).join(", ")}.`
        : "No matching vulnerable-group data found.",
      data,
      evidence: { table: "special_crimes" },
    };
  }

  // Intent: socio-economic correlation / "why behind the where"
  if (has(lc, "socio", "socio-economic", "socioeconomic", "correlat", "urbaniz", "literacy", "density", "why behind", "crime rate", "per capita", "per 100k", "population")) {
    const data = SOCIO.correlations();
    if (data) {
      const top = data.results[0];
      return {
        intent: "socio_correlation",
        answer: `Strongest socio-economic correlation with district crime rate: ${top.indicator} (r=${top.correlation}, ${top.strength} ${top.direction}). Based on Census 2011 vs KSP 2025 crime rates across ${data.sample_districts} districts.`,
        data,
        evidence: { method: data.method, table: "socioeconomic" },
      };
    }
  }

  // Intent: criminal network / offenders / gangs (synthetic demo)
  if (has(lc, "network", "gang", "offender", "repeat offender", "money trail", "organized crime", "association", "accomplice")) {
    return {
      intent: "network_hint",
      answer: "Criminal network, repeat-offender, gang and money-trail analysis is available in the Network Analysis module (synthetic demo data, grounded in real distributions). Ask there for relationship graphs and offender risk profiles.",
      data: { module: "network", note: "synthetic" },
      evidence: { module: "network_analysis" },
    };
  }

  // Intent: emerging trend alerts / spikes
  if (has(lc, "trend alert", "spike", "spiking", "emerging", "rising crime", "surge", "increasing", "alert")) {
    const data = A.trendAlerts({ threshold: 25, minVolume: 10 });
    const top = data.alerts.slice(0, 5).map((a) => `${a.category.split("(")[0].trim()} (${a.signals.join(", ")})`).join("; ");
    return {
      intent: "trend_alerts",
      answer: data.alerts.length
        ? `Emerging crime spikes (current month vs previous month / last year): ${top}.`
        : "No categories crossed the spike threshold this month.",
      data,
      evidence: { method: data.method, table: "crime_temporal" },
    };
  }

  // Intent: forecast / prediction
  if (has(lc, "forecast", "predict", "next month", "projection", "expected")) {
    const data = A.forecast({ limit: 10 });
    const top = data.results.slice(0, 5).map((r) => `${r.category.split("(")[0].trim()} (~${r.projected_next_month}, ${r.direction})`).join("; ");
    return {
      intent: "forecast",
      answer: `Projected next-month volumes (estimate): ${top}.`,
      data,
      evidence: { method: data.method, table: "crime_temporal" },
    };
  }

  // Intent: REAL monthly trend for a category ("monthly trend of theft",
  // "theft over the months", "show 12 month trend"). Uses the real monthly
  // series (12 KSP monthly files) rather than the single-month snapshot.
  if (has(lc, "monthly", "month by month", "month-by-month", "over the months", "12 month", "twelve month", "across months", "monthly trend", "by month")) {
    const keys = ["murder", "theft", "rape", "burglary", "kidnap", "robbery", "dacoity", "hurt", "cheating", "riot", "molestation", "accident", "dowry", "cyber", "forgery", "arson"];
    const found = keys.find((k) => lc.includes(k)) || null;
    const ms = A.monthlySeries(found ? { query: found } : {});
    if (ms.found) {
      const series = ms.series.map((p) => `${p.month} ${p.count}`).join(", ");
      return {
        intent: "monthly_trend",
        answer: `${ms.scope} — real month-by-month counts (2025): ${series}. Total ${ms.total.toLocaleString()}, peak in ${ms.peak_month}.`,
        data: ms,
        evidence: { source: "KSP 12 monthly review files", granularity: "state-monthly" },
      };
    }
  }

  // Intent: trend for a specific category (YoY/MoM)
  if (has(lc, "trend", "year over year", "yoy", "month over month", "mom", "compared to last year", "growth")) {
    const keys = ["murder", "theft", "rape", "burglary", "kidnap", "robbery", "dacoity", "hurt", "cheating", "riot", "molestation", "accident", "dowry", "cyber"];
    const found = keys.find((k) => lc.includes(k));
    if (found) {
      const d = A.categoryTrend({ query: found });
      if (d.found) {
        return {
          intent: "category_trend",
          answer: `${d.category}: current month ${d.current_month}, vs last month ${d.prev_month} (MoM ${d.mom_pct ?? "n/a"}%), vs same month last year ${d.same_month_prev_year} (YoY ${d.yoy_pct ?? "n/a"}%).`,
          data: d,
          evidence: { table: "crime_temporal", granularity: "state" },
        };
      }
    }
  }

  // Intent: category drill-down (e.g. "motives for murder", "types of theft")
  if (has(lc, "murder", "theft", "rape", "burglary", "kidnap", "robbery", "dacoity", "hurt", "cheating", "riot", "dowry death", "accident", "molestation")) {
    const keys = ["murder", "theft", "rape", "burglary", "kidnap", "robbery", "dacoity", "hurt", "cheating", "riot", "accident", "molestation"];
    const found = keys.find((k) => lc.includes(k)) || "";
    const detail = A.categoryDetail({ query: found });
    if (detail.found) {
      return {
        intent: "category_detail",
        answer: `${detail.category} — total ${detail.total !== null ? detail.total.toLocaleString() : "n/a"} in 2025. Leading sub-types: ${detail.subtypes.slice(0, 4).map((s) => `${s.subtype} (${s.count})`).join(", ")}.`,
        data: detail,
        evidence: { table: "crime_heads", granularity: "state" },
      };
    }
  }

  // Intent: top categories
  if (has(lc, "top crime", "most common", "category", "categories", "breakdown", "heads of crime")) {
    const lawType = matchLawType(lc);
    const data = A.categoryBreakdown({ lawType, limit: 10 });
    return {
      intent: "category_breakdown",
      answer: `Top ${lawType} crime categories in 2025: ${data.results.slice(0, 5).map((r) => `${r.category.split("(")[0].trim()} (${r.count.toLocaleString()})`).join(", ")}.`,
      data,
      evidence: { table: "crime_heads", granularity: "state" },
    };
  }

  // Intent: ranking ("top districts", "which district has most crime")
  if (has(lc, "top district", "which district", "most crime", "highest", "rank", "compare district")) {
    const metric = has(lc, "sll") ? "sll_crimes" : has(lc, "ipc", "bns") ? "ipc_bns_crimes" : "total";
    const order = has(lc, "lowest", "least", "safest") ? "asc" : "desc";
    const data = A.rankDistricts({ metric, order, limit: 10 });
    return {
      intent: "rank_districts",
      answer: `${order === "asc" ? "Lowest" : "Highest"} districts by ${metric}: ${data.results.slice(0, 5).map((r) => `${r.district} (${r.value.toLocaleString()})`).join(", ")}.`,
      data,
      evidence: { table: "district_crime_summary" },
    };
  }

  // Fallback
  return {
    intent: "unknown",
    answer:
      "I can answer questions about district crime totals, hotspots, risk scores, crime categories and sub-types, and crimes against women/children/SC-ST for Karnataka 2025. Try: 'top districts by crime', 'motives for murder', or 'crimes against women'.",
    data: { suggestions: ["state overview", "crime hotspots", "top districts by crime", "motives for murder", "crimes against women", "risk scores"] },
    evidence: { keywords: tokens(text) },
  };
}

module.exports = { answer };
