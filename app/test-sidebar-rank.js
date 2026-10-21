// Checks the sidebar's per-world rank pick (sidebarRank in src/webui/js/data/catalog.js).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { QP: { _loaded: [] } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "data", "catalog.js"), "utf8") + ";this.sidebarRank = sidebarRank;", ctx);
const pick = (ranked, world) => { const p = ctx.sidebarRank(ranked, world); return p && p.prefix + p.r.tier; };
const all = { solo: { tier: "PLATINUM" }, flex: { tier: "GOLD" }, tft: { tier: "MASTER" }, double_up: { tier: "DIAMOND" } };
assert.strictEqual(pick(all, "league"), "PLATINUM");
assert.strictEqual(pick(all, "tft"), "MASTER");
assert.strictEqual(pick(all, ""), "TFT · MASTER"); // Home: the highest, named
assert.strictEqual(pick({ flex: { tier: "GOLD" }, tft: { tier: "IRON" } }, "league"), "Flex · GOLD");
assert.strictEqual(pick({ solo: { tier: "GOLD" }, double_up: { tier: "SILVER" } }, "tft"), "Double Up · SILVER");
assert.strictEqual(pick({ tft: { tier: "GOLD" } }, "league"), null); // unranked in League: the level shows
assert.strictEqual(pick({ solo: { tier: "EMERALD" } }, ""), "EMERALD");
assert.strictEqual(pick(undefined, "league"), null);
console.log("ok test-sidebar-rank");
