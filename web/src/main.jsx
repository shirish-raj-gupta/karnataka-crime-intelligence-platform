import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./chartSetup";
import "./styles/theme.css";
import "./styles/layout.css";
import "./styles/components.css";
import App from "./App.jsx";
import { DEMO_MODE } from "./auth";

// Expose demo flag for the API client (disables 401->login redirect in demo).
if (typeof window !== "undefined") window.__DEMO_MODE__ = DEMO_MODE;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
