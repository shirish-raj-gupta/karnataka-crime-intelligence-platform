"""Build the bundled district_totals.json for the AppSail open-data microservice.

Reads the real, reconciled district crime summary (data/import) and writes a
compact JSON array the standalone Node service serves. Stdlib only.
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "data", "import", "district_crime_summary.csv")
OUT_DIR = os.path.join(ROOT, "appsail", "data")
OUT = os.path.join(OUT_DIR, "district_totals.json")


def main():
    rows = []
    with open(SRC, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append({
                "district_id": r["district_id"],
                "district": r["district"],
                "range_name": r["range_name"],
                "district_type": r["district_type"],
                "ipc_bns_crimes": int(r["ipc_bns_crimes"] or 0),
                "sll_crimes": int(r["sll_crimes"] or 0),
                "year": int(r["year"] or 2025),
            })
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(rows)} rows -> {OUT}")


if __name__ == "__main__":
    main()
