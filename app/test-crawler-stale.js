// node test-crawler-stale.js — the crawler going down mid-session (src/webui/js/stats-api.js): a page that re-renders keeps
// the last good copy and statsApi.stale says so; 4xx and never-loaded keys still fail.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let now = 1e12, mode = "up", calls = 0;
const events = [];
const ctx = {
  window: { dispatchEvent: (e) => events.push(e.detail) }, CustomEvent: class { constructor(t, o) { this.detail = o.detail; } },
  URLSearchParams, AbortSignal, Date: { now: () => now },
  fetch: async () => { calls++; if (mode === "down") throw new TypeError("Failed to fetch"); if (mode === "404") return { ok: false, status: 404, headers: { get: () => null } }; return { ok: true, json: async () => ({ n: calls }) }; },
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "stats-api.js"), "utf8"), ctx);
const api = ctx.window.statsApi, J = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  assert.deepStrictEqual(J(await api.tiers({ patch: "16.20" })), { n: 1 });
  assert.deepStrictEqual(J(await api.tiers({ patch: "16.20" })), { n: 1 }); // memo: no second request
  assert.strictEqual(calls, 1);
  mode = "down"; now += 11 * 60 * 1000; // past the 10 min TTL, crawler gone
  assert.deepStrictEqual(J(await api.tiers({ patch: "16.20" })), { n: 1 }); // last good copy, not an error
  assert.strictEqual(api.stale, true);
  await api.tiers({ patch: "16.20" }); assert.strictEqual(calls, 2); // within 30 s: no new request
  await assert.rejects(api.tiers({ patch: "16.19" })); // never loaded: still fails (the page shows its empty state)
  now += 31 * 1000; mode = "up";
  assert.deepStrictEqual(J(await api.tiers({ patch: "16.20" })), { n: 4 }); // retried after 30 s, fresh again
  assert.strictEqual(api.stale, false);
  assert.deepStrictEqual(events, [true, false]);
  now += 11 * 60 * 1000; mode = "404";
  await assert.rejects(api.tiers({ patch: "16.20" })); // a 4xx is an answer, not an outage
  console.log("test-crawler-stale ok");
})().catch((e) => { console.error(e); process.exit(1); });
