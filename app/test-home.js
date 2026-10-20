// Checks home's paged bar builder (src/webui/shell.js homePages, DONI-527): facts → one page of equal columns per game.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, document: { querySelector: () => null, addEventListener() {}, getElementById: () => null },
  rankLabel: (r) => `${r.tier} ${r.division}` };
ctx.window = ctx;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "shell.js"), "utf8"), ctx);
const homePages = (d) => JSON.parse(JSON.stringify(ctx.homePages(d))); // out of the vm realm so deepStrictEqual compares plainly
const vals = (p) => p.cols.map((c) => c.note || `${c.label}=${c.strip ? c.strip.join("") : c.value ?? "—"}${c.sub ? " " + c.sub : ""}`);

// Nothing loaded: every page keeps its labels, values are dashes (never an empty bar).
const empty = homePages({});
assert.deepStrictEqual(empty.map((p) => p.game), ["league", "tft", "deadlock"]);
assert.deepStrictEqual(empty.map(vals), [["Solo=—", "Flex=—", "Last 10=—", "Win rate=—"], ["Rank=—", "Last 10=—", "Avg place=—"], ["Matches=—", "Win rate=—", "Last 10=—"]]);

const g = (win) => ({ win });
const full = homePages({
  info: { ranked: { solo: { tier: "GOLD", division: "II", lp: 45 }, flex: null, tft: { tier: "PLATINUM", division: "IV", lp: 0 } } },
  lol: [g(1), g(0), g(1), g(1), g(0), g(1), g(1), g(0), g(1), g(1), g(0), g(0)], // 12 games: only the last 10 count
  tft: [1, 5, 3, 8].map((placement) => ({ placement })),
  dlId: "123", dl: [{ match_result: 1, player_team: 1 }, { match_result: 0, player_team: 1 }],
});
assert.deepStrictEqual(full.map(vals), [
  ["Solo=GOLD II 45 LP", "Flex=Unranked", "Last 10=WLWWLWWLWW", "Win rate=70% 7W 3L"],
  ["Rank=PLATINUM IV 0 LP", "Last 10=1538", "Avg place=4.3"],
  ["Matches=2", "Win rate=50% 1W 1L", "Last 10=WL"],
]);
assert.strictEqual(full[2].href, "#/deadlock");

// No Deadlock account: one quiet line that opens Settings.
const unset = homePages({ dlId: "" })[2];
assert.deepStrictEqual(vals(unset), ["Set your Deadlock account in Settings"]);
assert.strictEqual(unset.href, "#/settings#account");
// Loaded but no games: the strip says so instead of dashes.
assert.deepStrictEqual(vals(homePages({ info: { ranked: {} }, lol: [] })[0]), ["Solo=Unranked", "Flex=Unranked", "Last 10=", "Win rate=—"]);
console.log("test-home: ok");
