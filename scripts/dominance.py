"""Diagnose WHY champs can't be #1: are they flag-DOMINATED or just edged out?

A champ X is dominated by peer Y if, for every positive rule, X-can-fire => Y-can-fire AND
Y's boost-count >= X's on every shared rule (and Y is strictly better somewhere). Then
score(Y) >= score(X) in EVERY draft => X can never be uniquely #1. Domination means X and Y
are indistinguishable-or-worse to our FLAG VOCABULARY -> the fix is finer flags, not tuning.

Champs that are NOT dominated but still stuck are fixable by scoring (they have a unique rule).

Run:  py scripts/dominance.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import counter_engine as ce  # noqa: E402

ROLES = ["top", "jungle", "middle", "bottom", "utility"]
CH = [n for n in ce.CHAMPS if not n.startswith("_") and isinstance(ce.CHAMPS[n], dict)]
POS = [r for r in ce.RULES if r.get("weight", 0) > 0]


def by_role(role):
    return [n for n in CH if role in ce.CHAMPS[n].get("roles", [])]


def profile(c):
    """For each positive rule: (can-fire, boost-count capped 3) — the champ's scoring fingerprint."""
    cf = ce.flags_of(c)
    prof = {}
    for r in POS:
        fires = ce.rule_candidate_ok(r, c)
        boost = min(sum(1 for f in r.get("boost", []) if f in cf), 3) if fires else 0
        prof[r["id"]] = (fires, boost)
    return prof


def dominates(py, px):
    """Does Y's profile dominate X's (Y >= X on every rule, strictly better somewhere)?"""
    strict = False
    for rid, (xf, xb) in px.items():
        yf, yb = py[rid]
        if xf and not yf:
            return False               # X fires a rule Y can't -> X has an edge
        if xf and yf and xb > yb:
            return False               # X boosts a shared rule harder
        if (yf and not xf) or (xf and yf and yb > xb):
            strict = True              # Y strictly better here
    return strict


def main():
    print("FLAG-DOMINANCE DIAGNOSTIC (why champs can't be uniquely #1)\n" + "=" * 62)
    total_dom = total = 0
    twin_groups_all = 0
    for role in ROLES:
        pool = by_role(role)
        profs = {c: profile(c) for c in pool}
        dominated = []
        for x in pool:
            if any(y != x and dominates(profs[y], profs[x]) for y in pool):
                dominated.append(x)
        # identical-profile twin groups (mutually non-strict) — only 1 of each can ever win
        seen = {}
        for c in pool:
            key = tuple(sorted(profs[c].items()))
            seen.setdefault(key, []).append(c)
        twins = {k: v for k, v in seen.items() if len(v) > 1}
        twin_lost = sum(len(v) - 1 for v in twins.values())
        total_dom += len(dominated)
        total += len(pool)
        twin_groups_all += len(twins)
        print(f"\n[{role.upper()}] {len(dominated)}/{len(pool)} flag-DOMINATED (can never be #1 — need finer flags)")
        if dominated:
            print("   " + ", ".join(dominated))
        if twins:
            print(f"   identical-profile twin groups ({len(twins)}, {twin_lost} extra champs lose tie-break):")
            for v in list(twins.values())[:6]:
                print("     = " + " / ".join(v))
    print(f"\nTOTAL flag-dominated: {total_dom}/{total} role-slots")
    print("These are the champs the current FLAG VOCABULARY literally cannot distinguish.")


if __name__ == "__main__":
    main()
