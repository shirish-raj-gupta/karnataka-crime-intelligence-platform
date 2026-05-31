import { useState } from "react";
import { api } from "../api";
import { Card, Loading, ErrorBanner } from "./Common.jsx";

const SAMPLE =
  "On 12 March, accused Ramesh Kumar from Bengaluru was arrested near MG Road for chain snatching. " +
  "The victim Suresh Rao lost a gold chain worth Rs 50000. Police suspect links to a gang operating in Tumakuru.";

// Extracts entity list + keywords from the Zia response (shapes vary slightly).
function parse(result) {
  const out = { entities: [], keywords: [], keyphrases: [], sentiment: null };
  try {
    const ner = result.entities?.[0]?.ner?.general_entities || [];
    out.entities = ner.map((e) => ({ token: e.token, tag: e.ner_tag, conf: e.confidence_score }));
  } catch (e) { /* noop */ }
  try {
    const kw = result.keywords?.[0]?.keyword_extractor || {};
    out.keywords = kw.keywords || [];
    out.keyphrases = kw.keyphrases || [];
  } catch (e) { /* noop */ }
  try {
    out.sentiment = result.sentiment?.[0]?.sentiment_prediction?.[0]?.document_sentiment || null;
  } catch (e) { /* noop */ }
  return out;
}

const TAG_COLOR = {
  Person: "#4f9cff", Date: "#7b61ff", Location: "#3ddc97",
  Organization: "#ffb347", default: "#9bb0c9",
};

export default function CaseNoteAnalyzer() {
  const [text, setText] = useState(SAMPLE);
  const [state, setState] = useState({ loading: false, error: null, data: null });

  async function run() {
    setState({ loading: true, error: null, data: null });
    try {
      const result = await api.ziaAnalyzeNotes(text);
      setState({ loading: false, error: null, data: parse(result) });
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  }

  const d = state.data;
  return (
    <Card title="Case-note analyzer (Catalyst Zia — NER + keywords + sentiment)">
      <p className="note">
        Turn unstructured free-text case notes into structured intelligence: extract people, dates,
        places, organizations, key phrases and sentiment — addressing the "fragmented information" problem.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        style={{ width: "100%", background: "var(--panel-2)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: 8, padding: 10, fontFamily: "inherit", fontSize: 13, marginTop: 8 }}
      />
      <div className="controls" style={{ marginTop: 8 }}>
        <button className="btn btn-primary" onClick={run} disabled={state.loading}>Analyze with Zia</button>
        <button className="btn" onClick={() => setText(SAMPLE)}>Reset sample</button>
      </div>

      {state.loading && <Loading label="Zia analyzing…" />}
      {state.error && <ErrorBanner message={state.error} />}
      {d && (
        <div style={{ marginTop: 14 }}>
          <h3>Entities</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {d.entities.length ? d.entities.map((e, i) => (
              <span key={i} className="band" style={{ background: `${(TAG_COLOR[e.tag] || TAG_COLOR.default)}22`, color: TAG_COLOR[e.tag] || TAG_COLOR.default }}>
                {e.token} · {e.tag}
              </span>
            )) : <span className="note">No entities returned.</span>}
          </div>

          <h3 style={{ marginTop: 14 }}>Key phrases</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {[...d.keyphrases, ...d.keywords].map((k, i) => (
              <span key={i} className="chip">{k}</span>
            ))}
          </div>

          {d.sentiment && (
            <p className="note" style={{ marginTop: 14 }}>
              Document sentiment: <b style={{ color: d.sentiment === "Negative" ? "var(--danger)" : d.sentiment === "Positive" ? "var(--ok)" : "var(--muted)" }}>{d.sentiment}</b>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
