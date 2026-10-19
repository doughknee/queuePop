// Champion page depth (DONI-507): timeline purchases and skills, objectives, synergies, counter deltas.
// Normalised rows: lol_timeline (sampled matches, written on fetch) and lol_objectives (from raw match JSON, ingested
// at the start of every aggregation pass, so matches still holding raw backfill themselves). Stats tables hold counts.
const zlib = require("zlib");
const { tx } = require("./db");
const { parseTimeline } = require("./timeline");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lol_timeline (match_id TEXT, puuid TEXT, start TEXT, early TEXT, build TEXT, skills TEXT);
CREATE INDEX IF NOT EXISTS lol_timeline_match ON lol_timeline (match_id);
CREATE TABLE IF NOT EXISTS lol_objectives (match_id TEXT, team INT, objective TEXT, state INT);
CREATE INDEX IF NOT EXISTS lol_objectives_match ON lol_objectives (match_id);
CREATE TABLE IF NOT EXISTS stats_lol_starting (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, kind TEXT, key TEXT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_build_order (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, slot INT, key TEXT, games INT, wins INT, secs INT);
CREATE TABLE IF NOT EXISTS stats_lol_skills (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, levels INT, key TEXT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_objectives (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, objective TEXT, secured INT, secured_wins INT, yielded INT, yielded_wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_synergy (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, ally INT, ally_role TEXT, games INT, wins INT);
`;
const TABLES = ["lol_starting", "lol_build_order", "lol_skills", "lol_objectives", "lol_synergy"];
const SKILL_LEVELS = [6, 10, 15];

function storeTimeline(db, id, tl) {
  const fin = Object.fromEntries(db.prepare("SELECT puuid, items FROM lol_participants WHERE match_id = ?").all(id).map((r) => [r.puuid, JSON.parse(r.items || "[]")]));
  const parsed = parseTimeline(tl, fin);
  const ins = db.prepare("INSERT INTO lol_timeline VALUES (?, ?, ?, ?, ?, ?)");
  tx(db, () => {
    db.prepare("DELETE FROM lol_timeline WHERE match_id = ?").run(id);
    for (const [puuid, x] of Object.entries(parsed)) ins.run(id, puuid, x.start, JSON.stringify(x.early), JSON.stringify(x.build), x.skills);
  });
}

// Per team: 1 secured (took it first), -1 yielded (the enemy did), 0 neither. Soul = 4+ dragons (ponytail: elder
// kills count toward the 4; match-v5 has no soul flag).
const OBJECTIVES = { champion: "first_blood", tower: "first_tower", dragon: "first_dragon", horde: "grubs", riftHerald: "herald", baron: "baron", inhibitor: "first_inhibitor", atakhan: "atakhan" };
function objectiveRows(info) {
  const [a, b] = info.teams || [];
  if (!a || !b) return [];
  const rows = [];
  for (const [k, name] of Object.entries(OBJECTIVES)) {
    if (!a.objectives?.[k] || !b.objectives?.[k]) continue;
    const s = a.objectives[k].first ? 1 : b.objectives[k].first ? -1 : 0;
    rows.push([a.teamId, name, s], [b.teamId, name, -s]);
  }
  const da = a.objectives?.dragon?.kills ?? 0, db_ = b.objectives?.dragon?.kills ?? 0;
  const soul = da >= 4 ? 1 : db_ >= 4 ? -1 : 0;
  rows.push([a.teamId, "soul", soul], [b.teamId, "soul", -soul]);
  return rows;
}

function ingestObjectives(db) {
  const todo = db.prepare(`SELECT id, raw FROM matches m WHERE game = 'lol' AND status = 'done' AND raw IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM lol_objectives o WHERE o.match_id = m.id)`).all();
  const ins = db.prepare("INSERT INTO lol_objectives VALUES (?, ?, ?, ?)");
  tx(db, () => { for (const r of todo) for (const x of objectiveRows(JSON.parse(zlib.gunzipSync(r.raw)).info)) ins.run(r.id, ...x); });
  return todo.length;
}

// INSERT ... SELECT per patch; M joins matches on the patch placeholder, K is "m.patch, m.region, m.bracket" (jobs.aggregate).
function inserts(M, K) {
  const T = `FROM lol_timeline t JOIN lol_participants p ON p.match_id = t.match_id AND p.puuid = t.puuid ${M}`;
  return [
    `INSERT INTO stats_lol_starting SELECT ${K}, p.role, p.champion, 'start', t.start, count(*), sum(p.win) ${T} GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_starting SELECT ${K}, p.role, p.champion, 'early', j.value, count(*), sum(p.win) ${T}, json_each(t.early) j GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_build_order SELECT ${K}, p.role, p.champion, j.key + 1, json_extract(j.value, '$[0]'), count(*), sum(p.win), sum(json_extract(j.value, '$[1]'))
      ${T}, json_each(t.build) j WHERE j.key < 6 GROUP BY 1, 2, 3, 4, 5, 6, 7`,
    // slot 0 = core: the first three build items as one ordered key, timed at the third
    `INSERT INTO stats_lol_build_order SELECT ${K}, p.role, p.champion, 0, json_extract(t.build, '$[0][0]') || ',' || json_extract(t.build, '$[1][0]') || ',' || json_extract(t.build, '$[2][0]'),
      count(*), sum(p.win), sum(json_extract(t.build, '$[2][1]')) ${T} WHERE json_array_length(t.build) >= 3 GROUP BY 1, 2, 3, 4, 5, 7`,
    ...SKILL_LEVELS.map((n) => `INSERT INTO stats_lol_skills SELECT ${K}, p.role, p.champion, ${n}, substr(t.skills, 1, ${n}), count(*), sum(p.win) ${T} WHERE length(t.skills) >= ${n} GROUP BY 1, 2, 3, 4, 5, 7`),
    `INSERT INTO stats_lol_objectives SELECT ${K}, p.role, p.champion, o.objective, sum(o.state = 1), sum(o.state = 1 AND p.win), sum(o.state = -1), sum(o.state = -1 AND p.win)
      FROM lol_participants p JOIN lol_objectives o ON o.match_id = p.match_id AND o.team = p.team ${M} GROUP BY 1, 2, 3, 4, 5, 6`,
    // side as a pseudo-objective: secured = blue games, yielded = red games
    `INSERT INTO stats_lol_objectives SELECT ${K}, p.role, p.champion, 'side', sum(p.team = 100), sum(p.team = 100 AND p.win), sum(p.team = 200), sum(p.team = 200 AND p.win)
      FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_lol_synergy SELECT ${K}, p.role, p.champion, x.champion, x.role, count(*), sum(p.win) FROM lol_participants p
      JOIN lol_participants x ON x.match_id = p.match_id AND x.team = p.team AND x.puuid <> p.puuid ${M} WHERE p.role <> '' GROUP BY 1, 2, 3, 4, 5, 6, 7`,
  ];
}

const r4 = (x) => Math.round(x * 10000) / 10000;

// Extra /lol/champion/{id} fields. w/a: the patch/region/bracket filter; s: the strip row of this champion+role;
// matchups get delta1 (win rate vs them minus our average) and delta2 (minus the expected our avg - their avg + 50%).
function depth(db, w, a, { champion, role, s, minGames, matchups }) {
  const rate = (r, n) => ({ games: r.games, winRate: r4(r.wins / r.games), pickRate: n ? r4(r.games / n) : 0, lowSample: r.games < minGames });
  const q = (table, cols, extra = "", order = "games DESC") => db.prepare(`SELECT ${cols}, sum(games) games, sum(wins) wins FROM ${table}
    WHERE ${w} AND champion = ? AND role = ?${extra} GROUP BY ${cols} ORDER BY ${order}`).all(...a, champion, role);

  const start = q("stats_lol_starting", "kind, key");
  const timelineGames = start.filter((r) => r.kind === "start").reduce((n, r) => n + r.games, 0);
  const starting = start.filter((r) => r.kind === "start").slice(0, 10).map((r) => ({ key: r.key, ...rate(r, timelineGames) }));
  const early = start.filter((r) => r.kind === "early").slice(0, 12).map((r) => ({ key: r.key, ...rate(r, timelineGames) }));

  const bo = db.prepare(`SELECT slot, key, sum(games) games, sum(wins) wins, sum(secs) secs FROM stats_lol_build_order WHERE ${w} AND champion = ? AND role = ?
    GROUP BY slot, key ORDER BY games DESC`).all(...a, champion, role);
  const slotTotal = {};
  for (const r of bo) slotTotal[r.slot] = (slotTotal[r.slot] || 0) + r.games;
  const opt = (r) => ({ key: String(r.key), ...rate(r, slotTotal[r.slot]), avgMinute: Math.round(r.secs / r.games / 6) / 10 });
  const buildOrder = { core: bo.filter((r) => r.slot === 0).slice(0, 8).map(opt), slots: [1, 2, 3, 4, 5, 6].map((n) => bo.filter((r) => r.slot === n).slice(0, 6).map(opt)) };

  const sk = q("stats_lol_skills", "levels, key");
  const skills = Object.fromEntries(SKILL_LEVELS.map((n) => {
    const rows = sk.filter((r) => r.levels === n), tot = rows.reduce((x, r) => x + r.games, 0);
    return [n, rows.slice(0, 8).map((r) => ({ key: r.key, ...rate(r, tot) }))];
  }));

  const ob = db.prepare(`SELECT objective, sum(secured) secured, sum(secured_wins) sw, sum(yielded) yielded, sum(yielded_wins) yw FROM stats_lol_objectives
    WHERE ${w} AND champion = ? AND role = ? GROUP BY objective`).all(...a, champion, role);
  const side = ob.find((r) => r.objective === "side");
  const sides = side ? { blue: { games: side.secured, winRate: side.secured ? r4(side.sw / side.secured) : 0 }, red: { games: side.yielded, winRate: side.yielded ? r4(side.yw / side.yielded) : 0 } } : null;
  const objectives = ob.filter((r) => r.objective !== "side").map((r) => ({
    objective: r.objective, games: r.secured + r.yielded,
    secured: r.secured, securedRate: s.games ? r4(r.secured / s.games) : 0, securedWinRate: r.secured ? r4(r.sw / r.secured) : null,
    yielded: r.yielded, yieldedRate: s.games ? r4(r.yielded / s.games) : 0, yieldedWinRate: r.yielded ? r4(r.yw / r.yielded) : null,
    lowSample: r.secured + r.yielded < minGames,
  }));

  // Every champion's average win rate per role, for the deltas.
  const avg = new Map(db.prepare(`SELECT champion, role, sum(games) g, sum(wins) w FROM stats_lol_champ WHERE ${w} GROUP BY champion, role`).all(...a).map((r) => [`${r.champion}|${r.role}`, r.w / r.g]));
  const own = s.games ? s.wins / s.games : 0;
  const deltas = (wr, other) => ({ delta1: r4(wr - own), delta2: other == null ? null : r4(wr - (own - other + 0.5)) });
  for (const m of matchups) Object.assign(m, { pickRate: s.games ? r4(m.games / s.games) : 0 }, deltas(m.winRate, avg.get(`${m.opponent}|${role}`)));
  const synergies = db.prepare(`SELECT ally, ally_role, sum(games) games, sum(wins) wins FROM stats_lol_synergy WHERE ${w} AND champion = ? AND role = ?
    GROUP BY ally, ally_role ORDER BY games DESC LIMIT 60`).all(...a, champion, role).map((r) => {
    const wr = r.wins / r.games, al = avg.get(`${r.ally}|${r.ally_role}`);
    // synergy delta2: our win rate together minus the expected our avg + their avg - 50%
    return { ally: r.ally, role: r.ally_role, ...rate(r, s.games), delta1: r4(wr - own), delta2: al == null ? null : r4(wr - (own + al - 0.5)) };
  });

  return { timelineGames, starting, early, buildOrder, skills, objectives, sides, synergies };
}

module.exports = { SCHEMA, TABLES, storeTimeline, objectiveRows, ingestObjectives, inserts, depth };
