# Counter Engine — kit-attribute champion picker

A deterministic, offline, explainable champion-recommendation system for champ select.
It scores candidate champions against the live champ-select state (enemy team, your team,
your role/mastery) using **kit attributes + rules**, and emits a pick plus the **reasons
that fired**. No AI required to run; an optional LLM layer can sit on top for nicer prose.

**Why this shape:** kit interactions are *stable* (they only change on reworks, a few per
year), unlike win rates. So this is a low-maintenance asset that compounds — every fix is
permanent. See the conversation that produced this doc for the full rationale.

---

## 1. Data model

### Champion kit profile
Each champion gets one flat record of boolean/enum flags:

```jsonc
// data/champion_flags.json  (one entry per champion id)
{
  "266": {                    // Aatrox
    "name": "Aatrox",
    "ranged": false,
    "dash": true,
    "hard_cc": true,          // Q knockups
    "displacement": true,
    "self_heal": true,
    "healing_dependent": true,
    "anti_tank": false,
    "power_curve": "mid",
    "hard_engage": false,
    "comp": ["teamfight", "dive"],
    "_src": { "dash": "wiki", "hard_cc": "wiki", "self_heal": "wiki",
              "healing_dependent": "judgment", "power_curve": "judgment" }
  }
}
```

`_src` records provenance per flag so verification knows what's a free download vs. a human
call (see §2). Keep flags *flat and few* — resist the urge to model full ability data; that's
Meraki's job, not ours.

### Rule
```jsonc
{
  "id": "anti_tank_vs_frontline",
  "scope": "matchup",            // matchup | team_need | comp | lane | warning
  "when": "candidate.anti_tank && enemyTeam.count(tank) >= 1",
  "weight": 25,                  // signed; negative = warning/penalty
  "reason": "melts their frontline ({enemyTanks})"
}
```

Rules are data, not code — load them from `data/counter_rules.json` so they're tunable and
testable without a rebuild. The engine evaluates `when` against three contexts: `candidate`
(the champ being scored), `enemyTeam`, `myTeam`.

---

## 2. The flag catalog — split by provenance

This is the heart of the build plan. **Provenance tells you the cost of each flag:**

- **`wiki`** — the LoL Wiki maintains a category/list page for this exact property. Scrape the
  page → the flag is populated for all champions, community-verified. *Zero hand-tagging.*
- **`meraki`** — derivable by parsing Meraki's CDN ability JSON
  (`cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions`). Mechanical, no judgment.
- **`judgment`** — needs a human call (or LLM bulk-draft + human verify). Keep this set small.
  Several are tiny enumerable lists you can just type out.

### Group A — Mobility & positioning
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `dash` | bool | **wiki** | "Champions with a dash" category |
| `blink` | bool | **wiki** | "Champions with a blink" |
| `ranged` | bool | **meraki** | attack range threshold |
| `high_mobility` | bool | judgment | repeated/low-cd dashes (Yasuo, Zeri, Akali) |
| `immobile` | bool | judgment | no reliable escape (derive from `!dash && !blink`, then refine) |
| `mobility_dependent` | bool | judgment | weak if locked down |

### Group B — Crowd control
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `hard_cc` | bool | **wiki** | "Champions with hard crowd control" |
| `displacement` | bool | **wiki** | "Champions with displacement" |
| `point_click_cc` | bool | judgment | targeted, undodgeable (Malzahar R, Skarner R) |
| `cc_reliant` | bool | judgment | combo/engage depends on landing CC |
| `skillshot_reliant` | bool | judgment | key CC/damage is dodgeable |

### Group C — Damage profile
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `damage_type` | enum(phys/magic/mixed) | **meraki** | from ability damage types |
| `true_damage` | bool | **wiki** | "Champions with true damage" |
| `percent_hp_damage` | bool | **wiki** | "Champions with percent-health damage" |
| `anti_tank` | bool | judgment | derive from `true_damage \|\| percent_hp_damage`, refine |
| `burst` | bool | judgment | assassin-style one-combo burst |
| `sustained_dps` | bool | judgment | auto-attack DPS (most ADCs, Vayne, Kayle) |

### Group D — Defensive / disruption tools
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `spellshield` | bool | **wiki** | "Champions with a spell shield" (Sivir/Noc/Morg E) |
| `untargetability` | bool | **wiki** | "Champions with untargetability" (Fizz E, Vlad pool) |
| `invulnerability` | bool | **wiki** | "Champions with invulnerability" (Tryndamere, Kayle R) |
| `projectile_block` | bool | judgment | tiny list: Yasuo, Samira, Braum |
| `cc_immunity` | bool | judgment | small list: Olaf R, Gangplank W, Sivir, Morgana R |
| `self_peel` | bool | judgment | can defend self when dove |

