import { useEffect, useState } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { api } from "./api";
import { checkAuth, resolveRole, allowedTabs, signOut, isDevBypass, ROLE_DESCRIPTIONS } from "./auth";
import Dashboard from "./pages/Dashboard.jsx";
import HotspotMap from "./pages/HotspotMap.jsx";
import Patterns from "./pages/Patterns.jsx";
import Trends from "./pages/Trends.jsx";
import RiskVulnerable from "./pages/RiskVulnerable.jsx";
import Socio from "./pages/Socio.jsx";
import Network from "./pages/Network.jsx";
import Assistant from "./pages/Assistant.jsx";
import Login from "./pages/Login.jsx";
import GlobalSearch from "./components/GlobalSearch.jsx";
import PushToggle from "./components/PushToggle.jsx";
import Icon from "./components/Icon.jsx";
import Brand from "./components/Brand.jsx";

const TAB_DEFS = [
  { id: "dashboard", to: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "map", to: "/map", label: "Hotspot Map", icon: "map" },
  { id: "patterns", to: "/patterns", label: "Crime Patterns", icon: "patterns" },
  { id: "trends", to: "/trends", label: "Trends & Forecast", icon: "trends" },
  { id: "risk", to: "/risk", label: "Risk & Vulnerable", icon: "risk" },
  { id: "socio", to: "/socio", label: "Socio-Economic", icon: "socio" },
  { id: "network", to: "/network", label: "Network Analysis", icon: "network" },
  { id: "assistant", to: "/assistant", label: "Ask Intelligence", icon: "assistant" },
];

export default function App() {
  const [authState, setAuthState] = useState("checking"); // checking | in | out
  const [user, setUser] = useState(null);
  const [role, setRole] = useState("Analyst");
  const [meta, setMeta] = useState(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    checkAuth()
      .then((u) => {
        if (u) {
          setUser(u);
          setRole(resolveRole(u));
          setAuthState("in");
        } else {
          setAuthState("out");
        }
      })
      .catch(() => setAuthState("out"));
  }, []);

  useEffect(() => {
    if (authState !== "in") return;
    api.health().then(setMeta).catch(() => setOffline(true));
  }, [authState]);

  if (authState === "checking") {
    return (
      <div className="boot-screen">
        <div className="boot-spin" />
        Authenticating…
      </div>
    );
  }
  if (authState === "out") {
    return <Login onLogin={(u) => { setUser(u); setRole(resolveRole(u)); setAuthState("in"); }} />;
  }

  const tabs = TAB_DEFS.filter((t) => allowedTabs(role).includes(t.id));
  const allowed = allowedTabs(role);
  const firstPath = tabs.length ? tabs[0].to : "/dashboard";
  const displayName = user?.first_name ? `${user.first_name}${user.last_name ? " " + user.last_name : ""}` : "User";
  const initial = (displayName[0] || "U").toUpperCase();

  // Guard a route by role; redirect to the role's first allowed tab if denied.
  const guard = (tabId, element) =>
    allowed.includes(tabId) ? element : <Navigate to={firstPath} replace />;

  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="gov-strip" aria-hidden="true"><span></span><span></span><span></span></div>
      <header className="topbar" role="banner">
        <Brand />
        <div className="topbar-right">
          <GlobalSearch />
          <span className={"badge" + (offline ? " offline" : "")} title="Data provenance">
            <span className="dot" />
            {offline ? "API offline" : meta ? `${meta.source ? "KSP" : "Data"} · ${meta.year}` : "Loading…"}
          </span>
          <span className="role-pill" title={ROLE_DESCRIPTIONS[role] || ""}>
            <span className="avatar">{initial}</span>
            <span className="rp-name">{displayName} · </span>{role}
          </span>
          <PushToggle />
          <button className="btn signout-btn" onClick={() => signOut()} title="Sign out">
            <Icon name="logout" size={15} />
            {isDevBypass() ? "Reload" : "Sign out"}
          </button>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => "tab" + (isActive ? " active" : "")}>
            <Icon name={t.icon} size={16} />
            {t.label}
          </NavLink>
        ))}
      </nav>

      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Navigate to={firstPath} replace />} />
          <Route path="/dashboard" element={guard("dashboard", <Dashboard />)} />
          <Route path="/map" element={guard("map", <HotspotMap />)} />
          <Route path="/patterns" element={guard("patterns", <Patterns />)} />
          <Route path="/trends" element={guard("trends", <Trends />)} />
          <Route path="/risk" element={guard("risk", <RiskVulnerable />)} />
          <Route path="/socio" element={guard("socio", <Socio />)} />
          <Route path="/network" element={guard("network", <Network />)} />
          <Route path="/assistant" element={guard("assistant", <Assistant />)} />
          <Route path="*" element={<Navigate to={firstPath} replace />} />
        </Routes>
      </main>

      <footer className="footer">
        <span className="footer-badge">
          <Icon name="doc" size={13} />
          {meta ? `Source: ${meta.source} (${meta.license})` : "Source: Karnataka State Police Monthly Crime Review"}
        </span>
        <span className="footer-badge">
          <Icon name="shield" size={13} />
          Deployed on Zoho Catalyst · Role-based access
        </span>
      </footer>
    </>
  );
}
