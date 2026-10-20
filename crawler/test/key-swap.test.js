// A personal key is a new Riot app, and Riot encrypts puuids per app: stored puuids answer 400 "Exception decrypting". The
// crawl retires the stored players (kept, not deleted), re-seeds from the ladders and resumes discovery.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
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
    await jobs.seed(ctx, "lol", "na1");
    const n = db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n;
    // as if seeded under the old key's app
    db.exec("UPDATE players SET puuid = 'OLD_' || puuid");
    db.exec("INSERT INTO mode_players (puuid, region, queue) SELECT puuid, region, 450 FROM players LIMIT 3");
    const err = await jobs.ids(ctx, "lol", "na1").then(() => null, (e) => e);
    assert.ok(err?.decrypt && err.puuid.startsWith("OLD_"), "400 decrypt flagged with the puuid");
    assert.strictEqual(jobs.retirePuuids(db, err.puuid), true);
    assert.deepStrictEqual(db.prepare("SELECT game, count(*) n FROM players GROUP BY game").all().map((r) => [r.game, r.n]), [["lol-stale", n]], "kept, retired");
    assert.strictEqual(db.prepare("SELECT count(*) n FROM mode_players WHERE region NOT LIKE '%-stale'").get().n, 0);
    assert.strictEqual(leaderboard(db, "lol").players.length, 0, "leaderboard skips retired rows");
    assert.strictEqual(jobs.retirePuuids(db, err.puuid), false, "a late error for a retired puuid changes nothing");
    assert.strictEqual(await jobs.seed(ctx, "lol", "na1"), true, "seed state was reset: the ladder walk runs again");
    assert.strictEqual(db.prepare("SELECT count(*) n FROM players WHERE game = 'lol'").get().n, n, "fresh puuids");
    assert.strictEqual(await jobs.ids(ctx, "lol", "na1"), true, "discovery resumes");
    assert.ok(db.prepare("SELECT count(*) n FROM matches").get().n > 0);
  } finally { mock.server.close(); }
});
