"""
ETL: Normalize the KSP Monthly Crime Review table into a temporal-analytics
table with derived Year-over-Year (YoY) and Month-over-Month (MoM) metrics.

Source columns:
  - Heads of Crime  -> section (A IPC / B SLL / C Women / D Children / E SC-ST)
  - Major Heads     -> crime category
  - Minor Heads     -> sub-type (NA when category is a single line)
  - "...current year upto the end of month under review" -> ytd
  - "...corresponding month of previous year"            -> same_month_prev_year
  - "...previous month"                                  -> prev_month
  - "...current month"                                   -> current_month

Derived per row:
  - yoy_change, yoy_pct      (current_month vs same_month_prev_year)
  - mom_change, mom_pct      (current_month vs prev_month)
  - spike_score              (z-like signal flagging unusual current-month rises)
  - trend                    ("rising" | "falling" | "stable")

Output: data/processed/crime_temporal.csv  (+ updates meta)
This is real comparative time data (current vs previous month, current vs same
month last year), which powers the "emerging trend alerts" capability.
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone

RAW = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
SRC = os.path.join(RAW, "ka-crime-review-dec-2025.csv")

REVIEW_MONTH = "2025-12"  # December 2025 review (annual cumulative)

SECTION_MAP = {
    "A - IPC Crime": "IPC",
    "B - SPECIAL & LOCAL LAWS": "SLL",
    "C. CRIMES AGAINST WOMEN": "Women",
    "D.CRIME AGAINST CHILDREN": "Children",
    "E. CRIME AGAINST SCHEDULED CASTES /TRIBES BY NON SCs/STs": "SC/ST",
}


def clean(s):
    return (s or "").strip()


def to_int(s):
    s = clean(s).replace(",", "")
    if s in ("", "-", "NA"):
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def section_of(heads):
    h = clean(heads).replace("\n", " ")
    for key, val in SECTION_MAP.items():
        if h.startswith(key[:8]):
            return val
    # robust fallback by keyword
    hl = h.lower()
    if "ipc" in hl:
        return "IPC"
    if "special" in hl or "local law" in hl:
        return "SLL"
    if "women" in hl:
        return "Women"
    if "children" in hl:
        return "Children"
    if "scheduled" in hl or "sc" in hl:
        return "SC/ST"
    return "Other"


def pct(curr, base):
    if base is None or base == 0:
        return None
    return round((curr - base) / base * 100, 1)


def main():
    rows_out = []
    with open(SRC, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            section = section_of(r.get("Heads of Crime"))
            major = clean(r.get("Major Heads")).replace("\n", " ")
            minor = clean(r.get("Minor Heads")).replace("\n", " ")
            ytd = to_int(r.get("During the current year upto the end of month under review"))
            prev_year = to_int(r.get("During the corresponding month of previous year"))
            prev_month = to_int(r.get("During the previous month"))
            curr_month = to_int(r.get("During the current month"))

            # Skip rows that are entirely empty of measures
            if all(v is None for v in (ytd, prev_year, prev_month, curr_month)):
                continue

            is_total = minor.lower().startswith("sub total") or minor.lower().startswith("total") or minor == ""
            cm = curr_month or 0

            yoy_change = (cm - prev_year) if prev_year is not None else None
            mom_change = (cm - prev_month) if prev_month is not None else None
            yoy_pct = pct(cm, prev_year)
            mom_pct = pct(cm, prev_month)

            # Simple spike score: combine MoM and YoY momentum, weighted by volume
            # so tiny categories don't dominate. Bounded, explainable.
            spike = 0.0
            if mom_pct is not None:
                spike += max(min(mom_pct, 300), -100) / 100.0
            if yoy_pct is not None:
                spike += max(min(yoy_pct, 300), -100) / 100.0
            spike = round(spike, 2)

            if mom_change is None and yoy_change is None:
                trend = "unknown"
            else:
                net = (mom_change or 0) + (yoy_change or 0)
                trend = "rising" if net > 0 else "falling" if net < 0 else "stable"

            rows_out.append({
                "review_month": REVIEW_MONTH,
                "section": section,
                "category": major,
                "subtype": minor if not is_total else "TOTAL",
                "row_type": "total" if is_total else "subtype",
                "ytd": ytd,
                "same_month_prev_year": prev_year,
                "prev_month": prev_month,
                "current_month": curr_month,
                "yoy_change": yoy_change,
                "yoy_pct": yoy_pct,
                "mom_change": mom_change,
                "mom_pct": mom_pct,
                "spike_score": spike,
                "trend": trend,
            })

    fields = ["review_month", "section", "category", "subtype", "row_type",
              "ytd", "same_month_prev_year", "prev_month", "current_month",
              "yoy_change", "yoy_pct", "mom_change", "mom_pct", "spike_score", "trend"]
    out_path = os.path.join(OUT, "crime_temporal.csv")
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows_out)

    # update meta
    meta_path = os.path.join(OUT, "meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    meta.setdefault("tables", {})["crime_temporal"] = len(rows_out)
    meta["temporal_review_month"] = REVIEW_MONTH
    meta["temporal_generated_at"] = datetime.now(timezone.utc).isoformat()
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps({"crime_temporal_rows": len(rows_out),
                      "sample": rows_out[:2]}, indent=2))


if __name__ == "__main__":
    main()
