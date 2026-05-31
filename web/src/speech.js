// Robust browser Text-to-Speech helper.
//
// Problems this solves:
//  1. speechSynthesis.getVoices() is often EMPTY on first call — voices load
//     asynchronously and fire the "voiceschanged" event later.
//  2. Many systems have NO Kannada (kn-IN) voice installed, so setting
//     u.lang = "kn-IN" produces silence. We detect this and pick the best
//     available voice (prefer kn → any Indian/Hindi → default) so it always
//     speaks, and report which voice was used.

let _voices = [];

function loadVoices() {
  if (!window.speechSynthesis) return [];
  _voices = window.speechSynthesis.getVoices() || [];
  return _voices;
}

// Prime the voice list as early as possible (and on the async event).
if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/** Return the list of available voices, loading them if needed. */
export function getVoices() {
  if (!_voices.length) loadVoices();
  return _voices;
}

/** True if a real Kannada voice is installed on this device. */
export function hasKannadaVoice() {
  return getVoices().some((v) => /^kn(-|_|$)/i.test(v.lang) || /kannada/i.test(v.name));
}

/**
 * Pick the best voice for a target language.
 * For Kannada: exact kn → any Indian English (en-IN) / Hindi (hi-IN) → default.
 */
function pickVoice(lang) {
  const voices = getVoices();
  if (!voices.length) return null;
  if (lang === "kn") {
    return (
      voices.find((v) => /^kn(-|_|$)/i.test(v.lang) || /kannada/i.test(v.name)) ||
      voices.find((v) => /^hi(-|_|$)/i.test(v.lang)) ||      // Hindi can render Devanagari-ish phonetics
      voices.find((v) => /(-|_)IN$/i.test(v.lang)) ||         // any Indian-locale voice
      null
    );
  }
  return voices.find((v) => /^en(-|_)IN$/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
}

/**
 * Speak `text`. Returns { ok, voice, warning }.
 *   lang: "kn" | "en"
 * Ensures voices are loaded first (handles the async race), cancels any
 * in-flight utterance, and always falls back to a usable voice.
 */
export function speak(text, lang = "en") {
  if (!window.speechSynthesis || !text) return { ok: false, warning: "no-tts" };

  const run = () => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(lang);
    if (v) u.voice = v;
    // Set lang explicitly; if a kn voice exists this matches it, otherwise the
    // chosen fallback voice still speaks.
    u.lang = lang === "kn" ? (v && /^kn/i.test(v.lang) ? v.lang : (v ? v.lang : "kn-IN")) : (v ? v.lang : "en-IN");
    u.rate = 0.98;
    u.pitch = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return v;
  };

  // If voices aren't loaded yet, wait briefly for them.
  if (!getVoices().length) {
    setTimeout(() => { loadVoices(); run(); }, 250);
    return { ok: true, voice: null, warning: "voices-loading" };
  }

  const used = run();
  const warning = lang === "kn" && !hasKannadaVoice()
    ? "no-kannada-voice"
    : null;
  return { ok: true, voice: used ? used.name : null, warning };
}

export function stopSpeaking() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}
