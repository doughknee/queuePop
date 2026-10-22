// The store edition (DONI-704): what the reviewed Overwolf build may automate, and the champ select settings it acts on.
const assert = require("assert");
const { rules, storeChampSelect } = require("./edition");
const { trayItems } = require("./tray");
const { createAway } = require("./stepping-away");

assert.deepStrictEqual(rules(false), { autoAccept: true, lockIn: true, benchSwap: true, trades: true, steppingAway: true });
assert.deepStrictEqual(rules(true), { autoAccept: false, lockIn: false, benchSwap: false, trades: false, steppingAway: false });

// Picks and bans stay (they're hovered); trades and the ARAM bench go; nothing else in the plan changes.
const cs = { enabled: true, instant_lock: true, roles: { middle: { picks: ["Ahri"] } }, trades: { enabled: true, x: 1 }, aram: { enabled: true, auto_mastery: true, bench_delay: 2 } };
const s = storeChampSelect(cs);
assert.strictEqual(s.enabled, true);
assert.deepStrictEqual(s.roles, cs.roles);
assert.deepStrictEqual(s.trades, { enabled: false, x: 1 });
assert.deepStrictEqual(s.aram, { enabled: false, auto_mastery: false, bench_delay: 2 });
assert.strictEqual(cs.trades.enabled, true); // the saved settings are untouched
assert.deepStrictEqual(storeChampSelect(undefined).trades, { enabled: false });

// No stepping away and no auto-accept pause in the store tray; stepping away can't be switched on.
const f = { games: ["league"], connected: true, paused: false, away: false, lastQueue: null, names: {} };
assert.ok(trayItems(f).some((i) => i.act === "away"));
assert.ok(!trayItems({ ...f, store: true }).some((i) => i.act === "away" || i.act === "pause"));
const state = { paused: false, away: false };
assert.strictEqual(createAway(state, () => {}, false).set(true).on, false);
assert.strictEqual(state.away, false);
console.log("ok test-edition");
