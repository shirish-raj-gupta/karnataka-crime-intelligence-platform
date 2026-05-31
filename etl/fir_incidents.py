"""Build REAL incident-level analytics tables from the Karnataka Police FIR
dataset (1.6M FIRs, Apache-2.0, via Kaggle: vanshangaria/fir-details-karnataka-police).

Input  : data/import/FIR_Details_Data.csv   (~573 MB, streamed row-by-row)
Outputs (compact, browser/API-friendly):
  data/processed/fir_hotspots.csv   lat/long grid cells with incident counts
  data/processed/fir_units.csv      per police-unit aggregates + mean coords
  data/processed/fir_groups.csv     crime-group breakdown (real counts)
  data/processed/fir_outcomes.csv   per-district victim/accused/arrest/conviction
  data/processed/fir_meta.json      totals + provenance

Also copies the four CSVs into functions/crime_api/data/ so the deployed API
can read them directly (same pattern as monthly_series.csv).

Design notes
------------
* Streams the file (never loads 1.6M rows into memory).
* Fuzzy header matching — the Kaggle export's column names vary in
  case/spacing, so we resolve them by normalised name.
* Karnataka bounding box filter drops junk/zero coordinates.
* Grid cells = lat/long rounded to GRID dp (~1.1 km at 2dp) so the heat layer
  is a few thousand cells, not 1.6M points. Top cells capped for payload size.

Stdlib only.
"""
import csv
import os
import json
import sys
import math

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IN = os.path.join(ROOT, "data", "import", "FIR_Details_Data.csv")
OUT_DIR = os.path.join(ROOT, "data", "processed")
FN_DIR = os.path.join(ROOT, "functions", "crime_api", "data")

# Karnataka bounding box (generous) to drop bad / out-of-state coordinates.
KA_LAT = (11.0, 19.0)
KA_LNG = (73.5, 79.0)

GRID_DP = 2          # ~1.1 km cells
HOTSPOT_CAP = 1500   # max grid cells emitted (top by count)
UNIT_CAP = 1200      # max police-unit points emitted

# csv field size: some rows have long free-text fields
csv.field_size_limit(10_000_000)


def norm(s):
    return "".join(ch for ch in str(s).lower() if ch.isalnum())


# Map normalised header -> our canonical key. Multiple aliases allowed.
HEADER_ALIASES = {
    "districtname": "district",
    "impodistrictname": "district",  # some exports prefix the 1st column with junk
    "unitname": "unit",
    "firyear": "year",
    "firmonth": "month",
    "crimegroupname": "crime_group",
    "crimeheadname": "crime_head",
    "latitude": "lat",
    "longitude": "lng",
    "male": "male",
    "female": "female",
    "boy": "boy",
    "girl": "girl",
    "victimcount": "victims",
    "accusedcount": "accused",
    "arrestedcountno": "arrested",
    "arrestedcount": "arrested",
    "accusedchargesheetedcount": "chargesheeted",
    "convictioncount": "convictions",
}


def to_int(v):
    if v is None:
        return 0
    s = str(v).strip().replace(",", "")
    if not s or s in ("-", "NA", "NULL", "null"):
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def to_float(v):
    try:
        return float(str(v).strip())
    except (ValueError, AttributeError):
        return None


def resolve_columns(header):
    """Return {canonical_key: column_index} from the real header row."""
    idx = {}
    for i, col in enumerate(header):
        key = HEADER_ALIASES.get(norm(col))
        if key and key not in idx:
            idx[key] = i
    # Fallbacks for messy headers (e.g. junk-prefixed first column).
    if "district" not in idx:
        for i, col in enumerate(header):
            if "district" in norm(col):
                idx["district"] = i
                break
    return idx


