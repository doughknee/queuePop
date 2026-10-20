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
// The ffmpeg line says why Record video is greyed out.
const L = ctx.window.stFfmpegLine;
assert.strictEqual(L(null, true), "Couldn’t check.");
assert.ok(L({ found: false }, true).startsWith("ffmpeg not found"));
assert.strictEqual(L({ found: true, version: "9.0.1", encoder: "h264_nvenc" }, true), "Found ffmpeg 9.0.1, encoding with your NVIDIA card.");
assert.ok(L({ found: true, encoder: "libx264" }, false).endsWith("Turn on Record game events to record video."));
// DONI-590: which games each card serves, and when it folds.
const F = ctx.window.ST_FOR, off = ctx.window.stCardOff, cov = (g) => [...ctx.window.stCovers(g)];
assert.deepStrictEqual(cov("deadlock"), ["deadlock"]);
assert.ok(cov("tft").includes("queue") && !cov("tft").includes("champselect")); // TFT queues through the League client; no champ select
assert.ok(cov("league").includes("champselect"));
assert.strictEqual(off(F.champselect, ["tft", "deadlock"]), true); // League off: champ select folds
assert.strictEqual(off(F.queue, ["tft"]), false); // League off, TFT on: queue still matters
assert.strictEqual(off(undefined, []), false); // app-wide cards never fold
console.log("test-settings ok");
