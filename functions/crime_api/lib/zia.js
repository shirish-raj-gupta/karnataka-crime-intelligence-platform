"use strict";

/**
 * Catalyst Zia Services integration (#14).
 *
 * Two genuinely police-relevant capabilities:
 *   1. OCR  — extract text from a scanned FIR / document image (multipart upload).
 *   2. Text analytics on free-text case notes:
 *        - NER (Named Entity Recognition): pull people / places / orgs / dates
 *        - Keyword extraction
 *        - Sentiment
 *      This turns unstructured case notes into structured, searchable intelligence
 *      — directly addressing the challenge's "fragmented information" problem.
 *
 * Auth: inside the function the SDK uses project scope; if Zia requires extra
 * scope it can reuse the same Connection pattern as the LLM. Errors degrade
 * gracefully so the endpoint never hard-fails the app.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

let catalystSdk = null;
try { catalystSdk = require("zcatalyst-sdk-node"); } catch (e) { catalystSdk = null; }

function available() {
  return !!catalystSdk;
}

/** Run NER + keywords + sentiment on a block of case-note text. */
async function analyzeText(req, text) {
  if (!catalystSdk || !req) { const e = new Error("Zia SDK unavailable"); e.code = "NO_SDK"; throw e; }
  const app = catalystSdk.initialize(req);
  const zia = app.zia();
  const docs = [String(text || "").slice(0, 4000)];
  const out = { input_chars: docs[0].length };

  // Each call is independent; collect what succeeds.
  try {
    out.entities = await zia.getNERPrediction(docs);
  } catch (e) { out.entities_error = e.message; }
  try {
    out.keywords = await zia.getKeywordExtraction(docs);
  } catch (e) { out.keywords_error = e.message; }
  try {
    out.sentiment = await zia.getSentimentAnalysis(docs);
  } catch (e) { out.sentiment_error = e.message; }

  return out;
}

/** OCR: extract text from an uploaded image file (path on disk). */
async function ocrImage(req, filePath) {
  if (!catalystSdk || !req) { const e = new Error("Zia SDK unavailable"); e.code = "NO_SDK"; throw e; }
  const app = catalystSdk.initialize(req);
  const zia = app.zia();
  const stream = fs.createReadStream(filePath);
  const res = await zia.extractOpticalCharacters(stream, {});
  return res;
}

/** Save an incoming base64 image to a temp file and OCR it. */
async function ocrBase64(req, base64, ext = "png") {
  const tmp = path.join(os.tmpdir(), `zia-ocr-${Date.now()}.${ext}`);
  const data = base64.replace(/^data:image\/\w+;base64,/, "");
  fs.writeFileSync(tmp, Buffer.from(data, "base64"));
  try {
    return await ocrImage(req, tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) { /* noop */ }
  }
}

module.exports = { available, analyzeText, ocrImage, ocrBase64 };
