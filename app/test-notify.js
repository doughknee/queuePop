// node test-notify.js — Discord embed shape, version compare, and the companion's queue_pop payload over SSE.
const assert = require("assert");
const http = require("http");
const path = require("path");
const { buildDiscordPayload } = require("./notifications");
const { isNewer } = require("./updater");
const { createCompanion } = require("./companion");

const p = buildDiscordPayload("queue_pop", "go", { queue: "ARAM", mention: "42" });
assert.deepStrictEqual(p, { content: "<@42>", embeds: [{ title: "⚡ Queue Popped", description: "go", color: 0xc8aa6e,
  footer: { text: "queuePop • auto-accepting" }, fields: [{ name: "Queue", value: "ARAM", inline: true }] }] });
assert.deepStrictEqual(buildDiscordPayload("nope", "hi", {}), { content: "hi" });

assert.ok(isNewer("v1.5.0", "1.4.7") && !isNewer("1.4.7", "1.4.7") && !isNewer("1.4.6", "1.4.7"));

const TOKEN = "0123456789abcdef0123456789abcdef";
(async () => {
  const events = [{ id: 1, level: "info", message: "old", kind: null, ts: 0 }];
  const comp = createCompanion({ webRoot: path.join(__dirname, "..", "src", "webui"), events, getConfig: () => ({ companion: { token: TOKEN } }), push: () => {}, decline: async () => ({ ok: true }),
    champ: async () => ({ active: true, trades: [{ id: 7, name: "Ahri" }] }), trade: async (id, action) => ({ ok: id === "7" && action === "accept" }),
    status: () => ({ connected: false, paused: false }) });
  assert.ok(await comp.start(0));
  const port = comp.boundPort();
  const page = await new Promise((r) => http.get({ port, path: "/" }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => r([res.statusCode, t])); }));
  assert.strictEqual(page[0], 200);
  assert.ok(page[1].includes("<html"));
  assert.strictEqual(await new Promise((r) => http.get({ port, path: "/../index.js" }, (res) => { res.resume(); r(res.statusCode); })), 404);
  assert.strictEqual(await new Promise((r) => http.get({ port, path: "/%E0%A4%A" }, (res) => { res.resume(); r(res.statusCode); })), 400);
  // DONI-328: the feed needs the token (query or the cookie the QR link sets); static files don't.
  const get = (p, headers = {}) => new Promise((r) => http.get({ port, path: p, headers }, (res) => { res.resume(); r(res); }));
  assert.strictEqual((await get("/api/status")).statusCode, 403);
  assert.strictEqual((await get("/api/status?t=nope")).statusCode, 403);
  assert.strictEqual((await get("/api/status?t=" + TOKEN)).statusCode, 200);
  const landing = await get("/?t=" + TOKEN);
  assert.ok(String(landing.headers["set-cookie"]).includes("qp_t=" + TOKEN));
  assert.strictEqual((await get("/api/status", { cookie: "qp_t=" + TOKEN })).statusCode, 200);
  assert.strictEqual((await get("/manifest.json")).statusCode, 200);
  // DONI-337: Decline is POST-only and token-gated.
  const post = (p) => new Promise((r) => { const q = http.request({ port, path: p, method: "POST" }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => r([res.statusCode, t])); }); q.end(); });
  assert.strictEqual((await post("/api/decline"))[0], 403);
  assert.deepStrictEqual(await post("/api/decline?t=" + TOKEN), [200, '{"ok":true}']);
  assert.strictEqual((await get("/api/decline?t=" + TOKEN)).statusCode, 405);
  // DONI-337: champ select and trades from the phone, token-gated.
  const read = (p) => new Promise((r) => http.get({ port, path: p }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => r([res.statusCode, t])); }));
  assert.strictEqual((await read("/api/champ"))[0], 403);
  assert.deepStrictEqual(JSON.parse((await read("/api/champ?t=" + TOKEN))[1]).trades, [{ id: 7, name: "Ahri" }]);
  assert.strictEqual((await post("/api/trade?id=7&action=accept&t=" + TOKEN))[0], 200);
  assert.strictEqual((await post("/api/trade?id=8&action=accept&t=" + TOKEN))[0], 409);

  // Simulated queue pop after the phone connected: must arrive after the 'synced' marker.
  const body = await new Promise((resolve) => {
    http.get({ port, path: "/api/stream?t=" + TOKEN }, (res) => {
      let t = "";
      res.on("data", (c) => {
        t += c;
        if (t.includes("event: synced") && !events.some((e) => e.kind === "queue_pop"))
          events.push({ id: 2, level: "danger", message: "Queue popped", kind: "queue_pop", ts: 1 });
        if (t.includes('"kind":"queue_pop"')) { res.destroy(); resolve(t); }
      });
    });
  });
  assert.ok(body.indexOf("event: synced") < body.indexOf('"kind":"queue_pop"'));
  assert.ok(body.includes("id: 2\nevent: log\n"));
  comp.stop();
  console.log("test-notify ok");
})().catch((e) => { console.error(e); process.exit(1); });

// DONI-534: alerts only ever post to a Discord webhook.
const { isWebhook } = require("./notifications");
assert.ok(isWebhook("https://discord.com/api/webhooks/123456/abc-DEF_9"));
assert.ok(isWebhook("https://ptb.discordapp.com/api/webhooks/1/x/"));
assert.ok(!isWebhook("https://evil.example/api/webhooks/1/x"));
assert.ok(!isWebhook("http://discord.com/api/webhooks/1/x"));
assert.ok(!isWebhook("https://discord.com.evil.example/api/webhooks/1/x"));
console.log("test-notify webhook ok");
