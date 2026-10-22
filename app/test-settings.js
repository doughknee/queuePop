// node test-settings.js — Settings' pure helpers (src/webui/settings.js).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, Math, Object };
try { vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "settings.js"), "utf8"), ctx); } catch {} // the page half needs a DOM
const B = (rl) => JSON.parse(JSON.stringify(ctx.window.stBusyBuckets(rl)));

const lim = (used, limit, windowSec = 10) => ({ limits: [{ used, limit, windowSec }] });
// Busy ones only, fullest first; the rest are counted.
assert.deepStrictEqual(B({ a: lim(0, 100), b: lim(10, 100), c: lim(90, 100), d: lim(0, 500) }),
  { busy: [{ name: "c", used: 90, limit: 100, windowSec: 10, pct: 90 }, { name: "b", used: 10, limit: 100, windowSec: 10, pct: 10 }], idle: 2 });
assert.deepStrictEqual(B({ a: lim(0, 100), b: {} }).idle, 2); // a bucket with no limits counts as idle
assert.deepStrictEqual(B(undefined), { busy: [], idle: 0 });
assert.strictEqual(B({ x: lim(700, 500) }).busy[0].pct, 100); // capped
// DONI-594: every card sits on one tab, and old links land on the right one.
const tabOf = ctx.window.stTabOf, CT = ctx.window.ST_CARD_TAB;
assert.strictEqual(tabOf("tft"), "tft"); // a tab is itself
assert.strictEqual(tabOf("crawler"), "app");
assert.strictEqual(tabOf("tft-queue"), "tft");
assert.strictEqual(tabOf("alerts"), "league"); // pre-594 #alerts was League's
assert.strictEqual(tabOf("account"), "deadlock");
assert.strictEqual(tabOf("games"), "app");
assert.strictEqual(tabOf("nope"), null);
assert.ok(Object.values(CT).every((t) => ctx.window.ST_TABS.includes(t)));
// Engine line: which engine records, and what to do when the companion isn't there.
const EL = ctx.window.stEngineLine;
assert.strictEqual(EL({ engine: "overwolf", encoder: "h264_texture_amf", companion: { running: true, ready: true } }, true), "Recording with Overwolf (AMD AMF), game audio + mic.");
assert.strictEqual(EL({ engine: "overwolf", inProcess: true, encoder: "h264_texture_amf", companion: { running: true, ready: true } }, true), "Recording with Overwolf (built in, AMD AMF), game audio + mic.");
assert.ok(EL({ engine: "ffmpeg", encoder: "h264_amf", ffmpeg: { found: true }, companion: { running: false } }, true).startsWith("Recording with ffmpeg (your AMD card), main screen, no audio. For the game window, game audio and a mic track, start the QueuePop companion"));
assert.ok(EL({ engine: "ffmpeg", encoder: "h264_amf", companion: { running: true, error: "boom" } }, true).includes("isn’t ready (boom): restart it."));
assert.ok(EL({ engine: null, companion: {} }, true).startsWith("Nothing to record video with."));
console.log("test-settings ok");
