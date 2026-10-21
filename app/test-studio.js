// Checks Studio's recorder options (src/webui/js/recorder-options.js): defaults, migration, limits, size estimates.
const assert = require("assert");
const o = require("../src/webui/js/recorder-options.js");

// Defaults: Balanced 1080p60 at 8 Mbps, full games, game + mic on, desktop off, assists not clipped, hotkey on.
const d = o.normalize({});
assert.strictEqual(d.quality, "balanced");
assert.deepStrictEqual([d.height, d.fps, d.mbps], [1080, 60, 8]);
assert.strictEqual(d.mode, "full");
assert.deepStrictEqual([d.audio.game.on, d.audio.mic.on, d.audio.desktop.on, d.audio.mic.device], [true, true, false, "default"]);
assert.strictEqual(d.clips.assist.on, false);
assert.deepStrictEqual(d.clips.kill, { on: true, before: 10, after: 5 });
assert.deepStrictEqual(d.hotkey, { on: true, keys: "Alt+F8", seconds: 30 });

// Old configs keep what they meant.
assert.strictEqual(o.normalize({ preset: "720p30" }).quality, "saver");
assert.deepStrictEqual((({ quality, height, fps, mbps }) => [quality, height, fps, mbps])(o.normalize({ preset: "1080p30" })), ["custom", 1080, 30, 6]);
assert.strictEqual(o.normalize({ preset: "1080p60", enabled: true, video: true }).quality, "balanced");

// A preset fixes height/fps/mbps; custom keeps yours within limits.
assert.strictEqual(o.normalize({ quality: "high", mbps: 3 }).mbps, 16);
const c = o.normalize({ quality: "custom", height: 1440, fps: 30, mbps: 500 });
assert.deepStrictEqual([c.height, c.fps, c.mbps], [1440, 30, 80]);
assert.strictEqual(o.normalize({ quality: "custom", height: 1234 }).height, 1080);

// Clip seconds can't reach past the replay buffer; volumes 0-200; bad hotkeys fall back.
const b = o.normalize({ buffer_s: 15, clips: { kill: { before: 40, after: 99 } }, audio: { mic: { volume: 999 } }, hotkey: { keys: "C", seconds: 60 } });
assert.deepStrictEqual(b.clips.kill, { on: true, before: 14, after: 30 });
assert.strictEqual(b.audio.mic.volume, 200);
assert.deepStrictEqual([b.hotkey.keys, b.hotkey.seconds], ["Alt+F8", 15]);
assert.strictEqual(o.normalize({ hotkey: { keys: "Ctrl+Shift+C" } }).hotkey.keys, "Ctrl+Shift+C");

// Tracks and size: Balanced with game + mic = 3 tracks, about 3.8 GB an hour; desktop sound adds a track.
assert.strictEqual(o.tracks(d), 1 | 2 | 4);
assert.strictEqual(o.gbPerHour(d), 3.8);
assert.strictEqual(o.trackCount(o.tracks(o.normalize({ audio: { desktop: { on: true } } }))), 4);
assert.strictEqual(o.gamesInCap(d), 24); // 50 GB / (3.8 GB * 32/60)
assert.strictEqual(o.gamesInCap(o.normalize({ mode: "clips" })), 394); // 8 clips of 15 s a game
assert.deepStrictEqual(o.span(d, "kill"), [10, 5]);
assert.strictEqual(o.span(d, "assist"), null);
console.log("ok test-studio");
