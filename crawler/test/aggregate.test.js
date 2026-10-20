// Aggregation math on a hand-built set: 2 League matches (20 participants) and 1 TFT lobby (8 boards).
const test = require("node:test");
const assert = require("node:assert");
const { open, setMeta } = require("../src/db");
const { aggregate, retain, skillOrder } = require("../src/jobs");
const { lolTiers, lolChampion, tftComps, tftComp } = require("../src/server");

function build() {
  const db = open(":memory:");
  const match = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch) VALUES (?, ?, ?, ?, 'done', '16.20')");
  const lol = db.prepare("INSERT INTO lol_participants VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 8112, '[8112]', '4,14', ?)");
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
        // Ahri got a timeline in A only (sampled), so 1 skill-order game out of 2
        const skills = c === 103 && id === "A" ? "QEW" : null;
        lol.run(id, `${id}${team}${i}`, team, c, roles[i], team === winner ? 1 : 0, JSON.stringify(items), skills);
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
  assert.deepStrictEqual(row(103, "MIDDLE"), { champion: 103, role: "MIDDLE", games: 2, wins: 2, winRate: 1, pickRate: 1, banRate: 0, lowSample: true });
  assert.strictEqual(t.minGames, 200);
  // min_games greys, never drops
  const t2 = lolTiers(db, { min_games: "2" });
  assert.strictEqual(t2.champions.length, 13);
  assert.deepStrictEqual(t2.champions.filter((c) => !c.lowSample).map((c) => c.champion).sort((a, b) => a - b), [1, 11, 64, 86, 103, 222, 412]);
  assert.throws(() => lolTiers(db, { min_games: "x" }), /min_games/);
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
  const c = lolChampion(build(), 103, { min_games: 2 });
  assert.strictEqual(c.role, "MIDDLE");
  assert.deepStrictEqual(c.strip, { games: 2, wins: 2, winRate: 1, pickRate: 1, banRate: 0, matches: 2, lowSample: false });
  assert.deepStrictEqual(c.builds.item, [{ key: "3089", games: 2, winRate: 1, pickRate: 1, lowSample: false }, { key: "3020", games: 1, winRate: 1, pickRate: 0.5, lowSample: true }]);
  assert.deepStrictEqual(c.builds.spells, [{ key: "4,14", games: 2, winRate: 1, pickRate: 1, lowSample: false }]);
  assert.deepStrictEqual(c.builds.skills, [{ key: "QEW", games: 1, winRate: 1, pickRate: 1, lowSample: true }]);
  assert.deepStrictEqual(c.matchups, [{ opponent: 1, games: 2, winRate: 1, lowSample: false, pickRate: 1, delta1: 0, delta2: -0.5 }]);
  const garen = lolChampion(build(), 86);
  assert.deepStrictEqual(garen.matchups.sort((a, b) => a.opponent - b.opponent), [{ opponent: 122, games: 1, winRate: 1, lowSample: true, pickRate: 0.5, delta1: 0.5, delta2: 0 }, { opponent: 266, games: 1, winRate: 0, lowSample: true, pickRate: 0.5, delta1: -0.5, delta2: 0 }]);
});

test("skill max order from SKILL_LEVEL_UP slots", () => {
  // Q E W Q Q E Q R Q(5th: Q done) E E E(5th: E done) ...
  assert.strictEqual(skillOrder([1, 3, 2, 1, 1, 3, 1, 4, 1, 3, 3, 3, 4, 2, 2]), "QEW");
  assert.strictEqual(skillOrder([2, 1, 3, 2]), "WQE"); // nothing maxed: by points
});

test("TFT comps: avg placement, top-4, pick rate", () => {
  const db = build();
  const t = tftComps(db);
  assert.strictEqual(t.boards, 8);
  const ab = t.comps.find((c) => c.id === "A,B");
  assert.deepStrictEqual(ab, { id: "A,B", traits: ["A"], carry: "B", games: 3, avgPlacement: 3.3333, top4Rate: 0.6667, winRate: 0.3333, pickRate: 0.375, lowSample: true });
  assert.strictEqual(t.comps.find((c) => c.id === "C").avgPlacement, 5.3333);
  assert.deepStrictEqual(t.comps.find((c) => c.id === "none").traits, []);
  const d = tftComp(db, "A,B");
  assert.deepStrictEqual(d.units.find((u) => u.key === "X"), { key: "X", games: 3, frequency: 1, avgPlacement: 3.3333, top4Rate: 0.6667, lowSample: true });
  assert.strictEqual(tftComps(db, { min_games: 3 }).comps.find((x) => x.id === "A,B").lowSample, false);
  assert.strictEqual(tftComp(db, "nope"), null);
});

test("retention nulls raw only for old, aggregated matches and keeps rows", () => {
  const db = open(":memory:");
  const DAY = 86400000, now = 100 * DAY;
  const ins = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, started_at, fetched_at, raw) VALUES (?, 'lol', 'na1', 'DIAMOND', 'done', '16.20', ?, ?, x'01')");
  ins.run("old", now - 10 * DAY, now - 9 * DAY);   // old + aggregated -> nulled
  ins.run("new", now - 1 * DAY, now - 1 * DAY);    // recent -> kept
  ins.run("unagg", now - 10 * DAY, now - 1000);    // old but fetched after the pass -> kept
  db.prepare("INSERT INTO lol_participants (match_id, puuid) VALUES ('old', 'p')").run();
  assert.strictEqual(retain(db, 7, () => now), 0); // nothing aggregated yet
  setMeta(db, "aggregatedAt", now - 2000);
  assert.strictEqual(retain(db, 7, () => now), 1);
  const raws = Object.fromEntries(db.prepare("SELECT id, raw IS NOT NULL k FROM matches").all().map((r) => [r.id, r.k]));
  assert.deepStrictEqual(raws, { old: 0, new: 1, unagg: 1 });
  assert.strictEqual(db.prepare("SELECT count(*) n FROM matches").get().n, 3);
  assert.strictEqual(db.prepare("SELECT count(*) n FROM lol_participants").get().n, 1);
});
