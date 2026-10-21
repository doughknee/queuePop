// D14: build slots and the core count completed items only (Lolalytics' convention), from Data Dragon's recipe graph.
const test = require("node:test");
const assert = require("node:assert");
const { open, setMeta } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { completedIds } = require("../src/lol-items");

const DD = { data: {
  1001: { name: "Boots", into: ["3009"], tags: ["Boots"] },
  3009: { name: "Boots of Swiftness", from: ["1001"], into: ["3170"], tags: ["Boots"] },
  3170: { name: "Swiftmarch", from: ["3009"], tags: ["Boots"] },
  3067: { name: "Kindlegem", from: ["1028"], into: ["3190"], tags: ["Health"] },
  3190: { name: "Locket", from: ["3067"], tags: ["Health"] },
  1082: { name: "Dark Seal", into: ["3041"], tags: ["Lane"] },
  3041: { name: "Mejai's", from: ["1082"], tags: [] },
  2003: { name: "Health Potion", tags: ["Consumable"] },
  3865: { name: "World Atlas", tags: ["Lane"] },
  6697: { name: "Hubris", from: ["3134"], into: ["7777"] }, 7777: { name: "Masterwork", from: ["6697"], requiredAlly: "Ornn" },
} };

test("completed = has a recipe, not consumable, builds into nothing but tier-3 boots or Ornn upgrades", () => {
  assert.deepStrictEqual(completedIds(DD), [3009, 3041, 3170, 3190, 6697, 7777]);
});

test("slots and core skip components and starters", () => {
  const db = open(":memory:");
  setMeta(db, "lolItems", { version: "x", completed: completedIds(DD) });
  db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, fetched_at) VALUES ('M', 'lol', 'na1', 'DIAMOND', 'done', '16.20', 1)").run();
  db.prepare("INSERT INTO lol_participants (match_id, puuid, team, champion, role, win, items) VALUES ('M', 'a', 100, 1, 'UTILITY', 1, '[]')").run();
  // bought in order: Kindlegem, Boots of Swiftness, Locket, Dark Seal, Mejai's, Hubris
  db.prepare("INSERT INTO lol_timeline (match_id, puuid, build) VALUES ('M', 'a', ?)").run(JSON.stringify([[3067, 300], [3009, 400], [3190, 600], [1082, 700], [3041, 900], [6697, 1200]]));
  aggregate(db);
  const rows = db.prepare("SELECT slot, key, secs FROM stats_lol_build_order ORDER BY slot").all();
  assert.deepStrictEqual(rows.map((r) => [r.slot, String(r.key)]), [[0, "3009,3190,3041"], [1, "3009"], [2, "3190"], [3, "3041"], [4, "6697"]]);
  assert.strictEqual(rows[0].secs, 900, "core timed at its third item");
});

test("timeline: a completed item that later auto-upgraded (tier-2 boots) stays in the build", () => {
  const { parseTimeline } = require("../src/timeline");
  const ev = (t, itemId) => ({ type: "ITEM_PURCHASED", participantId: 1, itemId, timestamp: t });
  const tl = { info: { participants: [{ participantId: 1, puuid: "a" }], frames: [{ events: [ev(100000, 1001), ev(400000, 3009), ev(600000, 3190), ev(700000, 3067)] }] } };
  // final inventory holds the tier-3 boots 3170 (auto-upgraded, never purchased) and Locket
  const fin = { a: [3170, 3190] };
  assert.deepStrictEqual(parseTimeline(tl, fin).a.build.map((x) => x[0]), [3190], "without the completed list: boots lost");
  assert.deepStrictEqual(parseTimeline(tl, fin, new Set(completedIds(DD))).a.build.map((x) => x[0]), [3009, 3190], "with it: Swiftness kept, Kindlegem (sold component) still out");
});

test("item lists per patch: refreshItems keeps the two newest patches, aggregation uses each patch's own", async () => {
  const { refreshItems, loadCompleted } = require("../src/lol-items");
  const db = open(":memory:");
  const old = JSON.parse(JSON.stringify(DD)); delete old.data["6697"]; // 16.20 has no Hubris yet
  const fetchJson = async (u) => u.endsWith("versions.json") ? ["16.21.1", "16.20.1", "16.20.0", "16.19.1"] : u.includes("/16.21.1/") ? DD : old;
  const m = await refreshItems(db, { fetchJson });
  assert.strictEqual(m.version, "16.21.1");
  const ids = () => db.prepare("SELECT id FROM temp.lol_completed ORDER BY id").all().map((r) => r.id);
  loadCompleted(db, "16.20"); assert.ok(!ids().includes(6697), "16.20's list");
  loadCompleted(db, "16.21"); assert.ok(ids().includes(6697), "16.21's list");
  loadCompleted(db, "16.19"); assert.ok(ids().includes(6697), "unknown patch: the newest");
});
