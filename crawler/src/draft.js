// Draft advice (overnight D8, for track Q's champ select): GET /lol/draft ranks candidates for a role given what is known of the
// draft; GET /lol/plan/{champion} gathers the game-plan facts. stats_lol_vs (champion+role vs every enemy champion, any role)
// complements stats_lol_matchup (lane opponent only).
//
// Score, in win-rate points (0.01 = one point of win rate), every term shrunk toward 0 by its sample: x * n / (n + K):
//   base    = candidate's role win rate - 0.5                                   (K = 200 games)
//   lane    = matchup delta2 vs the enemy in our role (DONI-507 definition)      (K = 100, weight 1)
//   enemies = mean over the other enemies of (win rate vs them - own win rate)  (K = 100, weight 0.5)
//   allies  = mean over the allies of synergy delta2                           (K = 100, weight 0.5)
// The lane enemy is the one given as id:ROLE with our role, else the enemy whose most-played role is ours. Banned and already
// picked champions are not candidates. Candidates need MIN_GAMES games in the role, unless ?pool lists them (then any sample).
const r4 = (x) => Math.round(x * 10000) / 10000;
const SCHEMA = "CREATE TABLE IF NOT EXISTS stats_lol_vs (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, opponent INT, games INT, wins INT);";
const TABLES = ["lol_vs"];
const MIN_GAMES = 50;
const ROLES = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
const shrink = (x, n, k) => (x == null || !n ? 0 : x * n / (n + k));

const inserts = (M, K) => [
  `INSERT INTO stats_lol_vs SELECT ${K}, p.role, p.champion, x.champion, count(*), sum(p.win) FROM lol_participants p
    JOIN lol_participants x ON x.match_id = p.match_id AND x.team <> p.team ${M} WHERE p.role <> '' GROUP BY 1, 2, 3, 4, 5, 6`,
];

// "1,2:TOP, 3" -> [{ id: 1, role: null }, { id: 2, role: "TOP" }, { id: 3, role: null }]
const ids = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
  const [id, role, extra] = x.split(":");
  if (!/^\d+$/.test(id) || extra !== undefined || (role && !ROLES.includes(role.toUpperCase()))) throw Object.assign(new Error(`bad champion id ${x} (id or id:TOP|JUNGLE|MIDDLE|BOTTOM|UTILITY)`), { status: 400 });
  return { id: Number(id), role: role ? role.toUpperCase() : null };
});

