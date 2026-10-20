// node test-bench.js — ARAM bench advice (app/bench-advice.js, DONI-350).
const assert = require("assert");
const { benchAdvice, adviceLine } = require("./bench-advice");
const { flagsOf } = require("./champ-suggest");

const F = { Draven: ["deals_physical"], Jinx: ["deals_physical", "lane_poke"], Talon: ["deals_physical"], Garen: ["deals_physical", "frontline"],
  Leona: ["frontline", "hard_engage", "hard_cc"], Lux: ["deals_magic", "lane_poke", "hard_cc"], Sona: ["deals_magic", "team_heal_shield"] };
const flags = (n) => new Set(F[n] || []);

// An all-physical team; the bench has one mage.
const a = benchAdvice(["Draven", "Jinx", "Talon"], ["Garen", "Lux"], flags);
assert.strictEqual(a.pick, "Lux");
assert.deepStrictEqual(a.adds, ["magic damage", "crowd control"]);
assert.strictEqual(adviceLine(a), "Lux would add magic damage and crowd control: your team is all physical damage.");
// No frontline is the headline when damage is mixed.
assert.strictEqual(benchAdvice(["Lux", "Sona", "Draven"], ["Leona"], flags).gap, "nobody on your team can take the front");
// Nothing missing / nobody helps / empty bench → no advice.
assert.strictEqual(benchAdvice(["Draven"], [], flags), null);
assert.strictEqual(benchAdvice(["Draven", "Jinx", "Talon"], ["Unknown"], flags), null);
// The real data knows Lux deals magic damage (the live path uses champ-suggest's flags).
assert.ok(flagsOf("Lux").has("deals_magic"));
console.log("test-bench ok");
