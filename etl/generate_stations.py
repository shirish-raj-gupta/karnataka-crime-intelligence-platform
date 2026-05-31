"""
Generate SYNTHETIC police-station + time-of-day data, grounded in the REAL
district crime totals.

Closes two challenge gaps that the aggregate public data can't support directly:
  - Police-station-level drill-down
  - Spatiotemporal clusters (time-of-day x location)

Method (clearly labelled synthetic, statistically grounded):
  - Each real district is split into N synthetic police stations; the district's
    REAL total crime is distributed across them via a skewed split (some stations
    are busier), so station totals SUM EXACTLY to the real district total.
  - Each station gets a realistic 24-hour crime distribution (bimodal: late-night
    + evening peaks) so time-of-day hotspots can be layered with location.
  - Station coordinates jitter around the real district centroid.

Outputs:
  - data/processed/stations.csv        (station_id, district, lat, lon, total, ...)
  - data/processed/station_hourly.csv  (station_id, hour, crime_count)
"""

from __future__ import annotations
import csv
import json
import os
import random

random.seed(20260601)

PROC = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

# Stations per district scaled by crime volume (busier districts -> more stations)
def n_stations(total):
    if total > 30000: return 12
    if total > 8000: return 8
    if total > 4000: return 6
    if total > 2000: return 4
    return 3

STATION_SUFFIX = ["City", "Town", "Rural", "North", "South", "East", "West",
                  "Central", "Market", "Cantonment", "Extension", "Industrial"]

# 24-hour weights: bimodal — late-night (0-3), and evening (18-22) peaks.
HOUR_WEIGHTS = [
    9, 8, 7, 5, 4, 3, 3, 4,   # 0-7
    5, 6, 6, 6, 6, 6, 6, 7,   # 8-15
    8, 9, 11, 12, 12, 11, 10, 9  # 16-23
]


def load_districts():
    out = []
    with open(os.path.join(PROC, "district_crime_summary.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["district_id"] == "STATE":
                continue
            ipc = int(r["ipc_bns_crimes"]) if r["ipc_bns_crimes"] else 0
            sll = int(r["sll_crimes"]) if r["sll_crimes"] else 0
            out.append({"id": r["district_id"], "district": r["district"],
                        "range": r["range_name"], "total": ipc + sll})
    return out


def centroids():
    geo = {}
    with open(os.path.join(PROC, "districts.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["latitude"] and r["longitude"]:
                geo[r["district_id"]] = (float(r["latitude"]), float(r["longitude"]))
    return geo


def split_total(total, n):
    """Split an integer total into n skewed positive parts summing exactly to total."""
    weights = [random.random() ** 1.5 + 0.1 for _ in range(n)]
    s = sum(weights)
    raw = [int(total * w / s) for w in weights]
    # fix rounding remainder
    diff = total - sum(raw)
    for i in range(abs(diff)):
        raw[i % n] += 1 if diff > 0 else -1
    return [max(0, x) for x in raw]


def main():
    districts = load_districts()
    geo = centroids()
    stations = []
    hourly = []
    sid = 0
    for d in districts:
        n = n_stations(d["total"])
        parts = split_total(d["total"], n)
        lat0, lon0 = geo.get(d["id"], (15.0, 76.0))
        names = random.sample(STATION_SUFFIX, min(n, len(STATION_SUFFIX)))
        while len(names) < n:
            names.append(f"Unit{len(names)+1}")
        for i in range(n):
            sid += 1
            station_id = f"SYN-PS-{sid:04d}"
            stot = parts[i]
            lat = round(lat0 + (random.random() - 0.5) * 0.4, 4)
            lon = round(lon0 + (random.random() - 0.5) * 0.4, 4)
            stations.append({
                "station_id": station_id,
                "station_name": f"{d['district']} {names[i]} PS",
                "district_id": d["id"],
                "district": d["district"],
                "range_name": d["range"],
                "latitude": lat, "longitude": lon,
                "total_crimes": stot,
                "synthetic": "true",
            })
            # distribute station total across 24 hours by HOUR_WEIGHTS
            hw = sum(HOUR_WEIGHTS)
            hsplit = [int(stot * w / hw) for w in HOUR_WEIGHTS]
            diff = stot - sum(hsplit)
            for k in range(abs(diff)):
                hsplit[(18 + k) % 24] += 1 if diff > 0 else -1
            for h in range(24):
                hourly.append({
                    "station_id": station_id,
                    "district_id": d["id"],
                    "district": d["district"],
                    "hour": h,
                    "crime_count": max(0, hsplit[h]),
                })

    with open(os.path.join(PROC, "stations.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["station_id", "station_name", "district_id",
                                          "district", "range_name", "latitude",
                                          "longitude", "total_crimes", "synthetic"])
        w.writeheader(); w.writerows(stations)

    with open(os.path.join(PROC, "station_hourly.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["station_id", "district_id", "district", "hour", "crime_count"])
        w.writeheader(); w.writerows(hourly)

    # verify station totals reconcile to district totals
    by_d = {}
    for s in stations:
        by_d[s["district_id"]] = by_d.get(s["district_id"], 0) + s["total_crimes"]
    mismatches = sum(1 for d in districts if by_d.get(d["id"], 0) != d["total"])

    meta_path = os.path.join(PROC, "meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    meta.setdefault("tables", {}).update({
        "stations": len(stations), "station_hourly": len(hourly)})
    meta["station_data"] = "SYNTHETIC stations & hourly distribution; station totals reconcile to real district totals"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps({"stations": len(stations), "hourly_rows": len(hourly),
                      "district_total_mismatches": mismatches}, indent=2))


if __name__ == "__main__":
    main()
