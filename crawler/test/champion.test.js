// DONI-507: timeline parsing on a fixture timeline; objectives, synergies, starting/build/skills on a hand-built set.
const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { lolChampion } = require("../src/server");
const { parseTimeline } = require("../src/timeline");
const { storeTimeline, objectiveRows } = require("../src/agg-champion");

test("timeline parse: starting items, early items, build order, full skill order", () => {
  const m = require("../fixtures/lol-match-1.json"), tl = require("../fixtures/lol-timeline-1.json");
  const fin = Object.fromEntries(m.info.participants.map((p) => [p.puuid, [0, 1, 2, 3, 4, 5].map((k) => p["item" + k]).filter(Boolean)]));
  const p1 = parseTimeline(tl, fin)[m.info.participants[0].puuid];
  // 3006 bought at 1:35 and undone, rebought at 3:00; 2055 is a consumable; the 1055 sale doesn't touch the start set
  assert.deepStrictEqual(p1, {
    start: "1055,2003,2003", early: [3006, 3153, 3074],
    build: [[3006, 180], [3153, 360], [3074, 540]], skills: "WQEWWRWWQQRQQEEREE",
  });
  // EVOLVE level-ups are not skill points; an undo with no matching buy is ignored
  const tiny = { info: { participants: [{ participantId: 1, puuid: "x" }], frames: [{ events: [
    { type: "SKILL_LEVEL_UP", participantId: 1, skillSlot: 1, levelUpType: "NORMAL", timestamp: 1 },
    { type: "SKILL_LEVEL_UP", participantId: 1, skillSlot: 4, levelUpType: "EVOLVE", timestamp: 2 },
    { type: "ITEM_UNDO", participantId: 1, beforeId: 1001, afterId: 0, timestamp: 3 },
  ] }] } };
  assert.deepStrictEqual(parseTimeline(tiny).x, { start: "", early: [], build: [], skills: "Q" });
});

test("objective rows: first flags per team, soul from 4 dragons", () => {
  const team = (teamId, o) => ({ teamId, objectives: o });
  const rows = objectiveRows({ teams: [
    team(100, { champion: { first: true }, tower: { first: false }, dragon: { first: true, kills: 4 }, baron: { first: false } }),
    team(200, { champion: { first: false }, tower: { first: true }, dragon: { first: false, kills: 1 }, baron: { first: false } }),
  ] });
  const of = (t, o) => rows.find((r) => r[0] === t && r[1] === o)[2];
  assert.strictEqual(of(100, "first_blood"), 1);
  assert.strictEqual(of(200, "first_blood"), -1);
  assert.strictEqual(of(100, "first_tower"), -1);
  assert.strictEqual(of(100, "baron"), 0, "nobody took baron");
  assert.strictEqual(of(100, "soul"), 1);
  assert.strictEqual(of(200, "soul"), -1);
});

// Two matches, Ahri (103) MIDDLE on blue both times: wins A (her team took first blood), loses B (enemy took it).
function build() {
  const db = open(":memory:");
  const match = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, raw) VALUES (?, 'lol', 'na1', 'DIAMOND', 'done', '16.20', ?)");
  const lol = db.prepare("INSERT INTO lol_participants VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 8112, '[8112]', '4,14', NULL)");
  const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  const games = [["A", 100, [86, 64, 103, 222, 412], [122, 11, 1, 22, 25]], ["B", 200, [86, 64, 103, 222, 53], [266, 11, 1, 145, 412]]];
  for (const [id, winner, blue, red] of games) {
    const fb = id === "A" ? 100 : 200;
    const info = { teams: [100, 200].map((t) => ({ teamId: t, objectives: { champion: { first: t === fb, kills: 5 }, dragon: { first: false, kills: 0 } } })) };
    match.run(id, zlib.gzipSync(JSON.stringify({ info })));
    for (const [team, champs] of [[100, blue], [200, red]]) champs.forEach((c, i) => lol.run(id, `${id}${c}`, team, c, roles[i], team === winner ? 1 : 0, c === 103 ? "[3078,3020,6672,3089]" : "[]"));
    // Ahri's timeline: Doran's + 2 pots, Tear early, build 3020 -> 3078 -> 6672 (3089 in A only)
    const ev = [[1055, 5000], [2003, 6000], [2003, 7000], [3070, 300000], [3020, 500000], [3078, 700000], [6672, 900000], ...(id === "A" ? [[3089, 1100000]] : [])]
      .map(([itemId, timestamp]) => ({ type: "ITEM_PURCHASED", participantId: 3, itemId, timestamp }));
    const sk = [1, 3, 2, 1, 1, 4, 1, 1, 3, 3, 4, 3, 3, 2, 2, 4].map((skillSlot, t) => ({ type: "SKILL_LEVEL_UP", participantId: 3, skillSlot, levelUpType: "NORMAL", timestamp: 60000 * t }));
    storeTimeline(db, id, { info: { participants: [{ participantId: 3, puuid: `${id}103` }], frames: [{ events: [...ev, ...sk] }] } });
  }
  aggregate(db);
  return db;
}

test("champion depth: objectives, sides, synergies, starting, build order, skills", () => {
  const c = lolChampion(build(), 103, { min_games: 2 });
  const fb = c.objectives.find((o) => o.objective === "first_blood");
  assert.deepStrictEqual(fb, { objective: "first_blood", games: 2, secured: 1, securedRate: 0.5, securedWinRate: 1, yielded: 1, yieldedRate: 0.5, yieldedWinRate: 0, lowSample: false });
  assert.deepStrictEqual(c.objectives.find((o) => o.objective === "first_dragon"), { objective: "first_dragon", games: 0, secured: 0, securedRate: 0, securedWinRate: null, yielded: 0, yieldedRate: 0, yieldedWinRate: null, lowSample: true });
  assert.deepStrictEqual(c.sides, { blue: { games: 2, winRate: 0.5 }, red: { games: 0, winRate: 0 } });

  const ally = (id) => c.synergies.find((s) => s.ally === id);
  assert.deepStrictEqual(ally(86), { ally: 86, role: "TOP", games: 2, winRate: 0.5, pickRate: 1, lowSample: false, delta1: 0, delta2: 0 });
  assert.strictEqual(ally(412).games, 1);
  assert.ok(!c.synergies.some((s) => s.ally === 103), "not your own teammate");

  assert.strictEqual(c.timelineGames, 2);
  assert.deepStrictEqual(c.starting, [{ key: "1055,2003,2003", games: 2, winRate: 0.5, pickRate: 1, lowSample: false }]);
  assert.deepStrictEqual(c.early.map((e) => e.key).sort(), ["3020", "3070"], "Tear and boots by 10:00; 3078 at 11:40 is not early");
  assert.deepStrictEqual(c.buildOrder.core, [{ key: "3020,3078,6672", games: 2, winRate: 0.5, pickRate: 1, lowSample: false, avgMinute: 15 }]);
  assert.deepStrictEqual(c.buildOrder.slots[3], [{ key: "3089", games: 1, winRate: 1, pickRate: 1, lowSample: true, avgMinute: 18.3 }]);
  assert.deepStrictEqual(c.buildOrder.slots[4], []);
  assert.deepStrictEqual(c.skills[6], [{ key: "QEWQQR", games: 2, winRate: 0.5, pickRate: 1, lowSample: false }]);
  assert.strictEqual(c.skills[15][0].key, "QEWQQRQQEEREEWW");
  assert.deepStrictEqual(c.matchups.map((m) => [m.opponent, m.delta1]), [[1, 0]]);
});
