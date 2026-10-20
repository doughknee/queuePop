// Port of the live-suggestion path of src/counter_engine.py and of src/setup_suggest.py.
// Reads the same data/*.json. Ported: evaluate_scenario (scores only), suggest_bans, confidence,
// live_suggestions, infer_role, derive_role_picks. Skipped: draft analysis and the CLI printer (Python-only tools).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA = path.join(__dirname, "..", "data");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8"));

const MASTERY_FULL_AT = 100000;
const MASTERY_WEIGHT = 12.0;
const VIABILITY_BASE = 6.0;
const SCALE_TARGET = 3;
const SCALE_FLOOR = 0.30;
const DECAY = [1.0, 0.3, 0.12, 0.05, 0.02];
const TIE_EPS = 1.5;

const CHAMPS = readJson(fs.existsSync(path.join(DATA, "champion_flags.json")) ? "champion_flags.json" : "champion_flags.seed.json");
const RULES = readJson("counter_rules.seed.json").rules;

// Python round(): half-to-even.
function pyRound(x, nd = 0) {
  const m = 10 ** nd, y = x * m, f = Math.floor(y);
  const r = y - f === 0.5 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
  return r / m;
}

const decayed = (ws) => ws.reduce((s, w, i) => s + w * (i < DECAY.length ? DECAY[i] : DECAY[DECAY.length - 1] * 0.6), 0);
const flagsOf = (name) => new Set((CHAMPS[name] && CHAMPS[name].flags) || []);
const asList = (c) => (Array.isArray(c) ? c : [c]);

function champMatchesCountSpec(cf, spec) {
  if ("any_of" in spec) return spec.any_of.some((s) => champMatchesCountSpec(cf, s));
  let checked = false;
  if ("flag" in spec) { checked = true; if (!cf.has(spec.flag)) return false; }
  if ("flags" in spec) { checked = true; if (!spec.flags.every((f) => cf.has(f))) return false; }
  if ("any_flags" in spec) { checked = true; if (!spec.any_flags.some((f) => cf.has(f))) return false; }
  return checked;
}

function teamCountOk(names, spec) {
  const n = names.filter((nm) => champMatchesCountSpec(flagsOf(nm), spec)).length;
  return (!("min" in spec) || n >= spec.min) && (!("max" in spec) || n <= spec.max);
}
const teamConditionsOk = (names, conds) => conds == null || asList(conds).every((c) => teamCountOk(names, c));

function subjectMatches(sf, spec) {
  if (!spec || !Object.keys(spec).length) return true;
  if (spec.all && !spec.all.every((f) => sf.has(f))) return false;
  if (spec.any && !spec.any.some((f) => sf.has(f))) return false;
  if (spec.none && spec.none.some((f) => sf.has(f))) return false;
  return true;
}

function renderReason(template, enemyNames, myNames) {
  return template.replace(/\{(enemy|team)_with(_all|_any)?:([a-z_,]+)\}/g, (_m, side, mode, csv) => {
    const names = side === "enemy" ? enemyNames : myNames;
    const flags = csv.split(",");
    const pred = mode === "_all" ? (f) => flags.every((x) => f.has(x)) : mode === "_any" ? (f) => flags.some((x) => f.has(x)) : (f) => f.has(flags[0]);
    const hits = names.filter((nm) => pred(flagsOf(nm)));
    return hits.length ? hits.join(", ") : "them";
  });
}

function ruleContextOk(rule, laneOpp, enemyNames, myNames, lanePartner) {
  if ("lane_opponent" in rule && !subjectMatches(laneOpp ? flagsOf(laneOpp) : new Set(), rule.lane_opponent)) return false;
  if ("lane_partner" in rule && (!lanePartner || !subjectMatches(flagsOf(lanePartner), rule.lane_partner))) return false;
  if ("enemy_team" in rule && !teamConditionsOk(enemyNames, rule.enemy_team)) return false;
  if ("my_team" in rule && !teamConditionsOk(myNames, rule.my_team)) return false;
  return true;
}

function scaledBaseWeight(rule, enemyNames) {
  const w = rule.weight;
  if (w <= 0 || rule.no_scale) return w;
  if (rule.enemy_team == null) return w;
  const specs = asList(rule.enemy_team);
  const cnt = enemyNames.filter((nm) => specs.every((s) => champMatchesCountSpec(flagsOf(nm), s))).length;
  return w * Math.max(SCALE_FLOOR, Math.min(1.0, cnt / (rule.scale_at ?? SCALE_TARGET)));
}

