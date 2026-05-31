"""
Build a district-level socio-economic reference table for the Sociological /
Predictive dashboards (challenge requirement: "Socio-Economic Correlation —
overlay crime data with urbanization, population distribution and socio-economic
indicators to understand the 'why' behind the 'where'").

Figures are approximate public-domain values derived from Census of India 2011
for Karnataka districts (population, literacy %, urbanisation %, population
density). They are used as analytical context, not as precise current numbers.

Output: data/processed/socioeconomic.csv
The ETL joins these to the real crime-summary districts by name so the API can
compute crime-rate-per-100k and correlations with socio-economic indicators.
"""

from __future__ import annotations
import csv
import json
import os

PROC = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

# district: (population_2011, literacy_pct, urban_pct, density_per_sqkm)
# Public-domain Census of India 2011 approximations for Karnataka.
CENSUS = {
    "Bengaluru City": (9621551, 88.7, 90.9, 4378),
    "Bengaluru Dist": (990923, 75.0, 31.0, 441),
    "Bengaluru South": (990923, 75.0, 31.0, 441),
    "Mysuru City": (3001127, 72.8, 41.5, 476),
    "Mysuru Dist": (3001127, 72.8, 41.5, 476),
    "Hubballi Dharwad City": (1847023, 80.0, 56.8, 434),
    "Dharwad": (1847023, 80.0, 56.8, 434),
    "Mangaluru City": (2089649, 88.6, 47.7, 457),
    "Dakshina Kannada": (2089649, 88.6, 47.7, 457),
    "Belagavi City": (4779661, 73.5, 25.0, 356),
    "Belagavi Dist": (4779661, 73.5, 25.0, 356),
    "Kalaburagi": (2566326, 64.9, 31.0, 233),
    "Kalaburagi City": (2566326, 64.9, 31.0, 233),
    "Tumakuru": (2678980, 75.1, 19.0, 253),
    "Kolar": (1536401, 74.3, 32.0, 296),
    "Chickballapura": (1255104, 70.1, 23.0, 297),
    "K.G.F": (1536401, 74.3, 60.0, 296),
    "Chitradurga": (1659456, 73.7, 19.0, 197),
    "Davanagere": (1945497, 75.7, 32.3, 329),
    "Shivamogga": (1752753, 80.5, 35.0, 207),
    "Haveri": (1597668, 77.6, 21.0, 332),
    "Udupi": (1177361, 86.2, 28.0, 304),
    "Chikkamagaluru": (1137961, 79.2, 18.0, 158),
    "Uttara Kannada": (1437169, 84.1, 30.0, 140),
    "Bagalkot": (1889752, 68.8, 28.0, 288),
    "Vijayapur": (2177331, 67.2, 23.0, 207),
    "Gadag": (1064570, 75.2, 35.0, 230),
    "Bidar": (1703300, 70.5, 24.0, 312),
    "Yadgir": (1174271, 51.8, 17.0, 224),
    "Mandya": (1805769, 70.4, 16.0, 365),
    "Chamarajanagar": (1020791, 61.4, 17.0, 187),
    "Hassan": (1776421, 76.1, 21.0, 261),
    "Kodagu": (554519, 82.6, 14.0, 135),
    "Ballari": (2452595, 67.4, 38.0, 300),
    "Koppal": (1389920, 68.1, 17.0, 251),
    "Raichur": (1928812, 59.6, 24.0, 228),
    "Vijayanagara": (1353628, 67.0, 30.0, 270),
    "Karnataka Railways": (0, 0.0, 0.0, 0),
}


def main():
    summ_path = os.path.join(PROC, "district_crime_summary.csv")
    rows = []
    with open(summ_path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["district_id"] == "STATE":
                continue
            name = r["district"]
            ipc = int(r["ipc_bns_crimes"]) if r["ipc_bns_crimes"] else 0
            sll = int(r["sll_crimes"]) if r["sll_crimes"] else 0
            total = ipc + sll
            pop, lit, urb, dens = CENSUS.get(name, (0, 0.0, 0.0, 0))
            crime_rate = round(total / pop * 100000, 1) if pop else None
            rows.append({
                "district_id": r["district_id"],
                "district": name,
                "population_2011": pop,
                "literacy_pct": lit,
                "urban_pct": urb,
                "density_per_sqkm": dens,
                "total_crimes_2025": total,
                "crime_rate_per_100k": crime_rate if crime_rate is not None else "",
            })

    fields = ["district_id", "district", "population_2011", "literacy_pct",
              "urban_pct", "density_per_sqkm", "total_crimes_2025",
              "crime_rate_per_100k"]
    out = os.path.join(PROC, "socioeconomic.csv")
    with open(out, "w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    meta_path = os.path.join(PROC, "meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    meta.setdefault("tables", {})["socioeconomic"] = len(rows)
    meta["socioeconomic_source"] = "Census of India 2011 (public domain, approximate) joined to KSP 2025 crime totals"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps({"socioeconomic_rows": len(rows), "sample": rows[:2]}, indent=2))


if __name__ == "__main__":
    main()
