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
CREATE INDEX IF NOT EXISTS players_due ON players (game, region, ids_at);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY, game TEXT, region TEXT, bracket TEXT, status TEXT DEFAULT 'new',
  queue INT, patch TEXT, started_at INT, fetched_at INT, raw BLOB);
CREATE INDEX IF NOT EXISTS matches_todo ON matches (status, game, region);
CREATE TABLE IF NOT EXISTS lol_participants (
  match_id TEXT, puuid TEXT, team INT, champion INT, role TEXT, win INT, tier TEXT,
  items TEXT, keystone INT, runes TEXT, spells TEXT, skills TEXT);
CREATE INDEX IF NOT EXISTS lol_participants_match ON lol_participants (match_id);
CREATE TABLE IF NOT EXISTS lol_bans (match_id TEXT, team INT, champion INT);
CREATE TABLE IF NOT EXISTS tft_participants (
  match_id TEXT, puuid TEXT, placement INT, tier TEXT, comp TEXT, traits TEXT, units TEXT, augments TEXT);
CREATE INDEX IF NOT EXISTS tft_participants_match ON tft_participants (match_id);

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
  db.exec("PRAGMA auto_vacuum = INCREMENTAL; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

function tx(db, fn) {
  db.exec("BEGIN");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const getMeta = (db, k) => { const r = db.prepare("SELECT v FROM meta WHERE k = ?").get(k); return r ? JSON.parse(r.v) : null; };
const setMeta = (db, k, v) => db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v").run(k, JSON.stringify(v));

// The Riot key: one pasted via POST /admin/key (meta) wins over RIOT_API_KEY (env).
function riotKey(db, envKey) {
  const m = getMeta(db, "riotKey");
  if (m?.key) return { key: m.key, source: "meta", set_at: m.set_at };
  return envKey ? { key: envKey, source: "env", set_at: null } : { key: "", source: "none", set_at: null };
}

module.exports = { open, tx, getMeta, setMeta, riotKey };
