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
  put(db, solo); put(db, as("F", 440, 901)); put(db, as("A", 450, 902));
  db.prepare("DELETE FROM mode_players").run(); // as stored before DONI-596
  db.prepare("UPDATE matches SET patch = '16.20' WHERE id = 'F'").run(); // as stored before DONI-596
  aggregate(db);
  assert.ok(lolTiers(db, {}).champions.some((c) => c.champion === 901), "before: flex mixed into solo");
  assert.deepStrictEqual(backfillModes(db), { retagged: 1, patches: ["16.20", "16.20-flex"], seeded: 10 });
  assert.deepStrictEqual(backfillModes(db).retagged, 0, "idempotent");
  assert.strictEqual(aggregate(db), 2, "both patches dirty although no match was fetched");
  assert.ok(!lolTiers(db, {}).champions.some((c) => c.champion === 901));
  assert.strictEqual(lolTiers(db, { queue: "440" }).matches, 1);
  assert.strictEqual(aggregate(db), 0, "dirty list cleared");
});

test("TFT Double Up (1160) is stored as its own mode, not skipped (DONI-615)", () => {
  const { tftComps } = require("../src/server");
  const db = open(":memory:");
  const ranked = require("../fixtures/tft-match-1.json");
  const du = JSON.parse(JSON.stringify(ranked)); du.metadata.match_id = "NA1_DU"; du.info.queue_id = 1160;
  const ctx = { db, queues: [1100, 1160] };
  for (const [id, m] of [[ranked.metadata.match_id, ranked], ["NA1_DU", du]]) {
    db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES (?, 'tft', 'na1', 'DIAMOND')").run(id);
    store(ctx, "tft", id, m);
  }
  const row = db.prepare("SELECT status, patch FROM matches WHERE id = 'NA1_DU'").get();
  assert.ok(row.status === "done" && row.patch.endsWith("-doubleup"), "stored, under -doubleup");
  aggregate(db);
  const p = patches(db), base = p.tft[0];
  assert.deepStrictEqual([p.tft, p.doubleup, p.counts.doubleup[base]], [[base], [base], 1]);
  assert.strictEqual(tftComps(db, {}).boards, 8, "ranked comps have no Double Up boards");
  const d = tftComps(db, { queue: "doubleup" });
  assert.deepStrictEqual([d.patch, d.queue, d.boards], [base + "-doubleup", 1160, 8]);
  assert.strictEqual(tftComps(db, { patch: base + "-doubleup" }).boards, 8, "the app's suffixed patch picks the mode");
  assert.throws(() => tftComps(db, { queue: "420" }), (e) => e.status === 400);
});
