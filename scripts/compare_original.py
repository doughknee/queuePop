"""Honest deterministic before/after: ORIGINAL engine (no archetype rules, original crowded
weights, extreme decay) vs FINAL engine (7 archetype rules, lowered crowded weights, medium
decay). Same crc32-seeded finder so the delta is real, not hash-noise.
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

ARCH_IDS = {"hypercarry_outscales_low_lockdown", "artillery_zones_lowmobility",
            "assassin_dives_unpeeled_carry", "wombo_engage_vs_lowmobility",
            "enchanter_outheals_poke", "early_tempo_vs_scaling",
            "duelist_sidelanes_for_teamfight_comp"}
ORIG_CROWDED = {"lockdown_vs_hypercarry": 16, "protect_carry_vs_dive": 16,
                "burst_vs_immobile_carry": 14, "pick_comp_vs_immobile_carry": 13,
                "mobility_dodges_skillshots": 11, "synergy_engage_followup": 10,
                "team_needs_engage": 22, "team_needs_frontline": 18}

ALL_RULES = list(ce.RULES)
FILE_W = {r["id"]: r["weight"] for r in ALL_RULES}


def evaluate():
    role_pools = {r: sf.by_role(r) for r in ROLES}
    cand_flags = {c: ce.flags_of(c) for c in sf.CHAMPS}
    sel = pool = 0
    stuck = []
    for role in ROLES:
        p = role_pools[role]
        for champ in p:
            rank, _, _ = sf.best_draft_for(role, champ, role_pools, p, cand_flags, FR, FP)
            if rank == 1:
                sel += 1
            else:
                stuck.append(champ)
            pool += 1
    peak = surfaced = 0
    for role in ROLES:
        sp = cs.run_role(role, CN, 7)["spotlights"]
        tt = sum(sp.values()) or 1
        peak = max(peak, 100 * (max(sp.values()) if sp else 0) // tt)
        surfaced += len([1 for v in sp.values() if v])
    return sel, pool, peak, surfaced, set(stuck)


def main():
    print(f"ORIGINAL vs FINAL (finder {FR}x{FP} det., coverage {CN}/role)\n" + "=" * 60)

    # ORIGINAL
    ce.RULES[:] = [r for r in ALL_RULES if r["id"] not in ARCH_IDS]
    for r in ce.RULES:
        r["weight"] = ORIG_CROWDED.get(r["id"], FILE_W[r["id"]])
    ce.DECAY = [1.0, 0.2, 0.06, 0.02]
    o_sel, pool, o_peak, o_surf, o_stuck = evaluate()

    # FINAL
    ce.RULES[:] = list(ALL_RULES)
    for r in ce.RULES:
        r["weight"] = FILE_W[r["id"]]
    ce.DECAY = [1.0, 0.45, 0.22, 0.10, 0.04]
    f_sel, _, f_peak, f_surf, f_stuck = evaluate()

    print(f"{'metric':22}{'ORIGINAL':>12}{'FINAL':>12}")
    print(f"{'selectable (#1-able)':22}{f'{o_sel}/{pool}':>12}{f'{f_sel}/{pool}':>12}")
    print(f"{'surfaced (random 30k)':22}{f'{o_surf}/{pool}':>12}{f'{f_surf}/{pool}':>12}")
    print(f"{'peak monoculture':22}{f'{o_peak}%':>12}{f'{f_peak}%':>12}")
    newly = sorted(o_stuck - f_stuck)
    regress = sorted(f_stuck - o_stuck)
    print(f"\nNEWLY selectable ({len(newly)}): " + ", ".join(newly))
    print(f"\nREGRESSED to stuck ({len(regress)}): " + ", ".join(regress))


if __name__ == "__main__":
    main()
