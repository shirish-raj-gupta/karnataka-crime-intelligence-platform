"use strict";

/**
 * QuickML LLM Serving integration (Catalyst Generative AI — service #11),
 * authenticated via a Catalyst Connection (service #19).
 *
 * The function's default OAuth scope does NOT cover QuickML, so we use a
 * Catalyst Connection ("quickml_conn", scope QuickML.deployment.READ) to obtain
 * a properly-scoped Authorization header, then call the LLM chat endpoint.
 *
 * Grounding (RAG-style, hallucination-safe):
 *   1. nlq.js resolves the question to REAL data (retrieval).
 *   2. That data + question go to Qwen 2.5 14B Instruct for a fluent,
 *      multilingual (English/Kannada) answer (generation).
 *   3. On any failure we return null and the caller uses the deterministic
 *      answer, so the assistant never breaks and stays data-accurate.
 */

const https = require("https");

let catalystSdk = null;
try {
  catalystSdk = require("zcatalyst-sdk-node");
} catch (e) {
  catalystSdk = null;
}

const MODEL = process.env.LLM_MODEL || "crm-di-qwen_text_14b-fp8-it";
const CONNECTION = process.env.LLM_CONNECTION || "quickml_conn";
const PROJECT_ID = process.env.LLM_PROJECT_ID || "";
const LLM_HOST = "api.catalyst.zoho.in";
const LLM_PATH = `/quickml/v2/project/${PROJECT_ID}/llm/chat`;

function enabled() {
  return process.env.USE_LLM === "true" && !!catalystSdk;
}

const SYSTEM_PROMPT =
  "You are the Karnataka Crime Intelligence assistant for the State Crime Records Bureau. " +
  "Answer ONLY using the DATA provided in the user message. Be concise, factual and professional. " +
  "Quote the real figures from the data. Never invent numbers. If the data does not contain the answer, say so. " +
  "If the user writes in Kannada, reply in Kannada; otherwise reply in English.";

/** POST JSON to the LLM endpoint with the connection's auth headers. */
function postLLM(authHeaders, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const headers = Object.assign(
      { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      authHeaders || {}
    );
    const r = https.request(
      { host: LLM_HOST, path: LLM_PATH, method: "POST", headers, timeout: 30000 },
      (resp) => {
        let data = "";
        resp.on("data", (c) => (data += c));
        resp.on("end", () => {
          if (resp.statusCode >= 400) return reject(new Error(`LLM ${resp.statusCode}: ${data.slice(0, 200)}`));
          try { resolve(JSON.parse(data)); } catch (e) { resolve({ response: data }); }
        });
      }
    );
    r.on("error", reject);
    r.on("timeout", () => { r.destroy(); reject(new Error("LLM timeout")); });
    r.write(body);
    r.end();
  });
}

/**
 * Generate a natural-language answer grounded in `context`. Returns a string,
 * or null if disabled/unavailable (caller falls back to deterministic answer).
 */
async function generate(req, { question, context, lang = "en" }) {
  if (!enabled() || !req) return null;
  try {
    const app = catalystSdk.initialize(req);
    // Obtain a properly-scoped Authorization header from the Connection.
    const creds = await app.connections().getConnectionCredentials(CONNECTION);
    const authHeaders = Object.assign({}, (creds && creds.headers) || {});
    // The QuickML endpoint also requires the org id header.
    if (process.env.LLM_ORG_ID) authHeaders["CATALYST-ORG"] = process.env.LLM_ORG_ID;

    const dataStr = JSON.stringify(context).slice(0, 2000);
    const langHint = lang === "kn" ? " Reply in Kannada." : "";
    const prompt = `Q: ${question}\nDATA: ${dataStr}\nAnswer in 2-3 sentences for an investigator, using only DATA's figures.${langHint}`;

    const out = await postLLM(authHeaders, {
      prompt,
      model: MODEL,
      system_prompt: "Karnataka SCRB crime assistant. Use only DATA, quote real figures, never invent.",
      top_p: 0.9,
      top_k: 50,
      temperature: 0.3,
      max_tokens: 2048,
    });

    const text = out && (out.response || out.result || (Array.isArray(out.result) ? out.result[0] : null));
    return text ? String(text).trim() : null;
  } catch (e) {
    console.warn("[llm] generate failed, falling back:", e.message);
    if (process.env.LLM_DEBUG === "true") throw e;
    return null;
  }
}

/**
 * Translate text between English and Kannada using the Catalyst QuickML LLM.
 * This makes the assistant's translation genuinely Catalyst-backed (#15 —
 * translation), rather than browser-only. Returns translated string or null.
 */
async function translate(req, { text, target = "kn" }) {
  if (!enabled() || !req || !text) return null;
  try {
    const app = catalystSdk.initialize(req);
    const creds = await app.connections().getConnectionCredentials(CONNECTION);
    const authHeaders = Object.assign({}, (creds && creds.headers) || {});
    if (process.env.LLM_ORG_ID) authHeaders["CATALYST-ORG"] = process.env.LLM_ORG_ID;

    const targetName = target === "en" ? "English" : "Kannada";
    const prompt =
      `Translate the following crime-intelligence text into ${targetName}. ` +
      `Output ONLY the translation, no notes, no quotes.\n\nTEXT:\n${String(text).slice(0, 1500)}`;

    const out = await postLLM(authHeaders, {
      prompt,
      model: MODEL,
      system_prompt: "You are a precise English<->Kannada translator. Output only the translation.",
      top_p: 0.9,
      top_k: 50,
      temperature: 0.2,
      max_tokens: 1024,
    });
    const t = out && (out.response || out.result || (Array.isArray(out.result) ? out.result[0] : null));
    return t ? String(t).trim() : null;
  } catch (e) {
    console.warn("[llm] translate failed:", e.message);
    if (process.env.LLM_DEBUG === "true") throw e;
    return null;
  }
}

module.exports = { generate, translate, enabled };
