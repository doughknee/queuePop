// DONI-509: /lol/items, /lol/runes, /lol/spells roll stats_lol_build up across champions.
const test = require("node:test");
const assert = require("node:assert");
const { open, setMeta } = require("../src/db");
const { createServer } = require("../src/server");

function db() {
  const d = open(":memory:");
  d.prepare("INSERT INTO stats_lol_matches VALUES ('16.20', 'na1', 'DIAMOND', 10)").run();
  const champ = d.prepare("INSERT INTO stats_lol_champ VALUES ('16.20', 'na1', 'DIAMOND', ?, ?, ?, ?)");
  champ.run("MIDDLE", 1, 60, 30); champ.run("MIDDLE", 2, 40, 20); champ.run("TOP", 3, 100, 50);
  const b = d.prepare("INSERT INTO stats_lol_build VALUES ('16.20', 'na1', 'DIAMOND', ?, ?, ?, ?, ?, ?)");
  b.run("MIDDLE", 1, "item", "3020", 50, 30); b.run("MIDDLE", 2, "item", "3020", 30, 12); b.run("TOP", 3, "item", "3020", 20, 10);
  b.run("TOP", 3, "item", "3047", 80, 40);
  b.run("MIDDLE", 1, "keystone", "8112", 60, 30); b.run("MIDDLE", 1, "rune", "8112", 60, 30); b.run("MIDDLE", 1, "spells", "4,14", 60, 30);
  d.prepare("INSERT INTO stats_lol_shards VALUES ('16.20', 'na1', 'DIAMOND', 'MIDDLE', 1, '5008,5008,5011', 60, 30)").run();
  setMeta(d, "aggregatedAt", 1);
  return d;
}

test("lol rollups: games, win, pick, delta, top champions, role filter, memo until the next aggregation", async () => {
  const d = db();
  const api = createServer({ db: d, version: "t" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (p) => (await fetch(`http://127.0.0.1:${api.address().port}${p}`)).json();
  try {
    const all = await get("/lol/items");
    assert.strictEqual(all.players, 200);
    assert.deepStrictEqual(all.items[0], { key: "3020", games: 100, wins: 52, winRate: 0.52, delta: 0.02, pickRate: 0.5, lowSample: true,
      champions: [{ champion: 1, games: 50, winRate: 0.6 }, { champion: 2, games: 30, winRate: 0.4 }, { champion: 3, games: 20, winRate: 0.5 }] });
    const mid = await get("/lol/items?role=middle&min_games=50");
    assert.deepStrictEqual([mid.role, mid.players, mid.items.length, mid.items[0].games, mid.items[0].pickRate, mid.items[0].lowSample], ["MIDDLE", 100, 1, 80, 0.8, false]);
    const runes = await get("/lol/runes");
    assert.deepStrictEqual([runes.keystones[0].key, runes.runes[0].key, runes.shards[0].key], ["8112", "8112", "5008,5008,5011"]);
    assert.strictEqual((await get("/lol/spells")).spells[0].key, "4,14");
    d.prepare("DELETE FROM stats_lol_build WHERE key = '3047'").run();
    assert.strictEqual((await get("/lol/items")).items.length, 2, "memoised until aggregatedAt changes");
    setMeta(d, "aggregatedAt", 2);
    assert.strictEqual((await get("/lol/items")).items.length, 1);
  } finally { api.close(); }
});

test("tier list region weighting: region=all weighs each region's rates by its player share", () => {
  const { lolTiers } = require("../src/server");
  const d = open(":memory:");
  // big region: champion 1 in 10% of 100 matches; small region: 50% of 100 matches. Players 9:1.
  d.prepare("INSERT INTO stats_lol_matches VALUES ('16.20', 'big', 'DIAMOND', 100), ('16.20', 'small', 'DIAMOND', 100)").run();
  d.prepare("INSERT INTO stats_lol_champ VALUES ('16.20', 'big', 'DIAMOND', 'MIDDLE', 1, 10, 5), ('16.20', 'small', 'DIAMOND', 'MIDDLE', 1, 50, 40)").run();
  d.prepare("INSERT INTO stats_lol_bans VALUES ('16.20', 'small', 'DIAMOND', 1, 20)").run();
  setMeta(d, "regionWeights", { lol: { big: 900, small: 100 } });
  const t = lolTiers(d, {});
  const c = t.champions[0];
  assert.deepStrictEqual(t.weighting, { big: 0.9, small: 0.1 });
  assert.deepStrictEqual([c.games, c.pickRate, c.banRate], [60, 0.14, 0.02]); // 0.9*0.1 + 0.1*0.5; 0.1*0.2
  assert.strictEqual(c.winRate, 0.6071); // (0.9*5 + 0.1*40)/100 / 0.14
  const one = lolTiers(d, { region: "small" }).champions[0];
  assert.deepStrictEqual([one.pickRate, one.winRate, lolTiers(d, { region: "small" }).weighting], [0.5, 0.8, undefined]);
});

test("champion strip uses the same region weighting as its tier list row", () => {
  const { lolTiers, lolChampion } = require("../src/server");
  const d = open(":memory:");
  d.prepare("INSERT INTO stats_lol_matches VALUES ('16.20', 'big', 'DIAMOND', 100), ('16.20', 'small', 'DIAMOND', 100)").run();
  d.prepare("INSERT INTO stats_lol_champ VALUES ('16.20', 'big', 'DIAMOND', 'MIDDLE', 1, 10, 5), ('16.20', 'small', 'DIAMOND', 'MIDDLE', 1, 50, 40)").run();
  setMeta(d, "regionWeights", { lol: { big: 900, small: 100 } });
  const row = lolTiers(d, {}).champions[0], strip = lolChampion(d, 1, {}).strip;
  assert.deepStrictEqual([strip.winRate, strip.pickRate, strip.banRate, strip.games], [row.winRate, row.pickRate, row.banRate, 60]);
});

test("region weighting only applies to bracket=all ranked (the weights are Emerald+ ranked players)", () => {
  const { lolTiers } = require("../src/server");
  const d = open(":memory:");
  d.prepare("INSERT INTO stats_lol_matches VALUES ('16.20', 'big', 'MASTER', 100), ('16.20', 'small', 'MASTER', 100)").run();
  d.prepare("INSERT INTO stats_lol_champ VALUES ('16.20', 'big', 'MASTER', 'MIDDLE', 1, 10, 5), ('16.20', 'small', 'MASTER', 'MIDDLE', 1, 50, 40)").run();
  setMeta(d, "regionWeights", { lol: { big: 900, small: 100 } });
  assert.ok(lolTiers(d, {}).weighting);
  assert.strictEqual(lolTiers(d, { bracket: "master" }).weighting, undefined);
});
