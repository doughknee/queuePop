"""Counter engine — vertical-slice prototype.

Scores candidate champions against a champ-select scenario using kit attributes
+ data-driven rules, and prints the recommended pick with the reasons that fired.

Pure-Python, no deps. Run from the repo root:

    py scripts/counter_engine.py

Reads data/champion_flags.seed.json, data/counter_rules.seed.json, and
data/counter_scenarios.seed.json. See docs/counter-engine.md for the design.
"""

import collections
import json
import re
import zlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# Scoring knobs — the "weighting" we want to eyeball. Tune freely.
MASTERY_FULL_AT = 100_000      # mastery points that earn the full comfort bonus
MASTERY_WEIGHT = 12.0          # comfort is a soft PRIORITY bonus, never a gate —
                               # a strong-fit pick you've never played can still win

# Draft-sensitivity & diversity knobs (see the diversity Monte-Carlo in docs):
VIABILITY_BASE = 6.0   # every role-appropriate champ starts here — "it's a real pick"
SCALE_TARGET = 3       # enemy-condition count at which a matchup reward reaches full weight
SCALE_FLOOR = 0.30     # fraction of weight when the condition is only marginally present
DECAY = [1.0, 0.3, 0.12, 0.05, 0.02]  # favors a champ's BEST draft-fit reason over breadth,
                                # so the sharpest answer to THIS draft wins (diversity + draft-sensitivity)


def _decayed(weights):
    """Sum positive weights with diminishing returns so flag-dense generalists can't
    just stack every reward linearly. `weights` must be sorted descending."""
    return sum(w * (DECAY[i] if i < len(DECAY) else DECAY[-1] * 0.6) for i, w in enumerate(weights))


