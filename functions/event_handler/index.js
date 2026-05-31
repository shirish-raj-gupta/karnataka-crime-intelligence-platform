"use strict";

/**
 * Event Function (Catalyst Signals + Event Functions).
 *
 * Reacts to in-project events — e.g. a new row inserted into a Data Store table
 * (new crime record / audit entry) or an object uploaded to Stratus (a new
 * generated report). This is the "react to in-project events" capability and
 * the foundation for proactive, event-driven crime intelligence:
 *   - on a new high-severity incident insert -> could raise an alert
 *   - on a new report upload -> could notify supervisors
 *
 * Event functions receive the event payload. We inspect it and log a structured
 * reaction. (Side-effects like Mail/Push can be wired in once those senders are
 * configured.) Resilient: never throws back into the platform.
 */

module.exports = (event, context) => {
  const log = (m) => console.log(`[event_handler] ${m}`);
  try {
    // The event payload shape varies by source (Data Store / Stratus / etc).
    const data = event && (event.data || event.getData ? (event.getData ? event.getData() : event.data) : event);
    const source = (data && (data.source || data.bucket_name || data.table_name)) || "unknown";
    const action = (data && (data.action || data.operation || data.event_type)) || "event";

    log(`received event: source=${source} action=${action}`);

    // Example reaction logic (extend as needed):
    if (String(source).toLowerCase().includes("incident") || String(source).toLowerCase().includes("crimeheads")) {
      log("crime-data change detected — would refresh aggregates / raise trend re-check");
    }
    if (String(source).toLowerCase().includes("report") || String(action).toLowerCase().includes("upload")) {
      log("new report artifact detected — would notify supervisors");
    }

    if (context && typeof context.closeWithSuccess === "function") context.closeWithSuccess();
  } catch (err) {
    log("error handling event: " + err.message);
    if (context && typeof context.closeWithFailure === "function") context.closeWithFailure();
  }
};
