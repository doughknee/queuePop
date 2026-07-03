"""Run the draft sim until every champion has been SEEN in the recommendations
(top-8 — what the results panel actually shows), then report each champion's
recommendation percentages per role:

  #1%    share of that role's drafts where the champ was THE recommended pick
  top8%  share of drafts where it appeared in the visible recommendation list

Chunks of 20k drafts per role, stopping when every champ in the role pool has
at least one top-8 appearance (cap 200k/role so a truly buried champ can't hang
the run — any cap-breakers are reported explicitly).

Run:  py scripts/recommend_pct.py            (writes data/recommend_pct.json)
"""
import sys
import json
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import coverage_sim as cs  # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
CHUNK = 20_000
CAP = 200_000


def run_role_until_seen(role):
    pool = set(cs.by_role(role))
    spot = collections.Counter()
    top8 = collections.Counter()
    n = 0
    seed = 100
    while n < CAP:
        r = cs.run_role(role, CHUNK, seed)
        spot.update(r["spotlights"])
        top8.update(r["top8"])
        n += CHUNK
        seed += 1
        unseen = pool - set(top8)
        if not unseen:
            break
    return {"n": n, "spot": spot, "top8": top8,
            "unseen": sorted(pool - set(top8)), "pool": sorted(pool)}


def main():
    report = {}
    for role in ROLES:
        r = run_role_until_seen(role)
        report[role] = r
        rows = sorted(r["pool"], key=lambda c: (-r["spot"][c], -r["top8"][c]))
        print(f"\n[{role.upper()}]  {r['n']:,} drafts — "
              f"{len(r['pool']) - len(r['unseen'])}/{len(r['pool'])} champs seen in top-8")
        print(f"  {'champ':16} {'#1%':>7} {'top8%':>7}")
        for c in rows:
            print(f"  {c:16} {100*r['spot'][c]/r['n']:>6.2f}% {100*r['top8'][c]/r['n']:>6.1f}%")
        if r["unseen"]:
            print(f"  NEVER IN TOP-8 after {r['n']:,} drafts: {', '.join(r['unseen'])}")

    out = {role: {"n_drafts": r["n"],
                  "pct_top1": {c: round(100 * r["spot"][c] / r["n"], 3) for c in r["pool"]},
                  "pct_top8": {c: round(100 * r["top8"][c] / r["n"], 3) for c in r["pool"]},
                  "never_seen": r["unseen"]}
           for role, r in report.items()}
    (ROOT / "data" / "recommend_pct.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\nFull report -> data/recommend_pct.json")


if __name__ == "__main__":
    main()
