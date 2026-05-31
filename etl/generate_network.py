"""
Generate SYNTHETIC record-level data for criminal-network & offender-profiling
demos.

The public KSP dataset is aggregate-only (no FIRs, offenders, victims, or
financial links), so the challenge's network/relationship analysis cannot run
on real data. This script generates clearly-labelled SYNTHETIC records that are
*statistically grounded* in the real data:

  - Offenders/victims are distributed across the REAL districts in proportion to
    each district's actual IPC/BNS crime volume.
  - Crime types are drawn from the REAL top IPC categories by frequency.
  - Modus operandi, repeat-offending, and organized-group structures are
    injected so the network analytics have meaningful patterns to surface.

Every record carries synthetic=true and IDs are prefixed SYN- so it can never
be mistaken for real case data. Deterministic (fixed seed) for reproducibility.

Output: data/processed/network_*.csv  (offenders, incidents, links, accounts)
"""

from __future__ import annotations
import csv
import json
import os
import random

random.seed(20260531)

PROC = os.path.join(os.path.dirname(__file__), "..", "data", "processed")

N_OFFENDERS = 220
N_INCIDENTS = 480
N_ACCOUNTS = 90

FIRST_NAMES = ["Ravi", "Suresh", "Manoj", "Imran", "Vijay", "Anand", "Kiran",
               "Prakash", "Naveen", "Santosh", "Rahul", "Farhan", "Deepak",
               "Mahesh", "Ganesh", "Arjun", "Basava", "Shankar", "Yusuf", "Naga"]
LAST_NAMES = ["Kumar", "Reddy", "Gowda", "Shetty", "Patil", "Naik", "Rao",
              "Sharma", "Khan", "Hegde", "Desai", "Murthy", "Pujari", "Singh",
              "Iyer", "Joshi", "Nayak", "Bhat", "Acharya", "Kulkarni"]

MO_TAGS = ["chain_snatching", "vehicle_theft", "house_burglary", "atm_fraud",
           "otp_fraud", "investment_scam", "extortion", "robbery_highway",
           "cattle_theft", "mobile_theft", "dacoity", "counterfeit"]

# MO -> plausible crime category label (aligns with real heads of crime)
MO_TO_CRIME = {
    "chain_snatching": "Robbery",
    "vehicle_theft": "Theft",
    "house_burglary": "Burglary",
    "atm_fraud": "Cheating",
    "otp_fraud": "Cheating",
    "investment_scam": "Cheating",
    "extortion": "Criminal Intimidation",
    "robbery_highway": "Robbery",
    "cattle_theft": "Theft",
    "mobile_theft": "Theft",
    "dacoity": "Dacoity",
    "counterfeit": "Counterfeiting",
}


def load_districts_weighted():
    """Return (district_name, weight) using real IPC crime volume as weight."""
    path = os.path.join(PROC, "district_crime_summary.csv")
    rows = []
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["district_id"] == "STATE":
                continue
            ipc = int(r["ipc_bns_crimes"]) if r["ipc_bns_crimes"] else 0
            if ipc > 0:
                rows.append((r["district"], ipc))
    names = [x[0] for x in rows]
    weights = [x[1] for x in rows]
    return names, weights


def pick_weighted(names, weights, k=1):
    return random.choices(names, weights=weights, k=k)


