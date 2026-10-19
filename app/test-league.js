// Checks the League tier banding (src/webui/js/stats-api.js, DONI-506 rule) on a trimmed /lol/tiers response.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, URLSearchParams, AbortSignal, fetch: () => Promise.reject(new Error("offline")) };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "stats-api.js"), "utf8"), ctx);
const tiers = ctx.window.leagueTierRows;

const row = (champion, games, wins, pickRate, extra = {}) =>
  ({ champion, role: "MIDDLE", games, wins, winRate: wins / games, pickRate, banRate: 0, lowSample: games < 200, ...extra });
// 30 banded rows, win rate falling with the id, plus two low-sample rows.
const champions = Array.from({ length: 30 }, (_, i) => row(i + 1, 1000, 560 - i * 4, 0.1));
champions.push(row(99, 20, 20, 0.004), row(98, 150, 120, 0.03));
const rows = tiers(champions);
const tier = Object.fromEntries(rows.map((r) => [r.champion, r.tier]));
assert.strictEqual(rows.length, 32);
// 10% S, 20% A, 40% B, 20% C, 10% D, each split in thirds: of 30 rows S+ S S- are one each, D- is the last
assert.deepStrictEqual([1, 2, 3].map((c) => tier[c]), ["S+", "S", "S-"]);
assert.deepStrictEqual([4, 5, 6, 7, 8, 9].map((c) => tier[c]), ["A+", "A+", "A", "A", "A-", "A-"]);
assert.strictEqual(tier[30], "D-");
assert.strictEqual(rows.filter((r) => r.tier?.[0] === "B").length, 12);
// low-sample rows: no tier, score -1, after the banded ones
assert.strictEqual(tier[99], null);
assert.strictEqual(tier[98], null);
assert.strictEqual(rows.slice(-2).map((r) => r.score).join(), "-1,-1");
assert.ok(rows.slice(0, 30).every((r) => r.score >= 0 && r.score <= 1));

// PBI and the best-player block move a row: equal win rates, the one with better PBI/best players ranks higher
const even = [row(1, 1000, 500, 0.1, { pbi: 2, best: { winRate: 0.6, avgTier: 8 } }), row(2, 1000, 500, 0.1, { pbi: -1, best: { winRate: 0.5, avgTier: 6 } }),
  row(3, 1000, 500, 0.1)]; // no pbi/best: neutral 0.5
const ev = tiers(even), score = (c) => ev.find((r) => r.champion === c).score;
assert.ok(score(1) > score(3) && score(3) > score(2));

assert.strictEqual(tiers([]).length, 0);
assert.strictEqual(tiers([row(1, 1000, 500, 0.1)])[0].tier, "S+");
assert.strictEqual(tiers([row(1, 10, 5, 0.1)])[0].tier, null);
console.log("ok test-league");
