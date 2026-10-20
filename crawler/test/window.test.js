// D6 (DONI-513 data side): ?days window and ?trend series from stats_*_daily, game-length buckets, player-base depth.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { aggregate, backfillDuration } = require("../src/jobs");
const { lolTiers, lolChampion, tftComps } = require("../src/server");
const zlib = require("zlib");

const DAY = 86400000, now = Date.now();
function build() {
  const db = open(":memory:");
  const m = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, started_at, fetched_at, duration) VALUES (?, ?, 'na1', 'DIAMOND', 'done', '16.20', ?, 1, ?)");
  const p = db.prepare("INSERT INTO lol_participants (match_id, puuid, team, champion, role, win) VALUES (?, ?, ?, 7, 'MIDDLE', ?)");
  // two old games (10 days ago, 22 and 31 min, both won by "a"), one today (40 min, lost by "b")
  m.run("A", "lol", now - 10 * DAY, 22 * 60); p.run("A", "a", 100, 1);
  m.run("B", "lol", now - 10 * DAY, 31 * 60); p.run("B", "a", 100, 1);
  m.run("C", "lol", now, 40 * 60); p.run("C", "b", 100, 0);
  m.run("T1", "tft", now - 10 * DAY, 2000); m.run("T2", "tft", now, 2000);
  const t = db.prepare("INSERT INTO tft_participants (match_id, puuid, placement, comp) VALUES (?, 'x', ?, 'Inv,Ahri')");
  t.run("T1", 1); t.run("T2", 7);
  aggregate(db);
  return db;
}

test("days window and trend series", () => {
  const db = build();
  const all = lolTiers(db, {}).champions[0], last3 = lolTiers(db, { days: "3" });
  assert.deepStrictEqual([all.games, all.winRate, all.players, all.gamesPerPlayer], [3, 0.6667, 2, 1.5]);
  assert.deepStrictEqual([last3.days, last3.matches, last3.champions[0].games, last3.champions[0].winRate], [3, 1, 1, 0]);
  assert.strictEqual(last3.since, new Date(now - 2 * DAY).toISOString().slice(0, 10));
  const tr = lolTiers(db, { trend: "1" }).champions[0].daily;
  assert.deepStrictEqual(tr.map((d) => [d.games, d.winRate]), [[2, 1], [1, 0]]);
  assert.throws(() => lolTiers(db, { days: "0" }), (e) => e.status === 400);
  assert.strictEqual(lolTiers(db, { days: "patch" }).days, undefined);
  const c = tftComps(db, { days: "1", trend: "1" }).comps[0];
  assert.deepStrictEqual([c.games, c.avgPlacement, c.daily.length], [1, 7, 1]);
  assert.strictEqual(lolChampion(db, 7, { days: "3" }).strip.games, 1);
});

test("length buckets and depth on the champion page; backfill-length fills duration from raw", () => {
  const db = build();
  const ch = lolChampion(db, 7, {});
  assert.deepStrictEqual(ch.length.map((b) => [b.from, b.to, b.games, b.winRate, b.share]), [[20, 25, 1, 1, 0.3333], [30, 35, 1, 1, 0.3333], [40, 45, 1, 0, 0.3333]]);
  assert.deepStrictEqual(ch.depth, { players: 2, gamesPerPlayer: 1.5 });
  db.prepare("UPDATE matches SET duration = NULL, raw = ? WHERE id = 'C'").run(zlib.gzipSync(JSON.stringify({ info: { gameDuration: 3000 } })));
  assert.deepStrictEqual(backfillDuration(db), { matches: 1 });
  aggregate(db, () => now, true);
  assert.deepStrictEqual(lolChampion(db, 7, {}).length.at(-1), { bucket: 9, from: 45, to: null, games: 1, winRate: 0, share: 0.3333 });
});
