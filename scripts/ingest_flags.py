"""Phase 0 ingest — build data/champion_flags.json for the whole roster.

Pipeline (see docs/counter-engine.md): scrape -> map-to-intent -> spot-check.

  1. SCRAPE   roster + attack range from Data Dragon; kit flags from the LoL
              Wiki MediaWiki category API (authoritative membership lists).
  2. MAP      apply data/flag_overrides.json — refine categories that are broader
              than the flag's intent, and add flags that have no clean category.
  3. OVERLAY  carry the hand-curated *judgment* flags + roles from the 20-champ
              seed (champion_flags.seed.json) for those champions. New champions
              get mechanical flags only, pending Phase 1 judgment enrichment.

Run from repo root (needs network):

    py scripts/ingest_flags.py

Then verify nothing regressed:  py scripts/golden_test.py
"""

import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = {"User-Agent": "queuePop-counter-ingest/0.1 (https://github.com/; contact: queuePop)"}

# Flags that come from a data source (DDragon / wiki / overrides). Everything else
# in the seed is a judgment flag and gets carried via the seed overlay.
MECHANICAL_FLAGS = {
    "ranged", "melee", "dash", "blink", "untargetability", "invulnerability",
    "self_heal", "hard_cc", "displacement", "true_damage", "percent_hp_damage",
}

# flag -> wiki category title(s) to union. Verified live; the run prints per-category
# counts so a renamed/empty category is obvious.
SINGLE_CATEGORY = {
    "dash": ["Dash champion"],
    "blink": ["Blink champion"],
    "untargetability": ["Untargetable champion"],
    "invulnerability": ["Invulnerable champion"],
    "self_heal": ["Self Heal champion"],
}
# Reliable lockdown CC (NOT slow/silence/ground — those are soft CC, deliberately excluded).
HARD_CC_CATS = ["Stun champion", "Root champion", "Taunt champion", "Charm champion",
                "Flee champion", "Suppress champion", "Sleep champion", "Polymorph champion",
                "Knockup champion", "Knockback champion", "Knockdown champion",
                "Suspend champion", "Pull champion"]
# Forced movement of an enemy (airborne / displacement family).
DISPLACEMENT_CATS = ["Knockup champion", "Knockback champion", "Knockdown champion",
                     "Suspend champion", "Pull champion"]

RANGED_MIN = 300  # attackrange threshold: melee ~125-200, ranged ~500+

WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php"


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as fh:
        return json.load(fh)


def fetch_roster():
    version = get_json("https://ddragon.leagueoflegends.com/api/versions.json")[0]
    full = get_json(f"https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/championFull.json")["data"]
    roster = {}
    for entry in full.values():
        roster[entry["name"]] = {
            "id": entry["id"],
            "attackrange": entry["stats"]["attackrange"],
            "tags": entry["tags"],
        }
    return version, roster


def infer_roles(tags, flags):
    """Approximate role eligibility from class tags + flags. Heuristic (roles are
    flexy in League) and intentionally inclusive — better to over-offer a candidate
    than to hide a valid pick. Seed champs keep their hand-set roles instead."""
    t = set(tags)
    r = set()
    if "Support" in t:
        r.add("utility")
    if "Marksman" in t:
        r.add("bottom")
    if "Mage" in t:
        r.add("middle")
    if "Assassin" in t:
        r.update(["middle", "jungle"])
    if "Fighter" in t:
        r.update(["top", "jungle"])
    if "Tank" in t and "Support" not in t:
        r.update(["top", "jungle"])
    if "team_heal_shield" in flags:
        r.add("utility")
    if not r:
        r.add("middle")
    return sorted(r)


def fetch_category(title):
    url = (f"{WIKI_API}?action=query&list=categorymembers"
           f"&cmtitle=Category:{urllib.parse.quote(title)}&cmlimit=500&cmnamespace=0&format=json")
    data = get_json(url)
    return {m["title"] for m in data["query"]["categorymembers"]}


