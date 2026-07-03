"""Property-based QA for the counter engine — the sim's "make it perfect" harness.

Simulates realistic drafts (role-correct, no champ picked twice across BOTH teams,
partial drafts included — the early-draft case real usage hits most) and checks hard
invariants on every evaluation:

  I1  determinism          same scenario evaluated twice -> identical output
  I2  breakdown reconciles base+top+extras+comfort+risk == score (every row)
  I3  bounds & order       fit in [0,100]; results sorted by score desc
  I4  draft legality       no recommended champ is already picked by either team
  I5  absence honesty      team-need (max-only my_team) rules never fire with 0 known allies
  I6  reason rendering     no unresolved {tokens} in any reason/gap string
  I7  edge cases           empty draft / lone enemy / 1-champ pool never crash

Smell metrics (reported, not failed): tie-flood rate (top-6 within 1.5 pts),
zero-signal rate (#1 has no fired rules), warning-topped rate (#1 is net-negative
while a positive candidate exists).

Run:  py scripts/draft_qa.py [n_drafts] [seed]
Exit code 1 if any invariant fails.
"""
import sys
import json
import random
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce  # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
CH = [n for n in ce.CHAMPS if not n.startswith("_") and isinstance(ce.CHAMPS[n], dict)]
ROLE_POOL = {r: [n for n in CH if r in ce.CHAMPS[n].get("roles", [])] for r in ROLES}

# team-need rules whose my_team condition is max-only (absence claims)
ABSENCE_RULES = set()
for r in ce.RULES:
    conds = r.get("my_team")
    if conds is None or r.get("weight", 0) <= 0:
        continue
    specs = conds if isinstance(conds, list) else [conds]
    if specs and all("max" in s and "min" not in s for s in specs):
        ABSENCE_RULES.add(r["id"])


def gen_draft(rng):
    """Role-correct partial draft. Lane opponent revealed with high probability —
    that's the counterpick situation the sim exists for."""
    my_role = rng.choice(ROLES)
    used = set()

    def take(role):
        opts = [c for c in ROLE_POOL[role] if c not in used]
        pick = rng.choice(opts)
        used.add(pick)
        return pick

    n_enemy = rng.randint(1, 5)
    enemy_roles = set(rng.sample(ROLES, n_enemy))
    if rng.random() < 0.7:
        enemy_roles.add(my_role)          # lane opponent usually known
    enemy = [{"champ": take(r), "role": r} for r in ROLES if r in enemy_roles]

    open_roles = [r for r in ROLES if r != my_role]
    n_ally = rng.randint(0, 4)
    ally_roles = {r: take(r) for r in rng.sample(open_roles, n_ally)}
    my_team = list(ally_roles.values())

    pool = [{"champ": c, "mastery": rng.choice([0, 0, 0, 30000, 120000])}
            for c in ROLE_POOL[my_role]]
    return {"my_role": my_role, "my_team": my_team, "enemy_team": enemy,
            "ally_roles": ally_roles, "pool": pool}


def check(scn, results, fails):
    picked = set(scn["my_team"]) | {e["champ"] for e in scn["enemy_team"]}
    known_allies = len(scn["my_team"])
    prev = None
    for row in results:
        b = row["breakdown"]
        total = b["base"] + b["top"] + b["extras"] + b["comfort"] + b["risk"]
        if abs(total - row["score"]) > 0.06:
            fails["I2 breakdown"].append((scn, row["champ"], total, row["score"]))
        if not (0 <= row["fit"] <= 100):
            fails["I3 fit bounds"].append((scn, row["champ"], row["fit"]))
        # contract: descending up to TIE_EPS — rotation may reorder within a tie band
        if prev is not None and row["score"] > prev + ce.TIE_EPS + 1e-9:
            fails["I3 sort order"].append((scn, row["champ"]))
        prev = row["score"]
        if row["champ"] in picked:
            fails["I4 already picked"].append((scn, row["champ"]))
        for f in row["fired"]:
            if known_allies == 0 and f["id"] in ABSENCE_RULES:
                fails["I5 absence w/ empty team"].append((scn, row["champ"], f["id"]))
            if "{" in f["reason"]:
                fails["I6 unrendered token"].append((scn, f["id"], f["reason"][:60]))
        for g in row.get("gaps", []):
            if "{" in g["reason"]:
                fails["I6 unrendered token"].append((scn, g["id"], g["reason"][:60]))


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    rng = random.Random(seed)
    fails = collections.defaultdict(list)
    smells = collections.Counter()

    for i in range(n):
        scn = gen_draft(rng)
        results, _ = ce.evaluate_scenario(scn)
        if not results:
            fails["I7 empty results"].append((scn,))
            continue
        check(scn, results, fails)
        # I1 determinism (sampled — full double-eval would 2x runtime for little gain)
        if i % 97 == 0:
            again, _ = ce.evaluate_scenario(json.loads(json.dumps(scn)))
            if json.dumps(results, sort_keys=True) != json.dumps(again, sort_keys=True):
                fails["I1 nondeterminism"].append((scn,))
        # smells
        top = results[0]
        if len(results) >= 6 and results[0]["score"] - results[5]["score"] < 1.5:
            smells["tie-flood (top6 within 1.5)"] += 1
        if not top["fired"]:
            smells["zero-signal #1"] += 1
        if top["fired"] and all(f["weight"] < 0 for f in top["fired"]) \
                and any(any(f["weight"] > 0 for f in r["fired"]) for r in results[1:]):
            smells["warning-topped #1"] += 1
        lane_known = any(e["role"] == scn["my_role"] for e in scn["enemy_team"])
        if lane_known and top["fired"] and not any(
                f["scope"] in ("lane", "matchup") and f["weight"] > 0 for f in top["fired"]):
            smells["top pick ignores the matchup (lane opp known)"] += 1

    # I7 explicit edge cases
    edges = [
        {"my_role": "middle", "my_team": [], "enemy_team": [], "pool": [{"champ": c, "mastery": 0} for c in ROLE_POOL["middle"]]},
        {"my_role": "top", "my_team": [], "enemy_team": [{"champ": "Darius", "role": "top"}], "pool": [{"champ": "Vayne", "mastery": 0}]},
        {"my_role": "bottom", "my_team": [], "enemy_team": [], "pool": [{"champ": "Jinx", "mastery": 0}]},
    ]
    for scn in edges:
        try:
            res, _ = ce.evaluate_scenario(scn)
            if scn["enemy_team"] == [] and any(r["fired"] for r in res):
                fails["I7 rules fired on empty draft"].append((scn, [f["id"] for r in res for f in r["fired"]][:4]))
        except Exception as exc:  # noqa: BLE001
            fails["I7 crash"].append((scn, repr(exc)))

    print(f"draft_qa: {n} simulated drafts (seed {seed})\n" + "=" * 56)
    for name, items in sorted(fails.items()):
        print(f"  FAIL {name}: {len(items)}")
        for it in items[:3]:
            print("       e.g.", json.dumps(it[1:], default=str)[:160])
    for name, cnt in smells.most_common():
        print(f"  smell {name}: {cnt}/{n} ({100*cnt//n}%)")
    if not fails:
        print("  all invariants PASS")
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
