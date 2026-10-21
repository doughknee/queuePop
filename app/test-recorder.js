// node test-recorder.js — the recorder's event log (app/recorder.js) and the strip (src/webui/recordings.js), DONI-523.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { EventEmitter } = require("events");
const { mapLiveEvents, attachRecorder } = require("./recorder");

const raw = [
  { EventID: 0, EventName: "GameStart", EventTime: 0.04 },
  { EventID: 1, EventName: "ChampionKill", EventTime: 312.5, KillerName: "Doni", VictimName: "Zed", Assisters: [] },
  { EventID: 2, EventName: "ChampionKill", EventTime: 400, KillerName: "Zed", VictimName: "Doni", Assisters: [] },
  { EventID: 3, EventName: "ChampionKill", EventTime: 500, KillerName: "Thresh", VictimName: "Lux", Assisters: ["Doni"] },
  { EventID: 4, EventName: "Multikill", EventTime: 900, KillerName: "Doni", KillStreak: 3 },
  { EventID: 5, EventName: "DragonKill", EventTime: 1000, KillerName: "Thresh", DragonType: "Fire", Stolen: "False" },
  { EventID: 6, EventName: "ChampionKill", EventTime: 1001, KillerName: "Thresh", VictimName: "Lux", Assisters: [] }, // not mine
  { EventID: 7, EventName: "GameEnd", EventTime: 1800, Result: "Win" },
];
assert.deepStrictEqual(mapLiveEvents(raw, "Doni#NA1").map((e) => `${e.type}@${e.t}:${e.label}`), [
  "kill@312.5:Killed Zed", "death@400:Killed by Zed", "assist@500:Assist on Lux", "multikill@900:Triple kill",
  "objective@1000:Fire dragon (Thresh)", "end@1800:Victory"]);

// First blood rides on its kill instead of counting a second one.
assert.deepStrictEqual(mapLiveEvents([{ EventID: 1, EventName: "FirstBlood", EventTime: 90.2, Recipient: "Doni" },
  { EventID: 2, EventName: "ChampionKill", EventTime: 90.2, KillerName: "Doni", VictimName: "Zed", Assisters: [] }], "Doni#NA1").map((e) => `${e.type}:${e.label}`),
  ["kill:Killed Zed (first blood)"]);

// The strip: markers placed by game time over the game's length; events without a time are left off.
const ctx = { window: {}, Math, Number, String };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "recordings.js"), "utf8"), ctx);
const m = ctx.window.recStripMarkers({ events: [{ t: 450, type: "kill", label: "Killed Zed" }, { t: 900, type: "end", label: "Victory" }, { t: null, type: "end", label: "4th place" }] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(m)).map((x) => [x.left, x.type, x.label]), [[50, "kill", "7:30 Killed Zed"], [100, "end", "15:00 Victory"]]);

// One row's words: plural right, TFT says Top/Bottom 4.
const F = (r) => JSON.parse(JSON.stringify(ctx.window.recFacts(r)));
assert.deepStrictEqual(F({ game: "league", champion: "Ahri", result: "win", counts: { kill: 3, death: 1, assist: 7, objective: 1, multikill: 2 } }),
  { title: "Ahri", result: "Win", facts: "3 / 1 / 7 · 2 multikills · 1 objective" });
assert.deepStrictEqual(F({ game: "league", counts: {} }), { title: "League", result: "", facts: "0 / 0 / 0" });
assert.deepStrictEqual(F({ game: "tft", placement: 3, result: "win" }), { title: "TFT · 3rd place", result: "Top 4", facts: "" });
assert.deepStrictEqual(F({ game: "tft", placement: 7, result: "loss" }), { title: "TFT · 7th place", result: "Bottom 4", facts: "" });
assert.strictEqual(F({ game: "tft", queueId: 1160, placement: 1, result: "win" }).title, "Double Up · 1st place");

