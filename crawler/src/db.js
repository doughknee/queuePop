// SQLite schema. Raw match JSON is kept gzipped in matches.raw so normalised rows and stats can be
// rebuilt from it; stats_* tables hold counts only (rates are computed at read time, so any
// region/bracket filter is just a SUM).
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS players (
  puuid TEXT, game TEXT, region TEXT, tier TEXT, tier_n INT, division TEXT, lp INT,
  seeded_at INT, ids_at INT, PRIMARY KEY (puuid, game));
DROP INDEX IF EXISTS players_due; DROP INDEX IF EXISTS players_due_tier; -- replaced by players_tier_due (tier-balanced ids(), D14)
CREATE INDEX IF NOT EXISTS players_tier_due ON players (game, region, tier, ids_at); -- tier-balanced ids() (D14)
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, game TEXT, region TEXT, bracket TEXT, status TEXT DEFAULT 'new',
  queue INT, patch TEXT, started_at INT, fetched_at INT, raw BLOB);
CREATE INDEX IF NOT EXISTS matches_todo ON matches (status, game, region);
-- /status lastFetch and the aggregation dirty check (max / > fetched_at), leaderboard freshness (max seeded_at)
CREATE INDEX IF NOT EXISTS matches_fetched ON matches (fetched_at);
-- tierOrder's 24 h bracket mix, per game and region every minute: through matches_fetched it read ~140k wide rows, 5.7 s each,
-- ~46 s of every minute on the API thread (2026-10-20 22:10Z). Covering: an index range only.
CREATE INDEX IF NOT EXISTS matches_mix ON matches (game, region, fetched_at, bracket);
DROP INDEX IF EXISTS matches_patch; -- made the 16.20 pass 3x+ slower (planner drove every join from it); aggregation uses temp.pm
CREATE INDEX IF NOT EXISTS players_seeded ON players (game, seeded_at);
-- leaderboards: ladder order per game and per game+region (division sorts as text: I < II < III < IV)
CREATE INDEX IF NOT EXISTS players_ladder ON players (game, tier_n DESC, division, lp DESC);
CREATE INDEX IF NOT EXISTS players_ladder_region ON players (game, region, tier_n DESC, division, lp DESC);
CREATE TABLE IF NOT EXISTS lol_participants (
  match_id TEXT, puuid TEXT, team INT, champion INT, role TEXT, win INT, tier TEXT,
  items TEXT, keystone INT, runes TEXT, spells TEXT, skills TEXT);
CREATE INDEX IF NOT EXISTS lol_participants_match ON lol_participants (match_id);
CREATE TABLE IF NOT EXISTS lol_bans (match_id TEXT, team INT, champion INT);
CREATE TABLE IF NOT EXISTS tft_participants (
  match_id TEXT, puuid TEXT, placement INT, tier TEXT, comp TEXT, traits TEXT, units TEXT, augments TEXT);
CREATE INDEX IF NOT EXISTS tft_participants_match ON tft_participants (match_id);
-- DONI-596: capped-mode discovery (jobs.capped): players seen in ARAM/normal/swift matches, asked per queue
CREATE TABLE IF NOT EXISTS mode_players (puuid TEXT, region TEXT, queue INT, asked_at INT, PRIMARY KEY (puuid, queue));
CREATE INDEX IF NOT EXISTS mode_players_due ON mode_players (region, queue, asked_at);
CREATE INDEX IF NOT EXISTS tft_participants_puuid ON tft_participants (puuid); -- /tft/leaderboard crawled stats