function absenceKnowledgeScale(rule, myNames, enemyNames) {
  let factor = 1.0;
  for (const [key, names, size] of [["my_team", myNames, 4], ["enemy_team", enemyNames, 5]]) {
    if (rule[key] == null) continue;
    const specs = asList(rule[key]);
    if (specs.length && specs.every((s) => "max" in s && !("min" in s))) factor *= Math.min(1.0, names.length / size);
  }
  return factor;
}

function evaluateRule(rule, cand, laneOpp, enemyNames, myNames, lanePartner) {
  if (!(subjectMatches(flagsOf(cand), rule.candidate) && ruleContextOk(rule, laneOpp, enemyNames, myNames, lanePartner))) return null;
  const cf = flagsOf(cand);
  let weight = scaledBaseWeight(rule, enemyNames);
  if (weight > 0) weight *= absenceKnowledgeScale(rule, myNames, enemyNames);
  const boost = rule.boost || [];
  if (weight > 0 && boost.length) weight += Math.min(boost.filter((f) => cf.has(f)).length, 3);
  weight = pyRound(weight);
  if (weight === 0 && (rule.weight || 0) > 0) return null;
  const hit = { id: rule.id, weight, scope: rule.scope, reason: renderReason(rule.reason, enemyNames, myNames) };
  const notes = (CHAMPS[cand] && CHAMPS[cand].notes) || {};
  const c = rule.candidate || {};
  for (const k of [...(c.all || []), ...(c.any || [])]) {
    if (cf.has(k) && k in notes) { hit.detail = notes[k]; break; }
  }
  return hit;
}

function masteryTerm(points) {
  if (points <= 0) return [0.0, "no mastery on this champ"];
  return [Math.min(points / MASTERY_FULL_AT, 1.0) * MASTERY_WEIGHT, `comfort: ${points.toLocaleString("en-US")} mastery`];
}

// Scores only: the fit/gaps/breakdown fields of the Python result feed the Draft Sim, not the live view.
function evaluateScenario(scn) {
  const myNames = scn.my_team;
  const enemyNames = scn.enemy_team.map((e) => e.champ);
  const opp = scn.enemy_team.find((e) => e.role === scn.my_role);
  const laneOpp = opp ? opp.champ : null;
  const partnerRole = { bottom: "utility", utility: "bottom" }[scn.my_role];
  const lanePartner = partnerRole ? (scn.ally_roles || {})[partnerRole] : null;
  const taken = new Set([...myNames, ...enemyNames]);
  let results = scn.pool.filter((p) => !taken.has(p.champ)).map((entry) => {
    const pts = entry.mastery || 0;
    const fired = RULES.map((r) => evaluateRule(r, entry.champ, laneOpp, enemyNames, myNames, lanePartner)).filter(Boolean);
    const [ms, mlabel] = masteryTerm(pts);
    fired.sort((a, b) => b.weight - a.weight);
    const pos = fired.filter((h) => h.weight > 0).map((h) => h.weight);
    const neg = fired.filter((h) => h.weight < 0).reduce((s, h) => s + h.weight, 0);
    return { champ: entry.champ, score: VIABILITY_BASE + decayed(pos) + neg + ms, fired, mastery_label: mlabel };
  });
  const draftKey = scn.my_role + "|" + [...enemyNames].sort().join(",") + "|" + [...myNames].sort().join(",");
  results.sort((a, b) => b.score - a.score);
  // Leader-anchored near-tie groups, each reordered by a draft-seeded crc32 (deterministic per draft).
  const out = [];
  for (let i = 0; i < results.length;) {
    let j = i;
    while (j < results.length && results[i].score - results[j].score <= TIE_EPS) j++;
    const key = (r) => zlib.crc32(draftKey + r.champ);
    out.push(...results.slice(i, j).sort((a, b) => key(a) - key(b)));
    i = j;
  }
  return out;
}

function suggestBans(myRole, pool, topK = 5) {
  const poolNames = new Set(pool.map((p) => p.champ));
  const rows = [];
  for (const [opp, e] of Object.entries(CHAMPS)) {
    if (opp.startsWith("_") || !e || typeof e !== "object" || Array.isArray(e)) continue;
    if (!(e.roles || []).includes(myRole) || poolNames.has(opp)) continue;
    const results = evaluateScenario({ my_role: myRole, my_team: [], enemy_team: [{ champ: opp, role: myRole }], pool });
    const best = results.slice(0, 3);
    const warn = new Map();
    for (const r of results) for (const f of r.fired) if (f.weight < 0) warn.set(f.reason, (warn.get(f.reason) || 0) + 1);
    let threat = null, top = 0;
    for (const [reason, n] of warn) if (n > top) { top = n; threat = reason; }
    rows.push({ champ: opp, answer_strength: pyRound(best.reduce((s, r) => s + r.score, 0) / best.length, 1),
      best_answer: results[0].champ, threat_note: threat });
  }
  rows.sort((a, b) => a.answer_strength - b.answer_strength);
  return rows.slice(0, topK);
}

