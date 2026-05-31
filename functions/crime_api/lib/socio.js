"use strict";

/**
 * Sociological / socio-economic correlation analytics.
 *
 * Joins the real KSP crime totals with district socio-economic indicators
 * (Census of India 2011, public domain) to answer the "why behind the where":
 *   - crime rate per 100k population per district
 *   - Pearson correlation of crime rate vs urbanisation, literacy, density
 *   - ranked socio-economic risk factors
 *
 * Addresses challenge §3 "Socio-Economic Correlation".
 */

const { loadTable, num } = require("./store");

function rows() {
  return loadTable("socioeconomic")
    .map((r) => ({
      district_id: r.district_id,
      district: r.district,
      population: num(r.population_2011),
      literacy_pct: num(r.literacy_pct),
      urban_pct: num(r.urban_pct),
      density: num(r.density_per_sqkm),
      total_crimes: num(r.total_crimes_2025),
      crime_rate: num(r.crime_rate_per_100k),
    }))
    .filter((r) => r.population && r.crime_rate !== null);
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num_ = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num_ += a * b; dx += a * a; dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : +(num_ / den).toFixed(3);
}

function strength(r) {
  const a = Math.abs(r);
  if (a >= 0.7) return "strong";
  if (a >= 0.4) return "moderate";
  if (a >= 0.2) return "weak";
  return "negligible";
}

/** Correlation of crime rate vs each socio-economic indicator. */
function correlations() {
  const data = rows();
  const rate = data.map((d) => d.crime_rate);
  const indicators = [
    { key: "urban_pct", label: "Urbanisation (% urban)" },
    { key: "literacy_pct", label: "Literacy (%)" },
    { key: "density", label: "Population density (/sq.km)" },
    { key: "population", label: "Population size" },
  ];
  const results = indicators.map((ind) => {
    const r = pearson(data.map((d) => d[ind.key]), rate);
    return {
      indicator: ind.label,
      key: ind.key,
      correlation: r,
      strength: r === null ? "n/a" : strength(r),
      direction: r === null ? "n/a" : r > 0 ? "positive" : r < 0 ? "negative" : "none",
    };
  });
  results.sort((a, b) => Math.abs(b.correlation || 0) - Math.abs(a.correlation || 0));
  return {
    method: "Pearson correlation between district crime-rate-per-100k and each socio-economic indicator",
    sample_districts: data.length,
    source: "Census of India 2011 (public domain) joined to KSP 2025 crime totals",
    results,
  };
}

/** District rows with crime rate + indicators, for scatter/overlay charts. */
function districts({ sortBy = "crime_rate" } = {}) {
  const data = rows();
  data.sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
  return { source: "Census 2011 + KSP 2025", results: data };
}

/** Highest crime-rate districts with their socio-economic profile. */
function riskFactors({ limit = 10 } = {}) {
  const data = rows().sort((a, b) => b.crime_rate - a.crime_rate);
  return {
    note: "Districts with the highest crime rate per 100k, with socio-economic context.",
    results: data.slice(0, limit),
  };
}

module.exports = { correlations, districts, riskFactors };
