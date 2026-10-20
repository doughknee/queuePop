// DONI-506: per-player champion stats (Lolalytics' "best worldwide on champion") and the extra /lol/tiers columns.
// Plugged in with one line each: db.js open() -> migrate, jobs.js store() -> storeNames, jobs.js aggregate() -> aggregatePatch,
// server.js routes -> tiersPlus / championPlayers. Riot ids live per puuid in lol_names (newest name wins), not per
// participant row, so lol_participants' positional INSERT stays as it is.
const zlib = require("zlib");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS lol_names (puuid TEXT PRIMARY KEY, riot_id TEXT, region TEXT);
CREATE TABLE IF NOT EXISTS stats_lol_player_champ (patch TEXT, region TEXT, bracket TEXT, puuid TEXT, role TEXT, champion INT,
  games INT, wins INT, division TEXT, lp INT, rank_n REAL);
CREATE INDEX IF NOT EXISTS stats_lol_player_champ_champ ON stats_lol_player_champ (patch, champion);
`;
const BEST_MIN = 20; // a "best" player has at least this many games on the champion in the window (one patch)
const KEEP_MIN = 3; // ponytail: rows under 3 games are not stored (they can never reach BEST_MIN alone); lower it if a role split ever matters
const r4 = (x) => Math.round(x * 10000) / 10000;

function migrate(db) {
  db.exec(SCHEMA);
  // DONI-508/512: ladder wins/losses for the leaderboards
  const cols = db.prepare("PRAGMA table_info(players)").all().map((c) => c.name);
  for (const c of ["wins", "losses", "aram_at"]) if (!cols.includes(c)) db.exec(`ALTER TABLE players ADD COLUMN ${c} INT`); // aram_at: D13
  db.exec("CREATE INDEX IF NOT EXISTS players_aram ON players (game, region, aram_at, tier_n DESC)");
}

const riotId = (p) => p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline || ""}` : null;
function storeNames(db, region, participants) {
  const up = db.prepare("INSERT INTO lol_names VALUES (?, ?, ?) ON CONFLICT (puuid) DO UPDATE SET riot_id = excluded.riot_id, region = excluded.region");
  for (const p of participants) if (p.puuid && riotId(p)) up.run(p.puuid, riotId(p), region);
}

// bracket = the player's own seeded tier (players table, refreshed by the daily ladder walk), so server.js where()'s
// bracket filter means "players at or above". rank_n = tier index + division (IV 0, III .25, II .5, I .75).
// ponytail: tier/LP are the player's latest seeded rank, not the rank at each game; fine within one patch.
function aggregatePatch(db, patch) {
  db.prepare("DELETE FROM stats_lol_player_champ WHERE patch = ?").run(patch);
  db.prepare(`INSERT INTO stats_lol_player_champ
    SELECT m.patch, m.region, pl.tier, p.puuid, p.role, p.champion, count(*), sum(p.win), pl.division, pl.lp,
      pl.tier_n + CASE WHEN pl.tier_n >= 7 THEN 0 ELSE CASE pl.division WHEN 'I' THEN .75 WHEN 'II' THEN .5 WHEN 'III' THEN .25 ELSE 0 END END
    FROM lol_participants p JOIN matches m ON m.id = p.match_id AND m.patch = ? LEFT JOIN players pl ON pl.puuid = p.puuid AND pl.game = 'lol'
    GROUP BY m.region, p.puuid, p.role, p.champion HAVING count(*) >= ${KEEP_MIN}`).run(patch);
}

// Riot ids from the stored raw JSON, League and TFT (only the raw retention window still has it). Run `aggregate` after.
function backfillPlayers(db) {
  const rows = db.prepare("SELECT region, raw FROM matches WHERE status = 'done' AND raw IS NOT NULL").all(); // both games (TFT names since DONI-512)
  db.exec("BEGIN");
  try { for (const r of rows) storeNames(db, r.region, JSON.parse(zlib.gunzipSync(r.raw)).info.participants); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; }
  return { matches: rows.length, names: db.prepare("SELECT count(*) n FROM lol_names").get().n };
}

