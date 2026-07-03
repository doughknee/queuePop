"""Sweep weight-config x decay together (in-memory) to find the config that maximizes
selectability while holding monoculture down. Tests whether RESTORING the original crowded
weights (and letting the gentler decay do the diversity work) beats lowering them.
Rules come from the file; we patch ce.RULES[*].weight and ce.DECAY in memory per config.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce          # noqa: E402
import spotlight_finder as sf        # noqa: E402
import coverage_sim as cs            # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
FR, FP, CN = 3, 2, 5000

# original (pre-rebalance) crowded-rule weights — restoring these tests if the gentler
# decay alone (not the weight cut) is enough to keep coverage diverse.
RESTORE_CROWDED = {
    "lockdown_vs_hypercarry": 16, "protect_carry_vs_dive": 16, "burst_vs_immobile_carry": 14,
    "pick_comp_vs_immobile_carry": 13, "mobility_dodges_skillshots": 11,
    "synergy_engage_followup": 10, "team_needs_engage": 22, "team_needs_frontline": 18,
}
DECAYS = {
    "extreme": [1.0, 0.2, 0.06, 0.02],
    "medium":  [1.0, 0.45, 0.22, 0.10, 0.04],
    "gentle":  [1.0, 0.6, 0.38, 0.22, 0.12, 0.06],
}

BY_ID = {r["id"]: r for r in ce.RULES}
FILE_W = {r["id"]: r["weight"] for r in ce.RULES}  # current (rebalanced/lowered) weights


def set_weights(restore):
    for rid, r in BY_ID.items():
        r["weight"] = (RESTORE_CROWDED.get(rid, FILE_W[rid]) if restore else FILE_W[rid])


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
    max_mono = distinct = 0
    for role in ROLES:
        sp = cs.run_role(role, CN, 7)["spotlights"]
        tt = sum(sp.values()) or 1
        max_mono = max(max_mono, 100 * (max(sp.values()) if sp else 0) // tt)
        distinct += len([1 for v in sp.values() if v])
    return sel, pool, max_mono, distinct


def main():
    print(f"weight x decay sweep  (finder {FR}x{FP}, coverage {CN}/role)\n" + "=" * 64)
    print(f"{'config':28} {'selectable':>11} {'worst-mono':>11} {'distinct':>9}")
    for restore in (True, False):
        tag = "restored-crowded" if restore else "lowered-crowded"
        set_weights(restore)
        for dname in ("medium", "gentle"):
            ce.DECAY = DECAYS[dname]
            sel, pool, mono, distinct = evaluate()
            print(f"{tag+'+'+dname:28} {sel:>4}/{pool:<6} {mono:>9}% {distinct:>9}")


if __name__ == "__main__":
    main()
