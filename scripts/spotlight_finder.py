"""Reverse-engineer the BEST possible draft for every champion.

Random sampling (coverage_sim.py) only finds champs the dice happen to showcase.
This tool answers the harder question definitively, per champ:

  1. Which positive rules can this champ EVER fire?  (if none -> the rule set has
     no way to reward it, so it can never be the top pick -- a true gap.)
  2. What is the single best draft for it?  We hill-climb the enemy comp + allies to
     MAXIMISE this champ's margin over the field, then report its rank in that draft.
     rank == 1  -> "selectable; here is the matchup that picks it"
     rank  > 1  -> dominated even in its ideal scenario -> a gap to fix.

Run:  py scripts/spotlight_finder.py [restarts] [passes] [role]
Writes data/spotlight_report.json and prints a per-role summary.
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
BASE = ce.VIABILITY_BASE
POS_RULES = [r for r in ce.RULES if r.get("weight", 0) > 0]


def by_role(role):
    return [n for n in CHAMPS if role in ce.CHAMPS[n].get("roles", [])]


def fireable_rules(champ):
    """Positive rules whose candidate spec this champ satisfies (ignores context)."""
    return [r["id"] for r in POS_RULES if ce.rule_candidate_ok(r, champ)]


def score_pool(pool, cand_flags, enemy_names, allies, lane_opp):
    """Score every champ in pool for a fixed draft (mirrors evaluate_scenario, mastery=0)."""
    ctx = [(rule, ce.scaled_base_weight(rule, enemy_names)) for rule in ce.RULES
           if ce.rule_context_ok(rule, lane_opp, enemy_names, allies)]
    out = {}
    for c in pool:
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
        out[c] = BASE + ce._decayed(pos) + neg
    return out


def best_draft_for(role, champ, role_pools, pool, cand_flags, restarts, passes):
    """Hill-climb enemy + ally slots to maximise champ's margin over the field.
    Returns (best_rank, draft, margin)."""
    ar = [r for r in ROLES if r != role]
    # Deterministic seed (zlib.crc32 is stable across processes, unlike hash() which is
    # salted per-run) so selectability numbers are reproducible / comparable run-to-run.
    rng = random.Random(zlib.crc32((role + "|" + champ).encode()) or 1)
    others = [c for c in pool if c != champ]

    def evaluate(enemy, allies):
        sc = score_pool(pool, cand_flags, list(enemy.values()),
                        [allies[r] for r in ar], enemy[role])
        top_other = max(sc[o] for o in others) if others else -1e9
        rank = 1 + sum(1 for o in others if sc[o] > sc[champ])
        return rank, sc[champ] - top_other, sc

    best = (10**9, -1e18, None)
    for _ in range(restarts):
        enemy = {r: rng.choice(role_pools[r]) for r in ROLES}
        allies = {r: rng.choice(role_pools[r]) for r in ar}
        for _ in range(passes):
            improved = False
            for r in ROLES:                       # enemy slots
                cur, (_, bestm, _) = enemy[r], evaluate(enemy, allies)
                pick = cur
                for cand in role_pools[r]:
                    enemy[r] = cand
                    _, m, _ = evaluate(enemy, allies)
                    if m > bestm:
                        bestm, pick = m, cand
                enemy[r] = pick
                improved = improved or pick != cur
            for r in ar:                          # ally slots
                cur, (_, bestm, _) = allies[r], evaluate(enemy, allies)
                pick = cur
                for cand in role_pools[r]:
                    allies[r] = cand
                    _, m, _ = evaluate(enemy, allies)
                    if m > bestm:
                        bestm, pick = m, cand
                allies[r] = pick
                improved = improved or pick != cur
            if not improved:
                break
        rank, margin, sc = evaluate(enemy, allies)
        if (rank, margin) < (best[0], -best[1]):  # lower rank, then higher margin
            winner = max(pool, key=lambda c: sc[c])
            draft = {"enemy": dict(enemy), "allies": dict(allies),
                     "winner": winner, "champ_score": round(sc[champ], 1),
                     "winner_score": round(sc[winner], 1)}
            best = (rank, margin, draft)
    return best


def main():
    restarts = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    passes = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    only = sys.argv[3] if len(sys.argv) > 3 else None
    role_pools = {r: by_role(r) for r in ROLES}
    cand_flags = {c: ce.flags_of(c) for c in CHAMPS}

    report = {"restarts": restarts, "passes": passes, "roles": {}}
    print(f"Spotlight finder  (restarts={restarts}, passes={passes})\n" + "=" * 64)
    for role in ROLES:
        if only and role != only:
            continue
        pool = role_pools[role]
        rows = {}
        for champ in pool:
            fr = fireable_rules(champ)
            rank, margin, draft = best_draft_for(
                role, champ, role_pools, pool, cand_flags, restarts, passes)
            rows[champ] = {"best_rank": rank, "fireable_rules": fr,
                           "margin": round(margin, 1), "draft": draft}
        report["roles"][role] = rows

        selectable = [c for c, v in rows.items() if v["best_rank"] == 1]
        no_rules = sorted(c for c, v in rows.items() if not v["fireable_rules"])
        stuck = sorted((c for c, v in rows.items()
                        if v["best_rank"] > 1 and v["fireable_rules"]),
                       key=lambda c: rows[c]["best_rank"])
        print(f"\n[{role.upper()}]  {len(selectable)}/{len(pool)} can reach #1 in their ideal draft")
        if no_rules:
            print(f"  NO REWARDING RULE ({len(no_rules)}): " + ", ".join(no_rules))
        if stuck:
            print(f"  HAS RULES BUT STILL CAN'T WIN ({len(stuck)}): " +
                  ", ".join(f"{c}(best #{rows[c]['best_rank']})" for c in stuck))

    (ROOT / "data" / "spotlight_report.json").write_text(
        json.dumps(report, indent=2), encoding="utf-8")
    print("\nFull report -> data/spotlight_report.json")


if __name__ == "__main__":
    main()
