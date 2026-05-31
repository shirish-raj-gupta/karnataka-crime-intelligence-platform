import { useState } from "react";
import { enablePush, notificationSupported } from "../push";

/**
 * Topbar button to opt in to crime-spike alerts (#25).
 * Uses Catalyst native web push when a user session exists, else a live in-app
 * alerter driven by the platform's real spike analytics (works in demo mode).
 * Hidden only when the browser has no Notification API at all.
 */
export default function PushToggle() {
  const [state, setState] = useState("idle"); // idle | enabling | on | error
  const [msg, setMsg] = useState("");

  if (!notificationSupported()) return null;

  async function onClick() {
    setState("enabling");
    setMsg("");
    const res = await enablePush();
    if (res.ok) {
      setState("on");
      setMsg(res.mode === "catalyst" ? "Catalyst push enabled" : "Live alerts enabled");
    } else {
      setState("error");
      setMsg(res.reason || "Could not enable");
    }
  }

  const label =
    state === "on" ? "🔔 Alerts on" :
    state === "enabling" ? "Enabling…" :
    state === "error" ? "🔔 Retry alerts" : "🔔 Enable alerts";

  return (
    <button
      className="btn push-toggle"
      onClick={onClick}
      disabled={state === "enabling" || state === "on"}
      title={state === "error" ? msg : (state === "on" ? msg : "Get alerts for emerging crime spikes")}
    >
      {label}
    </button>
  );
}
