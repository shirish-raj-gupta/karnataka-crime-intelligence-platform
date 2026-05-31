import { useState } from "react";
import { goToLogin, demoLogin, DEMO_MODE, DEMO_ACCOUNTS } from "../auth.js";
import Icon from "../components/Icon.jsx";

// Login screen. In DEMO_MODE it shows a credential form backed by the demo
// accounts (role-based access for judging). Otherwise it redirects to the
// Catalyst Hosted Login page.
export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

  function submit(e) {
    if (e) e.preventDefault();
    setBusy(true);
    setError("");
    const res = demoLogin(username, password);
    if (res.ok) {
      onLogin ? onLogin(res.user) : window.location.reload();
    } else {
      setError(res.error);
      setBusy(false);
    }
  }

  function quickFill(acct) {
    setUsername(acct.username);
    setPassword(acct.password);
    setError("");
  }

  return (
    <div className="login-screen">
      <div className="gov-strip" aria-hidden="true" style={{ position: "fixed", top: 0 }}><span></span><span></span><span></span></div>
      <div className="login-brand">
        <span className="brand-mark" aria-hidden="true">
          {logoOk ? <img src="./KSP.png" alt="KSP emblem" className="brand-logo" onError={() => setLogoOk(false)} /> : <Icon name="shield" size={32} />}
        </span>
        <h1>Karnataka Crime Intelligence Platform</h1>
        <p className="subtitle">State Crime Records Bureau · Secure Access</p>
      </div>

      <div className="login-card">
        <h2 style={{ marginTop: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="logout" size={18} style={{ transform: "scaleX(-1)", color: "var(--accent)" }} />
          Sign in to continue
        </h2>

        {DEMO_MODE ? (
          <>
            <p className="login-note" style={{ marginTop: 0, textAlign: "left" }}>
              Role-based access (Supervisor, Analyst, Investigator, Policymaker).
              Sign in with a demo account below.
            </p>

            <form onSubmit={submit}>
              <div className="login-field">
                <label htmlFor="u">Username</label>
                <input id="u" type="text" autoComplete="username" value={username}
                  onChange={(e) => setUsername(e.target.value)} placeholder="supervisor" />
              </div>
              <div className="login-field">
                <label htmlFor="p">Password</label>
                <input id="p" type="password" autoComplete="current-password" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>

              {error && <div className="login-error"><Icon name="alert" size={14} /> {error}</div>}

              <button type="submit" className="btn btn-primary login-go" disabled={busy}>
                <Icon name="shield" size={16} />
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>

            <div className="login-accounts">
              <div className="login-accounts-title">Demo accounts — click to fill</div>
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.username} type="button" className="login-acct" onClick={() => quickFill(a)}>
                  <span className="login-acct-role">{a.role}</span>
                  <span className="login-acct-cred">{a.username} / {a.password}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="login-note" style={{ marginTop: 0, textAlign: "left" }}>
              Authorised personnel only. Access is role-based and audited.
            </p>
            <button className="btn btn-primary login-go" onClick={goToLogin}>
              <Icon name="logout" size={16} style={{ transform: "scaleX(-1)" }} />
              Sign in with Catalyst
            </button>
          </>
        )}
      </div>
    </div>
  );
}
