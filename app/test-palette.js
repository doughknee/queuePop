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

// Q queue 5: units from /tft/meta (set 18 keys too), board-only units left out, one row per name; recordings by recFacts.
const J2 = (x) => JSON.parse(JSON.stringify(x));
const units = J2(ctx.window.qpUnitItems({ traits: { DA_18_Emperor: { name: "Emperor" } }, units: {
  DA_18_Azir: { name: "Azir", cost: 4, traits: ["DA_18_Emperor", "Invoker"], icon: "a.png" },
  TFT16_Ahri: { name: "Ahri", cost: 2, traits: ["Arcana"] },
  TFT_BlueGolem: { name: "Golem", cost: 1, traits: [] },
  DA_18_Azir_Alt: { name: "Azir", cost: 4, traits: ["Emperor"] },
} }));
assert.deepStrictEqual(units.map((u) => [u.label, u.href]), [["Ahri", "#/tft/unit/TFT16_Ahri"], ["Azir", "#/tft/unit/DA_18_Azir"]]);
assert.strictEqual(units[1].sub, "4 cost · Emperor, Invoker");
assert.deepStrictEqual(J2(ctx.window.qpUnitItems(null)), []);
const recs = J2(ctx.window.qpRecordingItems([{ startedAt: 1, matchId: "NA1_5" }], () => ({ title: "Ahri", result: "Win", facts: "3 / 1 / 7" }), () => "Mon 9:00"));
assert.deepStrictEqual(recs, [{ kind: "recording", label: "Ahri", sub: "Mon 9:00 · Win · 3 / 1 / 7", href: "#/studio/game/NA1_5" }]);
assert.deepStrictEqual(qpRank(recs, "ahri").length, 1);
console.log("test-palette sources ok");
