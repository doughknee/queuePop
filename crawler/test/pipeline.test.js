// Whole pipeline on fixtures: mock Riot server -> seed -> ids -> fetch -> aggregate -> HTTP API.
const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");
const { open } = require("../src/db");
const jobs = require("../src/jobs");
const { Limiter } = require("../src/limiter");
const { createClient } = require("../src/riot");
const { createServer } = require("../src/server");
const { startMock } = require("../src/mock");

test("crawl fixtures end to end and serve a non-empty tier list", async () => {
  const mock = await startMock(0, { fail429Once: true });
  const db = open(":memory:");
  const limiter = new Limiter();
  const ctx = { db, riot: createClient({ key: "test", base: mock.url, limiter }), minTier: "EMERALD", queues: [420, 440, 1100], timelineSample: 1 };
  const api = createServer({ db, limiter, version: "test" });
  try {
    for (const g of ["lol", "tft"]) {
      assert.strictEqual(await jobs.seed(ctx, g, "na1"), true);
      assert.strictEqual(await jobs.seed(ctx, g, "na1"), false, "seeded today already");
      while (await jobs.ids(ctx, g, "na1"));
      while (await jobs.fetchOne(ctx, g, "na1"));
    }
    assert.strictEqual(mock.stats.served429, 1, "first call got a 429 and was retried");
    const count = (g, s) => db.prepare("SELECT count(*) n FROM matches WHERE game = ? AND status = ?").get(g, s).n;
    assert.strictEqual(db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n, 20);
    assert.strictEqual(count("lol", "done"), 3);
    assert.strictEqual(count("tft", "done"), 2);
    assert.strictEqual(count("tft", "skip"), 1, "normal-queue TFT game skipped");
    const raw = db.prepare("SELECT raw FROM matches WHERE id = 'NA1_520000001'").get().raw;
    assert.strictEqual(JSON.parse(zlib.gunzipSync(raw)).metadata.matchId, "NA1_520000001");

    jobs.aggregate(db);
    await new Promise((r) => api.listen(0, "127.0.0.1", r));
    const get = async (p) => { const r = await fetch(`http://127.0.0.1:${api.address().port}${p}`); return [r.status, await r.json(), r.headers]; };

    const [, tiers, headers] = await get("/lol/tiers?region=na1&bracket=emerald");
    assert.strictEqual(headers.get("access-control-allow-origin"), "*");
    assert.strictEqual(tiers.patch, "16.20");
    assert.strictEqual(tiers.matches, 3);
    assert.ok(tiers.champions.length > 0, "non-empty tier list");
    const champ = tiers.champions[0];
    const [, page] = await get(`/lol/champion/${champ.champion}?role=${champ.role}`);
    assert.strictEqual(page.strip.games, champ.games);
    assert.ok(page.builds.item.length && page.builds.keystone.length && page.builds.spells.length && page.builds.skills.length);
    assert.strictEqual(db.prepare("SELECT count(*) n FROM lol_participants WHERE skills IS NULL").get().n, 0, "every sampled match got skill orders");
    assert.ok(tiers.champions.every((c) => c.games > 0 && c.lowSample === true), "rows kept and flagged under min_games 200");

    const [, comps] = await get("/tft/comps");
    assert.strictEqual(comps.boards, 16);
    assert.ok(comps.comps.length > 0);
    const [, comp] = await get(`/tft/comp/${encodeURIComponent(comps.comps[0].id)}`);
    assert.ok(comp.units.length > 0);

    assert.deepStrictEqual((await get("/patches"))[1], { lol: ["16.20"], tft: ["16.20"] });
    const [, status] = await get("/status");
    assert.strictEqual(status.matches.lol.done, 3);
    assert.ok(status.rateLimits.na1 && status.rateLimits.americas);
    assert.deepStrictEqual((await get("/health"))[1], { ok: true, version: "test" });
    assert.strictEqual((await get("/lol/tiers?bracket=wood"))[0], 400);
    assert.strictEqual((await get("/nope"))[0], 404);
  } finally {
    api.close();
    mock.server.close();
  }
});
