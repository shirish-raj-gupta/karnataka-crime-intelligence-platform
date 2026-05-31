"""Sanity checks: district sums vs STATE total, and category subtotals vs
the sum of their subtypes. Prints a short report."""
import csv
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "processed")


def load(name):
    with open(os.path.join(OUT, name), encoding="utf-8") as f:
        return list(csv.DictReader(f))


def main():
    summ = load("district_crime_summary.csv")
    districts = [r for r in summ if r["district_id"] != "STATE"]
    state = next(r for r in summ if r["district_id"] == "STATE")

    ipc_sum = sum(int(r["ipc_bns_crimes"]) for r in districts if r["ipc_bns_crimes"])
    sll_sum = sum(int(r["sll_crimes"]) for r in districts if r["sll_crimes"])
    print("District reconciliation:")
    print(f"  IPC: sum(districts)={ipc_sum}  STATE={state['ipc_bns_crimes']}  "
          f"diff={ipc_sum - int(state['ipc_bns_crimes'])}")
    print(f"  SLL: sum(districts)={sll_sum}  STATE={state['sll_crimes']}  "
          f"diff={sll_sum - int(state['sll_crimes'])}")

    heads = load("crime_heads.csv")
    cats = {}
    for r in heads:
        key = f"{r['law_type']}#{r['category_seq']}"
        cats.setdefault(key, {"name": r["category"], "subtypes": [], "total": None})
        c = None if r["count"] == "" else int(r["count"])
        if r["row_type"] == "subtotal":
            cats[key]["total"] = c
        elif r["row_type"] == "subtype":
            cats[key]["subtypes"].append(c)
        # 'single' and 'derived_total' are intentionally excluded from the check

    mismatches = 0
    checked = 0
    for cid, c in cats.items():
        subs = [x for x in c["subtypes"] if x is not None]
        if c["total"] is not None and subs:
            checked += 1
            if sum(subs) != c["total"]:
                mismatches += 1
                if mismatches <= 8:
                    print(f"  [subtype mismatch] {cid} {c['name'][:40]!r}: "
                          f"sum={sum(subs)} subtotal={c['total']}")
    print(f"\nCategory subtotal checks: {checked} categories with subtypes, "
          f"{mismatches} mismatches.")


if __name__ == "__main__":
    main()
