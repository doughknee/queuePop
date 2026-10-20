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
assert.strictEqual(unset.href, "#/settings#deadlock");
// Loaded but no games: the strip says so instead of dashes.
assert.deepStrictEqual(vals(homePages({ info: { ranked: {} }, lol: [] })[0]), ["Solo=Unranked", "Flex=Unranked", "Last 10=", "Win rate=—"]);
// DONI-539: where you are → what the app remembers (last route, per world, last League champion).
const J = (o) => JSON.parse(JSON.stringify(o));
let last = {};
last = ctx.qpLastNext(last, "#/league/champion/103/middle");
assert.deepStrictEqual(J(last), { route: "#/league/champion/103/middle", worlds: { league: "#/league/champion/103/middle" }, recent: ["league"], champion: "103" });
last = ctx.qpLastNext(last, "#/tft/comp/x");
assert.deepStrictEqual(J(last.worlds), { league: "#/league/champion/103/middle", tft: "#/tft/comp/x" });
assert.strictEqual(last.champion, "103");
const same = ctx.qpLastNext(last, "#/tft/comp/x");
assert.strictEqual(same, last); // nothing changed → same object, no write
const st = ctx.qpLastNext(last, "#/settings#alerts");
assert.strictEqual(st.route, "#/settings#alerts");
assert.strictEqual(st.worlds.settings, undefined); // Settings is not a world
assert.strictEqual(ctx.qpLastNext(last, ""), last);
assert.strictEqual(ctx.qpLastNext(last, "#/").route, "#/");
// Q5: home's set-up strip, from facts to items.
const ids = (f) => ctx.homeSetupItems(f).map((i) => i.id).join(",");
const all3 = ["league", "tft", "deadlock"];
assert.strictEqual(ids({ games: all3, dlId: "", crawler: "down" }), "deadlock,games"); // an offline crawler is the status line's
assert.strictEqual(ids({ games: all3, dlId: "123", crawler: "ok" }), "games");
assert.strictEqual(ids({ games: ["deadlock"], dlId: "", crawler: "down" }), "deadlock");
assert.strictEqual(ids({ games: ["league"], dlId: undefined, crawler: undefined }), ""); // config not loaded: no Deadlock nag
assert.strictEqual(ids({ games: all3, dlId: "", dismissed: ["games"] }), "deadlock");
// Q7: home's "Pick up where you left off" tiles.
const pages = [{ href: "#/league", label: "Tier list", game: "league" }, { href: "#/league/history", label: "Match history", game: "league" },
  { href: "#/tft", label: "Overview", game: "tft" }, { href: "#/deadlock/heroes", label: "Heroes", game: "deadlock" }];
const tiles = (l, g = all3) => J(ctx.resumeTiles(l, g, pages));
assert.deepStrictEqual(tiles({}), []);
let lt = ctx.qpLastNext({}, "#/league/history");
lt = ctx.qpLastNext(lt, "#/deadlock/heroes/mo-krill");
assert.deepStrictEqual(tiles(lt).map((t) => t.game + ":" + t.page + ":" + (t.detail || "")), ["deadlock:Heroes:Mo Krill", "league:Match history:"]);
lt = ctx.qpLastNext(lt, "#/league/champion/103");
lt = ctx.qpLastNext(lt, "#/league");
assert.deepStrictEqual(tiles(lt).map((t) => t.game + ":" + t.page + ":" + (t.champion || "")), ["league:Tier list:", "deadlock:Heroes:", "league:Last champion:103"]);
assert.deepStrictEqual(tiles(lt, ["league"]).map((t) => t.page), ["Tier list", "Last champion"]); // switched-off worlds drop out
lt = ctx.qpLastNext(lt, "#/league/champion/103/top");
assert.deepStrictEqual(tiles(lt).map((t) => t.page), ["Champion", "Heroes"]); // already on that champion: no second tile
assert.strictEqual(tiles(ctx.qpLastNext({}, "#/tft/comp/TFT16_A%2CTFT16_B"))[0].comp, "TFT16_A,TFT16_B");
// DONI-548: client closed. No games remembered → one plain note per page; games remembered → they show, ranks say why they don't.
assert.deepStrictEqual(vals(homePages({ offline: true })[0]), ["Open the League client to see your ranks and games"]);
const offLol = homePages({ offline: true, lol: [{ win: true }, { win: false }] })[0];
assert.deepStrictEqual(vals(offLol), ["Solo=— client closed", "Flex=— client closed", "Last 10=WL", "Win rate=50% 1W 1L"]);
console.log("test-home: ok");
