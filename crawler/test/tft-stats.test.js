// DONI-510/511: /tft/units, /tft/unit/{key}, /tft/items, /tft/augments, /tft/traits from tft_participants.board.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { createServer } = require("../src/server");

function build() {
  const db = open(":memory:");
  db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, fetched_at) VALUES ('T', 'tft', 'na1', 'DIAMOND', 'done', '16.20', 1)").run();
  const ins = db.prepare("INSERT INTO tft_participants (match_id, puuid, placement, comp, traits, units, augments, board) VALUES ('T', ?, ?, ?, ?, ?, ?, ?)");
  // Ahri 3-star with Shojin+Blue wins; Ahri 2-star with Shojin goes 5th; Krug 2-star in both and on the 8th board.
  ins.run("a", 1, "Inv,Ahri", '[["Inv",3],["Brawl",1]]', '["Ahri","Krug"]', '["AugA","AugB"]', '[["Ahri",3,["Shojin","Blue"]],["Krug",2,[]]]');
  ins.run("b", 5, "Inv,Ahri", '[["Inv",2]]', '["Ahri","Krug"]', '["AugA"]', '[["Ahri",2,["Shojin"]],["Krug",2,["Bramble"]]]');
  ins.run("c", 8, "Brawl,Krug", '[["Brawl",1]]', '["Krug"]', '[]', '[["Krug",1,["Bramble"]]]');
  aggregate(db, () => 2);
  return db;
}

test("TFT units, unit page, items, augments by stage, traits by tier", async () => {
  const api = createServer({ db: build(), version: "t" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${api.address().port}${p}`); return [r.status, await r.json()]; };
  try {
    const [, u] = await get("/tft/units");
    assert.strictEqual(u.boards, 3);
    const krug = u.units.find((x) => x.key === "Krug");
    assert.deepStrictEqual([krug.games, krug.avgPlacement, krug.top4Rate, krug.winRate, krug.frequency], [3, 4.6667, 0.3333, 0.3333, 1]);
    assert.deepStrictEqual(krug.stars.map((s) => [s.star, s.games]), [[1, 1], [2, 2]]);
    assert.deepStrictEqual(krug.items, [{ key: "Bramble", games: 2, avgPlacement: 6.5 }]);

    const [, ahri] = await get("/tft/unit/Ahri");
    assert.deepStrictEqual([ahri.games, ahri.avgPlacement, ahri.frequency], [2, 3, 0.6667]);
    assert.deepStrictEqual(ahri.items.map((i) => [i.key, i.games, i.frequency]), [["Shojin", 2, 1], ["Blue", 1, 0.5]]);
    assert.deepStrictEqual(ahri.itemSets.map((i) => i.key).sort(), ["Blue,Shojin", "Shojin"]);
    assert.deepStrictEqual(ahri.comps.map((c) => [c.id, c.games, c.frequency]), [["Inv,Ahri", 2, 1]]);
    assert.strictEqual((await get("/tft/unit/Nobody"))[0], 404);
    const [, krugPage] = await get("/tft/unit/Krug");
    assert.deepStrictEqual(krugPage.itemSets.find((s) => s.key === ""), { key: "", games: 1, avgPlacement: 1, top4Rate: 1, winRate: 1, frequency: 0.3333, lowSample: true });

    const [, it] = await get("/tft/items");
    const sh = it.items.find((x) => x.key === "Shojin");
    assert.deepStrictEqual([sh.games, sh.avgPlacement, sh.frequency, sh.units.map((x) => x.unit)], [2, 3, 0.6667, ["Ahri"]]);

    const [, au] = await get("/tft/augments");
    const a = au.augments.find((x) => x.key === "AugA");
    assert.deepStrictEqual([a.games, a.avgPlacement, a.stages.map((s) => [s.stage, s.games])], [2, 3, [["2-1", 2]]]);
    assert.deepStrictEqual(au.augments.find((x) => x.key === "AugB").stages.map((s) => s.stage), ["3-2"]);
    assert.strictEqual(au.note, undefined);

    const [, tr] = await get("/tft/traits");
    const inv = tr.traits.find((x) => x.key === "Inv");
    assert.deepStrictEqual(inv.tiers.map((t) => [t.tier, t.games, t.avgPlacement]), [[2, 1, 5], [3, 1, 1]]);
  } finally { api.close(); }
});
