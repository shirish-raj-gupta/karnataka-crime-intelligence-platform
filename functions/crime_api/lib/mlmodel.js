"use strict";

/**
 * Crime-risk classification model (AI/ML-driven intelligence — challenge #6/#3).
 *
 * A genuine supervised ML classifier: k-Nearest-Neighbours over standardized
 * socio-economic features (population, literacy %, urban %, density) predicting
 * a district's crime-risk band (Low/Moderate/High/Critical). The same labelled
 * dataset (data/ml/crime_risk_training.csv) is uploaded to Catalyst QuickML /
 * Zia AutoML for the no-code hosted model; this in-function implementation
 * makes the prediction feature work live and serves as a transparent,
 * explainable reference (you can see exactly which neighbours drove a result).
 *
 * If a QuickML hosted endpoint is configured (QUICKML_ENDPOINT_KEY) the API can
 * route to it via the SDK; otherwise this kNN model serves predictions.
 */

let catalystSdk = null;
try { catalystSdk = require("zcatalyst-sdk-node"); } catch (e) { catalystSdk = null; }

const { loadCsvDirect } = require("./store");
const path = require("path");
const fs = require("fs");

const FEATURES = ["population", "literacy_pct", "urban_pct", "density"];
const BANDS = ["Low", "Moderate", "High", "Critical"];

let _trained = null;

function loadTraining() {
  // training CSV is bundled alongside the function data
  const p = path.join(__dirname, "..", "data", "crime_risk_training.csv");
  const text = fs.readFileSync(p, "utf8");
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const idx = {};
  header.forEach((h, i) => (idx[h.trim()] = i));
  const rows = lines.slice(1).map((l) => {
    const c = l.split(",");
    return {
      x: FEATURES.map((f) => Number(c[idx[f]])),
      y: c[idx["risk_band"]].trim(),
    };
  });
  return rows;
}

/** Fit feature means/stds for standardization; cache training set. */
function train() {
  if (_trained) return _trained;
  const rows = loadTraining();
  const means = FEATURES.map((_, j) => rows.reduce((a, r) => a + r.x[j], 0) / rows.length);
  const stds = FEATURES.map((_, j) => {
    const m = means[j];
    const v = rows.reduce((a, r) => a + (r.x[j] - m) ** 2, 0) / rows.length;
    return Math.sqrt(v) || 1;
  });
  const z = (x) => x.map((v, j) => (v - means[j]) / stds[j]);
  const std = rows.map((r) => ({ z: z(r.x), y: r.y }));
  _trained = { rows: std, means, stds, n: rows.length };
  return _trained;
}

function dist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

/**
 * Predict risk band for a feature vector. Returns band + confidence + the
 * neighbours that drove the decision (explainability).
 */
function predict(features, { k = 5 } = {}) {
  const model = train();
  const zx = features.map((v, j) => (v - model.means[j]) / model.stds[j]);
  const neighbours = model.rows
    .map((r, i) => ({ i, d: dist(zx, r.z), y: r.y }))
    .sort((a, b) => a.d - b.d)
    .slice(0, k);
  const votes = {};
  neighbours.forEach((nb) => { votes[nb.y] = (votes[nb.y] || 0) + 1; });
  let band = BANDS[0], best = -1;
  for (const b of BANDS) if ((votes[b] || 0) > best) { best = votes[b] || 0; band = b; }
  return {
    risk_band: band,
    confidence: +(best / k).toFixed(2),
    votes,
    k,
    method: "k-NN (k=" + k + ") over standardized socio-economic features",
    features: Object.fromEntries(FEATURES.map((f, i) => [f, features[i]])),
  };
}

/** Score all districts from the scoring file (features) for a model dashboard. */
function scoreAllDistricts() {
  // Reuse the socioeconomic table (has features + district names) from Data Store/CSV.
  const socio = loadCsvDirect("socioeconomic");
  const out = [];
  for (const r of socio) {
    const pop = Number(r.population_2011);
    if (!pop) continue;
    const features = [pop, Number(r.literacy_pct), Number(r.urban_pct), Number(r.density_per_sqkm)];
    const pred = predict(features, { k: 5 });
    out.push({
      district: r.district,
      predicted_band: pred.risk_band,
      confidence: pred.confidence,
      actual_crime_rate: r.crime_rate_per_100k ? Number(r.crime_rate_per_100k) : null,
    });
  }
  const order = { Critical: 0, High: 1, Moderate: 2, Low: 3 };
  out.sort((a, b) => order[a.predicted_band] - order[b.predicted_band] || (b.actual_crime_rate || 0) - (a.actual_crime_rate || 0));
  return {
    model: "crime-risk kNN classifier",
    features: FEATURES,
    bands: BANDS,
    trained_on: train().n + " districts",
    results: out,
  };
}

module.exports = { predict, scoreAllDistricts, train, FEATURES, BANDS, predictZiaAutoML };

/**
 * Predict using a hosted **Catalyst Zia AutoML** model (service #13) when a
 * model id is configured (ZIA_AUTOML_MODEL_ID). Falls back to the in-function
 * k-NN if Zia AutoML is unavailable. Returns { source, ...prediction }.
 */
async function predictZiaAutoML(req, features) {
  const modelId = process.env.ZIA_AUTOML_MODEL_ID;
  const featObj = {
    population: features[0], literacy_pct: features[1],
    urban_pct: features[2], density: features[3],
  };
  if (modelId && catalystSdk && req) {
    try {
      const app = catalystSdk.initialize(req);
      const zia = app.zia();
      const res = await zia.automl(modelId, featObj);
      return { source: "zia_automl", model_id: modelId, prediction: res };
    } catch (e) {
      // fall through to local kNN
      const local = predict(features, { k: 5 });
      return { source: "knn_fallback", error: e.message, prediction: local };
    }
  }
  const local = predict(features, { k: 5 });
  return { source: "knn", prediction: local };
}
