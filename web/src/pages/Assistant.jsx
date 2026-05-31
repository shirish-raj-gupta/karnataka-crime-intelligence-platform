import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { Line } from "react-chartjs-2";
import { api, fmt } from "../api";
import { Card, PageHead } from "../components/Common.jsx";
import Icon from "../components/Icon.jsx";
import { speak as ttsSpeak } from "../speech";

const SUGGESTIONS = [
  "State overview", "Crime hotspots", "Top districts by crime", "Motives for murder",
  "Monthly trend of theft", "Crimes against women", "District risk scores", "Top IPC categories",
];

const GREETING = {
  role: "bot",
  text: "Namaskara. I'm your crime intelligence assistant for Karnataka (2025 data). Ask me about districts, hotspots, crime categories, risk scores, or crimes against vulnerable groups. Every answer is backed by the source data.",
  evidence: null,
};

export default function Assistant() {
  const [messages, setMessages] = useState([GREETING]);
  const [input, setInput] = useState("");
  const [lang, setLang] = useState("en");
  const [recording, setRecording] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages]);

  function push(msg) { setMessages((m) => [...m, msg]); }

  async function send(text) {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput("");
    push({ role: "user", text: q });
    try {
      const result = await api.ask(q, lang);
      // Prefer the LLM-generated natural answer when available; the deterministic
      // answer is always present as the grounded fallback.
      let answer = result.answer_llm || result.answer;

      // Kannada mode: if the answer isn't already in Kannada script, translate it
      // via the Catalyst QuickML LLM so the displayed + spoken answer is Kannada.
      if (lang === "kn" && !/[\u0C80-\u0CFF]/.test(answer)) {
        try {
          const tr = await api.translate(answer, "kn");
          if (tr && tr.translated) answer = tr.translated;
        } catch (e) { /* keep English answer if translation fails */ }
      }

      push({
        role: "bot",
        text: answer,
        evidence: result.evidence,
        data: result.data,
        ai: !!result.answer_llm,
        model: result.llm_model,
      });
      const res = ttsSpeak(answer, lang);
      if (lang === "kn" && res.warning === "no-kannada-voice") {
        push({
          role: "bot",
          text: "ℹ Your device has no Kannada (kn-IN) text-to-speech voice, so audio uses the closest available voice. The Kannada text above is correct. Install a Kannada voice in OS settings for native audio.",
          evidence: null,
        });
      }
    } catch (e) {
      push({ role: "bot", text: "Sorry, I couldn't reach the intelligence service: " + e.message, evidence: null });
    }
  }

  // Translate the latest assistant answer to Kannada via Catalyst QuickML LLM.
  async function translateLast() {
    const lastBot = [...messages].reverse().find((m) => m.role === "bot" && m.text && !m.translated);
    if (!lastBot) return;
    try {
      const r = await api.translate(lastBot.text, "kn");
      push({ role: "bot", text: r.translated, evidence: null, translated: true });
      // Speak in Kannada; warn once if the device has no Kannada voice.
      const res = ttsSpeak(r.translated, "kn");
      if (res.warning === "no-kannada-voice") {
        push({
          role: "bot",
          text: "ℹ Showing the Kannada translation above. Your device/browser has no Kannada (kn-IN) text-to-speech voice installed, so spoken playback uses the closest available voice. To hear native Kannada audio, install a Kannada voice in your OS settings (Windows: Settings → Time & Language → Speech → Add voices → Kannada).",
          evidence: null,
        });
      }
    } catch (e) {
      push({ role: "bot", text: "Translation unavailable: " + e.message, evidence: null });
    }
  }

  function speak(text) {
    ttsSpeak(text, lang);
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      push({ role: "bot", text: "Voice input isn't supported in this browser. Try Chrome/Edge for speech-to-text.", evidence: null });
      return;
    }
    const rec = new SR();
    rec.lang = lang === "kn" ? "kn-IN" : "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    setRecording(true);
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onerror = () => push({ role: "bot", text: "Voice capture failed. Try typing instead.", evidence: null });
    rec.onend = () => setRecording(false);
    rec.start();
  }

  async function exportPdf() {
    // Prefer server-side SmartBrowz PDF; fall back to client-side jsPDF.
    try {
      const blob = await api.conversationPdf(messages);
      if (blob && blob.type === "application/pdf") {
        downloadBlob(blob, "crime-intelligence-conversation.pdf");
        return;
      }
      // Non-PDF (e.g. HTML fallback from local dev) — fall through to jsPDF.
    } catch (e) {
      // network/endpoint error — fall through to jsPDF
    }
    exportPdfClient();
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function exportPdfClient() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const width = doc.internal.pageSize.getWidth() - margin * 2;
    const pageH = doc.internal.pageSize.getHeight();
    let y = margin;

    doc.setFontSize(16); doc.setTextColor(20, 30, 50);
    doc.text("Karnataka Crime Intelligence — Conversation Log", margin, y); y += 22;
    doc.setFontSize(10); doc.setTextColor(110);
    doc.text("Generated " + new Date().toLocaleString() + " · Source: KSP Monthly Crime Review 2025 (Public Domain)", margin, y);
    y += 24;

    messages.forEach((m) => {
      const who = m.role === "user" ? "Investigator" : "Assistant";
      doc.setFontSize(11);
      if (m.role === "user") doc.setTextColor(30, 90, 200); else doc.setTextColor(70, 70, 70);
      doc.text(who + ":", margin, y); y += 14;
      doc.setTextColor(30); doc.setFontSize(10);
      doc.splitTextToSize(m.text, width).forEach((ln) => {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(ln, margin, y); y += 13;
      });
      if (m.evidence) {
        doc.setTextColor(120); doc.setFontSize(8);
        doc.splitTextToSize("Evidence: " + JSON.stringify(m.evidence), width).forEach((ln) => {
          if (y > pageH - margin) { doc.addPage(); y = margin; }
          doc.text(ln, margin, y); y += 11;
        });
      }
      y += 8;
    });
    doc.save("crime-intelligence-conversation.pdf");
  }

  const headRight = (
    <div className="controls">
      <label>
        Language
        <select value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="en">English</option>
          <option value="kn">ಕನ್ನಡ (Kannada)</option>
        </select>
      </label>
      <button className="btn" title="Voice input" onClick={startVoice}><Icon name="mic" size={15} />{recording ? "● rec" : "Voice"}</button>
      <button className="btn" title="Translate last answer to Kannada (Catalyst QuickML LLM)" onClick={translateLast}><Icon name="translate" size={15} />Kannada</button>
      <button className="btn" title="Export conversation to PDF (SmartBrowz)" onClick={exportPdf}><Icon name="download" size={15} />PDF</button>
    </div>
  );

  return (
    <>
      <PageHead icon="assistant" title="Ask Intelligence"
        subtitle="Conversational, data-grounded crime intelligence — voice, Kannada translation, and PDF export." />
      <Card title="Ask the Crime Intelligence Assistant" icon="assistant" headRight={headRight}>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {messages.map((m, i) => (
          <Message key={i} msg={m} />
        ))}
      </div>
      <div className="chat-input">
        <input
          type="text"
          placeholder="Ask: top districts by crime, motives for murder, crimes against women…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="btn btn-primary" onClick={() => send()}><Icon name="assistant" size={15} />Send</button>
      </div>
      <div className="suggestions">
        {SUGGESTIONS.map((s) => (
          <span key={s} className="chip" onClick={() => send(s)}>{s}</span>
        ))}
      </div>
    </Card>
    </>
  );
}

