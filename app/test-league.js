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

// DONI-507: items 4·5·6 alternatives skip what the core build already has
const opt = (key, games) => ({ key, games, winRate: 0.5, pickRate: 0.1 });
const alts = ctx.window.leagueSlotAlternatives({ core: [opt("3020,3078,6672", 50)], slots: [[], [], [],
  [opt("3078", 9), opt("3053", 8), opt("3071", 7), opt("6333", 6)], [opt("3053", 5)], []] });
assert.strictEqual(JSON.stringify(alts.map((s) => s.map((o) => o.key))), JSON.stringify([["3053", "3071", "6333"], ["3053"], []]));
assert.strictEqual(JSON.stringify(ctx.window.leagueSlotAlternatives(undefined)), "[[],[],[]]");
// Match history champion split: most played first, ties by wins; win rate and KDA per champion.
// Items page shelves
const grp = ctx.window.lgItemGroup;
assert.strictEqual(grp({ tags: ['Health', 'Lane'], gold: { total: 450 } }), 'starters'); // Doran's Blade
assert.strictEqual(grp({ tags: ['Lane'], into: ['3041'], gold: { total: 350 } }), 'starters'); // Dark Seal
assert.strictEqual(grp({ tags: ['Consumable', 'Vision'], gold: { total: 75 } }), 'starters'); // Control Ward
assert.strictEqual(grp({ tags: ['Damage', 'Lane'], into: ['1053', '4003', '6701'], gold: { total: 350 } }), 'components'); // Long Sword
assert.strictEqual(grp({ tags: ['Mana'], into: ['3003', '3004'], gold: { total: 400 } }), 'components'); // Tear
assert.strictEqual(grp({ tags: ['CriticalStrike'], from: ['1038'], gold: { total: 3500 } }), 'finished'); // Infinity Edge
assert.strictEqual(grp({ tags: ['Armor', 'Boots'], into: ['3174'], gold: { total: 1200 } }), 'boots'); // Plated Steelcaps
assert.strictEqual(grp(undefined), 'components');
const split = JSON.parse(JSON.stringify(ctx.window.lgChampSplit([
  { championId: 81, win: true, kills: 10, deaths: 2, assists: 4, position: "bottom" }, { championId: 81, win: false, kills: 2, deaths: 6, assists: 2 },
  { championId: 157, win: true, kills: 5, deaths: 0, assists: 1 }])));
assert.deepStrictEqual(split.map((r) => [r.championId, r.games, r.winRate]), [[81, 2, 0.5], [157, 1, 1]]);
assert.strictEqual(split[0].kda, 2.25); // (12 + 6) / 8
assert.strictEqual(split[1].kda, 6); // no deaths counts as 1
console.log("ok test-league");
