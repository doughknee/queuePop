// D11: a new patch's first matches start fresh stats, /patches lists it first, and the default switches at minMatches.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { patches, lolTiers, tftComps } = require("../src/server");

test("patch rollover: fresh rows per patch, newest listed first, default waits for minMatches", () => {
  const db = open(":memory:");
  const m = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, started_at, fetched_at) VALUES (?, ?, 'na1', 'DIAMOND', 'done', ?, 1, ?)");
  const lp = db.prepare("INSERT INTO lol_participants (match_id, puuid, team, champion, role, win) VALUES (?, ?, 100, ?, 'TOP', 1)");
  const tp = db.prepare("INSERT INTO tft_participants (match_id, puuid, placement, comp) VALUES (?, ?, 1, 'A,B')");
  m.run("L1", "lol", "16.20", 1); lp.run("L1", "a", 10);
  m.run("T1", "tft", "16.20", 1); tp.run("T1", "a");
  aggregate(db, () => 1);
  // first games of 16.21 arrive
  m.run("L2", "lol", "16.21", 5); lp.run("L2", "b", 20);
  m.run("T2", "tft", "16.21", 5); tp.run("T2", "b");
  aggregate(db, () => 10);
  const p = patches(db);
  assert.deepStrictEqual([p.lol, p.tft], [["16.21", "16.20"], ["16.21", "16.20"]]);
  assert.deepStrictEqual(lolTiers(db, { patch: "16.21" }).champions.map((c) => c.champion), [20], "16.21 starts fresh");
  assert.deepStrictEqual(lolTiers(db, { patch: "16.20" }).champions.map((c) => c.champion), [10], "16.20 untouched");
  // neither patch reaches minMatches: the one with more matches wins (tie: newest)
  assert.strictEqual(p.default.lol, "16.21");
  // 16.20 is a full patch, 16.21 has 1 game: default stays on 16.20 until 16.21 reaches minMatches
  db.prepare("UPDATE stats_lol_matches SET matches = ? WHERE patch = '16.20'").run(p.minMatches.lol);
  db.prepare("UPDATE stats_tft_boards SET boards = ? WHERE patch = '16.20'").run(p.minMatches.tft * 8);
  assert.deepStrictEqual([patches(db).default.lol, patches(db).default.tft], ["16.20", "16.20"]);
  assert.strictEqual(lolTiers(db, {}).patch, "16.20");
  assert.strictEqual(tftComps(db, {}).patch, "16.20");
  db.prepare("UPDATE stats_lol_matches SET matches = ? WHERE patch = '16.21'").run(p.minMatches.lol);
  assert.strictEqual(lolTiers(db, {}).patch, "16.21", "switches once the new patch has minMatches");
  assert.strictEqual(lolTiers(db, { patch: "16.20" }).patch, "16.20", "an explicit patch always wins");
});

// DONI-596 follow-up: 16.21 arrives. Solo passes 2,000 on it while ARAM, flex, normal and swift there have a handful of games:
// each mode keeps its own default, no mode points at a patch it has no games on, and 16.20 stays selectable.
test("16.21 rollover per mode: a tiny new patch never takes a mode's default; ?days and the bracket sampler cope", () => {
  const { tierOrder } = require("../src/jobs");
  const db = open(":memory:");
  const now = Date.parse("2026-10-21T12:00:00Z");
  const m = db.prepare("INSERT INTO matches (id, game, region, bracket, status, queue, patch, started_at, fetched_at) VALUES (?, 'lol', 'na1', 'DIAMOND', 'done', ?, ?, ?, ?)");
  const lp = db.prepare("INSERT INTO lol_participants (match_id, puuid, team, champion, role, win) VALUES (?, ?, 100, ?, ?, 1)");
  const put = (id, queue, patch, champ, t) => { m.run(id, queue, patch, t, t); lp.run(id, "p" + id, champ, queue === 450 ? "" : "TOP"); };
  for (let i = 0; i < 30; i++) { put("S20" + i, 420, "16.20", 10, now - 3 * 86400000); put("A20" + i, 450, "16.20-aram", 11, now - 3 * 86400000); put("F20" + i, 440, "16.20-flex", 12, now - 3 * 86400000); }
  put("S21", 420, "16.21", 20, now - 3600000); put("A21", 450, "16.21-aram", 21, now - 3600000);
  aggregate(db, () => now);
  db.prepare("UPDATE stats_lol_matches SET matches = 2000 WHERE patch = '16.21'").run(); // solo crossed its threshold
  const p = patches(db);
  assert.deepStrictEqual([p.lol, p.aram, p.flex], [["16.21", "16.20"], ["16.21", "16.20"], ["16.20"]], "16.20 stays listed and selectable");
  assert.deepStrictEqual([p.default.lol, p.default.aram, p.default.flex, p.default.normal, p.default.swift], ["16.21", "16.20", "16.20", null, null]);
  assert.strictEqual(lolTiers(db, {}).patch, "16.21");
  assert.strictEqual(lolTiers(db, { queue: "aram" }).patch, "16.20-aram", "ARAM stays on the patch with its games");
  assert.strictEqual(lolTiers(db, { queue: "440" }).matches, 30);
  assert.strictEqual(lolTiers(db, { queue: "aram", patch: "16.21" }).matches, 1, "an explicit patch always wins");
  assert.strictEqual(lolTiers(db, { patch: "16.20" }).matches, 30);
  // "patch so far" windows on the tiny patch: the 1-day window has its one game, a 7-day window the same
  assert.deepStrictEqual([1, 7].map((d) => lolTiers(db, { patch: "16.21", days: String(d) }).matches), [1, 1]);
  // bracket sampler with one recent match: no division by zero, every seeded tier still ordered
  db.prepare("INSERT INTO players (puuid, game, region, tier, tier_n) VALUES ('x', 'lol', 'na1', 'DIAMOND', 6), ('y', 'lol', 'na1', 'GOLD', 3)").run();
  assert.deepStrictEqual(tierOrder(db, "lol", "na1", now).sort(), ["DIAMOND", "GOLD"]);
});