function draft(db, head, where, q = {}) {
  const role = String(q.role || "").toUpperCase();
  if (!ROLES.includes(role)) throw Object.assign(new Error("role must be TOP, JUNGLE, MIDDLE, BOTTOM or UTILITY"), { status: 400 });
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const allies = ids(q.allies), enemies = ids(q.enemies), bans = ids(q.bans);
  const taken = new Set([...allies, ...enemies, ...bans].map((x) => x.id));
  const pool = q.pool ? new Set(ids(q.pool).map((x) => x.id)) : null; // optional: only these champions (the player's pool)

  const champ = db.prepare(`SELECT champion, role, sum(games) g, sum(wins) w FROM stats_lol_champ WHERE ${w} GROUP BY champion, role`).all(...a);
  const avg = new Map(champ.map((r) => [`${r.champion}|${r.role}`, r.w / r.g]));
  const mainRole = new Map();
  for (const r of champ) if (!mainRole.has(r.champion) || r.g > mainRole.get(r.champion).g) mainRole.set(r.champion, r);
  const lane = enemies.find((e) => e.role === role) || enemies.find((e) => !e.role && mainRole.get(e.id)?.role === role) || null;
  const others = enemies.filter((e) => e !== lane);

  // one query per signal, for every candidate at once
  const IN = (xs) => xs.length ? `(${xs.map(() => "?").join(",")})` : "(NULL)";
  const byKey = (rows, k) => { const m = new Map(); for (const r of rows) m.set(`${r.champion}|${r[k]}`, r); return m; };
  const laneRows = lane ? byKey(db.prepare(`SELECT champion, opponent, sum(games) g, sum(wins) w FROM stats_lol_matchup WHERE ${w} AND role = ? AND opponent = ? GROUP BY champion`).all(...a, role, lane.id), "opponent") : new Map();
  const vsRows = byKey(db.prepare(`SELECT champion, opponent, sum(games) g, sum(wins) w FROM stats_lol_vs WHERE ${w} AND role = ? AND opponent IN ${IN(others.map((e) => e.id))} GROUP BY champion, opponent`).all(...a, role, ...others.map((e) => e.id)), "opponent");
  const synRows = byKey(db.prepare(`SELECT champion, ally, sum(games) g, sum(wins) w FROM stats_lol_synergy WHERE ${w} AND role = ? AND ally IN ${IN(allies.map((x) => x.id))} GROUP BY champion, ally`).all(...a, role, ...allies.map((x) => x.id)), "ally");
  const allyRole = (x) => x.role || mainRole.get(x.id)?.role;

  const candidates = champ.filter((r) => r.role === role && (pool ? pool.has(r.champion) : r.g >= MIN_GAMES) && !taken.has(r.champion)).map((r) => {
    const own = r.w / r.g;
    const base = { value: r4(own - 0.5), games: r.g, score: shrink(own - 0.5, r.g, 200) };
    let laneC = null;
    if (lane) {
      const m = laneRows.get(`${r.champion}|${lane.id}`), other = avg.get(`${lane.id}|${role}`);
      const d = m && other != null ? m.w / m.g - (own - other + 0.5) : null;
      laneC = { champion: lane.id, value: d == null ? null : r4(d), games: m ? m.g : 0, score: shrink(d, m?.g, 100) };
    }
    const vs = others.map((e) => { const m = vsRows.get(`${r.champion}|${e.id}`); const d = m ? m.w / m.g - own : null; return { champion: e.id, value: d == null ? null : r4(d), games: m ? m.g : 0, score: shrink(d, m?.g, 100) }; });
    const syn = allies.map((x) => {
      const m = synRows.get(`${r.champion}|${x.id}`), al = avg.get(`${x.id}|${allyRole(x)}`);
      const d = m && al != null ? m.w / m.g - (own + al - 0.5) : null;
      return { champion: x.id, value: d == null ? null : r4(d), games: m ? m.g : 0, score: shrink(d, m?.g, 100) };
    });
    const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x.score, 0) / xs.length : 0);
    const score = base.score + (laneC ? laneC.score : 0) + 0.5 * mean(vs) + 0.5 * mean(syn);
    const strip = (c) => c && (({ score: _, ...rest }) => rest)(c);
    return { champion: r.champion, score: r4(score), games: r.g, winRate: r4(own), lowSample: r.g < h.minGames,
      components: { base: strip(base), lane: strip(laneC), enemies: vs.map(strip), allies: syn.map(strip) } };
  }).sort((x, y) => y.score - x.score);
  return { ...h, role, lane: lane ? lane.id : null, allies: allies.map((x) => x.id), enemies: enemies.map((x) => x.id), bans: bans.map((x) => x.id),
    candidates: candidates.slice(0, Math.max(1, Math.min(100, Math.trunc(Number(q.limit)) || 30))) };
}

// Game plan for a locked champion: the facts the champion page already computes, narrowed to what matters in this draft.
function plan(champion, page, db, w, a, enemies) {
  const role = page.role;
  const en = ids(enemies);
  const own = page.strip.games ? page.strip.wins / page.strip.games : 0;
  const vs = en.length ? db.prepare(`SELECT opponent, sum(games) g, sum(wins) w FROM stats_lol_vs WHERE ${w} AND champion = ? AND role = ? AND opponent IN (${en.map(() => "?").join(",")}) GROUP BY opponent`)
    .all(...a, champion, role ?? "", ...en.map((e) => e.id)) : [];
  // worst first by the sample-shrunk delta (n/(n+100), as in /lol/draft), so 2 games at 0% don't outrank 3,000 at 44%
  const threats = vs.map((r) => ({ champion: r.opponent, games: r.g, winRate: r4(r.w / r.g), delta: r4(r.w / r.g - own), s: shrink(r.w / r.g - own, r.g, 100) }))
    .sort((x, y) => x.s - y.s).slice(0, 2).map(({ s: _, ...t }) => t);
  const first = (l) => (l && l[0]) || null;
  return { patch: page.patch, region: page.region, bracket: page.bracket, champion, role, games: page.strip.games, winRate: page.strip.winRate,
    core: first(page.buildOrder?.core), starting: first(page.starting), skillOrder: first(page.builds.skills), skills15: first(page.skills?.[15]),
    keystone: first(page.builds.keystone), spells: first(page.builds.spells), shards: first(page.shards),
    threats, objectives: page.objectives || [], sides: page.sides || null };
}

module.exports = { SCHEMA, TABLES, inserts, draft, plan, ids, MIN_GAMES };