// A whole game: off by default; on → one file per game with your events and the result, no duplicates across polls.
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qp-rec-")), lcu = new EventEmitter();
  let cfg = { recorder: { enabled: false } }, polls = 0;
  lcu.request = async (m, uri) => (uri === "/lol-gameflow/v1/session" ? { status: 200, data: { gameData: { gameId: 555, queue: { id: 420 } } } } : { status: 404 });
  const live = async (p) => {
    if (p.endsWith("activeplayername")) return "Doni#NA1";
    if (p.endsWith("activeplayer")) return { championName: "Ahri" };
    if (p.endsWith("gamestats")) return { gameTime: 30 };
    if (p.endsWith("eventdata")) { polls++; return { Events: raw.slice(0, polls === 1 ? 3 : 8) }; }
    return null;
  };
  const r = attachRecorder({ lcu, getConfig: () => cfg, dir, push: () => {}, log: () => {}, platform: async () => "na1", live });
  const phase = (p) => lcu.emit("event", { uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: p });
  phase("InProgress"); await new Promise((res) => setTimeout(res, 20));
  assert.strictEqual(r.list().length, 0); // off by default: nothing
  cfg = { recorder: { enabled: true } };
  phase("InProgress"); await new Promise((res) => setTimeout(res, 50));
  phase("EndOfGame"); await new Promise((res) => setTimeout(res, 50));
  const list = r.list();
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].matchId, "NA1_555");
  assert.strictEqual(list[0].champion, "Ahri");
  assert.strictEqual(list[0].result, "win");
  assert.deepStrictEqual(list[0].counts, { kill: 1, death: 1, assist: 1, multikill: 1, objective: 1, end: 1 });
  assert.strictEqual(r.get("NA1_555").clock.gameTime, 30);
  assert.strictEqual(r.get("555").matchId, "NA1_555"); // bare id finds the platform-prefixed recording
  assert.strictEqual(r.get("EUW1_555").matchId, "NA1_555");
  // Delete takes its video and clips, never a file outside the folder; list() skips JSON that isn't a recording.
  fs.writeFileSync(path.join(dir, "NA1_555.mkv"), "v"); fs.writeFileSync(path.join(dir, "NA1_555-clip1.mp4"), "c");
  const outside = path.join(os.tmpdir(), `qp-outside-${process.pid}.mp4`); fs.writeFileSync(outside, "keep");
  r.update("NA1_555", { video: { file: path.join(dir, "NA1_555.mkv") }, clips: [{ file: path.join(dir, "NA1_555-clip1.mp4") }, { file: outside }] });
  fs.writeFileSync(path.join(dir, "settings.json"), "{}");
  assert.strictEqual(r.list().length, 1);
  assert.strictEqual(r.remove("NA1_555").ok, true);
  assert.strictEqual(r.list().length, 0);
  assert.deepStrictEqual(fs.readdirSync(dir), ["settings.json"]);
  assert.ok(fs.existsSync(outside)); fs.rmSync(outside);

  // A burst of phases records one game once; TFT waits for EndOfGame and reads that game's placement.
  let starts = 0; const lcu2 = new EventEmitter(), dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "qp-rec-"));
  lcu2.request = async (m, uri) => uri === "/lol-gameflow/v1/session" ? { status: 200, data: { gameData: { gameId: 777, queue: { id: 1100 } } } }
    : uri === "/lol-end-of-game/v1/tft-eog-stats" ? { status: 200, data: { gameId: 777, localPlayer: { ffaStanding: 3 } } } : { status: 404 };
  const r2 = attachRecorder({ lcu: lcu2, getConfig: () => cfg, dir: dir2, push: () => {}, log: () => {}, platform: async () => "na1", live, onGame: (rec, ph) => { if (ph === "start") starts++; } });
  const ph2 = (p) => lcu2.emit("event", { uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: p });
  ph2("InProgress"); ph2("InProgress"); ph2("WaitingForStats"); ph2("PreEndOfGame"); await new Promise((res) => setTimeout(res, 50));
  assert.strictEqual(starts, 1);
  assert.strictEqual(r2.live().matchId, "NA1_777"); // TFT still recording before EndOfGame
  ph2("EndOfGame"); await new Promise((res) => setTimeout(res, 50));
  assert.strictEqual(r2.live(), null);
  assert.strictEqual(r2.get("NA1_777").placement, 3);

  // League client closed during the game: the recording keeps going and ends on GameEnd.
  const lcu3 = new EventEmitter(), dir3 = fs.mkdtempSync(path.join(os.tmpdir(), "qp-rec-")); let p3 = 0;
  lcu3.request = async (m, uri) => (uri === "/lol-gameflow/v1/session" ? { status: 200, data: { gameData: { gameId: 888, queue: { id: 420 } } } } : { status: 404 });
  const live3 = async (p) => p.endsWith("activeplayername") ? "Doni#NA1" : p.endsWith("eventdata") ? (p3++ < 2 ? { Events: raw.slice(0, 2) } : { Events: raw }) : null;
  const r3 = attachRecorder({ lcu: lcu3, getConfig: () => cfg, dir: dir3, push: () => {}, log: () => {}, platform: async () => "na1", live: live3 });
  lcu3.emit("event", { uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: "InProgress" }); await new Promise((res) => setTimeout(res, 30));
  lcu3.emit("disconnect"); await new Promise((res) => setTimeout(res, 30));
  assert.strictEqual(r3.live() && r3.live().matchId, "NA1_888"); // still recording
  await new Promise((res) => setTimeout(res, 4300)); // the 2 s poll sees GameEnd
  assert.strictEqual(r3.live(), null);
  assert.strictEqual(r3.get("NA1_888").result, "win");
  // A TFT game that ended without a placement (Double Up's screen had none) gets it, and the board, from match history.
  const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), "qp-rec-"));
  fs.writeFileSync(path.join(dir4, "NA1_5663876381.json"), JSON.stringify({ matchId: "NA1_5663876381", gameId: 5663876381, queueId: 1160, game: "tft", startedAt: 1, endedAt: 2, champion: null, result: null, events: [] }));
  const r4 = attachRecorder({ lcu: new EventEmitter(), getConfig: () => cfg, dir: dir4, push: () => {}, log: () => {}, live,
    tftHistory: async () => [{ id: "NA1_5663876381", placement: 3, level: 8, units: [{ key: "TFT_Ahri", stars: 2, items: [] }], traits: [], augments: [], length: 1800 }] });
  await r4.fill();
  const got = r4.get("NA1_5663876381");
  assert.strictEqual(got.placement, 3); assert.strictEqual(got.result, "win"); assert.strictEqual(got.board.units[0].key, "TFT_Ahri");
  assert.strictEqual(got.events.filter((e) => e.type === "end").length, 1);
  await r4.fill(); assert.strictEqual(r4.get("NA1_5663876381").events.filter((e) => e.type === "end").length, 1); // filling twice adds nothing
  for (const d of [dir, dir2, dir3, dir4]) fs.rmSync(d, { recursive: true });
  console.log("test-recorder ok");
})().catch((e) => { console.error(e); process.exit(1); });

