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
    assert.ok(page.starting.length && page.buildOrder.slots[0].length && page.skills[15].length && page.objectives.length && page.synergies.length, "DONI-507 depth from timelines + raw");
    assert.strictEqual(db.prepare("SELECT count(*) n FROM lol_participants WHERE skills IS NULL").get().n, 0, "every sampled match got skill orders");
    assert.ok(tiers.champions.every((c) => c.games > 0 && c.lowSample === true), "rows kept and flagged under min_games 200");

    const [, comps] = await get("/tft/comps");
    assert.strictEqual(comps.boards, 16);
    assert.ok(comps.comps.length > 0);
    const [, comp] = await get(`/tft/comp/${encodeURIComponent(comps.comps[0].id)}`);
    assert.ok(comp.units.length > 0);

    const [, bySet] = await get("/tft/comps?set=16");
    assert.strictEqual(bySet.patch, "16.20");
    assert.strictEqual(bySet.set, 16);
    assert.strictEqual((await get("/tft/comps?set=99"))[1].patch, null, "no patch has that set");
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

test("TFT game_version parses to patch + set, and backfill-patch repairs '?' rows", () => {
  const info = { game_version: "Linux Version 16.20.717.3345 (Oct 14 2026/14:02:41) [PUBLIC]", tft_set_number: 16 };
  assert.strictEqual(jobs.patchOf(info), "16.20");
  assert.strictEqual(jobs.patchOf({ gameVersion: "16.19.1.2" }), "16.19");
  assert.strictEqual(jobs.setOf(info), 16);
  const db = open(":memory:");
  db.exec("INSERT INTO matches (id, game, region, bracket, status, patch, raw) VALUES ('A', 'tft', 'na1', 'DIAMOND', 'done', '?', NULL)");
  db.prepare("UPDATE matches SET raw = ? WHERE id = 'A'").run(zlib.gzipSync(JSON.stringify({ info })));
  db.exec("INSERT INTO matches (id, game, region, bracket, status, patch) VALUES ('B', 'tft', 'na1', 'DIAMOND', 'done', '?')"); // raw already nulled
  db.exec("INSERT INTO stats_tft_boards VALUES ('?', 'na1', 'DIAMOND', 5)");
  assert.deepStrictEqual({ ...jobs.backfillPatch(db) }, { scanned: 1, fixed: 1, unparsed: 0, sample: null });
  assert.deepStrictEqual({ ...db.prepare(`SELECT patch, "set" FROM matches WHERE id = 'A'`).get() }, { patch: "16.20", set: 16 });
  assert.strictEqual(db.prepare("SELECT count(*) n FROM stats_tft_boards").get().n, 0, "stale ? stats dropped");
  assert.strictEqual(jobs.backfillPatch(db).scanned, 0, "idempotent");
});

test("TFT placeholder game_version: patch comes from the League patch window containing game_datetime", () => {
  const db = open(":memory:");
  const lol = (id, patch, t) => db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, started_at) VALUES (?, 'lol', 'na1', 'EMERALD', 'done', ?, ?)").run(id, patch, t);
  lol("L1", "16.19", 1000); lol("L2", "16.19", 5000); lol("L3", "16.20", 9000); lol("L4", "16.20", 12000);
  const info = (t) => ({ game_version: "TFT Unreal Version ?.?.?.?", game_datetime: t, tft_set_number: 16 });
  const tft = (id, t) => db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, raw) VALUES (?, 'tft', 'na1', 'EMERALD', 'done', '?', ?)").run(id, zlib.gzipSync(JSON.stringify({ info: info(t) })));
  tft("T1", 6000); tft("T2", 10000); tft("T3", 500);
  assert.strictEqual(jobs.patchOf(info(1)), "?");
  assert.strictEqual(jobs.backfillPatch(db).fixed, 3);
  const got = Object.fromEntries(db.prepare("SELECT id, patch FROM matches WHERE game = 'tft'").all().map((r) => [r.id, r.patch]));
  assert.deepStrictEqual(got, { T1: "16.19", T2: "16.20", T3: "16.20" }, "before every window -> newest League patch");
  assert.strictEqual(jobs.backfillPatch(db).scanned, 0);
});
