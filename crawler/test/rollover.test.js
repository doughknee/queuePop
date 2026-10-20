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
  assert.deepStrictEqual(patches(db).default, { lol: "16.20", tft: "16.20" });
  assert.strictEqual(lolTiers(db, {}).patch, "16.20");
  assert.strictEqual(tftComps(db, {}).patch, "16.20");
  db.prepare("UPDATE stats_lol_matches SET matches = ? WHERE patch = '16.21'").run(p.minMatches.lol);
  assert.strictEqual(lolTiers(db, {}).patch, "16.21", "switches once the new patch has minMatches");
  assert.strictEqual(lolTiers(db, { patch: "16.20" }).patch, "16.20", "an explicit patch always wins");
});