// Highlights' filter and order (recFilterClips, deck-out round 3)
{
  const R = (champion, startedAt) => ({ champion, startedAt });
  const items = [
    { r: R("Ezreal", 100), c: { types: ["kill"], start: 10, end: 25, favorite: false }, i: 0 },
    { r: R("Ezreal", 100), c: { types: ["death"], start: 40, end: 50, favorite: true }, i: 1 },
    { r: R("Ahri", 200), c: { types: ["kill", "multikill"], start: 5, end: 30, favorite: false }, i: 0 },
    { r: R("Ahri", 200), c: { types: ["manual"], mine: true, start: 60, end: 90, favorite: true }, i: 1 },
  ];
  const ids = (f) => JSON.parse(JSON.stringify(ctx.window.recFilterClips(items, f))).map((x) => x.r.champion[0] + x.c.start);
  assert.deepStrictEqual(ids({}), ["A60", "E40", "A5", "E10"]); // starred first, then newest game, then earlier in the game
  assert.deepStrictEqual(ids({ type: "kill" }), ["A5", "E10"]); // a multikill clip that also holds a kill counts as a kill
  assert.deepStrictEqual(ids({ type: "mine" }), ["A60"]);
  assert.deepStrictEqual(ids({ champ: "Ezreal" }), ["E40", "E10"]);
  assert.deepStrictEqual(ids({ star: true, sort: "new" }), ["A60", "E40"]);
  assert.deepStrictEqual(ids({ sort: "long" }), ["A60", "A5", "E10", "E40"]);
  assert.deepStrictEqual(ids({ type: "assist" }), []);
}
console.log("test-recorder highlights ok");
