"""Build a REAL monthly crime series from the 12 KSP monthly review files.

Source: data/import/CRIME_REVIEW_FOR_THE_MONTH_OF_<MONTH>_2025*.csv
Each monthly file is a state-level crime-head table with columns (header naming
varies slightly per file, so we match by position/fuzzy):
  Sl.No. | Heads of Crime | Major Heads | Minor Heads
  | During the current year upto the end of month under review   (YTD)
  | During the corresponding month of previous year              (prev-year same month)
  | During the previous month                                    (prev month)
  | During the current month                                     (THIS month's count)

We extract the **subtotal (TOTAL) rows per Major Head** and the per-month count,
producing a tidy long series:
  data/processed/monthly_series.csv
    law_type, category, month_idx (1-12), month_name, current_month,
    ytd, same_month_prev_year, prev_month

This is REAL month-by-month data (the "During the current month" column),
replacing the synthetic monthly interpolation in the Trends tab.

Stdlib only.
"""
import csv
import os
import re
import glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMPORT_DIR = os.path.join(ROOT, "data", "import")
OUT_DIR = os.path.join(ROOT, "data", "processed")
OUT = os.path.join(OUT_DIR, "monthly_series.csv")

MONTHS = {
    "JANUARY": 1, "FEBRUARY": 2, "MARCH": 3, "APRIL": 4, "MAY": 5, "JUNE": 6,
    "JULY": 7, "AUGUST": 8, "SEPTEMBER": 9, "OCTOBER": 10, "NOVEMBER": 11,
    "DECEMBER": 12,
}
MONTH_NAME = {v: k.title() for k, v in MONTHS.items()}


def month_from_filename(fn):
    up = fn.upper()
    for name, idx in MONTHS.items():
        if name in up:
            return idx
    return None


def num(v):
    if v is None:
        return 0
    s = str(v).strip().replace(",", "")
    if s == "" or s == "-":
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def law_type_from_major(heads_crime):
    """The 'Heads of Crime' column groups rows: 'A - IPC Crime',
    'B - SPECIAL & LOCAL LAWS', 'C. CRIMES AGAINST WOMEN', etc."""
    s = (heads_crime or "").upper()
    if "IPC" in s:
        return "IPC"
    if "SPECIAL" in s or "LOCAL LAW" in s or "SLL" in s:
        return "SLL"
    if "WOMEN" in s:
        return "WOMEN"
    if "CHILD" in s:
        return "CHILDREN"
    if "SCHEDULED" in s or "SC" in s:
        return "SCST"
    return "OTHER"


def pick_one(files):
    """If duplicates exist for a month, prefer the one without '(1)' / pick first."""
    files = sorted(files)
    return files[0]


def load_month(path):
    """Aggregate the per-month count by (law_type, Major Head).

    The monthly files are flat subtype lists (no TOTAL rows), so we SUM all
    minor rows under each Major Head to get the category total for that month.
    Returns dict keyed by (law_type, category) -> summed metrics.
    """
    agg = {}
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return agg
        for r in reader:
            if len(r) < 8:
                continue
            heads_crime = r[1].strip()
            major = r[2].strip()
            if not major:
                continue
            lt = law_type_from_major(heads_crime)
            key = (lt, major)
            cur = agg.setdefault(key, {
                "law_type": lt, "category": major,
                "ytd": 0, "same_month_prev_year": 0, "prev_month": 0, "current_month": 0,
            })
            cur["ytd"] += num(r[4])
            cur["same_month_prev_year"] += num(r[5])
            cur["prev_month"] += num(r[6])
            cur["current_month"] += num(r[7])
    return agg


def main():
    # Group files by month, dedupe.
    by_month = {}
    for path in glob.glob(os.path.join(IMPORT_DIR, "CRIME_REVIEW_FOR_THE_MONTH_OF_*.csv")):
        m = month_from_filename(os.path.basename(path))
        if m is None:
            continue
        by_month.setdefault(m, []).append(path)

    out_rows = []
    months_found = []
    for m in sorted(by_month):
        path = pick_one(by_month[m])
        months_found.append((m, os.path.basename(path)))
        agg = load_month(path)
        for rec in agg.values():
            rec["month_idx"] = m
            rec["month_name"] = MONTH_NAME[m]
            out_rows.append(rec)

    os.makedirs(OUT_DIR, exist_ok=True)
    cols = ["law_type", "category", "month_idx", "month_name",
            "current_month", "ytd", "same_month_prev_year", "prev_month"]

    def write_csv(target):
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=cols)
            w.writeheader()
            w.writerows(out_rows)

    write_csv(OUT)
    # Also bundle into the function's data dir so the deployed API can read it.
    fn_target = os.path.join(ROOT, "functions", "crime_api", "data", "monthly_series.csv")
    write_csv(fn_target)
    print(f"wrote -> {OUT}\nwrote -> {fn_target}")

    # Report
    print("months parsed:")
    for m, fn in months_found:
        print(f"  {m:2d} {MONTH_NAME[m]:10s} <- {fn}")
    cats = set((r["law_type"], r["category"]) for r in out_rows)
    print(f"\nrows: {len(out_rows)}  unique categories: {len(cats)}")

    # Sanity: state IPC + SLL annual = sum of Dec YTD across IPC/SLL categories?
    dec = [r for r in out_rows if r["month_idx"] == 12]
    ipc_ytd = sum(r["ytd"] for r in dec if r["law_type"] == "IPC")
    sll_ytd = sum(r["ytd"] for r in dec if r["law_type"] == "SLL")
    print(f"Dec YTD sums -> IPC={ipc_ytd:,}  SLL={sll_ytd:,} (compare to 138,666 / 63,867)")

    # Also: sum of current_month across all 12 months for IPC should ~= Dec YTD IPC.
    ipc_monthsum = sum(r["current_month"] for r in out_rows if r["law_type"] == "IPC")
    print(f"Sum of monthly IPC current_month across 12 months = {ipc_monthsum:,}")


if __name__ == "__main__":
    main()
