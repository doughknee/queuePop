"""Ablate the archetype rules to find the config that maximizes BOTH selectability and
random surfacing. Hypothesis: the broad assassin(16)/duelist(27) rules homogenize their
archetype (everyone ties -> fewer uniquely #1), while the narrow rules add real niches.
Deterministic finder => comparable.
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

ALL = list(ce.RULES)
FILE_W = {r["id"]: r["weight"] for r in ALL}
HOMOGENIZERS = {"assassin_dives_unpeeled_carry", "duelist_sidelanes_for_teamfight_comp"}
ORIG_CROWDED = {"lockdown_vs_hypercarry": 16, "protect_carry_vs_dive": 16,
                "burst_vs_immobile_carry": 14, "pick_comp_vs_immobile_carry": 13,
                "mobility_dodges_skillshots": 11, "synergy_engage_followup": 10,
                "team_needs_engage": 22, "team_needs_frontline": 18}
EXTREME = [1.0, 0.2, 0.06, 0.02]
MEDIUM = [1.0, 0.45, 0.22, 0.10, 0.04]


def apply(rule_ids, crowded_orig, decay):
    ce.RULES[:] = [r for r in ALL if r["id"] in rule_ids]
    for r in ce.RULES:
        r["weight"] = (ORIG_CROWDED.get(r["id"], FILE_W[r["id"]]) if crowded_orig
                       else FILE_W[r["id"]])
    ce.DECAY = decay


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
    peak = surf = 0
    for role in ROLES:
        sp = cs.run_role(role, CN, 7)["spotlights"]
        tt = sum(sp.values()) or 1
        peak = max(peak, 100 * (max(sp.values()) if sp else 0) // tt)
        surf += len([1 for v in sp.values() if v])
    return sel, pool, peak, surf


ALL_IDS = {r["id"] for r in ALL}
NARROW5 = ALL_IDS - HOMOGENIZERS
CONFIGS = [
    ("orig+all7+lowered+medium (=FINAL)", ALL_IDS, False, MEDIUM),
    ("orig-weights+all7+extreme",         ALL_IDS, True, EXTREME),
    ("orig-weights+narrow5+extreme",      NARROW5, True, EXTREME),
    ("lowered+narrow5+medium",            NARROW5, False, MEDIUM),
    ("lowered+narrow5+extreme",           NARROW5, False, EXTREME),
]


def main():
    print(f"archetype ablation (finder {FR}x{FP} det., coverage {CN}/role)\n" + "=" * 70)
    print(f"{'config':38}{'selectable':>11}{'peak':>7}{'surfaced':>10}")
    for name, ids, corig, decay in CONFIGS:
        apply(ids, corig, decay)
        sel, pool, peak, surf = evaluate()
        print(f"{name:38}{f'{sel}/{pool}':>11}{f'{peak}%':>7}{f'{surf}':>10}")


if __name__ == "__main__":
    main()
