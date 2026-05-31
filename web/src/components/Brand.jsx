import { useState } from "react";
import Icon from "./Icon.jsx";

// Government brand lockup. Shows the KSP emblem (public/ksp.png) when present,
// otherwise a clean shield mark. Drop your logo at web/public/ksp.png and it
// appears automatically (served at ./ksp.png under the /app/ base).
export default function Brand({ compact = false }) {
  const [imgOk, setImgOk] = useState(true);
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        {imgOk ? (
          <img src="./KSP.png" alt="KSP emblem" className="brand-logo" onError={() => setImgOk(false)} />
        ) : (
          <Icon name="shield" size={compact ? 28 : 24} />
        )}
      </span>
      {!compact && (
        <div>
          <h1>Karnataka Crime Intelligence Platform</h1>
          <p className="subtitle">State Crime Records Bureau · Analytical &amp; Conversational Intelligence</p>
        </div>
      )}
    </div>
  );
}
