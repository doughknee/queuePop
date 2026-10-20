// node test-tray.js — the tray menu for the games you play and the client's state (app/tray.js, DONI-544).
const assert = require("assert");
const Module = require("module");
const load = Module._load;
Module._load = (req, ...a) => (req === "electron" ? {} : load(req, ...a)); // tray.js needs no Electron for trayItems
const { trayItems } = require("./tray");
Module._load = load;

const names = { 420: "Ranked Solo/Duo", 440: "Ranked Flex", 400: "Draft Pick", 450: "ARAM", 1090: "TFT Normal", 1100: "TFT Ranked" };
const labels = (rows) => rows.filter((r) => r.label).map((r) => r.label);
const all = ["league", "tft", "deadlock"];

const up = trayItems({ games: all, connected: true, paused: false, lastQueue: 420, names });
assert.deepStrictEqual(labels(up), ["Open queuePop", "League of Legends", "Teamfight Tactics", "Deadlock", "Queue again: Ranked Solo/Duo", "Start a queue", "I'm stepping away", "Auto-accept paused", "Quit queuePop"]);
assert.deepStrictEqual(up.find((r) => r.submenu).submenu.map((r) => r.arg), [420, 440, 400, 450, 1090, 1100]);
assert.strictEqual(up.find((r) => r.act === "pause").checked, false);

const down = trayItems({ games: ["tft"], connected: false, paused: true, lastQueue: null, names });
assert.deepStrictEqual(labels(down), ["Open queuePop", "Teamfight Tactics", "Queue up (League client closed)", "I'm stepping away", "Auto-accept paused", "Quit queuePop"]);
assert.strictEqual(down.find((r) => (r.label || "").startsWith("Queue up")).enabled, false);
assert.strictEqual(down.find((r) => r.act === "pause").checked, true);

const dl = trayItems({ games: ["deadlock"], connected: true, paused: false, lastQueue: 420, names });
assert.deepStrictEqual(labels(dl), ["Open queuePop", "Deadlock", "I'm stepping away", "Auto-accept paused", "Quit queuePop"]); // no League/TFT, no queues
const awayRows = trayItems({ games: all, connected: true, paused: false, away: true, lastQueue: null, names });
assert.strictEqual(awayRows.find((r) => r.act === "away").checked, true);
assert.strictEqual(awayRows.find((r) => r.act === "pause").enabled, false); // away owns auto-accept until you're back
console.log("test-tray ok");
