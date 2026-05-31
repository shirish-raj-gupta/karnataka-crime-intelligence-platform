"""
Prepare Data Store import-ready CSVs.

Catalyst ds:import maps CSV headers to table columns. Numeric columns can reject
empty cells, so we fill blank numeric fields with 0 and write copies into
data/import/. Text columns are left as-is.
"""
import csv
import os

PROC = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "import")

# numeric columns per file that must not be blank
NUMERIC = {
    "districts": [],  # lat/lon kept as text (may be blank for a unit)
    "district_crime_summary": ["ipc_bns_crimes", "sll_crimes", "year"],
    "crime_heads": ["category_seq", "count", "year"],
    "special_crimes": ["count", "year"],
    "crime_temporal": ["ytd", "same_month_prev_year", "prev_month",
                        "current_month", "yoy_change", "mom_change"],
}


def prepare(name, numeric_cols):
    src = os.path.join(PROC, f"{name}.csv")
    dst = os.path.join(OUT, f"{name}.csv")
    with open(src, encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    fields = rows[0].keys() if rows else []
    for r in rows:
        for c in numeric_cols:
            if c in r and (r[c] is None or str(r[c]).strip() == ""):
                r[c] = "0"
    with open(dst, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(fields))
        w.writeheader()
        w.writerows(rows)
    print(f"{name}: {len(rows)} rows -> data/import/{name}.csv")


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, cols in NUMERIC.items():
        prepare(name, cols)


if __name__ == "__main__":
    main()