CREATE TABLE IF NOT EXISTS stats_lol_matches (patch TEXT, region TEXT, bracket TEXT, matches INT);
CREATE TABLE IF NOT EXISTS stats_lol_champ (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_bans (patch TEXT, region TEXT, bracket TEXT, champion INT, bans INT);
CREATE TABLE IF NOT EXISTS stats_lol_build (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, kind TEXT, key TEXT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_lol_matchup (patch TEXT, region TEXT, bracket TEXT, role TEXT, champion INT, opponent INT, games INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_boards (patch TEXT, region TEXT, bracket TEXT, boards INT);
CREATE TABLE IF NOT EXISTS stats_tft_comp (patch TEXT, region TEXT, bracket TEXT, comp TEXT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_part (patch TEXT, region TEXT, bracket TEXT, comp TEXT, kind TEXT, key TEXT, games INT, placement_sum INT, top4 INT);
`;

function open(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  // auto_vacuum only takes effect on a new file (or after `npm run vacuum`); it must precede the first table.
  // busy_timeout first: the aggregation worker opens a second connection while the crawl writes.
  // synchronous NORMAL (WAL's usual setting): no fsync per commit, still never corrupt; a power cut can drop the last commits.
  // FULL fsynced every commit, and on Unraid's FUSE share that was 78% of the API thread (live profile 2026-10-20 22:12Z).
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
  db.exec(SCHEMA);
  require("./agg-players").migrate(db); // DONI-506: lol_names + stats_lol_player_champ
  db.exec(require("./agg-champion").SCHEMA); // DONI-507 champion depth tables
  require("./agg-window").migrate(db); // D6: matches.duration, stats_*_daily, stats_lol_length, stats_lol_depth
  require("./agg-tft").migrate(db);
  db.exec(require("./clips").SCHEMA); // published clips (docs/clip-publishing.md)
  db.exec(require("./draft").SCHEMA); // D8: stats_lol_vs // DONI-510/511: tft_participants.board + stats_tft_{unit,unit_item,item,augment,trait}
  // Migration: TFT set number (nullable), for DBs created before it existed.
  if (!db.prepare("PRAGMA table_info(matches)").all().some((c) => c.name === "set")) db.exec('ALTER TABLE matches ADD COLUMN "set" INT');
  // Every stats_* read and the aggregation's per-patch swap filter on patch: without these each was a full table scan (the swap
  // runs while the crawl waits, DONI-596).
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name GLOB 'stats_*'").all()) db.exec(`CREATE INDEX IF NOT EXISTS ${name}_patch ON ${name} (patch)`);
  return db;
}

function tx(db, fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const getMeta = (db, k) => { const r = db.prepare("SELECT v FROM meta WHERE k = ?").get(k); return r ? JSON.parse(r.v) : null; };
const setMeta = (db, k, v) => db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").run(k, JSON.stringify(v));

// The Riot key per game: Riot registers a personal key per product (League, TFT), each its own app with its own puuid
// encryption and rate limits. meta riotKey:<game> (POST /admin/key { game }) wins over meta riotKey (POST /admin/key without a
// game: both games, e.g. one development key), then RIOT_API_KEY. Without a game: the shared key.
const GAMES = ["lol", "tft"];
function riotKey(db, envKey, game) {
  const g = game && getMeta(db, `riotKey:${game}`);
  if (g?.key) return { key: g.key, source: `meta:${game}`, set_at: g.set_at };
  const m = getMeta(db, "riotKey");
  if (m?.key) return { key: m.key, source: "meta", set_at: m.set_at };
  return envKey ? { key: envKey, source: "env", set_at: null } : { key: "", source: "none", set_at: null };
}
function setKey(db, key, game, now = Date.now()) {
  setMeta(db, game ? `riotKey:${game}` : "riotKey", { key, set_at: now });
  const bad = badKeys(db); delete bad[keyHash(key)]; setMeta(db, "keyBad", bad); // a posted key is trusted until Riot rejects it again
}

// Key health (D2): meta keyBad = { <hash>: { reason, since } }, written when Riot answers 401/403 for a key. A game's key is bad
// while its current key hashes to an entry; posting a new key changes the hash, so health (and the crawl) comes back on its own.
const keyHash = (k) => require("crypto").createHash("sha256").update(k).digest("hex").slice(0, 16);
const badKeys = (db) => { const b = getMeta(db, "keyBad") || {}; return b.hash ? { [b.hash]: { reason: b.reason, since: b.since } } : b; }; // before per-game keys: one { hash, reason, since }
function keyHealth(db, envKey, game) {
  if (!game) { const hs = GAMES.map((g) => keyHealth(db, envKey, g)); return hs.find((h) => !h.valid) || hs[0]; } // both: the worse
  const k = riotKey(db, envKey, game);
  if (!k.key) return { valid: false, reason: "no key set", since: null };
  const bad = badKeys(db)[keyHash(k.key)];
  return bad ? { valid: false, reason: bad.reason, since: bad.since } : { valid: true, reason: null, since: null };
}
// usedKey: the key the rejected request carried (DONI-568: a 403 for the old key arriving after a new key was posted must not
// mark the new one bad). Defaults to the shared key.
function markKeyBad(db, envKey, reason, now = Date.now(), usedKey = riotKey(db, envKey).key) {
  if (!usedKey) return;
  const h = keyHash(usedKey), bad = badKeys(db);
  if (!bad[h]) setMeta(db, "keyBad", { ...bad, [h]: { reason, since: now } });
}

module.exports = { open, tx, getMeta, setMeta, riotKey, setKey, keyHealth, markKeyBad, GAMES };