### Group E — Sustain / healing
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `self_heal` | bool | **wiki**/meraki | "Champions whose abilities heal" |
| `team_heal_shield` | bool | judgment | enchanters (Soraka, Lulu, Yuumi, Karma) |
| `healing_dependent` | bool | judgment | sustain is core → weak to anti-heal |

### Group F — Lane dynamics
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `lane_poke` | bool | judgment | strong harass (Xerath, Zoe) |
| `waveclear` | bool | judgment | fast clear |

### Group G — Power curve (the accuracy-bump flag)
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `power_curve` | enum(early/mid/late) | judgment | enables "lose lane, outscale" reasoning |

### Group H — Engage / disengage / pick (comp-level)
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `hard_engage` | bool | judgment | reliable initiation (Malphite R, Leona, Amumu) |
| `disengage` | bool | judgment | Janna, Poppy, Anivia wall |
| `pick_potential` | bool | judgment | catch isolated targets (Thresh, Blitz, Nocturne) |

### Group I — Comp archetype contribution
| Flag | Type | Provenance | Notes |
|---|---|---|---|
| `comp` | set | judgment | any of: engage / poke / protect_carry / dive / split / teamfight |

### Provenance tally
- **Free downloads (`wiki`/`meraki`): ~12 flags** — `dash`, `blink`, `ranged`, `hard_cc`,
  `displacement`, `damage_type`, `true_damage`, `percent_hp_damage`, `spellshield`,
  `untargetability`, `invulnerability`, `self_heal`.
- **Judgment: ~18 flags** — but ~5 are tiny enumerable lists (`projectile_block`,
  `cc_immunity`, `point_click_cc`, `team_heal_shield`, `high_mobility`), and the rest are
  well-known. Bulk-draft with an LLM (one-line justification per flag) → human verifies by
  *skimming sentences*, not recalling kits.

So the real hand-tag surface is roughly **170 champs × ~13 judgment flags**, most of which an
LLM pre-fills. An afternoon or two, not weeks.

---

## 2b. Audit findings — raw categories need a refinement layer

A 20-champion dry run of the verification process (cross-checking hand tags vs. the wiki
category pages) found that even the "free download" flags are **not** safe to ingest naively:

- **Precision was high, recall was not.** Of ~47 hand tags, only 2 were false positives
  (`invulnerability → Tryndamere` — his R is a min-HP floor, not damage immunity;
  `self_heal → Lee Sin` — omnivamp, not a heal ability); ~11 were misses (mostly Amumu).
  Mechanical ingest fixes the recall problem; the false positives are the ones to fear.