// Per-player rows for one champion under the filter, summed over roles (or one role) and regions (an account lives on one
// platform, so max(region) only matters in hand-built tests).
function players(db, w, a, champion, role) {
  return db.prepare(`SELECT s.puuid, max(n.riot_id) riotId, max(s.region) region, max(s.bracket) tier, max(s.division) division, max(s.lp) lp,
    max(s.rank_n) rank_n, sum(s.games) games, sum(s.wins) wins FROM stats_lol_player_champ s LEFT JOIN lol_names n ON n.puuid = s.puuid
    WHERE ${w.replace(/\b(patch|region|bracket)\b/g, "s.$1")} AND s.champion = ?${role ? " AND s.role = ?" : ""}
    GROUP BY s.puuid HAVING sum(s.games) >= ${BEST_MIN}`).all(...a, champion, ...(role ? [role] : []));
}
const best = (ps, wr) => {
  if (!ps.length) return null;
  const games = ps.reduce((s, p) => s + p.games, 0), winRate = r4(ps.reduce((s, p) => s + p.wins, 0) / games);
  const ranked = ps.filter((p) => p.rank_n != null);
  return { players: ps.length, games, winRate, delta: r4(winRate - wr), avgTier: ranked.length ? Math.round(ranked.reduce((s, p) => s + p.rank_n, 0) / ranked.length * 100) / 100 : null };
};

// /lol/tiers plus, per champion-role row: laneShare (row games / the champion's games in all roles), delta (winRate minus
// the filter's average win rate over every row), pbi (pick-ban influence: delta in points x banRate / (1 - pickRate)),
// best (players with >= BEST_MIN games on the champion, any role: their pooled win rate, games, delta vs the row's win
// rate, avg rank_n). Plus regions[] (the crawled regions, for the app's filter).
function tiersPlus(db, base, where, q = {}) {
  const [w, a] = where(q, base.patch);
  const C = require("./agg-window").src(q, "lol_champ"); // ?days: lane share and the average follow the window
  const all = db.prepare(`SELECT champion, sum(games) g, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d} GROUP BY champion`).all(...a, ...C.da);
  const total = new Map(all.map((r) => [r.champion, r.g]));
  const games = all.reduce((s, r) => s + r.g, 0), avg = games ? all.reduce((s, r) => s + r.wins, 0) / games : 0.5;
  const pool = new Map();
  for (const p of db.prepare(`SELECT champion, puuid, sum(games) games, sum(wins) wins, max(rank_n) rank_n FROM stats_lol_player_champ WHERE ${w}
    GROUP BY champion, puuid HAVING sum(games) >= ${BEST_MIN}`).all(...a)) (pool.get(p.champion) || pool.set(p.champion, []).get(p.champion)).push(p);
  return { ...base, avgWinRate: r4(avg), regions: db.prepare("SELECT DISTINCT region FROM stats_lol_matches ORDER BY region").all().map((r) => r.region),
    champions: base.champions.map((c) => {
      const delta = c.winRate - avg;
      return { ...c, laneShare: r4(c.games / (total.get(c.champion) || c.games)), delta: r4(delta),
        pbi: Math.round(delta * 100 * c.banRate / Math.max(0.01, 1 - c.pickRate) * 100) / 100, best: best(pool.get(c.champion) || [], c.winRate) };
    }) };
}

// GET /lol/champion/{id}/players: the top 50 by win rate (ties: more games), min BEST_MIN games.
function championPlayers(db, head, where, champion, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const role = q.role ? q.role.toUpperCase() : "";
  const list = players(db, w, a, champion, role).sort((x, y) => y.wins / y.games - x.wins / x.games || y.games - x.games).slice(0, 50);
  return { ...h, champion, role: role || "all", minPlayerGames: BEST_MIN, players: list.map((p) => ({ riotId: p.riotId, region: p.region, tier: p.tier,
    division: p.division, lp: p.lp, rank: p.rank_n, games: p.games, wins: p.wins, winRate: r4(p.wins / p.games) })) };
}

module.exports = { migrate, storeNames, aggregatePatch, backfillPlayers, tiersPlus, championPlayers, BEST_MIN };
