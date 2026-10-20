// DONI-568 P3s: malformed input answers 400 (not 500), limits are integers, ?days only where applied, /status LAN-only.
const test = require("node:test");
const assert = require("node:assert");
const { open } = require("../src/db");
const { createServer } = require("../src/server");

test("malformed input and gating", async () => {
  const db = open(":memory:");
  db.prepare("INSERT INTO stats_lol_matches VALUES ('16.20', 'na1', 'DIAMOND', 10)").run();
  db.prepare("INSERT INTO stats_lol_champ VALUES ('16.20', 'na1', 'DIAMOND', 'MIDDLE', 1, 60, 30)").run();
  const api = createServer({ db, version: "t" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const get = (p, h = {}) => fetch(`http://127.0.0.1:${api.address().port}${p}`, { headers: h });
  try {
    for (const p of ["/tft/comp/%", "/tft/unit/%E0%A4%A", "/lol/match/%E0%A4%A"]) assert.strictEqual((await get(p)).status, 400, p);
    assert.strictEqual((await get("/lol/leaderboard?limit=2.5")).status, 200);
    assert.strictEqual((await get("/lol/draft?role=middle&enemies=9:MID")).status, 400);
    assert.strictEqual((await get("/lol/draft?role=middle&limit=-5")).status, 200);
    const items = await (await get("/lol/items?days=3")).json();
    assert.strictEqual(items.days, undefined, "routes that ignore ?days don't echo it");
    assert.strictEqual((await (await get("/lol/tiers?days=3")).json()).days, 3);
    assert.strictEqual((await (await get("/lol/tiers?patch=16.20-aram")).json()).queue, 450, "a -aram patch means ARAM");
    assert.strictEqual((await get("/status")).status, 200);
    assert.strictEqual((await get("/status", { "x-forwarded-for": "8.8.8.8" })).status, 403, "proxied requests are not LAN");
  } finally { api.close(); }
});
