// Checks the TFT comp tier banding (src/webui/js/tft-stats-api.js) on a fixture /tft/comps response.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "tft-stats-api.js"), "utf8"), ctx);
const { compRows, compTier, bare } = ctx.window.tftStats;

const comp = (id, avgPlacement, pickRate, games, lowSample = false) => ({ id, traits: id.split(","), games, avgPlacement, top4Rate: 0.5, winRate: 0.1, pickRate, lowSample });
const fixture = { patch: "16.20", region: "all", bracket: "all", minGames: 200, boards: 4000, comps: [
  comp("TFT16_Bastion,TFT16_Sorcerer", 4.2, 0.1, 400),   // 4.2 - 0.5 = 3.7 → A
  comp("TFT16_Gunslinger", 3.4, 0.01, 40, true),         // 3.35 → S, low sample still banded
  comp("TFT16_Brawler,TFT16_Juggernaut", 4.4, 0.3, 1200), // bonus capped at 0.5 → 3.9 → A
  comp("TFT16_Invoker", 4.6, 0.02, 80, true),            // 4.5 → B (boundary)
  comp("TFT16_Slayer", 5.1, 0.05, 200),                  // 4.85 → C
  comp("none", 4.5, 0.2, 800),                           // no trait at breakpoint 2: dropped
] };
const rows = compRows(fixture);
// Full-sample rows first (tier, then avg placement), low-sample rows after them, greyed but kept.
assert.deepStrictEqual(rows.map((r) => r.tier).join(""), "AACSB");
assert.deepStrictEqual(rows.map((r) => r.id), ["TFT16_Bastion,TFT16_Sorcerer", "TFT16_Brawler,TFT16_Juggernaut", "TFT16_Slayer", "TFT16_Gunslinger", "TFT16_Invoker"]);
assert.deepStrictEqual(rows.map((r) => r.lowSample), [false, false, false, true, true]);
assert.strictEqual(compTier({ avgPlacement: 3.5, pickRate: 0 }), "S");
assert.strictEqual(compTier({ avgPlacement: 4.01, pickRate: 0 }), "B");
assert.strictEqual(compRows({ comps: [] }).length, 0);
assert.strictEqual(compRows(null).length, 0);
assert.strictEqual(bare("TFT16_MissFortune"), "Miss Fortune");
assert.strictEqual(bare("DA_18_Azir"), "Azir");
assert.strictEqual(bare("DA_Fiddlesticks18"), "Fiddlesticks");
console.log("ok");