def main():
    print("Fetching Data Dragon roster ...")
    version, roster = fetch_roster()
    print(f"  patch {version}, {len(roster)} champions")

    # Fetch every distinct wiki category once.
    all_cats = set(sum(SINGLE_CATEGORY.values(), [])) | set(HARD_CC_CATS) | set(DISPLACEMENT_CATS)
    print("Fetching wiki categories ...")
    members = {}
    for cat in sorted(all_cats):
        try:
            members[cat] = fetch_category(cat)
            print(f"  {cat:<22} {len(members[cat]):>3} members")
        except Exception as exc:
            members[cat] = set()
            print(f"  {cat:<22} FAILED: {exc!r}")

    def union(cats):
        out = set()
        for c in cats:
            out |= members.get(c, set())
        return out

    hard_cc = union(HARD_CC_CATS)
    displacement = union(DISPLACEMENT_CATS)

    # Curated role membership (from tier lists) — authoritative; replaces tag inference.
    role_data = json.loads((DATA / "champion_roles.json").read_text(encoding="utf-8"))
    curated_roles = {}
    for role, names in role_data.items():
        if role.startswith("_"):
            continue
        for n in names:
            curated_roles.setdefault(n, []).append(role)

    overrides = json.loads((DATA / "flag_overrides.json").read_text(encoding="utf-8"))
    engage_only = set(overrides.get("engage_only_dash", []))
    incidental_unt = set(overrides.get("incidental_untargetability", []))
    extra_true = set(overrides.get("true_damage", []))
    extra_pct = set(overrides.get("percent_hp_damage", []))
    add_map = overrides.get("add", {})
    remove_map = overrides.get("remove", {})

    # Judgment overlays: hand-curated seed (20) + Phase 1 batches (champion_judgment.json).
    # Only judgment flags are taken from these (mechanical flags stay authoritative).
    overlay_map = {}
    seed_roles = {}
    seed = json.loads((DATA / "champion_flags.seed.json").read_text(encoding="utf-8"))
    for name, entry in seed.items():
        if name.startswith("_") or not isinstance(entry, dict):
            continue
        overlay_map.setdefault(name, set()).update(set(entry.get("flags", [])) - MECHANICAL_FLAGS)
        if entry.get("roles"):
            seed_roles[name] = entry["roles"]

    # Per-champion ability notes (flag -> specific kit text) for dynamic reasoning:
    # Phase-1 judgment 'why' first, then curated champion_notes.json (wins/extends).
    notes_map = {}
    judgment_path = DATA / "champion_judgment.json"
    phase1 = 0
    if judgment_path.exists():
        for name, entry in json.loads(judgment_path.read_text(encoding="utf-8")).items():
            if name.startswith("_") or not isinstance(entry, dict):
                continue
            overlay_map.setdefault(name, set()).update(set(entry.get("flags", [])) - MECHANICAL_FLAGS)
            if entry.get("why"):
                notes_map.setdefault(name, {}).update(entry["why"])
            phase1 += 1

    notes_path = DATA / "champion_notes.json"
    if notes_path.exists():
        for name, nd in json.loads(notes_path.read_text(encoding="utf-8")).items():
            if name.startswith("_") or not isinstance(nd, dict):
                continue
            notes_map.setdefault(name, {}).update(nd)

    out = {
        "_meta": {
            "generated_from": f"ddragon {version} + wiki categories + flag_overrides.json + seed/phase1 overlay",
            "ddragon_version": version,
            "note": "Mechanical flags are authoritative; roles are hand-set for seed champs, else inferred from class tags (approximate).",
            "champions": len(roster),
        }
    }

    mechanical_only = 0
    uncovered_roles = []
    for name, info in sorted(roster.items()):
        flags = set()

        # --- mechanical: ranged/melee ---
        flags.add("ranged" if info["attackrange"] >= RANGED_MIN else "melee")

        # --- mechanical: single-category flags ---
        for flag, cats in SINGLE_CATEGORY.items():
            if name in union(cats):
                flags.add(flag)
        if name in hard_cc:
            flags.add("hard_cc")
        if name in displacement:
            flags.add("displacement")

        # --- map-to-intent refinement ---
        if name in engage_only:
            flags.discard("dash")
        if name in incidental_unt:
            flags.discard("untargetability")
        if name in extra_true:
            flags.add("true_damage")
        if name in extra_pct:
            flags.add("percent_hp_damage")

        # --- judgment overlay (seed + Phase 1) ---
        overlay = overlay_map.get(name)
        if overlay:
            flags |= overlay
        else:
            mechanical_only += 1

        # --- per-champion overrides (applied last) ---
        for f in add_map.get(name, []):
            flags.add(f)
        for f in remove_map.get(name, []):
            flags.discard(f)

        # --- derive immobile: no reliable repositioning tool ---
        if not (flags & {"dash", "blink", "high_mobility"}):
            flags.add("immobile")

        # Roles: curated tier-list membership first; tag inference only if a champ
        # is in no list (logged below so it can be added to champion_roles.json).
        roles = curated_roles.get(name)
        if not roles:
            uncovered_roles.append(name)
            roles = seed_roles.get(name) or infer_roles(info["tags"], flags)
        roles = sorted({"utility" if r == "support" else r for r in roles})
        entry = {"id": info["id"], "roles": roles, "flags": sorted(flags)}
        if notes_map.get(name):
            entry["notes"] = notes_map[name]
        out[name] = entry

    (DATA / "champion_flags.json").write_text(
        json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")

    print("-" * 60)
    print(f"  wrote data/champion_flags.json — {len(roster)} champions")
    print(f"  judgment overlay: {len(overlay_map)} champs (seed 20 + phase1 {phase1})   mechanical-only: {mechanical_only}")
    if uncovered_roles:
        print(f"  ROLES NOT IN champion_roles.json (fell back to inference): {uncovered_roles}")
    print("  next: py scripts/golden_test.py")


if __name__ == "__main__":
    main()