def main():
    if not os.path.exists(IN):
        print(f"ERROR: input not found: {IN}")
        print("Download FIR_Details_Data.csv from Kaggle and place it in data/import/.")
        sys.exit(1)

    grid = {}        # (latc, lngc) -> count
    units = {}       # (district, unit) -> aggregate
    groups = {}      # crime_group -> count
    outcomes = {}    # district -> outcome aggregate

    total = 0
    geo_ok = 0
    year_min, year_max = None, None

    with open(IN, newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            print("ERROR: empty file")
            sys.exit(1)
        col = resolve_columns(header)
        required = ["district", "lat", "lng"]
        missing = [k for k in required if k not in col]
        if missing:
            print(f"ERROR: could not find columns {missing} in header:")
            print(header)
            sys.exit(1)

        gi = col.get
        for r in reader:
            if not r:
                continue
            total += 1
            # year range
            if "year" in col:
                y = to_int(r[gi("year")]) if gi("year") < len(r) else 0
                if y:
                    year_min = y if year_min is None else min(year_min, y)
                    year_max = y if year_max is None else max(year_max, y)

            district = (r[gi("district")] or "").strip() if gi("district") < len(r) else ""
            unit = (r[gi("unit")] or "").strip() if "unit" in col and gi("unit") < len(r) else ""
            cg = (r[gi("crime_group")] or "").strip() if "crime_group" in col and gi("crime_group") < len(r) else ""

            if cg:
                groups[cg] = groups.get(cg, 0) + 1

            # outcomes per district
            if district:
                o = outcomes.setdefault(district, {
                    "district": district, "incidents": 0, "victims": 0,
                    "male": 0, "female": 0, "boy": 0, "girl": 0,
                    "accused": 0, "arrested": 0, "chargesheeted": 0, "convictions": 0,
                })
                o["incidents"] += 1
                for k in ("victims", "male", "female", "boy", "girl",
                          "accused", "arrested", "chargesheeted", "convictions"):
                    if k in col and gi(k) < len(r):
                        o[k] += to_int(r[gi(k)])

            lat = to_float(r[gi("lat")]) if gi("lat") < len(r) else None
            lng = to_float(r[gi("lng")]) if gi("lng") < len(r) else None
            if (lat is None or lng is None or
                    not (KA_LAT[0] <= lat <= KA_LAT[1]) or
                    not (KA_LNG[0] <= lng <= KA_LNG[1])):
                continue
            geo_ok += 1

            latc = round(lat, GRID_DP)
            lngc = round(lng, GRID_DP)
            grid[(latc, lngc)] = grid.get((latc, lngc), 0) + 1

            if district or unit:
                u = units.setdefault((district, unit), {
                    "district": district, "unit": unit or district,
                    "sum_lat": 0.0, "sum_lng": 0.0, "total_crimes": 0,
                })
                u["sum_lat"] += lat
                u["sum_lng"] += lng
                u["total_crimes"] += 1

            if total % 200000 == 0:
                print(f"  ...processed {total:,} rows ({geo_ok:,} geo-valid)")

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(FN_DIR, exist_ok=True)

    # ---- hotspots grid (top by count) ----
    grid_rows = [
        {"lat": latc, "lng": lngc, "count": c}
        for (latc, lngc), c in grid.items()
    ]
    grid_rows.sort(key=lambda x: x["count"], reverse=True)
    grid_rows = grid_rows[:HOTSPOT_CAP]

    # ---- units (top by volume), finalise mean coords ----
    unit_rows = []
    for u in units.values():
        n = u["total_crimes"] or 1
        unit_rows.append({
            "district": u["district"],
            "unit": u["unit"],
            "latitude": round(u["sum_lat"] / n, 5),
            "longitude": round(u["sum_lng"] / n, 5),
            "total_crimes": u["total_crimes"],
        })
    unit_rows.sort(key=lambda x: x["total_crimes"], reverse=True)
    unit_rows = unit_rows[:UNIT_CAP]

    # ---- groups ----
    group_rows = [{"crime_group": k, "count": v} for k, v in groups.items()]
    group_rows.sort(key=lambda x: x["count"], reverse=True)

    # ---- outcomes ----
    outcome_rows = list(outcomes.values())
    outcome_rows.sort(key=lambda x: x["incidents"], reverse=True)

    def write(name, rows, cols):
        for target_dir in (OUT_DIR, FN_DIR):
            with open(os.path.join(target_dir, name), "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=cols)
                w.writeheader()
                w.writerows(rows)

    write("fir_hotspots.csv", grid_rows, ["lat", "lng", "count"])
    write("fir_units.csv", unit_rows, ["district", "unit", "latitude", "longitude", "total_crimes"])
    write("fir_groups.csv", group_rows, ["crime_group", "count"])
    write("fir_outcomes.csv", outcome_rows,
          ["district", "incidents", "victims", "male", "female", "boy", "girl",
           "accused", "arrested", "chargesheeted", "convictions"])

    meta = {
        "source": "Karnataka Police FIR dataset (incident-level)",
        "license": "Apache-2.0",
        "via": "Kaggle: vanshangaria/fir-details-karnataka-police",
        "total_firs": total,
        "geo_valid_firs": geo_ok,
        "year_min": year_min,
        "year_max": year_max,
        "hotspot_cells": len(grid_rows),
        "units": len(unit_rows),
        "crime_groups": len(group_rows),
        "grid_dp": GRID_DP,
    }
    for target_dir in (OUT_DIR, FN_DIR):
        with open(os.path.join(target_dir, "fir_meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)

    print("\n=== DONE ===")
    print(json.dumps(meta, indent=2))
    print(f"\nTop 5 hotspot cells: {grid_rows[:5]}")
    print(f"Top 5 units: {[ (u['unit'], u['total_crimes']) for u in unit_rows[:5] ]}")
    print(f"Top 5 crime groups: {[ (g['crime_group'], g['count']) for g in group_rows[:5] ]}")


if __name__ == "__main__":
    main()
