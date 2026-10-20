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
