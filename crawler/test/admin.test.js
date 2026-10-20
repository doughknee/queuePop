// POST /admin/key: auth, validation, and that the next outbound Riot request carries the new key.
const test = require("node:test");
const assert = require("node:assert");
const { open, riotKey } = require("../src/db");
const { Limiter } = require("../src/limiter");
const { createClient } = require("../src/riot");
const { createServer } = require("../src/server");
const { startMock } = require("../src/mock");

const KEY = "RGAPI-12345678-abcd-ef01-2345-6789abcdef01";

async function setup(adminToken) {
  const mock = await startMock(0);
  const db = open(":memory:");
  const api = createServer({ db, limiter: new Limiter(), version: "test", adminToken, envKey: "RGAPI-env" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${api.address().port}`;
  const post = (body, token) => fetch(url + "/admin/key", { method: "POST", headers: token ? { authorization: "Bearer " + token } : {}, body: JSON.stringify(body) });
  return { mock, db, api, url, post, close: () => { api.close(); mock.server.close(); } };
}

test("posted key replaces the env key on the next Riot request, no restart", async () => {
  const t = await setup("tok");
  try {
    const riot = createClient({ key: () => riotKey(t.db, "RGAPI-env").key, base: t.mock.url, limiter: new Limiter() });
    await riot.get("na1", "/lol/match/v5/matches/NA1_520000001", "m");
    assert.strictEqual(t.mock.stats.lastKey, "RGAPI-env");
    assert.strictEqual((await (await fetch(t.url + "/status")).json()).key.source, "env");
    const res = await t.post({ key: KEY }, "tok");
    assert.strictEqual(res.status, 200);
    assert.ok(!JSON.stringify(await res.json()).includes(KEY), "key is never echoed");
    await riot.get("na1", "/lol/match/v5/matches/NA1_520000001", "m");
    assert.strictEqual(t.mock.stats.lastKey, KEY);
    const st = await (await fetch(t.url + "/status")).json();
    assert.strictEqual(st.key.source, "meta");
    assert.ok(!JSON.stringify(st).includes(KEY));
    assert.strictEqual((await fetch(t.url + "/")).headers.get("content-type"), "text/html; charset=utf-8");
  } finally { t.close(); }
});

test("admin auth: 401 without token, 400 on a bad key, 503 when ADMIN_TOKEN is unset", async () => {
  const t = await setup("tok");
  try {
    assert.strictEqual((await t.post({ key: KEY })).status, 401);
    assert.strictEqual((await t.post({ key: KEY }, "wrong")).status, 401);
    assert.strictEqual((await t.post({ key: "nope" }, "tok")).status, 400);
    assert.strictEqual(riotKey(t.db, "").source, "none", "rejected requests stored nothing");
  } finally { t.close(); }
  const u = await setup("");
  try { assert.strictEqual((await u.post({ key: KEY }, "x")).status, 503); } finally { u.close(); }
});

test("key health: a 403 marks the key invalid in /status, a posted key makes it valid again", async () => {
  const mock = await startMock(0, { rejectKey: "RGAPI-env" });
  const db = open(":memory:");
  const { keyHealth, markKeyBad } = require("../src/db");
  const api = createServer({ db, limiter: new Limiter(), version: "test", adminToken: "tok", envKey: "RGAPI-env" });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${api.address().port}`;
  try {
    const riot = createClient({ key: () => riotKey(db, "RGAPI-env").key, base: mock.url, limiter: new Limiter(),
      onAuthFail: (s, m) => markKeyBad(db, "RGAPI-env", `${s} ${m}`) });
    await assert.rejects(riot.get("na1", "/lol/match/v5/matches/NA1_520000001", "m"), (e) => e.auth === true);
    let k = (await (await fetch(url + "/status")).json()).key;
    assert.deepStrictEqual([k.valid, k.reason], [false, "403 Forbidden"]);
    assert.ok(k.since > 0);
    const n = mock.stats.requests;
    await fetch(url + "/admin/key", { method: "POST", headers: { authorization: "Bearer tok" }, body: JSON.stringify({ key: KEY }) });
    k = (await (await fetch(url + "/status")).json()).key;
    assert.deepStrictEqual([k.valid, k.reason, k.source], [true, null, "meta"]);
    assert.ok(await riot.get("na1", "/lol/match/v5/matches/NA1_520000001", "m"));
    assert.strictEqual(mock.stats.requests, n + 1, "one request with the new key, no retries");
    assert.strictEqual(keyHealth(db, "").valid, true);
  } finally { api.close(); mock.server.close(); }
});
