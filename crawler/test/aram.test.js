// D13: ARAM (queue 450) stored under "<patch>-aram", served with ?queue=450, kept out of ranked stats; discovery capped by share.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { store, aggregate, capped } = require("../src/jobs");
const { lolTiers, lolChampion, patches } = require("../src/server");

const ranked = require("../fixtures/lol-match-1.json");
const aram = JSON.parse(JSON.stringify(ranked));
aram.metadata.matchId = "NA1_777";
aram.info.queueId = 450;
for (const p of aram.info.participants) { p.teamPosition = ""; p.championId = 999; }

test("ARAM rows live under <patch>-aram and only ?queue=450 sees them", () => {
  const db = open(":memory:");
  const ctx = { db, queues: [420, 440, 450, 1100] };
  for (const m of [ranked, aram]) {
    db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES (?, 'lol', 'na1', 'DIAMOND')").run(m.metadata.matchId);
    store(ctx, "lol", m.metadata.matchId, m);
  }
  aggregate(db);
  const p = patches(db);
  assert.deepStrictEqual([p.lol, p.aram, p.default.lol], [["16.20"], ["16.20"], "16.20"], "ARAM never becomes the League default");
  assert.ok(!lolTiers(db, {}).champions.some((c) => c.champion === 999), "ranked tier list has no ARAM games");
  const a = lolTiers(db, { queue: "450" });
  assert.deepStrictEqual([a.patch, a.queue, a.matches, a.champions.map((c) => c.champion)], ["16.20-aram", 450, 1, [999]]);
  assert.strictEqual(lolTiers(db, { queue: "aram", patch: "16.20" }).patch, "16.20-aram");
  assert.strictEqual(lolChampion(db, 999, { queue: "450" }).strip.games, 10);
  assert.throws(() => lolTiers(db, { queue: "900" }), (e) => e.status === 400);
});

test("capped discovery stops at the configured share of the region's League fetches", async () => {
  const db = open(":memory:");
  let calls = 0;
  const riot = { get: async () => { calls++; return ["NA1_A1", "NA1_A2"]; } };
  const ctx = { db, riot, queues: [420, 450], shares: { 450: 0.1 }, now: () => 1e12 };
  db.prepare("INSERT INTO players (puuid, game, region, tier, tier_n) VALUES ('p', 'lol', 'na1', 'DIAMOND', 6), ('q', 'lol', 'na1', 'GOLD', 3)").run();
  const m = db.prepare("INSERT INTO matches (id, game, region, status, queue, fetched_at) VALUES (?, 'lol', 'na1', 'done', ?, ?)");
  for (let i = 0; i < 18; i++) m.run("R" + i, 420, 1e12 - 1000);
  assert.strictEqual(await capped({ ...ctx, modeEvery: 0 }, "na1"), true, "0 of 18 is under 10%");
  assert.deepStrictEqual(db.prepare("SELECT id, queue, status FROM matches WHERE queue = 450 ORDER BY id").all().map((r) => [r.id, r.queue, r.status]), [["NA1_A1", 450, "new"], ["NA1_A2", 450, "new"]]);
  assert.strictEqual(await capped({ ...ctx, modeEvery: 0 }, "na1"), false, "2 waiting of 20 reaches 10%");
  assert.strictEqual(calls, 1);
  assert.strictEqual(await capped({ ...ctx, queues: [420] }, "na1"), false, "off without queue 450");
  // request gate: one ids call per region and queue per minute, even under the share
  db.prepare("DELETE FROM matches WHERE queue = 450").run();
  db.prepare("DELETE FROM mode_players").run();
  const t = { v: 2e12 }, gated = { ...ctx, now: () => t.v };
  assert.strictEqual(await capped(gated, "oc1"), false, "no oc1 players");
  db.prepare("UPDATE players SET region = 'oc1'").run();
  assert.strictEqual(await capped(gated, "oc1"), true);
  db.prepare("DELETE FROM matches WHERE queue = 450").run();
  assert.strictEqual(await capped(gated, "oc1"), false, "gated within the minute");
  t.v += 60001;
  assert.strictEqual(await capped(gated, "oc1"), true, "allowed again after a minute: the other ranked player");
  t.v += 60001;
  assert.strictEqual(await capped(gated, "oc1"), false, "both ranked players asked within 6 h");
});

test("an ARAM match's players are asked for ARAM next (snowball), normal and swift have their own share", async () => {
  const db = open(":memory:");
  const asked = [];
  const riot = { get: async (_r, path) => { asked.push(path); return []; } };
  db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES ('NA1_777', 'lol', 'na1', NULL)").run();
  store({ db, queues: [420, 450], now: () => 0 }, "lol", "NA1_777", aram);
  assert.strictEqual(db.prepare("SELECT count(*) n FROM mode_players WHERE queue = 450 AND region = 'na1' AND asked_at IS NULL").get().n, 10);
  const ctx = { db, riot, queues: [420, 450, 400, 480, 490], modeEvery: 0, now: () => Date.now() };
  assert.strictEqual(await capped(ctx, "na1"), true);
  const [, who, q] = /by-puuid\/(.+)\/ids\?queue=(\d+)&/.exec(asked[0]);
  assert.ok(aram.info.participants.some((p) => p.puuid === who) && q === "450", "asks an ARAM player for ARAM");
  // 1 ARAM fetched of 1: ARAM is over its share, so the next call goes to normal (a ranked player: no normal match seen yet)
  db.prepare("UPDATE matches SET fetched_at = ? WHERE id = 'NA1_777'").run(Date.now());
  db.prepare("INSERT INTO players (puuid, game, region, tier, tier_n) VALUES ('r', 'lol', 'na1', 'GOLD', 3)").run();
  assert.strictEqual(await capped(ctx, "na1"), true);
  assert.match(asked[1], /\/by-puuid\/r\/ids\?queue=400&/);
});
