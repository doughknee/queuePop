// DONI-508/512: leaderboards from the players table, on-demand League/TFT lookups through the mock Riot API.
const test = require("node:test");
const assert = require("node:assert");
const { open, getMeta } = require("../src/db");
const { Limiter } = require("../src/limiter");
const { createClient } = require("../src/riot");
const { createServer } = require("../src/server");
const { createLookup, parseRiotId } = require("../src/lookup");
const { seed } = require("../src/jobs");
const { startMock } = require("../src/mock");

async function setup(perMin = 3, accountGame = "lol") {
  const mock = await startMock(0, { accountGame });
  const db = open(":memory:");
  let t = 1e12;
  const now = () => t;
  const riot = createClient({ key: "k", base: mock.url, limiter: new Limiter() });
  const api = createServer({ db, version: "t", lookup: createLookup({ db, riot, perMin, now }) });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${api.address().port}${p}`); return [r.status, await r.json(), r.headers.get("retry-after")]; };
  return { mock, db, riot, get, tick: (ms) => { t += ms; }, close: () => { api.close(); mock.server.close(); } };
}

test("riot id parsing", () => {
  assert.deepStrictEqual(parseRiotId("Poop%20Crayons%23mugen"), { name: "Poop Crayons", tag: "mugen" });
  assert.deepStrictEqual(parseRiotId("Faker-KR1"), { name: "Faker", tag: "KR1" });
  assert.throws(() => parseRiotId("nohash"), (e) => e.status === 400);
});

test("leaderboards: ladder order with wins/losses, TFT rows carry crawled boards, apex refresh between daily walks", async () => {
  const t = await setup();
  try {
    let clock = Date.now();
    const ctx = { db: t.db, riot: t.riot, minTier: "DIAMOND", queues: [420, 1100], now: () => clock };
    for (const g of ["lol", "tft"]) while (!getMeta(t.db, `seed:${g}:na1`)?.doneAt) await seed(ctx, g, "na1");
    const [, lol] = await t.get("/lol/leaderboard?region=na1&limit=5");
    assert.strictEqual(lol.players.length, 5);
    assert.strictEqual(lol.players[0].tier, "CHALLENGER");
    assert.strictEqual(lol.players[0].division, null);
    assert.ok(lol.players[0].wins > 0 && lol.players[0].winRate > 0);
    for (let i = 1; i < 5; i++) assert.ok(lol.players[i - 1].lp >= lol.players[i].lp || lol.players[i - 1].tier !== lol.players[i].tier);
    // a Challenger the apex refresh hasn't seen for over an hour (demoted / banned) is gone
    t.db.prepare("UPDATE players SET seeded_at = ? WHERE game = 'lol' AND tier = 'CHALLENGER'").run(Date.now() - 2 * 3600000);
    assert.ok(!(await t.get("/lol/leaderboard?region=na1&limit=5"))[1].players.some((p) => p.tier === "CHALLENGER"));
    const [, tft] = await t.get("/tft/leaderboard");
    assert.ok(tft.players.length > 0 && "crawled" in tft.players[0]);
    // between daily walks only the three apex ladders are re-read, every 30 min
    const n = t.mock.stats.requests;
    clock += 60000; assert.strictEqual(await seed(ctx, "lol", "na1"), false);
    clock += 1800000; assert.strictEqual(await seed(ctx, "lol", "na1"), true);
    assert.strictEqual(t.mock.stats.requests, n + 3);
  } finally { t.close(); }
});

test("lookups: League and TFT player, cached 10 min, capped per minute, 404 for unknown ids", async () => {
  const t = await setup(1);
  try {
    const [s, lol] = await t.get("/lol/summoner/Synthetic10%23NA1?region=na1");
    assert.strictEqual(s, 200);
    assert.deepStrictEqual([lol.riotId, lol.level, lol.ranked[0].tier, lol.ranked[0].division], ["Synthetic10#NA1", 321, "DIAMOND", "II"]);
    assert.ok(lol.matches.length > 0);
    const g = lol.matches[0];
    assert.ok(g.id.startsWith("NA1_52") && g.champion > 0 && typeof g.win === "boolean" && g.items.length > 0);
    const n = t.mock.stats.requests;
    assert.strictEqual((await t.get("/lol/summoner/synthetic10-na1?region=na1"))[0], 200);
    assert.strictEqual(t.mock.stats.requests, n, "same player (any case, either separator) is served from cache");

    const [s3, , retry] = await t.get("/lol/summoner/Nobody%23NA1");
    assert.deepStrictEqual([s3, Number(retry) > 0], [429, true], "second fresh lookup in a minute is refused (cap 1)");
    t.tick(61000);
    assert.strictEqual((await t.get("/lol/summoner/Nobody%23NA1"))[0], 404);
    assert.strictEqual((await t.get("/lol/summoner/x%23y?region=mars"))[0], 400);
  } finally { t.close(); }
  const u = await setup(3, "tft");
  try {
    const [, tft] = await u.get("/tft/player/Synthetic10%23NA1");
    assert.ok(tft.matches.length > 0 && tft.matches[0].units.length > 0 && tft.matches[0].placement >= 1);
    assert.strictEqual(tft.ranked[0].queue, "RANKED_TFT");
  } finally { u.close(); }
});
