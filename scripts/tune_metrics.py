"""Fast scorecard for tuning the counter engine. One number per axis so weight/decay
changes can be compared in ~2-3 min instead of running the full finder.

Reports:
  GOLDEN     passed/total (must stay 40/40)
  SELECTABLE champs that reach #1 in their ideal draft (targeted hill-climb, low settings)
  MONOCULTURE max single-champ #1 share per role (lower = healthier spread)

Run:  py scripts/tune_metrics.py [finder_restarts] [finder_passes] [coverage_N]
"""
import sys
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce          # noqa: E402
import spotlight_finder as sf        # noqa: E402
import coverage_sim as cs            # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]


def golden():
    out = subprocess.run([sys.executable, str(ROOT / "scripts" / "golden_test.py")],
                         capture_output=True, text=True).stdout
    for line in out.splitlines():
        if "passed" in line and "total" in line:
            return line.strip()
    return "golden: ?"


def main():
    fr = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    fp = int(sys.argv[2]) if len(sys.argv) > 2 else 2
    cn = int(sys.argv[3]) if len(sys.argv) > 3 else 6000
    role_pools = {r: sf.by_role(r) for r in ROLES}
    cand_flags = {c: ce.flags_of(c) for c in sf.CHAMPS}

    print(golden())
    print(f"\n(finder restarts={fr} passes={fp}; coverage N={cn}/role)\n")
    print(f"{'ROLE':8} {'SELECTABLE':>12} {'STUCK':>6}   {'MONOCULTURE (top #1 share)':<40}")
    tot_sel = tot_pool = 0
    stuck_all = []
    for role in ROLES:
        pool = role_pools[role]
        sel = stuck = 0
        for champ in pool:
            rank, _, _ = sf.best_draft_for(role, champ, role_pools, pool, cand_flags, fr, fp)
            if rank == 1:
                sel += 1
            else:
                stuck += 1
                stuck_all.append((role, champ, rank))
        cov = cs.run_role(role, cn, 7)
        sp = cov["spotlights"]
        tt = sum(sp.values()) or 1
        top = sorted(sp.items(), key=lambda x: -x[1])[:3]
        mono = ", ".join(f"{c} {100*n//tt}%" for c, n in top)
        print(f"{role:8} {sel:>4}/{len(pool):<7} {stuck:>6}   {mono:<40}")
        tot_sel += sel
        tot_pool += len(pool)
    print(f"\nTOTAL SELECTABLE: {tot_sel}/{tot_pool}   (stuck: {tot_pool - tot_sel})")
    stuck_all.sort(key=lambda x: -x[2])
    print("WORST-STUCK: " + ", ".join(
        f"{champ}({role} #{rank})" for role, champ, rank in stuck_all[:18]))


if __name__ == "__main__":
    main()
