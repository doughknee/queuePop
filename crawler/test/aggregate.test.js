// Aggregation math on a hand-built set: 2 League matches (20 participants) and 1 TFT lobby (8 boards).
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { lolTiers, lolChampion, tftComps, tftComp } = require("../src/server");

function build() {
  const db = open(":memory:");
  const match = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch) VALUES (?, ?, ?, ?, 'done', '16.20')");
  const lol = db.prepare("INSERT INTO lol_participants VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 8112, '[8112]', '4,14')");
  const ban = db.prepare("INSERT INTO lol_bans VALUES (?, ?, ?)");
  const roles = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];
  // [matchId, region, bracket, winning team, blue champs, red champs]
  const games = [
    ["A", "na1", "DIAMOND", 100, [86, 64, 103, 222, 412], [122, 11, 1, 22, 25]],
    ["B", "euw1", "MASTER", 200, [86, 64, 1, 222, 53], [266, 11, 103, 145, 412]],
  ];
  for (const [id, region, bracket, winner, blue, red] of games) {
    match.run(id, "lol", region, bracket);
    for (const [team, champs] of [[100, blue], [200, red]]) {
      champs.forEach((c, i) => {
        const items = c === 103 ? (id === "A" ? [3089, 3020] : [3089]) : [1001];
        lol.run(id, `${id}${team}${i}`, team, c, roles[i], team === winner ? 1 : 0, JSON.stringify(items));
      });
    }
  }
  ban.run("A", 100, 157); ban.run("A", 200, 157); ban.run("A", 100, 517); ban.run("B", 200, 157);

  match.run("T", "tft", "na1", "DIAMOND");
  const tft = db.prepare("INSERT INTO tft_participants VALUES ('T', ?, ?, NULL, ?, '[]', ?, '[]')");
  for (const [placement, comp] of [[1, "A,B"], [3, "A,B"], [6, "A,B"], [2, "none"], [8, "none"], [4, "C"], [5, "C"], [7, "C"]]) {
    tft.run("p" + placement, placement, comp, JSON.stringify(comp === "A,B" ? ["X", "Y"] : ["Z"]));
  }
  aggregate(db);
  return db;
}

test("League tier list: win, pick and ban rates", () => {
  const db = build();
  const t = lolTiers(db);
  assert.strictEqual(t.patch, "16.20");
  assert.strictEqual(t.matches, 2);
  const row = (c, r) => t.champions.find((x) => x.champion === c && x.role === r);
  assert.deepStrictEqual(row(103, "MIDDLE"), { champion: 103, role: "MIDDLE", games: 2, wins: 2, winRate: 1, pickRate: 1, banRate: 0 });
  assert.strictEqual(row(1, "MIDDLE").winRate, 0);
  assert.strictEqual(row(86, "TOP").winRate, 0.5);
  assert.strictEqual(row(412, "UTILITY").winRate, 1);
  assert.strictEqual(row(266, "TOP").pickRate, 0.5);
  assert.strictEqual(t.champions.length, 13);
  assert.strictEqual(t.champions.reduce((s, c) => s + c.games, 0), 20);

  const bans = lolChampion(db, 157);
  assert.strictEqual(bans.strip.banRate, 1); // banned in both matches (twice in A counts once)
  assert.strictEqual(lolChampion(db, 517).strip.banRate, 0.5);

  // filters
  assert.strictEqual(lolTiers(db, { bracket: "master" }).matches, 1);
  assert.strictEqual(lolTiers(db, { bracket: "diamond" }).matches, 2);
  const na = lolTiers(db, { region: "na1", role: "top" });
  assert.deepStrictEqual(na.champions.map((c) => [c.champion, c.winRate]).sort(), [[122, 0], [86, 1]]);
});

test("League champion page: strip, builds, matchups", () => {
  const c = lolChampion(build(), 103);
  assert.strictEqual(c.role, "MIDDLE");
  assert.deepStrictEqual(c.strip, { games: 2, wins: 2, winRate: 1, pickRate: 1, banRate: 0, matches: 2 });
  assert.deepStrictEqual(c.builds.item, [{ key: "3089", games: 2, winRate: 1, pickRate: 1 }, { key: "3020", games: 1, winRate: 1, pickRate: 0.5 }]);
  assert.deepStrictEqual(c.builds.spells, [{ key: "4,14", games: 2, winRate: 1, pickRate: 1 }]);
  assert.deepStrictEqual(c.matchups, [{ opponent: 1, games: 2, winRate: 1 }]);
  const garen = lolChampion(build(), 86);
  assert.deepStrictEqual(garen.matchups.sort((a, b) => a.opponent - b.opponent), [{ opponent: 122, games: 1, winRate: 1 }, { opponent: 266, games: 1, winRate: 0 }]);
});

test("TFT comps: avg placement, top-4, pick rate", () => {
  const db = build();
  const t = tftComps(db);
  assert.strictEqual(t.boards, 8);
  const ab = t.comps.find((c) => c.id === "A,B");
  assert.deepStrictEqual(ab, { id: "A,B", traits: ["A", "B"], games: 3, avgPlacement: 3.3333, top4Rate: 0.6667, winRate: 0.3333, pickRate: 0.375 });
  assert.strictEqual(t.comps.find((c) => c.id === "C").avgPlacement, 5.3333);
  assert.deepStrictEqual(t.comps.find((c) => c.id === "none").traits, []);
  const d = tftComp(db, "A,B");
  assert.deepStrictEqual(d.units.find((u) => u.key === "X"), { key: "X", games: 3, frequency: 1, avgPlacement: 3.3333, top4Rate: 0.6667 });
  assert.strictEqual(tftComp(db, "nope"), null);
});
