// D8: /lol/draft ranking with explained components, /lol/plan facts.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { createServer } = require("../src/server");

// 120 matches. Blue: MIDDLE 1 or 2 (alternating) + JUNGLE 7; red: MIDDLE 9 + TOP 8. Champion 1 wins 3 of 4 games, champion 2 wins 1 of 4.
// Ally 7 is always with them, enemy 8 is always against them.
function build() {
  const db = open(":memory:");
  const m = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, started_at, fetched_at) VALUES (?, 'lol', 'na1', 'DIAMOND', 'done', '16.20', 1, 1)");
  const p = db.prepare("INSERT INTO lol_participants (match_id, puuid, team, champion, role, win, items, runes, keystone, spells) VALUES (?, ?, ?, ?, ?, ?, '[3020]', '[8005]', 8005, '4,14')");
  for (let i = 0; i < 120; i++) {
    const id = "M" + i, mid = i % 2 ? 2 : 1, blueWins = mid === 1 ? i % 8 !== 0 : i % 8 === 1;
    m.run(id);
    p.run(id, id + "a", 100, mid, "MIDDLE", blueWins ? 1 : 0); p.run(id, id + "b", 100, 7, "JUNGLE", blueWins ? 1 : 0);
    p.run(id, id + "c", 200, 9, "MIDDLE", blueWins ? 0 : 1); p.run(id, id + "d", 200, 8, "TOP", blueWins ? 0 : 1);
  }
  aggregate(db);
  return db;
}

test("draft ranks by own win rate, lane matchup, other enemies and allies, with sample sizes; plan gathers the facts", async () => {
  const api = createServer({ db: build(), version: "t" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (path) => { const r = await fetch(`http://127.0.0.1:${api.address().port}${path}`); return [r.status, await r.json()]; };
  try {
    const [, d] = await get("/lol/draft?role=middle&enemies=9,8&allies=7");
    assert.deepStrictEqual([d.role, d.lane, d.candidates.map((c) => c.champion)], ["MIDDLE", 9, [1, 2]], "lane enemy found by its main role; 9 is not a candidate");
    const [one, two] = d.candidates;
    assert.ok(one.score > two.score);
    assert.deepStrictEqual([one.components.lane.champion, one.components.lane.games], [9, 60]);
    assert.deepStrictEqual(one.components.enemies.map((e) => [e.champion, e.games]), [[8, 60]]);
    assert.deepStrictEqual(one.components.allies.map((e) => [e.champion, e.games]), [[7, 60]]);
    assert.strictEqual(one.components.base.games, 60);
    assert.ok(!(await get("/lol/draft?role=middle&bans=1"))[1].candidates.some((c) => c.champion === 1), "banned champions drop out");
    assert.strictEqual((await get("/lol/draft?role=middle&enemies=1:TOP"))[1].lane, null, "an enemy given with another role is not the lane opponent");
    assert.strictEqual((await get("/lol/draft?role=mid"))[0], 400);
    assert.strictEqual((await get("/lol/draft?role=middle&enemies=x"))[0], 400);

    const [, plan] = await get("/lol/plan/1?role=middle&enemies=9,8");
    assert.deepStrictEqual([plan.role, plan.games, plan.keystone.key, plan.spells.key], ["MIDDLE", 60, "8005", "4,14"]);
    assert.strictEqual(plan.threats.length, 2);
    assert.ok(Array.isArray(plan.objectives));
  } finally { api.close(); }
});