def load_json(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


# Prefer the full ingested roster (Phase 0); fall back to the 20-champ seed.
_FLAGS_PATH = DATA / "champion_flags.json"
if not _FLAGS_PATH.exists():
    _FLAGS_PATH = DATA / "champion_flags.seed.json"
CHAMPS = load_json(_FLAGS_PATH)
RULES = load_json(DATA / "counter_rules.seed.json")["rules"]


def flags_of(name):
    entry = CHAMPS.get(name)
    if entry is None:
        return set()
    return set(entry.get("flags", []))


# ---- predicate evaluation ---------------------------------------------------

def champ_matches_count_spec(champ_flags, spec):
    """Does a single champion satisfy a count spec's flag requirement?
    Keys COMBINE (AND) when several are present: flag=has it, flags=has ALL,
    any_flags=has ANY. any_of=[spec,...] is an OR of sub-specs — needed for
    composite archetypes like "diver" = hard_engage OR (burst AND mobility)."""
    if "any_of" in spec:
        return any(champ_matches_count_spec(champ_flags, s) for s in spec["any_of"])
    checked = False
    if "flag" in spec:
        checked = True
        if spec["flag"] not in champ_flags:
            return False
    if "flags" in spec:           # must have ALL
        checked = True
        if not all(f in champ_flags for f in spec["flags"]):
            return False
    if "any_flags" in spec:       # must have ANY
        checked = True
        if not any(f in champ_flags for f in spec["any_flags"]):
            return False
    return checked


def team_count_ok(team_names, spec):
    n = sum(1 for nm in team_names if champ_matches_count_spec(flags_of(nm), spec))
    ok = True
    if "min" in spec:
        ok = ok and n >= spec["min"]
    if "max" in spec:
        ok = ok and n <= spec["max"]
    return ok


def team_conditions_ok(team_names, conds):
    if conds is None:
        return True
    if isinstance(conds, dict):
        conds = [conds]
    return all(team_count_ok(team_names, c) for c in conds)


def subject_matches(subject_flags, spec):
    if not spec:
        return True
    if "all" in spec and not all(f in subject_flags for f in spec["all"]):
        return False
    if "any" in spec and not any(f in subject_flags for f in spec["any"]):
        return False
    if "none" in spec and any(f in subject_flags for f in spec["none"]):
        return False
    return True


# ---- reason rendering -------------------------------------------------------

_TOKEN = re.compile(r"\{(enemy|team)_with(_all|_any)?:([a-z_,]+)\}")


def render_reason(template, enemy_names, my_names):
    def repl(m):
        side, mode, flags_csv = m.group(1), m.group(2), m.group(3)
        names = enemy_names if side == "enemy" else my_names
        flags = flags_csv.split(",")
        if mode == "_all":
            pred = lambda f: all(x in f for x in flags)
        elif mode == "_any":
            pred = lambda f: any(x in f for x in flags)
        else:
            pred = lambda f: flags[0] in f
        hits = [nm for nm in names if pred(flags_of(nm))]
        return ", ".join(hits) if hits else "them"
    return _TOKEN.sub(repl, template)


# ---- core -------------------------------------------------------------------

def rule_context_ok(rule, lane_opp, enemy_names, my_names, lane_partner=None):
    """Does the DRAFT (enemy/team/lane) satisfy this rule, ignoring the candidate?
    If so, the reward is 'available' — some champion could earn it here."""
    if "lane_opponent" in rule:
        lf = flags_of(lane_opp) if lane_opp else set()
        if not subject_matches(lf, rule["lane_opponent"]):
            return False
    if "lane_partner" in rule:  # duo synergy: requires a KNOWN partner matching the spec
        if not lane_partner or not subject_matches(flags_of(lane_partner), rule["lane_partner"]):
            return False
    if "enemy_team" in rule and not team_conditions_ok(enemy_names, rule["enemy_team"]):
        return False
    if "my_team" in rule and not team_conditions_ok(my_names, rule["my_team"]):
        return False
    return True


def rule_candidate_ok(rule, candidate):
    return subject_matches(flags_of(candidate), rule.get("candidate"))


def candidate_key_flags(rule):
    """The candidate flags a rule keys on — used to fetch the champ-specific note."""
    c = rule.get("candidate") or {}
    return list(c.get("all", [])) + list(c.get("any", []))


def enemy_condition_count(rule, enemy_names):
    """How many enemies satisfy this rule's enemy_team condition (the draft 'magnitude').
    None if the rule has no enemy condition (team-need / lane rules aren't scaled)."""
    spec = rule.get("enemy_team")
    if spec is None:
        return None
    specs = spec if isinstance(spec, list) else [spec]
    return sum(1 for nm in enemy_names
               if all(champ_matches_count_spec(flags_of(nm), s) for s in specs))


def scaled_base_weight(rule, enemy_names):
    """Base weight scaled by how strongly the draft calls for it: full only when the
    enemy condition is met SCALE_TARGET+ times (3 tanks), a fraction when marginal."""
    w = rule["weight"]
    if w <= 0 or rule.get("no_scale"):
        return w  # absence/team-shape rules aren't "more is scarier" — don't dilute by count
    cnt = enemy_condition_count(rule, enemy_names)
    if cnt is None:
        return w
    # Per-rule target: "more is scarier" rules (tanks, poke) default to SCALE_TARGET;
    # rules where ONE occurrence is already fully significant (a single assassin to lock
    # down) set scale_at: 1 so they don't get diluted away.
    return w * max(SCALE_FLOOR, min(1.0, cnt / rule.get("scale_at", SCALE_TARGET)))


def _absence_knowledge_scale(rule, my_names, enemy_names):
    """Absence claims ("your team lacks engage", "enemy has no lockdown") are only as
    strong as our knowledge of that team. A max-only condition on a team we've seen 0
    picks of is trivially true and means nothing — scale its reward by the fraction of
    that team actually known. Presence (min) conditions need real picks, so they're safe."""
    factor = 1.0
    for key, names, size in (("my_team", my_names, 4), ("enemy_team", enemy_names, 5)):
        conds = rule.get(key)
        if conds is None:
            continue
        specs = conds if isinstance(conds, list) else [conds]
        if specs and all("max" in s and "min" not in s for s in specs):
            factor *= min(1.0, len(names) / size)
    return factor


def evaluate_rule(rule, candidate, lane_opp, enemy_names, my_names, lane_partner=None):
    """Return the fired-rule dict if the rule fires for this candidate, else None.
    Attaches `detail` — this champion's specific kit reason — when we have a note
    for the flag that triggered the rule, so reasoning is per-champion not generic."""
    if not (rule_candidate_ok(rule, candidate)
            and rule_context_ok(rule, lane_opp, enemy_names, my_names, lane_partner)):
        return None
    cf = flags_of(candidate)
    # Magnitude scaling: a reward is full-strength only when the draft strongly calls for
    # it (3+ tanks → full anti-tank; 1 tank → a fraction) — makes picks draft-specific.
    weight = scaled_base_weight(rule, enemy_names)
    if weight > 0:
        weight *= _absence_knowledge_scale(rule, my_names, enemy_names)
    # Intensity boost: a champ with more of a rule's SUPPORTING flags does it harder
    # (Vayne has %HP + true damage; Corki only true) — breaks intra-archetype ties.
    boost_flags = rule.get("boost", [])
    if weight > 0 and boost_flags:
        weight += min(sum(1 for f in boost_flags if f in cf), 3)
    weight = round(weight)
    if weight == 0 and rule.get("weight", 0) > 0:
        return None  # reward scaled away entirely (e.g. absence claim on an unknown team)
    hit = {"id": rule["id"], "weight": weight, "scope": rule["scope"],
           "reason": render_reason(rule["reason"], enemy_names, my_names)}
    notes = (CHAMPS.get(candidate) or {}).get("notes") or {}
    for k in candidate_key_flags(rule):
        if k in cf and k in notes:
            hit["detail"] = notes[k]
            break
    return hit


def mastery_term(points):
    if points <= 0:
        return 0.0, "no mastery on this champ"
    norm = min(points / MASTERY_FULL_AT, 1.0)
    return norm * MASTERY_WEIGHT, f"comfort: {points:,} mastery"


def evaluate_scenario(scn):
    my_names = scn["my_team"]
    enemy = scn["enemy_team"]
    enemy_names = [e["champ"] for e in enemy]
    lane_opp = next((e["champ"] for e in enemy if e["role"] == scn["my_role"]), None)
    # Bot is a 2v2 — duo rules see your lane partner when the caller provides ally roles.
    ally_roles = scn.get("ally_roles") or {}
    partner_role = {"bottom": "utility", "utility": "bottom"}.get(scn["my_role"])
    lane_partner = ally_roles.get(partner_role) if partner_role else None
    # A champion already locked by EITHER team can't be picked — drop it from the pool
    # (draft rules; without this "what beats Darius?" once listed Darius as an answer).
    taken = set(my_names) | set(enemy_names)
    pool = [p for p in scn["pool"] if p["champ"] not in taken]

    # Pass 1 — score every candidate.
    prelim = []
    for entry in pool:
        cand = entry["champ"]
        pts = entry.get("mastery", 0)
        fired = []
        for rule in RULES:
            hit = evaluate_rule(rule, cand, lane_opp, enemy_names, my_names, lane_partner)
            if hit:
                fired.append(hit)
        ms, mlabel = mastery_term(pts)
        fired.sort(key=lambda h: -h["weight"])
        pos = [h["weight"] for h in fired if h["weight"] > 0]
        neg = sum(h["weight"] for h in fired if h["weight"] < 0)
        total = VIABILITY_BASE + _decayed(pos) + neg + ms  # base + diminishing positives + warnings + comfort
        prelim.append({"champ": cand, "pts": pts, "fired": fired, "total": total,
                       "ms": ms, "mlabel": mlabel})

    # Rewards ACHIEVABLE in this role = positive rules at least one candidate in the
    # pool captures. Using the pool (not all theoretically-available rules) keeps the
    # fit ceiling and the gap list role-relevant — an ADC isn't dinged for lacking a
    # tank's cc-immunity. 100 = captures every role-achievable reward AND you main it.
    by_id = {r["id"]: r for r in RULES}
    role_reward_ids = {h["id"] for p in prelim for h in p["fired"] if h["weight"] > 0}
    role_rewards = [by_id[i] for i in role_reward_ids]
    ceil_weights = sorted((scaled_base_weight(r, enemy_names)
                           * _absence_knowledge_scale(r, my_names, enemy_names)
                           for r in role_rewards), reverse=True)
    fit_ceiling = VIABILITY_BASE + _decayed(ceil_weights) + MASTERY_WEIGHT

    results = []
    for p in prelim:
        fired_ids = {h["id"] for h in p["fired"]}
        gaps = [{"id": r["id"], "weight": r["weight"], "scope": r["scope"],
                 "reason": render_reason(r.get("gap", r["reason"]), enemy_names, my_names)}
                for r in role_rewards if r["id"] not in fired_ids]
        gaps.sort(key=lambda g: -g["weight"])
        fit = round(max(0.0, min(1.0, p["total"] / fit_ceiling)) * 100) if fit_ceiling > 0 else 0
        pos = [h["weight"] for h in p["fired"] if h["weight"] > 0]
        neg = sum(h["weight"] for h in p["fired"] if h["weight"] < 0)
        topw = pos[0] if pos else 0
        results.append({
            "champ": p["champ"], "score": p["total"], "fit": fit,
            "fired": p["fired"], "gaps": gaps,
            "mastery_score": p["ms"], "mastery_label": p["mlabel"], "mastery_points": p["pts"],
            # exact breakdown so the card's math reconciles: base + top + extras + comfort + risk = score
            "breakdown": {"base": VIABILITY_BASE, "top": round(topw, 1),
                          "extras": round(_decayed(pos) - topw, 1),
                          "comfort": round(p["ms"], 1), "risk": neg},
        })

    # Near-ties are ordered by a DRAFT-SEEDED rotation instead of pool order. The band
    # (TIE_EPS) matches the UI's "effectively tied — comfort decides" threshold, so we
    # only ever rotate inside groups the product already presents as interchangeable.
    # Same draft always returns the same order (deterministic); different drafts split
    # the tie across the class — Janna/Lulu/Milio/Nami each get their share of
    # enchanter drafts instead of one of them permanently owning the tie.
    draft_key = scn["my_role"] + "|" + ",".join(sorted(enemy_names)) + "|" + ",".join(sorted(my_names))
    results.sort(key=lambda r: -r["score"])
    results = _rotate_ties(results, lambda r: r["score"],
                           lambda r: zlib.crc32((draft_key + r["champ"]).encode()))
    return results, lane_opp


TIE_EPS = 1.5  # keep in sync with the frontend's tie display epsilon


def _rotate_ties(rows, score_of, rot_key):
    """Leader-anchored tie groups: from the top, every row within TIE_EPS of the
    group leader joins the group; each group is re-ordered by the draft-seeded key."""
    out, i = [], 0
    while i < len(rows):
        leader = score_of(rows[i])
        j = i
        while j < len(rows) and leader - score_of(rows[j]) <= TIE_EPS:
            j += 1
        group = sorted(rows[i:j], key=rot_key)
        out.extend(group)
        i = j
    return out


def suggest_bans(my_role, pool, top_k=5):
    """Rank potential same-role opponents by how badly they suppress THIS pool.
    For each enemy the user could face in lane, evaluate the pool against them alone
    (early-draft framing) and measure the pool's best remaining answers. The scariest
    ban is the opponent that leaves you with the weakest answers — personal to the
    user's champions, which is what makes it a real ban suggestion rather than a
    generic tier list."""
    pool_names = {p["champ"] for p in pool}
    opponents = [n for n, e in CHAMPS.items()
                 if not n.startswith("_") and isinstance(e, dict)
                 and my_role in e.get("roles", []) and n not in pool_names]
    rows = []
    for opp in opponents:
        scn = {"my_role": my_role, "my_team": [],
               "enemy_team": [{"champ": opp, "role": my_role}], "pool": pool}
        results, _ = evaluate_scenario(scn)
        best = results[:min(3, len(results))]
        answer_strength = sum(r["score"] for r in best) / len(best)
        # the most common warning it triggers across the pool = what makes it scary
        warn = collections.Counter(
            f["reason"] for r in results for f in r["fired"] if f["weight"] < 0)
        rows.append({
            "champ": opp,
            "answer_strength": round(answer_strength, 1),
            "best_answer": results[0]["champ"],
            "best_fit": results[0]["fit"],
            "threat_note": warn.most_common(1)[0][0] if warn else None,
        })
    rows.sort(key=lambda r: r["answer_strength"])
    return rows[:top_k]


def confidence(results):
    if not results or results[0]["score"] <= 0:
        return "LOW"
    has_positive = any(f["weight"] > 0 for f in results[0]["fired"] if f["scope"] != "warning")
    top = results[0]["score"]
    margin = top - (results[1]["score"] if len(results) > 1 else 0)
    ratio = margin / top if top > 0 else 0  # relative — scores are compressed by base+decay now
    if has_positive and (margin >= 8 or ratio >= 0.20):
        return "HIGH"
    if margin >= 3 or ratio >= 0.09:
        return "MEDIUM"
    return "LOW"


# ---- draft analysis ---------------------------------------------------------

def _names_with(names, flag):
    return [n for n in names if flag in flags_of(n)]


def summarize_team(names):
    """A scouting read of a 5-man (or partial) team from its champions' flags."""
    if not names:
        return None
    phys = _names_with(names, "deals_physical")
    magic = _names_with(names, "deals_magic")
    hard_engage = _names_with(names, "hard_engage")
    burst = _names_with(names, "burst")
    poke = _names_with(names, "lane_poke")
    pick = _names_with(names, "pick_potential")
    carries = [n for n in names if "sustained_dps" in flags_of(n)]
    hypercarry = [n for n in names if {"sustained_dps", "scaling_late"} <= flags_of(n)]
    healing = sorted(set(_names_with(names, "self_heal"))
                     | set(_names_with(names, "team_heal_shield"))
                     | set(_names_with(names, "healing_dependent")))
    summary = {
        "champs": names, "physical": len(phys), "magic": len(magic),
        "frontline": _names_with(names, "frontline"),
        "hard_engage": hard_engage, "disengage": _names_with(names, "disengage"),
        "burst": burst, "pick": pick, "poke": poke,
        "carries": carries, "hypercarry": hypercarry, "healing": healing,
        "anti_tank": _names_with(names, "anti_tank"),
    }
    sc = {"early": len(_names_with(names, "scaling_early")),
          "mid": len(_names_with(names, "scaling_mid")),
          "late": len(_names_with(names, "scaling_late"))}
    summary["scaling"] = sc
    if sc["late"] - sc["early"] >= 2:
        summary["tempo"] = "scaling / late-game"
    elif sc["early"] - sc["late"] >= 2:
        summary["tempo"] = "early-game"
    else:
        summary["tempo"] = "mid-game"
    if len(hard_engage) >= 2:
        summary["comp"] = "hard-engage / wombo"
    elif len(poke) >= 2 and not hard_engage:
        summary["comp"] = "poke & siege"
    elif len(pick) >= 2:
        summary["comp"] = "pick"
    elif hypercarry and (healing or summary["disengage"]):
        summary["comp"] = "protect-the-carry"
    else:
        summary["comp"] = "standard skirmish"
    tags = []
    np_, nm = len(phys), len(magic)
    if np_ >= 3 and np_ >= 2 * max(nm, 1):
        tags.append("AD-heavy")
    elif nm >= 3 and nm >= 2 * max(np_, 1):
        tags.append("AP-heavy")
    else:
        tags.append("mixed damage")
    if len(hard_engage) >= 2:
        tags.append("hard-engage")
    if hard_engage and burst:
        tags.append("dive threat")
    if len(poke) >= 2:
        tags.append("poke")
    if len(pick) >= 2:
        tags.append("pick threat")
    if hypercarry:
        tags.append("scaling carry")
    if len(healing) >= 2:
        tags.append("heavy sustain")
    tags.append(summary["tempo"])
    tags.append(summary["comp"])
    summary["tags"] = tags
    return summary


def team_needs(team_sum):
    """What the allied team lacks — the draft holes a good pick should fill."""
    if not team_sum:
        return []
    needs = []
    if not team_sum["hard_engage"]:
        needs.append("hard engage")
    if not team_sum["frontline"]:
        needs.append("a frontline")
    if team_sum["physical"] and not team_sum["magic"]:
        needs.append("magic damage")
    if team_sum["magic"] and not team_sum["physical"]:
        needs.append("physical damage")
    if team_sum["carries"] and not (team_sum["disengage"] or team_sum["healing"]):
        needs.append("peel for your carry")
    return needs


def itemization(enemy_sum):
    """Build priorities for YOUR team vs the enemy comp (enemy-driven, shared)."""
    if not enemy_sum:
        return []
    es = enemy_sum
    hints = []
    if len(es["healing"]) >= 2:
        hints.append({"item": "Grievous Wounds", "why": "cut their heavy sustain (" + ", ".join(es["healing"]) + ")"})
    if "AD-heavy" in es["tags"]:
        hints.append({"item": "Armor", "why": "their damage is mostly physical"})
    if "AP-heavy" in es["tags"]:
        hints.append({"item": "Magic resist", "why": "their damage is mostly magic"})
    if es["burst"]:
        hints.append({"item": "Zhonya's / GA", "why": "survive their assassins (" + ", ".join(es["burst"]) + ")"})
    hard_cc = [n for n in es["champs"] if "hard_cc" in flags_of(n)]
    if len(es["hard_engage"]) >= 1 or len(hard_cc) >= 3:
        hints.append({"item": "Tenacity / QSS", "why": "they have heavy lockdown"})
    if len(es["frontline"]) >= 2:
        hints.append({"item": "%max-HP / armor pen", "why": "cut through their frontline"})
    return hints


def game_plan(team_sum, enemy_sum):
    """Tempo read: when does YOUR comp want the game to be decided vs theirs."""
    if not team_sum or not enemy_sum:
        return None
    you = team_sum["scaling"]["late"] - team_sum["scaling"]["early"]
    them = enemy_sum["scaling"]["late"] - enemy_sum["scaling"]["early"]
    if you - them >= 2:
        return "You scale harder — play safe early, concede nothing, and take over mid-to-late."
    if them - you >= 2:
        return "They scale harder — force tempo, take early fights and objectives, and close before they come online."
    return "Even scaling — the game is decided by picks, objective setups, and teamfight execution."


def win_condition(s):
    """How YOUR composition is supposed to win, from its comp identity."""
    if not s:
        return None
    comp = s.get("comp")
    if comp == "hard-engage / wombo":
        return "Win condition: group as 5, land your engage, and chain CC in teamfights."
    if comp == "poke & siege":
        return "Win condition: poke them down and siege objectives — avoid coin-flip all-ins."
    if comp == "pick":
        return "Win condition: catch isolated targets and snowball the numbers advantage."
    if comp == "protect-the-carry":
        car = (s.get("hypercarry") or s.get("carries") or [])
        return f"Win condition: peel {car[0] if car else 'your carry'} and win extended fights front-to-back."
    return "Win condition: win clean teamfights and control objectives (Dragon/Baron)."


def analyze_draft(scn):
    enemy_names = [e["champ"] for e in scn.get("enemy_team", [])]
    team_sum = summarize_team(scn.get("my_team", []))
    enemy_sum = summarize_team(enemy_names)
    return {"enemy": enemy_sum, "team": team_sum, "needs": team_needs(team_sum),
            "itemization": itemization(enemy_sum), "game_plan": game_plan(team_sum, enemy_sum),
            "win_condition": win_condition(team_sum)}


# ---- presentation -----------------------------------------------------------

def fmt_team(names):
    return ", ".join(names)


def fmt_enemy(enemy):
    return ", ".join(f"{e['champ']}({e['role']})" for e in enemy)


def print_scenario(scn):
    results, lane_opp = evaluate_scenario(scn)
    conf = confidence(results)

    print("=" * 70)
    print(f"SCENARIO: {scn['name']}")
    if scn.get("note"):
        print(f"  {scn['note']}")
    print("-" * 70)
    print(f"  Picking:    {scn['my_role'].upper()}"
          + (f"   (lane vs {lane_opp})" if lane_opp else ""))
    print(f"  Your team:  {fmt_team(scn['my_team'])}")
    print(f"  Enemy team: {fmt_enemy(scn['enemy_team'])}")
    print()

    top = results[0]
    print(f"  >> RECOMMEND: {top['champ']}   "
          f"fit {top['fit']}/100   score {top['score']:.1f}   confidence: {conf}")
    for f in top["fired"]:
        print(f"        {f['weight']:+.0f}  {f['reason']}")
    if top["mastery_score"]:
        print(f"        {top['mastery_score']:+.0f}  {top['mastery_label']}")
    for g in top["gaps"]:
        print(f"         gap  {g['reason']}")
    print()

    for r in results[1:]:
        print(f"     {r['champ']}   score {r['score']:.1f}")
        for f in r["fired"]:
            print(f"        {f['weight']:+.0f}  {f['reason']}")
        print(f"        {r['mastery_score']:+.0f}  {r['mastery_label']}")
        print()


def main():
    # Make box/arrow output safe on Windows code pages.
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    scenarios = load_json(DATA / "counter_scenarios.seed.json")["scenarios"]
    for scn in scenarios:
        print_scenario(scn)


if __name__ == "__main__":
    main()
