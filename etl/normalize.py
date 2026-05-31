"""
ETL: Normalize Karnataka State Police aggregate crime CSVs into a clean
relational model ready for ingestion into Catalyst Data Store.

Source: Karnataka State Police Monthly Crime Review (2025), republished by
data.opencity.in (Public Domain).

The raw CSVs are hierarchical (range -> district, category -> subtype) and
this script flattens them into tidy, typed tables. Pure stdlib, no deps.

Outputs (data/processed):
  - districts.csv               district reference + geo placeholders
  - district_crime_summary.csv  per-district IPC/BNS & SLL totals
  - crime_heads.csv             IPC/BNS & SLL category + subtype counts (statewide)
  - special_crimes.csv          crimes vs Women / Children / SC-ST
  - meta.json                   provenance + load stats
"""

from __future__ import annotations

import csv
import json
import os
import re
from datetime import datetime, timezone

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

YEAR = 2025
SOURCE = "Karnataka State Police Monthly Crime Review (via data.opencity.in)"
LICENSE = "Public Domain"

# District centroids (lat, lon) for the geospatial map layer. District-level
# only -- this dataset has no incident-level coordinates.
DISTRICT_CENTROIDS = {
    "Bengaluru City": (12.9716, 77.5946),
    "Mysuru City": (12.2958, 76.6394),
    "Hubballi Dharwad City": (15.3647, 75.1240),
    "Mangaluru City": (12.9141, 74.8560),
    "Belagavi City": (15.8497, 74.4977),
    "Kalaburagi City": (17.3297, 76.8343),
    "Bengaluru Dist": (13.0000, 77.5000),
    "Bengaluru South": (12.8000, 77.5500),
    "Tumakuru": (13.3379, 77.1173),
    "Kolar": (13.1357, 78.1326),
    "Chickballapura": (13.4355, 77.7315),
    "K.G.F": (12.9558, 78.2691),
    "Chitradurga": (14.2251, 76.3980),
    "Davanagere": (14.4644, 75.9218),
    "Shivamogga": (13.9299, 75.5681),
    "Haveri": (14.7935, 75.4045),
    "Dakshina Kannada": (12.8703, 75.2479),
    "Udupi": (13.3409, 74.7421),
    "Chikkamagaluru": (13.3161, 75.7720),
    "Uttara Kannada": (14.6195, 74.8354),
    "Belagavi Dist": (15.8497, 74.4977),
    "Bagalkot": (16.1691, 75.6615),
    "Vijayapur": (16.8302, 75.7100),
    "Dharwad": (15.4589, 75.0078),
    "Gadag": (15.4315, 75.6355),
    "Kalaburagi": (17.3297, 76.8343),
    "Bidar": (17.9133, 77.5301),
    "Yadgir": (16.7700, 77.1376),
    "Mysuru Dist": (12.2958, 76.6394),
    "Mandya": (12.5223, 76.8954),
    "Chamarajanagar": (11.9261, 76.9438),
    "Hassan": (13.0073, 76.0962),
    "Kodagu": (12.3375, 75.8069),
    "Ballari": (15.1394, 76.9214),
    "Koppal": (15.3500, 76.1543),
    "Raichur": (16.2076, 77.3463),
    "Vijayanagara": (15.3350, 76.4600),
    "Karnataka Railways": (15.3173, 75.7139),
}

NUM_RE = re.compile(r"^\d+[a-z]?$")  # matches "1", "8a", etc.


def _clean(s: str) -> str:
    return (s or "").strip()


def _to_int(s: str):
    s = _clean(s).replace(",", "")
    if s == "" or s == "-":
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def read_rows(path: str):
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.reader(f):
            yield [_clean(c) for c in row]


# --------------------------------------------------------------------------
# 1. District-wise summary
# --------------------------------------------------------------------------
def parse_districts(path: str):
    """Range headers have empty Sl No and blank count cells; districts have a
    numeric Sl No; STATE / Karnataka Railways are special total rows."""
    districts = []
    summaries = []
    current_range = None
    did = 0

    for row in read_rows(path):
        if len(row) < 4:
            continue
        sl, name, ipc, sll = row[0], row[1], row[2], row[3]
        if not name or name.lower() in ("districts/units",):
            continue

        is_range_header = (sl == "" and ipc == "" and sll == "")
        if is_range_header:
            current_range = name
            continue

        ipc_v, sll_v = _to_int(ipc), _to_int(sll)

        if name.upper() == "STATE":
            summaries.append({
                "district_id": "STATE", "district": "STATE",
                "range_name": "STATE", "district_type": "State Total",
                "ipc_bns_crimes": ipc_v, "sll_crimes": sll_v, "year": YEAR,
            })
            continue

        # Karnataka Railways appears as a standalone total row (no Sl No)
        if name == "Karnataka Railways":
            current_range = "Karnataka Railways"

        did += 1
        district_id = f"D{did:02d}"
        dtype = "Commissionerate" if current_range == "Commissionerates" else (
            "Railways" if current_range == "Karnataka Railways" else "District")
        lat, lon = DISTRICT_CENTROIDS.get(name, (None, None))

        districts.append({
            "district_id": district_id, "district": name,
            "range_name": current_range or "Unknown", "district_type": dtype,
            "latitude": lat, "longitude": lon,
        })
        summaries.append({
            "district_id": district_id, "district": name,
            "range_name": current_range or "Unknown", "district_type": dtype,
            "ipc_bns_crimes": ipc_v, "sll_crimes": sll_v, "year": YEAR,
        })

    return districts, summaries


