// node test-away.js — "I'm stepping away" arms champ select without touching the user's settings (app/stepping-away.js, DONI-424).
const assert = require("assert");
const { applyAway, createAway } = require("./stepping-away");

const mine = Object.freeze({ enabled: false, instant_lock: true, lock_in_at_seconds: 10, roles: { middle: { picks: ["Ahri"] } } });
const away = applyAway(mine);
assert.deepStrictEqual(away, { enabled: true, instant_lock: false, lock_in_at_seconds: 3, roles: { middle: { picks: ["Ahri"] } } });
assert.deepStrictEqual(applyAway(undefined), { enabled: true, instant_lock: false, lock_in_at_seconds: 3 });

// Round trip: arming unpauses auto-accept; coming back restores exactly the pause you had.
const state = { paused: true }, log = [];
const a = createAway(state, (m) => log.push(m));
assert.strictEqual(a.set(true).on, true);
assert.strictEqual(state.paused, false);
assert.strictEqual(a.set(true).on, true); // no double arm
assert.strictEqual(log.length, 1);
assert.strictEqual(a.set(false).on, false);
assert.strictEqual(state.paused, true);
assert.strictEqual(log.length, 2);
console.log("test-away ok");
