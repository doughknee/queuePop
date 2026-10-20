// Time windows, game length and player-base depth (DONI-513 data side, overnight D6).
// - stats_*_daily: the same counts as stats_lol_{matches,champ,bans} / stats_tft_{boards,comp}, split by UTC day of match start,
//   rebuilt per dirty patch with the rest. `?days=N` reads them: the last N days (today counts as one) within the patch.
//   `?trend=1` adds a per-day series to tier-list and comp rows (sparklines, deltas).
// - stats_lol_length: per champion+role, games and wins by 5-minute game-length bucket (matches.duration, seconds).
// - stats_lol_depth: distinct players per champion+role. ponytail: summed over regions/brackets a player whose games land in two
//   brackets counts twice; with bracket=all the number is a slight overcount.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS stats_lol_matches_daily (day TEXT, patch TEXT, region TEXT, bracket TEXT, matches INT);
CREATE TABLE IF NOT EXISTS stats_lol_champ_daily (day TEXT, patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_bans_daily (day TEXT, patch TEXT, region TEXT, bracket TEXT, champion INT, bans INT);
CREATE TABLE IF NOT EXISTS stats_tft_boards_daily (day TEXT, patch TEXT, region TEXT, bracket TEXT, boards INT);
CREATE TABLE IF NOT EXISTS stats_tft_comp_daily (day TEXT, patch TEXT, region TEXT, bracket TEXT, comp TEXT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_length (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, bucket INT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_depth (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, players INT);
`;
const DAILY = ["lol_matches", "lol_champ", "lol_bans", "tft_boards", "tft_comp"];
const TABLES = [...DAILY.map((t) => t + "_daily"), "lol_length", "lol_depth"];
const BUCKET = 300, LAST_BUCKET = 9; // 5-minute buckets, the last one is 45 min and longer

function migrate(db) {
  if (!db.prepare("PRAGMA table_info(matches)").all().some((c) => c.name === "duration")) db.exec("ALTER TABLE matches ADD COLUMN duration INT");
  db.exec(SCHEMA);
}

// Game length in seconds: match-v5 gameDuration, tft-match-v1 game_length.
const durationOf = (info) => Math.round(info?.gameDuration ?? info?.game_length ?? 0) || null;

function inserts(M, K) {
  const D = "date(m.started_at / 1000, 'unixepoch')";
  return [
    `INSERT INTO stats_lol_matches_daily SELECT date(started_at / 1000, 'unixepoch'), patch, region, bracket, count(*) FROM matches
      WHERE game = 'lol' AND status = 'done' AND patch = ? GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_lol_champ_daily SELECT ${D}, ${K}, p.role, p.champion, count(*), sum(p.win) FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5, 6`,
    `INSERT INTO stats_lol_bans_daily SELECT ${D}, ${K}, p.champion, count(DISTINCT p.match_id) FROM lol_bans p ${M} GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_tft_boards_daily SELECT ${D}, ${K}, count(*) FROM tft_participants p ${M} GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_tft_comp_daily SELECT ${D}, ${K}, p.comp, count(*), sum(p.placement), sum(p.placement <= 4), sum(p.placement = 1) FROM tft_participants p ${M} GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_lol_length SELECT ${K}, p.role, p.champion, min(m.duration / ${BUCKET}, ${LAST_BUCKET}), count(*), sum(p.win) FROM lol_participants p ${M}
      WHERE m.duration IS NOT NULL GROUP BY 1, 2, 3, 4, 5, 6`,
    `INSERT INTO stats_lol_depth SELECT ${K}, p.role, p.champion, count(DISTINCT p.puuid) FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5`,
  ];
}

// ?days=N -> N (1..90) or null. Throws a 400 on anything else.
function days(q) {
  if (q.days === undefined || q.days === "" || q.days === "patch") return null;
  const n = Number(q.days);
  if (!Number.isInteger(n) || n < 1 || n > 90) throw Object.assign(new Error("days must be 1..90 or 'patch'"), { status: 400 });
  return n;
}
const cutoff = (n, now = Date.now()) => new Date(now - (n - 1) * 86400000).toISOString().slice(0, 10);

// The table to read for a windowable stat, plus the extra WHERE and its argument: stats_<name> or stats_<name>_daily + day.
function src(q, name, now) {
  const n = days(q);
  return n ? { t: `stats_${name}_daily`, d: " AND day >= ?", da: [cutoff(n, now)] } : { t: `stats_${name}`, d: "", da: [] };
}

// Per-day series for ?trend=1: Map(rowKey -> [{ day, games, wins|placement_sum }]), over the window (or the whole patch).
function daily(db, w, a, q, name, keyCols, valCols) {
  const s = src(q, name);
  const rows = db.prepare(`SELECT day, ${keyCols}, ${valCols} FROM stats_${name}_daily WHERE ${w}${s.d} GROUP BY day, ${keyCols} ORDER BY day`).all(...a, ...s.da);
  const m = new Map(), cols = keyCols.split(",").map((c) => c.trim());
  for (const r of rows) { const k = cols.map((c) => r[c]).join("|"); (m.get(k) || m.set(k, []).get(k)).push(r); }
  return m;
}

const r4 = (x) => Math.round(x * 10000) / 10000;
// Champion page: length buckets ({ from, to } minutes, to null for the last) and depth.
function champion(db, w, a, champion, role) {
  const rows = db.prepare(`SELECT bucket, sum(games) games, sum(wins) wins FROM stats_lol_length WHERE ${w} AND champion = ? AND role = ? GROUP BY bucket ORDER BY bucket`).all(...a, champion, role);
  const total = rows.reduce((s, r) => s + r.games, 0);
  const players = db.prepare(`SELECT sum(players) n FROM stats_lol_depth WHERE ${w} AND champion = ? AND role = ?`).get(...a, champion, role).n || 0;
  return {
    length: rows.map((r) => ({ bucket: r.bucket, from: r.bucket * 5, to: r.bucket >= LAST_BUCKET ? null : r.bucket * 5 + 5, games: r.games, winRate: r4(r.wins / r.games), share: r4(r.games / total) })),
    depth: { players, gamesPerPlayer: players ? r4(total / players) : null },
  };
}
// Tier list: distinct players per champion+role.
const depthMap = (db, w, a) => new Map(db.prepare(`SELECT champion, role, sum(players) n FROM stats_lol_depth WHERE ${w} GROUP BY champion, role`).all(...a).map((r) => [`${r.champion}|${r.role}`, r.n]));

module.exports = { SCHEMA, TABLES, migrate, durationOf, inserts, days, cutoff, src, daily, champion, depthMap };
