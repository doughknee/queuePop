"""First-run setup: per-role pick suggestions from the player's own mastery and
recent matches. Pure helpers; the LCU fetching lives in web_api.suggest_picks."""
import json
import os
import sys

ROLES = ("top", "jungle", "middle", "bottom", "utility")
TOP_N = 5
SUMMONERS_RIFT = 11

_LANES = {"TOP": "top", "JUNGLE": "jungle", "MIDDLE": "middle", "MID": "middle"}


def match_position(map_id, lane, role):
    """A match-history participant's timeline lane/role as a Rift position key,
    or None (non-Rift maps, lane NONE). Bottom lane splits on DUO_SUPPORT."""
    if map_id != SUMMONERS_RIFT:
        return None
    lane = (lane or "").upper()
    if lane in ("BOTTOM", "BOT"):
        return "utility" if (role or "").upper() == "DUO_SUPPORT" else "bottom"
    return _LANES.get(lane)


def load_champion_roles():
    """{role: [champion names]} from data/champion_roles.json, {} if missing."""
    base = getattr(
        sys, "_MEIPASS", os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    try:
        path = os.path.join(base, "data", "champion_roles.json")
        with open(path, encoding="utf-8") as f:
            return {r: v for r, v in json.load(f).items() if r in ROLES}
    except (OSError, ValueError):
        return {}


def derive_role_picks(mastery, matches, champion_roles):
    """mastery [{name, points}] + matches [{name, position}] + champion_roles
    {role: [names]} -> {role: [names]}, top TOP_N per role.

    Ranked by games played in that position recently, then mastery points.
    Champions with mastery but no positioned recent game fall back to every
    role the champion table lists them in."""
    games = {}  # (role, name) -> recent games there
    for m in matches:
        if m.get("name") and m.get("position") in ROLES:
            key = (m["position"], m["name"])
            games[key] = games.get(key, 0) + 1
    points = {m["name"]: m.get("points", 0) for m in mastery if m.get("name")}
    played = {name for _, name in games}
    out = {}
    for role in ROLES:
        listed = set(champion_roles.get(role, ()))
        cands = {n for r, n in games if r == role}
        cands |= {n for n in points if n not in played and n in listed}
        out[role] = sorted(
            cands, key=lambda n: (-games.get((role, n), 0), -points.get(n, 0), n)
        )[:TOP_N]
    return out