# --------------------------------------------------------------------------
# 2. Crime heads (IPC/BNS and SLL detailed files share the same shape)
# --------------------------------------------------------------------------
def parse_crime_heads(path: str, law_type: str):
    """Flatten a hierarchical KSP "heads of crime" sheet.

    Row shapes encountered in the source (all handled here):
      * Pattern A header:  "N,CATEGORY,"        numeric Sl No, empty count
      * Pattern B header:  ",CATEGORY,"         blank Sl No, empty count, and
                            the number lands on the FIRST subtype row instead
                            (a genuine inconsistency in the KSP sheet, e.g.
                            "ATTEMPT TO MURDER").
      * Single category:   "N,CATEGORY,123"     numeric Sl No + a count
      * Subtype:           ",label,123"         blank Sl No + a count
      * Sub total:         ",Sub Total,123"     the category's official total
      * Derived total:     ",Total Burglary,.." totals-of-totals / grand totals
                            that must NOT be summed into a category.

    Each emitted row carries a ``row_type`` so the downstream API/LLM layer can
    reason about the data without re-deriving this structure.
    ``category_seq`` is our own unique counter (the source Sl No repeats/typos,
    e.g. a stray "49" before the real 49), kept separately as ``source_sl``.
    """
    rows = []
    cat_seq = 0
    cur = None  # {"seq", "source_sl", "name", "has_subtypes"}

    def emit(row_type, subtype, count):
        rows.append({
            "law_type": law_type,
            "category_seq": cur["seq"],
            "source_sl": cur["source_sl"] or "",
            "category": cur["name"],
            "row_type": row_type,
            "subtype": subtype,
            "count": count,
            "year": YEAR,
        })

    for row in read_rows(path):
        row = (row + ["", "", ""])[:3]
        sl, head, count = row[0], row[1], row[2]
        if not sl and not head and not count:
            continue
        if head.lower() == "heads of crime" or sl.lower() in ("sl. no.", "sl no"):
            continue
        cval = _to_int(count)

        if NUM_RE.match(sl):
            # Pattern B: the open category came from a blank-Sl header and is
            # still waiting for its number + first subtype.
            if cur and cur["source_sl"] is None and not cur["has_subtypes"] \
                    and cval is not None:
                cur["source_sl"] = sl
                cur["has_subtypes"] = True
                emit("subtype", head, cval)
                continue
            # Otherwise this starts a new category.
            cat_seq += 1
            cur = {"seq": cat_seq, "source_sl": sl, "name": head,
                   "has_subtypes": False}
            if cval is not None:
                emit("single", "", cval)  # single-count category
            continue

        # Blank Sl No.
        if cval is None:
            # Empty count + blank Sl No => Pattern B category header.
            cat_seq += 1
            cur = {"seq": cat_seq, "source_sl": None, "name": head,
                   "has_subtypes": False}
            continue

        if cur is None:
            continue
        low = head.lower()
        if low.startswith("sub total"):
            emit("subtotal", "TOTAL", cval)
        elif low.startswith("total"):
            emit("derived_total", head, cval)  # excluded from subtype sums
        else:
            cur["has_subtypes"] = True
            emit("subtype", head, cval)
    return rows


# --------------------------------------------------------------------------
# 3. Special crimes (Women / Children / SC-ST) -- three side-by-side blocks
# --------------------------------------------------------------------------
def parse_special_crimes(path: str):
    """The file has three independent blocks across columns:
    [0..2] Women, [3..5] Children, [6..8] SC/ST. We read each block separately."""
    out = []
    blocks = [
        ("Women", 1, 2),
        ("Children", 4, 5),
        ("SC/ST", 7, 8),
    ]
    first = True
    for row in read_rows(path):
        if first:  # header
            first = False
            continue
        row = (row + [""] * 9)[:9]
        for victim_group, name_idx, count_idx in blocks:
            name = row[name_idx]
            count = _to_int(row[count_idx])
            if not name:
                continue
            if name.lower().startswith("crimes against") or name.lower() == "":
                continue
            is_total = name.lower().startswith("total") or \
                name.lower().startswith("sub total")
            out.append({
                "victim_group": victim_group,
                "crime_type": name,
                "is_total": is_total,
                "count": count,
                "year": YEAR,
            })
    return out


def write_csv(path: str, rows: list, fields: list):
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in rows:
            w.writerow(r)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    districts, summaries = parse_districts(
        os.path.join(RAW_DIR, "ka-district-wise-2025.csv"))
    ipc = parse_crime_heads(
        os.path.join(RAW_DIR, "ka-ipc-crimes-2025.csv"), "IPC")
    sll = parse_crime_heads(
        os.path.join(RAW_DIR, "ka-sll-crimes-2025.csv"), "SLL")
    crime_heads = ipc + sll

    special_path = os.path.join(RAW_DIR, "ka-crimes-women-children-sc-st-2025.csv")
    special = parse_special_crimes(special_path) if os.path.exists(special_path) else []

    write_csv(os.path.join(OUT_DIR, "districts.csv"), districts,
              ["district_id", "district", "range_name", "district_type",
               "latitude", "longitude"])
    write_csv(os.path.join(OUT_DIR, "district_crime_summary.csv"), summaries,
              ["district_id", "district", "range_name", "district_type",
               "ipc_bns_crimes", "sll_crimes", "year"])
    write_csv(os.path.join(OUT_DIR, "crime_heads.csv"), crime_heads,
              ["law_type", "category_seq", "source_sl", "category",
               "row_type", "subtype", "count", "year"])
    write_csv(os.path.join(OUT_DIR, "special_crimes.csv"), special,
              ["victim_group", "crime_type", "is_total", "count", "year"])

    meta = {
        "source": SOURCE,
        "license": LICENSE,
        "year": YEAR,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "tables": {
            "districts": len(districts),
            "district_crime_summary": len(summaries),
            "crime_heads": len(crime_heads),
            "special_crimes": len(special),
        },
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
