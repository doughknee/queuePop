// A personal key is a new Riot app, and Riot encrypts puuids per app: stored puuids answer 400 "Exception decrypting". The
// crawl retires the stored players (kept, not deleted), re-seeds from the ladders and resumes discovery.
const test = require("node:test");
const assert = require("node:assert");
const { open, getMeta } = require("../src/db");
const jobs = require("../src/jobs");
const { Limiter } = require("../src/limiter");
const { createClient } = require("../src/riot");
const { startMock } = require("../src/mock");
const { leaderboard } = require("../src/lookup");

test("stored puuids from another app: decrypt error, players retired, re-seeded, ids resume", async () => {
  const mock = await startMock(0, { foreignPrefix: "OLD_" });
  const db = open(":memory:");
  const ctx = { db, riot: createClient({ key: "k", base: mock.url, limiter: new Limiter() }), minTier: "EMERALD", queues: [420, 440, 450] };
  try {
    for (const g of ["lol", "tft"]) while (!getMeta(db, `seed:${g}:na1`)?.doneAt) await jobs.seed(ctx, g, "na1");
    const n = db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n;
    // as if seeded under the old key's app
    db.exec("UPDATE players SET puuid = 'OLD_' || puuid WHERE game = 'lol'"); // League got its own personal key, TFT didn't yet
    const tft = db.prepare("SELECT count(*) n FROM players WHERE game = 'tft'").get().n;
    db.exec("INSERT INTO mode_players (puuid, region, queue) SELECT puuid, region, 450 FROM players LIMIT 3");
    const err = await jobs.ids(ctx, "lol", "na1").then(() => null, (e) => e);
    assert.ok(err?.decrypt && err.game === "lol" && err.puuid.startsWith("OLD_"), "400 decrypt flagged with game and puuid");
    assert.strictEqual(jobs.retirePuuids(db, err.puuid, "tft"), false, "not a TFT player");
    assert.strictEqual(jobs.retirePuuids(db, err.puuid, err.game), true);
    assert.strictEqual(jobs.retirePuuids(db, err.puuid, err.game), false, "one retirement at a time");
    assert.strictEqual(await jobs.ids(ctx, "lol", "na1"), false, "during the move, old rows are never asked (no decrypt errors)");
    let batches = 0;
    while (jobs.retireBatch(db, "lol", 7)) batches++; // the crawl loop's batches
    assert.ok(batches >= Math.ceil(n / 7), "moved in batches");
    assert.deepStrictEqual(db.prepare("SELECT game, count(*) n FROM players GROUP BY game ORDER BY game").all().map((r) => [r.game, r.n]), [["lol-stale", n], ["tft", tft]], "League kept and retired, TFT untouched");
    assert.strictEqual(db.prepare("SELECT count(*) n FROM mode_players WHERE region NOT LIKE '%-stale'").get().n, 0);
    assert.strictEqual(leaderboard(db, "lol").players.length, 0, "leaderboard skips retired rows");
    assert.strictEqual(jobs.retirePuuids(db, err.puuid, "lol"), false, "a late error for a retired puuid changes nothing");
    assert.strictEqual(await jobs.seed(ctx, "lol", "na1"), true, "seed state was reset: the ladder walk runs again");
    assert.ok(db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n > 0, "the first page (Challenger) is back at once");
    while (!getMeta(db, "seed:lol:na1")?.doneAt) await jobs.seed(ctx, "lol", "na1");
    assert.strictEqual(db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n, n, "fresh puuids");
    assert.strictEqual(await jobs.ids(ctx, "lol", "na1"), true, "discovery resumes");
    assert.ok(db.prepare("SELECT count(*) n FROM matches").get().n > 0);
  } finally { mock.server.close(); }
});

test("a key per game: League and TFT calls carry their own key and get their own rate-limit lane", async () => {
  const { setKey, riotKey, keyHealth, markKeyBad } = require("../src/db");
  const mock = await startMock(0);
  const db = open(":memory:"), limiter = new Limiter();
  const riot = createClient({ key: (g) => riotKey(db, "RGAPI-env", g).key, base: mock.url, limiter });
  try {
    await riot.get("americas", "/lol/match/v5/matches/NA1_520000001", "lol match");
    assert.strictEqual(mock.stats.lastKey, "RGAPI-env");
    assert.ok(limiter.state().americas, "one key: one shared lane");
    setKey(db, "RGAPI-tft", "tft");
    await riot.get("americas", "/tft/match/v1/matches/NA1_530000001", "tft match");
    assert.strictEqual(mock.stats.lastKey, "RGAPI-tft");
    await riot.get("americas", "/lol/match/v5/matches/NA1_520000001", "lol match");
    assert.strictEqual(mock.stats.lastKey, "RGAPI-env", "League still on the shared key");
    assert.ok(limiter.state()["americas/tft"] && limiter.state()["americas/lol"], "two keys: a lane each");
    markKeyBad(db, "RGAPI-env", "401 Unknown apikey", 1, "RGAPI-tft");
    assert.deepStrictEqual([keyHealth(db, "RGAPI-env", "lol").valid, keyHealth(db, "RGAPI-env", "tft").valid, keyHealth(db, "RGAPI-env").valid], [true, false, false]);
    setKey(db, "RGAPI-tft2", "tft");
    assert.strictEqual(keyHealth(db, "RGAPI-env", "tft").valid, true, "a new TFT key is trusted");
  } finally { mock.server.close(); }
});
