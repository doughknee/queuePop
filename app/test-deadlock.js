// Checks the Deadlock tier-list row builder (src/webui/deadlock-view.js) on a trimmed /analytics/hero-stats response,
// plus the account-id bridge methods against a stubbed config.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, Image: class { decode() { return Promise.resolve(); } }, document: { fonts: { load: () => Promise.resolve() } } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "deadlock-view.js"), "utf8"), ctx);

const hero = (id, wins, matches, k, d, a, souls) => ({ hero_id: id, wins, losses: matches - wins, matches,
  total_kills: k, total_deaths: d, total_assists: a, total_net_worth: souls });
const fixture = [
  hero(1, 600, 1000, 7000, 6000, 11000, 42000000), hero(2, 560, 1000, 6000, 6000, 9000, 41000000),
  hero(3, 520, 1000, 5000, 6000, 8000, 40000000), hero(4, 510, 1000, 5000, 5000, 8000, 40000000),
  hero(6, 500, 1000, 5000, 5000, 8000, 39000000), hero(7, 490, 1000, 5000, 5000, 8000, 39000000),
  hero(8, 480, 1000, 5000, 5000, 8000, 38000000), hero(9, 470, 1000, 5000, 5000, 8000, 38000000),
  hero(10, 450, 1000, 5000, 5000, 8000, 37000000), hero(11, 400, 1000, 4000, 8000, 6000, 36000000),
  hero(12, 20, 30, 300, 200, 400, 1200000), // under min matches: dropped
];
const rows = ctx.window.deadlockTierRows(fixture);
assert.strictEqual(rows.length, 10);
assert.deepStrictEqual(rows.map((r) => r.hid), [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
assert.deepStrictEqual(rows.map((r) => r.tier).join(""), "SAABBBBCCD");
const top = rows[0];
assert.strictEqual(top.wr, 0.6);
assert.strictEqual(top.kda, 3);
assert.strictEqual(top.souls, 42000);
assert.ok(Math.abs(top.pick - 1000 / (10030 / 12)) < 1e-9);
assert.strictEqual(ctx.window.deadlockTierRows([]).length, 0);

const config = require("./config");
let saved = { webhook_url: "x" };
config.get = () => ({ ...saved });
config.save = (cfg) => { saved = cfg; };
const dl = require("./deadlock-api");
assert.strictEqual(dl.get_deadlock_account(), "");
assert.deepStrictEqual(dl.set_deadlock_account("244471627"), { ok: true });
assert.strictEqual(dl.get_deadlock_account(), "244471627");
assert.strictEqual(saved.webhook_url, "x");
dl.set_deadlock_account("not a number");
assert.strictEqual(saved.deadlock_account_id, "");
console.log("deadlock ok");
