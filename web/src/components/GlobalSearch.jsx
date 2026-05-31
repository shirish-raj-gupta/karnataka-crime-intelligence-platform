import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import Icon from "./Icon.jsx";

// Friendly labels + which columns to show per Data Store table.
const TABLE_META = {
  CrimeHeads: { label: "Crime Heads", primary: "category", secondary: "subtype", tag: (r) => r.law_type },
  Districts: { label: "Districts", primary: "district", secondary: "range_name", tag: (r) => r.district_type },
  SpecialCrimes: { label: "Special Crimes", primary: "crime_type", secondary: "victim_group", tag: (r) => r.victim_group },
};

/**
 * Global full-text search powered by Catalyst Search (#10).
 * Debounced query against /search, grouped results in a dropdown panel.
 */
export default function GlobalSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const boxRef = useRef(null);
  const timer = useRef(null);

  // Debounced search.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q || q.trim().length < 2) {
      setData(null);
      setErr(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.search(q.trim(), 30);
        setData(res);
        setErr(null);
      } catch (e) {
        setErr(e.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => timer.current && clearTimeout(timer.current);
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const groups = data?.groups || {};
  const total = data?.total || 0;
  const sourceTag = data?.source === "catalyst_search" ? "Catalyst Search" : "Local index";

  return (
    <div className="gsearch" ref={boxRef}>
      <span className="gsearch-wrap">
        <span className="gs-ic"><Icon name="search" size={15} /></span>
        <input
          type="search"
          className="gsearch-input"
          placeholder="Search crimes, districts, victims…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          aria-label="Global search"
        />
      </span>
      {open && (q.trim().length >= 2) && (
        <div className="gsearch-panel" role="listbox">
          <div className="gsearch-head">
            <span>{loading ? "Searching…" : `${total} result${total === 1 ? "" : "s"}`}</span>
            {data && <span className="gsearch-source">{sourceTag}</span>}
          </div>
          {err && <div className="gsearch-empty">Search error: {err}</div>}
          {!loading && !err && total === 0 && (
            <div className="gsearch-empty">No matches for “{q}”.</div>
          )}
          {Object.keys(groups).map((table) => {
            const meta = TABLE_META[table] || { label: table, primary: Object.keys(groups[table][0] || {})[0] };
            return (
              <div className="gsearch-group" key={table}>
                <div className="gsearch-group-title">{meta.label}</div>
                {groups[table].slice(0, 8).map((row, i) => (
                  <div className="gsearch-row" key={i}>
                    <div className="gsearch-primary">{row[meta.primary]}</div>
                    <div className="gsearch-secondary">
                      {meta.secondary && row[meta.secondary] ? row[meta.secondary] : ""}
                      {meta.tag && meta.tag(row) ? <span className="gsearch-chip">{meta.tag(row)}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
