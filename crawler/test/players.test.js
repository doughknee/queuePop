// DONI-506: per-player champion aggregate + the /lol/tiers extras, on a hand-built set.
const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");
const { open } = require("../src/db");
const { aggregate } = require("../src/jobs");
const { createServer } = require("../src/server");
const { backfillPlayers } = require("../src/agg-players");

// 30 matches. Ahri (103) MIDDLE: P1 plays all 30 (24 wins, Challenger), P2 plays 20 of them on the other team (8 wins,
// Diamond II), P3 plays 4 on Ahri TOP (1 win, no seeded rank: excluded, under 20). Every match also has a Zed (238) MIDDLE
// filler so lanes add up; Zed bans in 15 matches.
function build() {
  const db = open(":memory:");
  const match = db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, raw) VALUES (?, 'lol', ?, 'DIAMOND', 'done', '16.20', ?)");
  const part = db.prepare("INSERT INTO lol_participants VALUES (?, ?, ?, ?, ?, ?, NULL, '[]', NULL, '[]', '4,14', NULL)");
  db.prepare("INSERT INTO players (puuid, game, region, tier, tier_n, division, lp) VALUES ('P1', 'lol', 'kr', 'CHALLENGER', 9, 'I', 1200), ('P2', 'lol', 'na1', 'DIAMOND', 6, 'II', 40)").run();
  for (let i = 0; i < 30; i++) {
    const id = "M" + i, region = i < 20 ? "kr" : "na1";
    const ps = [{ puuid: "P1", riotIdGameName: "Faker", riotIdTagline: "KR1" }, { puuid: "P2", riotIdGameName: "Second", riotIdTagline: "NA1" }];
    match.run(id, region, zlib.gzipSync(JSON.stringify({ info: { participants: ps } })));
    const p1win = i < 24 ? 1 : 0;
    part.run(id, "P1", 100, 103, "MIDDLE", p1win);
    if (i < 20) part.run(id, "P2", 200, 103, "MIDDLE", i < 8 ? 1 : 0); else part.run(id, "Z" + i, 200, 238, "MIDDLE", 1 - p1win);
    if (i < 4) part.run(id, "P3", 200, 103, "TOP", i < 1 ? 1 : 0);
    if (i < 15) db.prepare("INSERT INTO lol_bans VALUES (?, 100, 238)").run(id);
  }
  aggregate(db);
  return db;
}

test("player aggregate: best-on-champion block, lane share, delta, PBI, top players", async () => {
  const db = build();
  assert.deepStrictEqual(backfillPlayers(db), { matches: 30, names: 2 });
  // P3 (4 games) is stored (>= KEEP_MIN 3) and dropped at read time (< 20)
  assert.strictEqual(db.prepare("SELECT count(*) n FROM stats_lol_player_champ WHERE patch = '16.20'").get().n, 4); // P1 kr + na1, P2, P3
  const api = createServer({ db, version: "test" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = async (p) => (await fetch(`http://127.0.0.1:${api.address().port}${p}`)).json();
  try {
    const t = await get("/lol/tiers?min_games=0");
    assert.deepStrictEqual(t.regions, ["kr", "na1"]);
    const row = (c, r) => t.champions.find((x) => x.champion === c && x.role === r);
    const mid = row(103, "MIDDLE"), top = row(103, "TOP"), zed = row(238, "MIDDLE");
    assert.strictEqual(mid.games, 50);
    assert.strictEqual(mid.laneShare, 0.9259); // 50 of Ahri's 54 games
    assert.strictEqual(top.laneShare, 0.0741);
    // average win rate over every row (Zed won 6 of its 10 games)
    const wins = t.champions.reduce((s, c) => s + c.wins, 0), games = t.champions.reduce((s, c) => s + c.games, 0);
    assert.strictEqual(t.avgWinRate, Math.round(wins / games * 10000) / 10000);
    assert.strictEqual(zed.delta, Math.round((zed.winRate - wins / games) * 10000) / 10000);
    // PBI = delta(points) x banRate / (1 - pickRate)
    assert.strictEqual(zed.pbi, Math.round((zed.winRate - wins / games) * 100 * 0.5 / (1 - zed.pickRate) * 100) / 100);
    // best: P1 (30 games, 24 wins) + P2 (20 games, 8 wins) pooled; P3 excluded; same block on the TOP row (any role)
    assert.deepStrictEqual(mid.best, { players: 2, games: 50, winRate: 0.64, delta: 0, avgTier: 7.75 }); // (9 + 6.5) / 2
    assert.strictEqual(top.best.players, 2);
    assert.strictEqual(zed.best, null);
    const pl = await get("/lol/champion/103/players?role=middle");
    assert.strictEqual(pl.role, "MIDDLE");
    assert.deepStrictEqual(pl.players.map((p) => [p.riotId, p.region, p.tier, p.games, p.winRate]), [["Faker#KR1", "na1", "CHALLENGER", 30, 0.8], ["Second#NA1", "kr", "DIAMOND", 20, 0.4]]);
    assert.strictEqual((await get("/lol/champion/103/players?region=na1")).players.length, 0, "P1 has only 10 na1 games");
    assert.strictEqual((await get("/lol/champion/238/players")).players.length, 0);
    // bracket filters players by their own seeded tier
    assert.deepStrictEqual((await get("/lol/champion/103/players?bracket=master")).players.map((p) => p.riotId), ["Faker#KR1"]);
  } finally { api.close(); }
});
