"""Sweep the DECAY curve in-memory and report the selectability vs monoculture tradeoff.

DECAY controls how much a champ's 2nd/3rd-best reasons count. Extreme decay -> only the
top reason matters -> rampant ties -> few champs can be uniquely #1. Gentle decay -> unique
COMBINATIONS of reasons distinguish champs (more selectable) but flag-dense generalists can
re-dominate (monoculture). This finds the sweet spot. Rules/weights come from the files as-is.

Run:  py scripts/sweep_decay.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce          # noqa: E402
import spotlight_finder as sf        # noqa: E402
import coverage_sim as cs            # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
CURVES = {
    "extreme(cur)": [1.0, 0.2, 0.06, 0.02],
    "steep":        [1.0, 0.3, 0.12, 0.05, 0.02],
    "medium":       [1.0, 0.45, 0.22, 0.10, 0.04],
    "gentle":       [1.0, 0.6, 0.38, 0.22, 0.12, 0.06],
}
FR, FP, CN = 3, 2, 5000


def evaluate():
    role_pools = {r: sf.by_role(r) for r in ROLES}
    cand_flags = {c: ce.flags_of(c) for c in sf.CHAMPS}
    sel = pool = 0
    worst = []
    for role in ROLES:
        p = role_pools[role]
        for champ in p:
            rank, _, _ = sf.best_draft_for(role, champ, role_pools, p, cand_flags, FR, FP)
            if rank == 1:
                sel += 1
            pool += 1
    # coverage monoculture: worst single-champ #1 share across roles
    max_mono = 0
    distinct_tot = 0
    for role in ROLES:
        cov = cs.run_role(role, CN, 7)
        sp = cov["spotlights"]
        tt = sum(sp.values()) or 1
        top = max(sp.values()) if sp else 0
        max_mono = max(max_mono, 100 * top // tt)
        distinct_tot += len([1 for v in sp.values() if v])
    return sel, pool, max_mono, distinct_tot


def main():
    print(f"DECAY sweep  (finder {FR}x{FP}, coverage {CN}/role)\n" + "=" * 60)
    print(f"{'curve':14} {'selectable':>12} {'worst-mono':>11} {'distinct':>9}")
    for name, curve in CURVES.items():
        ce.DECAY = curve
        sel, pool, mono, distinct = evaluate()
        print(f"{name:14} {sel:>5}/{pool:<6} {mono:>9}% {distinct:>9}")


if __name__ == "__main__":
    main()
