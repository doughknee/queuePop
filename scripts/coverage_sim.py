"""Coverage / spotlight audit for the counter engine.

For each role, simulates many random (role-correct) drafts and records, per champion:
  - how many times it was the #1 recommendation ("spotlights"),
  - its BEST rank ever achieved + an example draft that produced it.

Answers two questions:
  1. Does every champ in a role eventually get picked #1? (coverage gaps = never-#1 champs)
  2. Reverse-engineering: which enemy comp actually selects a given champ?

Run:  py scripts/coverage_sim.py [N_per_role] [seed]
Writes a full report to data/coverage_report.json and prints a summary.
"""

import sys
import json
import random
import zlib
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce  # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
CHAMPS = [n for n in ce.CHAMPS if not n.startswith("_") and isinstance(ce.CHAMPS[n], dict)]


def by_role(role):
    return [n for n in CHAMPS if role in ce.CHAMPS[n].get("roles", [])]


def run_role(role, n, seed):
    """Optimized ranking-only sim. Mirrors evaluate_scenario's scoring (scaled weight +
    boost + diminishing returns + base) but precomputes the draft context ONCE per draft
    (it's identical for every candidate) so 100k drafts is tractable. mastery = 0."""
    rng = random.Random(seed)
    pool = by_role(role)
    cand_flags = {c: ce.flags_of(c) for c in pool}
    ally_roles = [r for r in ROLES if r != role]
    role_pools = {r: by_role(r) for r in ROLES}
    BASE = ce.VIABILITY_BASE

    spotlights = collections.Counter()
    top8 = collections.Counter()
    best = {c: {"rank": 10**9, "draft": None} for c in pool}
    partner_role = {"bottom": "utility", "utility": "bottom"}.get(role)

    for _ in range(n):
        used = set()

        def take(r):
            opts = [c for c in role_pools[r] if c not in used]
            pick = rng.choice(opts)
            used.add(pick)
            return pick

        enemy_pick = {r: take(r) for r in ROLES}
        enemy_names = list(enemy_pick.values())
        ally_pick = {r: take(r) for r in ally_roles}
        allies = list(ally_pick.values())
        lane_opp = enemy_pick[role]
        lane_partner = ally_pick.get(partner_role) if partner_role else None
        # Context (which rules apply + their scaled weight) is the same for all candidates.
        ctx = [(rule, ce.scaled_base_weight(rule, enemy_names)) for rule in ce.RULES
               if ce.rule_context_ok(rule, lane_opp, enemy_names, allies, lane_partner)]
        scored = []
        for c in pool:
            if c in used:      # draft legality — champ already locked by either team
                continue
            cf = cand_flags[c]
            pos, neg = [], 0
            for rule, w in ctx:
                if not ce.rule_candidate_ok(rule, c):
                    continue
                ww = w
                if ww > 0 and rule.get("boost"):
                    ww += min(sum(1 for f in rule["boost"] if f in cf), 3)
                ww = round(ww)
                if ww > 0:
                    pos.append(ww)
                elif ww < 0:
                    neg += ww
            pos.sort(reverse=True)
            scored.append((c, BASE + ce._decayed(pos) + neg))
        # mirror the engine's draft-seeded banded tie rotation (counter_engine sort)
        draft_key = role + "|" + ",".join(sorted(enemy_names)) + "|" + ",".join(sorted(allies))
        scored.sort(key=lambda x: -x[1])
        scored = ce._rotate_ties(scored, lambda x: x[1],
                                 lambda x: zlib.crc32((draft_key + x[0]).encode()))
        order = [c for c, _ in scored]
        winner = order[0]
        spotlights[winner] += 1
        for name in order[:8]:
            top8[name] += 1
        for rank, name in enumerate(order, 1):
            if rank < best[name]["rank"]:
                best[name] = {"rank": rank, "draft": {
                    "enemy": dict(enemy_pick), "allies": allies, "winner": winner}}

    never = sorted(c for c in pool if spotlights[c] == 0)
    return {
        "pool_size": len(pool),
        "got_spotlight": len(pool) - len(never),
        "never_picked": never,
        "spotlights": dict(spotlights),
        "top8": dict(top8),
        "n": n,
        "best": best,
    }


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    report = {"n_per_role": n, "seed": seed, "roles": {}}
    print(f"Coverage audit: {n} drafts per role\n" + "=" * 60)
    for role in ROLES:
        r = run_role(role, n, seed)
        report["roles"][role] = r
        print(f"\n[{role.upper()}]  {r['got_spotlight']}/{r['pool_size']} champs got a spotlight"
              f"   ({n} drafts)")
        if r["never_picked"]:
            print(f"  NEVER #1 ({len(r['never_picked'])}): " +
                  ", ".join(f"{c}(best #{r['best'][c]['rank']})" for c in r["never_picked"]))
        # a few reverse-engineered spotlights (rarest first — most interesting niches)
        rare = sorted((c for c in r["spotlights"] if r["spotlights"][c] > 0),
                      key=lambda c: r["spotlights"][c])[:5]
        for c in rare:
            d = r["best"][c]["draft"]
            print(f"  {c} (#1 in {r['spotlights'][c]}/{n}) e.g. vs "
                  + ", ".join(f"{role_}:{champ}" for role_, champ in d["enemy"].items()))

    (ROOT / "data" / "coverage_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("\nFull report -> data/coverage_report.json")


if __name__ == "__main__":
    main()
