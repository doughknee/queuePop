// ARAM bench advice (DONI-350): what your team lacks (damage type, frontline, engage, crowd control, poke, heals) and which
// bench champion fills most of it, as one line under the bench: "Lux would add magic damage and poke: your team is all
// physical damage." Advice only; the bench takeover's own priority is unchanged. Flags from data/champion_flags.json.
const NEEDS = [
  // [need, label, does this champion give it, how many the team wants]
  ["magic", "magic damage", (f) => f.has("deals_magic"), 2],
  ["physical", "physical damage", (f) => f.has("deals_physical"), 2],
  ["frontline", "a frontline", (f) => f.has("frontline"), 1],
  ["engage", "engage", (f) => f.has("hard_engage") || f.has("aoe_engage"), 1],
  ["cc", "crowd control", (f) => f.has("hard_cc"), 2],
  ["poke", "poke", (f) => f.has("lane_poke"), 1],
  ["sustain", "heals or shields", (f) => f.has("team_heal_shield"), 1],
];

// team, bench: champion names; flagsOf(name) → Set. → { pick, adds: [labels], gap } | null. Pure; app/test-bench.js checks it.
function benchAdvice(team, bench, flagsOf) {
  const have = Object.fromEntries(NEEDS.map(([k, , gives]) => [k, team.filter((n) => gives(flagsOf(n))).length]));
  const missing = NEEDS.filter(([k, , , want]) => have[k] < want);
  if (!missing.length || !bench.length) return null;
  let best = null;
  for (const name of bench) {
    const f = flagsOf(name), adds = missing.filter(([, , gives]) => gives(f));
    if (adds.length && (!best || adds.length > best.adds.length)) best = { pick: name, adds };
  }
  if (!best) return null;
  const all = (k) => team.length >= 3 && have[k] === 0;
  const gap = all("magic") ? "your team is all physical damage" : all("physical") ? "your team is all magic damage"
    : have.frontline === 0 ? "nobody on your team can take the front" : `your team is short on ${missing[0][1]}`;
  return { pick: best.pick, adds: best.adds.map(([, label]) => label), gap };
}
const adviceLine = (a) => (a ? `${a.pick} would add ${a.adds.length > 1 ? a.adds.slice(0, -1).join(", ") + " and " + a.adds[a.adds.length - 1] : a.adds[0]}: ${a.gap}.` : "");

module.exports = { benchAdvice, adviceLine };
