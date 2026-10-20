// DONI-596: flex / normal / swift live under "<patch>-<mode>" like ARAM; ?queue maps to the suffix; backfill-modes re-tags old flex rows.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { store, aggregate, backfillModes } = require("../src/jobs");
const { lolTiers, patches } = require("../src/server");

const solo = require("../fixtures/lol-match-1.json");
const as = (id, queueId, champ) => { const m = JSON.parse(JSON.stringify(solo)); m.metadata.matchId = id; m.info.queueId = queueId; for (const p of m.info.participants) p.championId = champ; return m; };
const ctx = (db) => ({ db, queues: [420, 440, 450, 400, 480, 490, 1100] });
const put = (db, m) => { db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES (?, 'lol', 'na1', 'DIAMOND')").run(m.metadata.matchId); store(ctx(db), "lol", m.metadata.matchId, m); };

test("each queue gets its own suffix and ?queue picks it", () => {
  const db = open(":memory:");
  for (const m of [solo, as("F", 440, 901), as("N", 400, 902), as("S", 480, 903), as("Q", 490, 904)]) put(db, m);
  aggregate(db);
  const p = patches(db);
  assert.deepStrictEqual([p.lol, p.flex, p.normal, p.swift, p.counts.swift], [["16.20"], ["16.20"], ["16.20"], ["16.20"], { "16.20": 2 }]);
  const champs = (q) => new Set(lolTiers(db, q).champions.map((c) => c.champion));
  assert.ok(![901, 902, 903].some((c) => champs({}).has(c)), "solo has no other mode");
  for (const [queue, patch, id, c] of [["440", "16.20-flex", 440, 901], ["flex", "16.20-flex", 440, 901], ["400", "16.20-normal", 400, 902], ["490", "16.20-swift", 480, 904], ["480", "16.20-swift", 480, 903]]) {
    const t = lolTiers(db, { queue });
    assert.deepStrictEqual([t.patch, t.queue, champs({ queue }).has(c)], [patch, id, true], queue);
  }
  assert.strictEqual(lolTiers(db, { queue: "420" }).queue, undefined);
  assert.strictEqual(lolTiers(db, { patch: "16.20-normal" }).queue, 400, "a suffixed patch picks its mode");
  assert.throws(() => lolTiers(db, { queue: "constructor" }), (e) => e.status === 400);
});

test("backfill-modes moves old flex rows off the solo patch and the next pass rebuilds both", () => {
  const db = open(":memory:");
  put(db, solo); put(db, as("F", 440, 901));
  db.prepare("UPDATE matches SET patch = '16.20' WHERE id = 'F'").run(); // as stored before DONI-596
  aggregate(db);
  assert.ok(lolTiers(db, {}).champions.some((c) => c.champion === 901), "before: flex mixed into solo");
  assert.deepStrictEqual(backfillModes(db), { retagged: 1, patches: ["16.20", "16.20-flex"] });
  assert.deepStrictEqual(backfillModes(db).retagged, 0, "idempotent");
  assert.strictEqual(aggregate(db), 2, "both patches dirty although no match was fetched");
  assert.ok(!lolTiers(db, {}).champions.some((c) => c.champion === 901));
  assert.strictEqual(lolTiers(db, { queue: "440" }).matches, 1);
  assert.strictEqual(aggregate(db), 0, "dirty list cleared");
});
