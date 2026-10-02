"""Run: py tests/test_pick_suggestions.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import counter_engine as ce
from setup_suggest import load_champion_roles

POOL = [{"champ": "Darius", "mastery": 120000}, {"champ": "Garen", "mastery": 40000},
        {"champ": "Malphite", "mastery": 5000}, {"champ": "Ornn", "mastery": 0}]

# Picks: an all-squishy team into Fiora top wants a frontline engager; Darius
# (huge mastery, the engage + frontline + armor reasons) tops the list.
scn = {"my_role": "top", "my_team": ["Ahri", "Jinx", "Lee Sin"],
       "enemy_team": [{"champ": "Fiora", "role": "top"}, {"champ": "Zed", "role": "middle"}],
       "pool": POOL}
out = ce.live_suggestions(scn)
assert out["phase"] == "picks" and out["bans"] == [], out
assert [p["champ"] for p in out["picks"]][0] == "Darius", out
assert len(out["picks"]) == 3, out
for p in out["picks"]:
    assert len(p["reasons"]) == 2 and all(isinstance(r, str) and r for r in p["reasons"]), p
    assert p["confidence"] in ("HIGH", "MEDIUM", "LOW"), p

# A locked champ can't be suggested.
taken = ce.live_suggestions(dict(scn, my_team=["Darius"]))
assert "Darius" not in [p["champ"] for p in taken["picks"]], taken

# Bans: no enemy locked yet -> three same-role bans with a reason, none from
# the user's own pool and none already banned.
out = ce.live_suggestions({"my_role": "top", "my_team": [], "enemy_team": [], "pool": POOL})
assert out["phase"] == "bans" and out["picks"] == [], out
assert len(out["bans"]) == 3 and all(b["reason"] for b in out["bans"]), out
first = out["bans"][0]["champ"]
assert first not in {p["champ"] for p in POOL}, out
again = ce.live_suggestions({"my_role": "top", "my_team": [], "enemy_team": [], "pool": POOL},
                            taken=[first])
assert first not in [b["champ"] for b in again["bans"]] and len(again["bans"]) == 3, again

# Role inference from data/champion_roles.json: known champ -> a role, unknown -> None.
roles = load_champion_roles()
assert ce.infer_role("Jinx", roles) == "bottom", ce.infer_role("Jinx", roles)
assert ce.infer_role("Not A Champion", roles) is None
assert ce.infer_role("A", {"top": ["X", "A"], "jungle": ["A"]}) == "jungle"  # ranks higher there

print("ok")
