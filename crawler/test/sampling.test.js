// D14: ids() samples tiers toward their (floored) population share instead of draining the apex first.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { ids, tierOrder } = require("../src/jobs");

test("tier-balanced ids: the tier furthest below its share is asked next", async () => {
  const db = open(":memory:");
  const pl = db.prepare("INSERT INTO players (puuid, game, region, tier, tier_n) VALUES (?, 'lol', 'na1', ?, ?)");
  for (let i = 0; i < 90; i++) pl.run("e" + i, "EMERALD", 5);
  for (let i = 0; i < 9; i++) pl.run("d" + i, "DIAMOND", 6);
  pl.run("m0", "MASTER", 7);
  const now = 1e12;
  // last 24 h: 100 Master matches, nothing else -> Emerald is furthest below target
  const m = db.prepare("INSERT INTO matches (id, game, region, bracket, fetched_at) VALUES (?, 'lol', 'na1', ?, ?)");
  for (let i = 0; i < 100; i++) m.run("M" + i, "MASTER", now - 1000);
  assert.deepStrictEqual(tierOrder(db, "lol", "na1", now), ["EMERALD", "DIAMOND", "MASTER"]);
  const asked = [];
  const riot = { get: async (host, path) => { asked.push(path.split("/")[6]); return []; } };
  await ids({ db, riot, queues: [420], now: () => now }, "lol", "na1");
  assert.ok(asked[0].startsWith("e"), "an Emerald player is asked first");
  // a later mix of Emerald + Master: Diamond (0% vs ~8.7%) first, Master (4.8% vs floor ~3.9%) before over-served Emerald
  for (let i = 0; i < 2000; i++) m.run("E" + i, "EMERALD", now + 60000);
  assert.deepStrictEqual(tierOrder(db, "lol", "na1", now + 120000), ["DIAMOND", "MASTER", "EMERALD"]);
});
