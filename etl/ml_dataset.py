"""
Build a tabular ML training dataset for crime-risk classification.

Features (per district, real data):
  - population_2011, literacy_pct, urban_pct, density_per_sqkm
Label:
  - risk_band (Low / Moderate / High / Critical) derived from crime_rate_per_100k
    quartiles — a supervised target QuickML / Zia AutoML can train on.

Output:
  - data/ml/crime_risk_training.csv   (features + label, for QuickML upload)
  - data/ml/crime_risk_scoring.csv    (features only, for batch scoring demo)

This gives a genuine tabular ML task: predict a district's crime-risk band from
its socio-economic profile (addresses challenge #6 "ML-driven intelligence" and
#3 "predictive risk scoring").
"""

from __future__ import annotations
import csv
import os

PROC = os.path.join(os.path.dirname(__file__), "..", "data", "processed")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "ml")


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    with open(os.path.join(PROC, "socioeconomic.csv"), encoding="utf-8") as f:
        for r in csv.DictReader(f):
            try:
                pop = int(r["population_2011"])
                rate = float(r["crime_rate_per_100k"]) if r["crime_rate_per_100k"] else None
            except ValueError:
                continue
            if not pop or rate is None:
                continue
            rows.append({
                "district": r["district"],
                "population": pop,
                "literacy_pct": float(r["literacy_pct"]),
                "urban_pct": float(r["urban_pct"]),
                "density": int(r["density_per_sqkm"]),
                "crime_rate": rate,
            })

    # Quartile thresholds for the label
    rates = sorted(r["crime_rate"] for r in rows)
    n = len(rates)
    q1 = rates[n // 4]
    q2 = rates[n // 2]
    q3 = rates[(3 * n) // 4]

    def band(x):
        if x >= q3:
            return "Critical"
        if x >= q2:
            return "High"
        if x >= q1:
            return "Moderate"
        return "Low"

    for r in rows:
        r["risk_band"] = band(r["crime_rate"])

    feat = ["population", "literacy_pct", "urban_pct", "density"]

    # Training file: features + label
    with open(os.path.join(OUT, "crime_risk_training.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(feat + ["risk_band"])
        for r in rows:
            w.writerow([r[c] for c in feat] + [r["risk_band"]])

    # Scoring file: features only (+ district for readability)
    with open(os.path.join(OUT, "crime_risk_scoring.csv"), "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["district"] + feat)
        for r in rows:
            w.writerow([r["district"]] + [r[c] for c in feat])

    print(f"rows={len(rows)} thresholds q1={q1} q2={q2} q3={q3}")
    print("bands:", {b: sum(1 for r in rows if r["risk_band"] == b) for b in ["Low", "Moderate", "High", "Critical"]})


if __name__ == "__main__":
    main()
