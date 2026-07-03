"""Deterministic head-to-head of decay curves on the FINAL ruleset (archetype rules in,
crowded weights lowered). Now that the finder seed is stable (crc32), these numbers are
reproducible and directly comparable. Picks the decay that best balances selectability
(champs that can be #1 in some draft) against peak monoculture (lower = more diverse).
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce          # noqa: E402
import spotlight_finder as sf        # noqa: E402
import coverage_sim as cs            # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
FR, FP, CN = 3, 3, 30000
CURVES = {
    "extreme": [1.0, 0.2, 0.06, 0.02],
    "steep":   [1.0, 0.3, 0.12, 0.05, 0.02],
    "medium":  [1.0, 0.45, 0.22, 0.10, 0.04],
}


def evaluate():
    role_pools = {r: sf.by_role(r) for r in ROLES}
    cand_flags = {c: ce.flags_of(c) for c in sf.CHAMPS}
    sel = pool = 0
    for role in ROLES:
        p = role_pools[role]
        for champ in p:
            rank, _, _ = sf.best_draft_for(role, champ, role_pools, p, cand_flags, FR, FP)
            sel += 1 if rank == 1 else 0
            pool += 1
    peak = surfaced = 0
    for role in ROLES:
        sp = cs.run_role(role, CN, 7)["spotlights"]
        tt = sum(sp.values()) or 1
        peak = max(peak, 100 * (max(sp.values()) if sp else 0) // tt)
        surfaced += len([1 for v in sp.values() if v])
    return sel, pool, peak, surfaced


def main():
    print(f"decay head-to-head on FINAL ruleset (finder {FR}x{FP} det., coverage {CN}/role)\n" + "=" * 66)
    print(f"{'decay':10} {'selectable':>12} {'peak-mono':>10} {'surfaced(random)':>18}")
    for name, curve in CURVES.items():
        ce.DECAY = curve
        sel, pool, peak, surf = evaluate()
        print(f"{name:10} {sel:>5}/{pool:<6} {peak:>8}% {surf:>14}/{pool}")


if __name__ == "__main__":
    main()