function Message({ msg }) {
  const rows = previewRows(msg.data);
  const series = Array.isArray(msg.data?.series) ? msg.data.series : null;
  return (
    <>
      <div className={`msg ${msg.role}`}>
        <div className="bubble">
          {msg.ai && (
            <div className="ai-tag">
              <Icon name="spark" size={11} /> AI (Qwen 2.5 · grounded)
            </div>
          )}
          {msg.text}
          {msg.evidence && (
            <div className="evidence">
              Evidence — {Object.entries(msg.evidence).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" | ")}
            </div>
          )}
        </div>
      </div>
      {series && series.length > 0 && (
        <div className="msg bot">
          <div className="bubble" style={{ maxWidth: "95%", width: "95%" }}>
            <div style={{ height: 200 }}>
              <Line
                data={{
                  labels: series.map((p) => p.month),
                  datasets: [{
                    label: "Monthly count",
                    data: series.map((p) => p.count),
                    borderColor: "#4f9cff",
                    backgroundColor: "rgba(79,156,255,0.15)",
                    fill: true, tension: 0.35, pointRadius: 2,
                  }],
                }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }}
              />
            </div>
          </div>
        </div>
      )}
      {rows && (
        <div className="msg bot">
          <div className="bubble" style={{ maxWidth: "95%" }}>
            <table>
              <thead><tr>{rows.keys.map((k) => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>
                {rows.data.map((r, i) => (
                  <tr key={i}>{rows.keys.map((k) => <td key={k}>{typeof r[k] === "number" ? fmt(r[k]) : String(r[k])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function previewRows(d) {
  if (!d) return null;
  let arr = null;
  // Vulnerable-groups returns results[0].items (array of {crime_type,count}).
  if (Array.isArray(d.results) && d.results.length && Array.isArray(d.results[0].items)) {
    arr = d.results[0].items;
  } else if (Array.isArray(d.results)) arr = d.results;
  else if (d.hotspots) arr = d.hotspots;
  else if (d.subtypes) arr = d.subtypes;
  else if (Array.isArray(d.items)) arr = d.items;
  if (!arr || !arr.length) return null;
  const rows = arr.slice(0, 6);
  // Only show primitive columns — never render nested objects/arrays as text.
  const keys = Object.keys(rows[0])
    .filter((k) => {
      const v = rows[0][k];
      return !["evidence", "z_score", "district_id"].includes(k) && v !== null && typeof v !== "object";
    })
    .slice(0, 4);
  return { keys, data: rows };
}
