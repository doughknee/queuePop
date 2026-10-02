"""Run: py tests/test_setup_suggest.py"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from setup_suggest import derive_role_picks, load_champion_roles, match_position

TABLE = {"top": ["Garen", "Darius"], "middle": ["Ahri", "Lux"], "utility": ["Lux"]}

# Recency beats mastery: 2 recent mid games of Ahri outrank Lux's huge mastery.
mastery = [{"name": "Lux", "points": 900000}, {"name": "Ahri", "points": 1000}]
matches = [{"name": "Ahri", "position": "middle"}] * 2
picks = derive_role_picks(mastery, matches, TABLE)
assert picks["middle"] == ["Ahri", "Lux"], picks

# Role fallback: Lux has mastery but no recent games, so she lands in every role
# the table lists (mid + support), never in a role she isn't listed for.
assert picks["utility"] == ["Lux"], picks
assert "Lux" not in picks["top"] and picks["jungle"] == [], picks

# A champion played recently stays in the roles actually played, not the table.
picks = derive_role_picks([{"name": "Garen", "points": 5}],
                          [{"name": "Garen", "position": "middle"}], TABLE)
assert picks["middle"] == ["Garen"] and picks["top"] == [], picks

# Cap of 5 per role, ordered by games then points.
names = [f"C{i}" for i in range(8)]
mastery = [{"name": n, "points": i} for i, n in enumerate(names)]
picks = derive_role_picks(mastery, [], {"top": names})
assert picks["top"] == ["C7", "C6", "C5", "C4", "C3"], picks

# Match-history lane/role mapping: Rift only, bottom splits on support.
assert match_position(11, "BOTTOM", "DUO_SUPPORT") == "utility"
assert match_position(11, "BOTTOM", "DUO_CARRY") == "bottom"
assert match_position(11, "NONE", "NONE") is None
assert match_position(12, "MIDDLE", "SOLO") is None  # ARAM

# The bundled role table loads and covers all five roles.
assert set(load_champion_roles()) == {"top", "jungle", "middle", "bottom", "utility"}

print("ok")
