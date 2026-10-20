// D9: /lol/match/{id}, /tft/match/{id} from raw, from rows after retention, and from Riot for unknown ids.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { store } = require("../src/jobs");
const { Limiter } = require("../src/limiter");
const { createClient } = require("../src/riot");
const { createServer } = require("../src/server");
const { createLookup } = require("../src/lookup");
const { startMock } = require("../src/mock");

test("match detail: raw, rows, riot", async () => {
  const mock = await startMock(0);
  const db = open(":memory:");
  const ctx = { db, queues: [420, 440, 1100] };
  for (const [game, f] of [["lol", "lol-match-1"], ["tft", "tft-match-1"]]) {
    const m = require(`../fixtures/${f}.json`), id = m.metadata.matchId || m.metadata.match_id;
    db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES (?, ?, 'na1', 'DIAMOND')").run(id, game);
    store(ctx, game, id, m);
  }
  const riot = createClient({ key: "k", base: mock.url, limiter: new Limiter() });
  const api = createServer({ db, version: "t", lookup: createLookup({ db, riot, perMin: 2 }) });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${api.address().port}${p}`); return [r.status, await r.json()]; };
  try {
    const [, lol] = await get("/lol/match/NA1_520000001");
    assert.strictEqual(lol.source, "raw");
    assert.strictEqual(lol.participants.length, 10);
    const p = lol.participants[0];
    assert.ok(p.riotId && p.kills != null && p.damage > 0 && p.items.length && p.runes.length === 2 && p.spells.length === 2);
    assert.strictEqual(lol.teams.length, 2);
    assert.ok("baron" in lol.teams[0].objectives);

    const [, tft] = await get("/tft/match/NA1_530000001");
    assert.deepStrictEqual([tft.source, tft.participants.length, tft.participants[0].placement], ["raw", 8, 1]);
    assert.ok(tft.participants[0].units[0].length === 3);

    db.prepare("UPDATE matches SET raw = NULL").run();
    const [, rows] = await get("/lol/match/NA1_520000001");
    assert.deepStrictEqual([rows.source, rows.participants.length, rows.participants[0].kills], ["rows", 10, null]);
    assert.ok(rows.participants[0].items.length > 0 && rows.participants[0].riotId);
    const [, trows] = await get("/tft/match/NA1_530000001");
    assert.deepStrictEqual([trows.source, trows.participants.length], ["rows", 8]);

    const [s, fetched] = await get("/lol/match/NA1_520000002");
    assert.deepStrictEqual([s, fetched.source, fetched.participants.length], [200, "riot", 10]);
    assert.strictEqual((await get("/lol/match/NA1_999"))[0], 404);
    assert.strictEqual((await get("/lol/match/NA1_998"))[0], 429, "on-demand fetches share the lookup cap");
    assert.strictEqual((await get("/lol/match/nope"))[0], 400);
  } finally { api.close(); mock.server.close(); }
});