function confidence(results) {
  if (!results.length || results[0].score <= 0) return "LOW";
  const hasPositive = results[0].fired.some((f) => f.scope !== "warning" && f.weight > 0);
  const top = results[0].score;
  const margin = top - (results.length > 1 ? results[1].score : 0);
  const ratio = top > 0 ? margin / top : 0;
  if (hasPositive && (margin >= 8 || ratio >= 0.20)) return "HIGH";
  if (margin >= 3 || ratio >= 0.09) return "MEDIUM";
  return "LOW";
}

function inferRole(name, championRoles) {
  let best = null;
  for (const [role, names] of Object.entries(championRoles)) {
    const i = names.indexOf(name);
    if (i >= 0 && (best === null || i < best[1])) best = [role, i];
  }
  return best ? best[0] : null;
}

// ponytail: unbounded-ish cache cleared at 32 entries, like the Python lru_cache(maxsize=32).
const bansCache = new Map();
function bansCached(role, pool) {
  const key = role + JSON.stringify(pool.map((p) => [p.champ, p.mastery || 0]));
  if (!bansCache.has(key)) {
    if (bansCache.size >= 32) bansCache.clear();
    bansCache.set(key, suggestBans(role, pool.map((p) => ({ champ: p.champ, mastery: p.mastery || 0 })), 10));
  }
  return bansCache.get(key);
}

function liveSuggestions(scn, topK = 3, taken = []) {
  if (!scn.enemy_team.length) {
    const skip = new Set([...taken, ...scn.my_team]);
    const bans = bansCached(scn.my_role, scn.pool).filter((b) => !skip.has(b.champ));
    return { phase: "bans", picks: [], bans: bans.slice(0, topK).map((b) => ({ champ: b.champ, reason: b.threat_note || `your best answer is only ${b.best_answer}` })) };
  }
  const results = evaluateScenario(scn);
  const label = confidence(results);
  return { phase: "picks", bans: [], picks: results.slice(0, topK).map((r) => ({
    champ: r.champ, score: pyRound(r.score, 1), confidence: label,
    reasons: [...r.fired.map((f) => f.reason), r.mastery_label, "no strong matchup edge either way"].slice(0, 2),
  })) };
}

// --- setup_suggest ---
const SETUP_ROLES = ["top", "jungle", "middle", "bottom", "utility"];
const LANES = { TOP: "top", JUNGLE: "jungle", MIDDLE: "middle", MID: "middle" };

function matchPosition(mapId, lane, role) {
  if (mapId !== 11) return null;
  lane = String(lane || "").toUpperCase();
  if (lane === "BOTTOM" || lane === "BOT") return String(role || "").toUpperCase() === "DUO_SUPPORT" ? "utility" : "bottom";
  return LANES[lane] || null;
}

let championRoles = null;
function loadChampionRoles() {
  if (!championRoles) {
    try { championRoles = Object.fromEntries(Object.entries(readJson("champion_roles.json")).filter(([r]) => SETUP_ROLES.includes(r))); } catch { championRoles = {}; }
  }
  return championRoles;
}

function deriveRolePicks(mastery, matches, champRoles) {
  const games = new Map(); // "role|name" -> recent games there
  for (const m of matches) if (m.name && SETUP_ROLES.includes(m.position)) games.set(m.position + "|" + m.name, (games.get(m.position + "|" + m.name) || 0) + 1);
  const points = new Map(mastery.filter((m) => m.name).map((m) => [m.name, m.points || 0]));
  const played = new Set([...games.keys()].map((k) => k.slice(k.indexOf("|") + 1)));
  const out = {};
  for (const role of SETUP_ROLES) {
    const listed = new Set(champRoles[role] || []);
    const cands = new Set([...games.keys()].filter((k) => k.startsWith(role + "|")).map((k) => k.slice(role.length + 1)));
    for (const n of points.keys()) if (!played.has(n) && listed.has(n)) cands.add(n);
    const g = (n) => games.get(role + "|" + n) || 0, p = (n) => points.get(n) || 0;
    out[role] = [...cands].sort((a, b) => g(b) - g(a) || p(b) - p(a) || (a < b ? -1 : a > b ? 1 : 0)).slice(0, 5);
  }
  return out;
}

module.exports = { flagsOf, liveSuggestions, inferRole, matchPosition, loadChampionRoles, deriveRolePicks, SETUP_ROLES, pyRound };
