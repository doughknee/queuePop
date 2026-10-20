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

(async () => {
  const events = [{ id: 1, level: "info", message: "old", kind: null, ts: 0 }];
  const comp = createCompanion({ webRoot: path.join(__dirname, "..", "src", "webui"), events, getConfig: () => ({}), push: () => {},
    status: () => ({ connected: false, paused: false }) });
  assert.ok(await comp.start(0));
  const port = comp.boundPort();
  const page = await new Promise((r) => http.get({ port, path: "/" }, (res) => { let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => r([res.statusCode, t])); }));
  assert.strictEqual(page[0], 200);
  assert.ok(page[1].includes("<html"));
  assert.strictEqual(await new Promise((r) => http.get({ port, path: "/../index.js" }, (res) => { res.resume(); r(res.statusCode); })), 404);
  assert.strictEqual(await new Promise((r) => http.get({ port, path: "/%E0%A4%A" }, (res) => { res.resume(); r(res.statusCode); })), 400);

  // Simulated queue pop after the phone connected: must arrive after the 'synced' marker.
  const body = await new Promise((resolve) => {
    http.get({ port, path: "/api/stream" }, (res) => {
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
