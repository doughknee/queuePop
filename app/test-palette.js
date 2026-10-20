// node test-palette.js — the global search ranking (src/webui/palette.js, DONI-537).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, String, Math };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "palette.js"), "utf8"), ctx);
const { qpFuzzy, qpRank } = ctx.window;

assert.ok(qpFuzzy("ahr", "Ahri") > qpFuzzy("ahr", "Shahr Ahri")); // prefix beats word start
assert.ok(qpFuzzy("fort", "Miss Fortune") > qpFuzzy("fort", "Comfort")); // word start beats mid-word
assert.ok(qpFuzzy("mf", "Miss Fortune") >= 0 && qpFuzzy("zz", "Miss Fortune") < 0); // letters in order, or nothing
assert.strictEqual(qpFuzzy("", "x"), 0);

const items = [{ label: "Accept delay", sub: "League" }, { label: "Ahri", sub: "the Nine-Tailed Fox" }, { label: "Akali" }, { label: "Text size", sub: "Display" }];
assert.deepStrictEqual(qpRank(items, "a").map((x) => x.label), ["Ahri", "Akali", "Accept delay"]); // "Display" has an a mid-word: the sub line only matches at a word start // shorter prefix match first
assert.deepStrictEqual(qpRank(items, "display").map((x) => x.label), ["Text size"]); // sub matches, at half weight
assert.strictEqual(qpRank(items, "  ").length, 0);
assert.strictEqual(qpRank(items, "a", 1).length, 1);
console.log("test-palette ok");