- **The wiki categories are broader than the flag's intent.** Six flags need a mapping pass,
  not a raw copy:
  - `dash` — includes engage-only ults (Malphite R) and combo-tethered dashes (Zed). Split
    into `escape_dash` (mobility / skillshot-dodging) vs `engage_dash`; rules that reward
    slipperiness must read only `escape_dash`.
  - `untargetability` — includes incidental dash-frame untargetability (Zed R) that is
    offensive, not an escape. Needs an "escape-relevant" sub-filter.
  - `invulnerability` — separate true damage-immunity (Kayle R) from min-HP "can't die"
    (Tryndamere → `undying`).
  - `self_heal` — separate dedicated heal abilities from vamp-stat sustain (omnivamp / lifesteal).
  - `hard_cc` — conditional CC (Caitlyn trap, Jhin marked-target) and silence-as-CC deserve a
    reliability sub-tag, not equal weight with a point-and-click stun.
  - `percent_hp_damage` / `true_damage` — **no clean wiki category exists**; the reference
    lists are non-exhaustive (they omit Vayne's % max-HP). Verify per-ability, not by category.

Takeaway: **Phase 0 ingest is `scrape → map-to-intent → spot-check`, not `scrape → done`.**
None of the 13 corrections changed any scenario recommendation (the current rules don't yet
consume the affected flags), but they would once the rule set grows — so fix at ingest.

---

## 3. Starter rule set

Counter (candidate vs. enemy):
- `mobility_dodges_skillshots` — `candidate.dash && enemy.skillshot_reliant` → "dodges {enemy}'s skillshots"
- `anti_tank_vs_frontline` — `candidate.anti_tank && enemyTeam.count(tank) >= 1` → "melts their frontline"
- `cc_immunity_vs_lockdown` — `candidate.cc_immunity && enemyTeam.cc_reliant_engage` → "you ult through their lockdown"
- `lockdown_vs_hypercarry` — `candidate.hard_cc && enemyTeam.has(immobile && sustained_dps)` → "you can pin their carry"
- `projectile_block_vs_poke` — `candidate.projectile_block && enemy.lane_poke && enemy.ranged` → "windwall negates their poke"
- `range_vs_melee_lane` — `candidate.ranged && laneOpp.melee && laneOpp.immobile` → "you outrange them in lane"
- `burst_vs_squishy` — `candidate.burst && enemyBackline.immobile` → "you can blow up their {carry}"

Warning (negative weight):
- `squishy_vs_assassin_no_peel` — `candidate.immobile && !candidate.self_peel && enemyTeam.has(burst) && myTeam.count(disengage)==0` → "no peel for you vs their assassin"

Team need (candidate fills my gap):
- `team_needs_engage` — `myTeam.count(hard_engage)==0 && candidate.hard_engage` → "your team has no engage — this is it"
- `team_needs_frontline` — `myTeam.count(tank)==0 && candidate.tankish` → "your team has no frontline"
- `damage_balance` — `myTeam all phys && candidate.damage_type!=phys` → "your team is all AD; adds magic"

Comp coherence:
- `completes_comp` — `myTeam trending X-comp && X in candidate.comp` → "completes your {X} comp"

Comfort / personalization:
- `mastery_weight` — `+ scale(candidate.masteryPoints)` → "you're comfortable on this ({pts})"
- `zero_mastery_penalty` — `candidate.masteryPoints == 0` → small negative

Scaling:
- `survive_and_scale` — `candidate.power_curve=='late' && candidate has waveclear/self_peel` → "you'll cede lane but outscale"

---

## 4. Scoring

```
score(c) = w_counter  * Σ matchup_rules(c)
         + w_teamneed * Σ team_need_rules(c)
         + w_comp     * Σ comp_rules(c)
         + w_mastery  * mastery_norm(c)
         - Σ warnings(c)
```

- Surface the **top 2-3 contributing rules** as the displayed "why."
- Weights live in config so they're tunable. **Weighting is the hard part** — when many rules
  fire, which dominates? Expect to tune this against the golden tests (§5) and stats triage.
- Emit a **confidence**: high when contributors agree and the margin over #2 is large; low when
  it's a coin flip. Say so honestly rather than faking precision.

---

## 5. Verification plan

1. **Provenance auto-fill** (§2) — `wiki`/`meraki` flags need no human verification.
2. **Stats as a triage oracle** — run the engine across all matchups, diff against empirical
   win-rate counters (counterstats / U.GG / Meraki). Review only the **disagreements**
   (rules say "hard counter," stats say "even/losing"): a bad rule, missing flag, or phase
   nuance. ~100-300 cells, not 29,000. Treat as "look here," not ground truth (stats are
   elo/role-dependent and noisy on rare pairings).
3. **Golden tests** — ~150 hand-picked uncontroversial matchups as assertions
   (`Vayne > Cho'Gath`, `Malphite > AD-crit Cait`, `Olaf > lockdown`). Run on every rule
   change; a flipped golden = instant regression signal. Stable for years because kits are.
4. **LLM as red-teamer** (not picker) — feed it the flags + rules for a champ and ask "what
   famous interaction do these miss? what flag is wrong?" Adversarial QA of the deterministic
   system.
5. **Rework detection** — diff Meraki ability data between patches; auto-flag "kit changed,
   re-review." That's the entire upkeep loop.

---

## 6. Build phases

**Status:** Phases 0, 2, 3 (prototype-level) are built and green — `scripts/ingest_flags.py`
generates `data/champion_flags.json` for all 173 champions; `scripts/counter_engine.py` runs;
`scripts/golden_test.py` is 35/35 against the full roster. Mechanical flags cover all 173, and **Phase 1 (judgment flags) is DONE — all 173 champions are
fully tagged** (`data/champion_judgment.json`, built by per-class agent batches grounded in
ability text). The verification gates earned their keep repeatedly: golden caught a missing
`Knockdown`/`Suspend` category in Phase 0; the programmatic `anti_tank` check + spot-checks
caught wrong tags across batches (Jinx/Kayle/Ahri/Syndra — *missing*-health or incidental true
damage, not tank-shred; Briar — armor-shred ≠ definition) and over-broad `projectile_block`
(single parries/spellshields ≠ windwall).

**Phase 1.5 (rule expansion) is underway.** Added rules that consume the richer flags:
`protect_carry_vs_dive` (peel via `disengage`/`team_heal_shield` when the team has a carry and the
enemy can dive), `pick_comp_vs_immobile_carry` (`pick_potential`), `disengage_vs_engage`, and
`waveclear_vs_poke_comp` — 20 rules total, 40 golden tests. The support-vs-dive scenario that used
to tie now correctly favors the peel pick. Remaining: a few more comp rules if desired, then
**Phase 4 — wire the engine into `src/champ_select.py`** (the actual app integration).

- **Phase 0 — Ingest.** *(done, prototype)* `scripts/ingest_flags.py`: Data Dragon roster +
  attack range, LoL Wiki MediaWiki category API for kit flags, `data/flag_overrides.json` for the
  map-to-intent layer, plus a judgment+roles overlay from the seed. Re-runnable per patch.
  (Meraki CDN is reachable too — useful later for richer ability-derived flags.)
- **Phase 1 — Judgment flags.** *(done — all 173)* Per role/class batch: an agent reads each
  champion's real ability text (Data Dragon) and assigns judgment flags with a per-flag
  justification, written to `data/champion_judgment.json`; then verification = a programmatic
  `anti_tank` check (flags any tag without %max/current-health or true-damage language) + a human
  spot-check of the spicy flags + the golden gate. Method note: grounding in ability text is
  necessary but **not sufficient** — agents still mislabeled missing-health damage as `anti_tank`
  and over-tagged `projectile_block`, so the verification pass stays mandatory.
- **Phase 1.5 — Rule expansion.** *(next)* Add rules that consume the flags Phase 1 unlocked:
  protect-the-carry (`disengage`/`team_heal_shield`/`self_peel` vs enemy dive/assassins), pick
  comps (`pick_potential`), poke vs dive, etc. Add golden tests alongside each new rule.
- **Phase 2 — Engine.** Rule evaluator + scoring, loaded from `counter_rules.json`. Pure,
  offline, deterministic. Unit-testable.
- **Phase 3 — Verify.** Golden tests + stats triage; tune weights.
- **Phase 4 — Integrate.** Wire into `src/champ_select.py` as a pick source. It becomes the
  smart default *and* the always-available fallback under any future AI layer. Config under
  `champ_select` (e.g. `champ_select.counter_engine.enabled`, weight overrides) in `src/config.py`.
- **Phase 5 — (optional) AI layer.** LLM produces the natural-language "why," **grounded by the
  flags** (pass it the verified attributes so it reasons over facts, not stale memory). Hard
  timeout → fall back to the engine. BYOK.
- **Phase 6 — (optional) Extensions.** Item/rune hints reuse the same flags (e.g. enemy
  `healing_dependent` count ≥ 2 → recommend Grievous), tying into the existing loadout system.

---

## 7. Integration & storage notes

- **Where the data ships:** `champion_flags.json` + `counter_rules.json` bundle with the app and
  update via the same mechanism as champion data — see `src/asset_refresh.py` (writes a Data
  Dragon override next to `config.json`; the one-file build can't write `_MEIPASS`). New champions
  surface day-one via the live-LCU merge; their flags default to empty until the next data refresh
  (engine should degrade gracefully — unknown champ = mastery-only scoring, no crash).
- **Champ-select hook:** `src/champ_select.py` already parses enemy team, your team, your cell,
  and mastery — that's the entire input the engine needs. Hover-before-lock still applies.
- **ARAM:** counters matter far less (random pool, no bans, ARAM-specific balance). Keep ARAM on
  the existing mastery/bench logic; the counter engine targets Draft/Ranked.
- **Latency:** the engine is local and instant, so unlike the AI layer it has no champ-select
  clock risk — it can run on every session update.

---

## 8. Open decisions

- **Stats oracle source** for §5.2 — which provider, and how to fetch (manual snapshot vs.
  scrape). Only needed for verification, not runtime, so a one-off snapshot per major patch is fine.
- **Weighting strategy** — fixed weights tuned by hand, or learned from the user's own outcomes
  over time (log win/loss per recommended pick → light personalization). Start fixed.
- **Flag count discipline** — every new flag is maintenance. Add one only when a rule needs it.
- **Override UX** — let users edit flags/weights? Powerful + a potential community dataset moat,
  but scope creep. Defer.
