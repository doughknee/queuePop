// Checks the League tier banding (src/webui/js/stats-api.js) on a trimmed /lol/tiers response.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, URLSearchParams, AbortSignal, fetch: () => Promise.reject(new Error("offline")) };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "stats-api.js"), "utf8"), ctx);

const row = (champion, games, wins, pickRate, lowSample = false) =>
  ({ champion, role: "MIDDLE", games, wins, winRate: wins / games, pickRate, banRate: 0, lowSample });
const fixture = { patch: "16.20", minGames: 200, matches: 5000, champions: [
  row(1, 1000, 560, 0.20), row(2, 900, 500, 0.18), row(3, 800, 430, 0.16), row(4, 700, 360, 0.14),
  row(5, 600, 300, 0.12), row(6, 500, 250, 0.10), row(7, 400, 195, 0.08), row(8, 300, 140, 0.06),
  row(9, 250, 110, 0.05), row(10, 2, 2, 0.0004, true), // 2-game 100%: shrunk toward average, not S
] };
const rows = ctx.window.leagueTierRows(fixture.champions);
assert.strictEqual(rows.length, 10);
const tier = Object.fromEntries(rows.map((r) => [r.champion, r.tier]));
assert.strictEqual(tier[1], "S");
assert.deepStrictEqual([2, 3].map((c) => tier[c]), ["A", "A"]);
assert.strictEqual(tier[9], "D");
assert.notStrictEqual(tier[10], "S");
assert.strictEqual(rows.filter((r) => r.tier === "B").length, 4);
assert.ok(rows.every((r) => r.score >= 0 && r.score <= 1));
assert.strictEqual(ctx.window.leagueTierRows([]).length, 0);
assert.strictEqual(ctx.window.leagueTierRows([row(1, 10, 5, 0.1)])[0].tier, "S");

// DONI-507: items 4·5·6 alternatives skip what the core build already has
const opt = (key, games) => ({ key, games, winRate: 0.5, pickRate: 0.1 });
const alts = ctx.window.leagueSlotAlternatives({ core: [opt("3020,3078,6672", 50)], slots: [[], [], [],
  [opt("3078", 9), opt("3053", 8), opt("3071", 7), opt("6333", 6)], [opt("3053", 5)], []] });
assert.strictEqual(JSON.stringify(alts.map((s) => s.map((o) => o.key))), JSON.stringify([["3053", "3071", "6333"], ["3053"], []]));
assert.strictEqual(JSON.stringify(ctx.window.leagueSlotAlternatives(undefined)), "[[],[],[]]");
console.log("ok test-league");