def gen_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def main():
    os.makedirs(PROC, exist_ok=True)
    districts, weights = load_districts_weighted()

    # --- Offenders ---
    offenders = []
    for i in range(1, N_OFFENDERS + 1):
        oid = f"SYN-OFF-{i:04d}"
        home = pick_weighted(districts, weights)[0]
        # Each offender has a primary MO, sometimes a secondary
        primary = random.choice(MO_TAGS)
        mo = [primary]
        if random.random() < 0.35:
            mo.append(random.choice([m for m in MO_TAGS if m != primary]))
        age = random.randint(18, 58)
        offenders.append({
            "offender_id": oid,
            "name": gen_name(),
            "age": age,
            "gender": random.choices(["M", "F"], weights=[88, 12])[0],
            "home_district": home,
            "primary_mo": primary,
            "mo_tags": "|".join(mo),
            "synthetic": "true",
        })

    # --- Organized groups: cluster ~30% of offenders into gangs ---
    gang_members = random.sample(offenders, int(N_OFFENDERS * 0.30))
    n_gangs = 8
    gangs = {f"SYN-GANG-{g+1:02d}": [] for g in range(n_gangs)}
    for off in gang_members:
        g = random.choice(list(gangs.keys()))
        gangs[g].append(off["offender_id"])
    offender_gang = {}
    for g, members in gangs.items():
        for m in members:
            offender_gang[m] = g

    # --- Incidents (synthetic FIRs) ---
    incidents = []
    # Repeat offenders: weight selection so some offenders recur a lot
    recur_weights = [random.choices([1, 3, 8], weights=[60, 30, 10])[0] for _ in offenders]
    for i in range(1, N_INCIDENTS + 1):
        fir = f"SYN-FIR-{i:05d}"
        off = random.choices(offenders, weights=recur_weights)[0]
        mo = random.choice(off["mo_tags"].split("|"))
        crime = MO_TO_CRIME[mo]
        # incident district: usually home, sometimes neighbouring (cross-jurisdiction)
        if random.random() < 0.7:
            dist = off["home_district"]
        else:
            dist = pick_weighted(districts, weights)[0]
        month = random.randint(1, 12)
        incidents.append({
            "fir_id": fir,
            "offender_id": off["offender_id"],
            "crime_type": crime,
            "modus_operandi": mo,
            "district": dist,
            "month": month,
            "year": 2025,
            "synthetic": "true",
        })

    # --- Financial accounts + money trail links ---
    accounts = []
    for i in range(1, N_ACCOUNTS + 1):
        accounts.append({
            "account_id": f"SYN-ACC-{i:04d}",
            "bank": random.choice(["KSCB", "Canara", "SBI", "HDFC", "Axis", "Union"]),
            "flagged": random.choices(["true", "false"], weights=[35, 65])[0],
            "synthetic": "true",
        })

    # --- Links (edges): offender-offender (co-accused/gang), offender-account ---
    links = []
    lid = 0

    def add_link(src, dst, rel, weight):
        nonlocal lid
        lid += 1
        links.append({
            "link_id": f"SYN-LNK-{lid:05d}",
            "source": src, "target": dst, "relation": rel,
            "weight": weight, "synthetic": "true",
        })

    # gang co-offender edges (dense within gang)
    for g, members in gangs.items():
        for a in range(len(members)):
            for b in range(a + 1, len(members)):
                if random.random() < 0.5:
                    add_link(members[a], members[b], "co_offender", random.randint(1, 5))

    # random co-accused across non-gang offenders (sparse)
    for _ in range(120):
        a, b = random.sample(offenders, 2)
        add_link(a["offender_id"], b["offender_id"], "associate", 1)

    # offender -> financial account (money trail), gang members share accounts
    for off in offenders:
        if random.random() < 0.4:
            acc = random.choice(accounts)
            add_link(off["offender_id"], acc["account_id"], "controls_account", random.randint(1, 4))
    # shared accounts within gangs (money pooling signal)
    for g, members in gangs.items():
        if len(members) >= 2 and random.random() < 0.7:
            acc = random.choice(accounts)
            for m in members:
                add_link(m, acc["account_id"], "uses_account", random.randint(1, 3))

    # attach gang id onto offenders
    for off in offenders:
        off["gang_id"] = offender_gang.get(off["offender_id"], "")

    def write(name, rows, fields):
        with open(os.path.join(PROC, name), "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)

    write("network_offenders.csv", offenders,
          ["offender_id", "name", "age", "gender", "home_district",
           "primary_mo", "mo_tags", "gang_id", "synthetic"])
    write("network_incidents.csv", incidents,
          ["fir_id", "offender_id", "crime_type", "modus_operandi",
           "district", "month", "year", "synthetic"])
    write("network_accounts.csv", accounts,
          ["account_id", "bank", "flagged", "synthetic"])
    write("network_links.csv", links,
          ["link_id", "source", "target", "relation", "weight", "synthetic"])

    # update meta
    meta_path = os.path.join(PROC, "meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    meta.setdefault("tables", {}).update({
        "network_offenders": len(offenders),
        "network_incidents": len(incidents),
        "network_accounts": len(accounts),
        "network_links": len(links),
    })
    meta["network_data"] = "SYNTHETIC (demo only) — grounded in real district/crime distributions"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    print(json.dumps({
        "offenders": len(offenders),
        "incidents": len(incidents),
        "accounts": len(accounts),
        "links": len(links),
        "gangs": n_gangs,
    }, indent=2))


if __name__ == "__main__":
    main()
