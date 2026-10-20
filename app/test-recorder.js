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

// The strip: markers placed by game time over the game's length; events without a time are left off.
const ctx = { window: {}, Math, Number, String };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "recordings.js"), "utf8"), ctx);
const m = ctx.window.recStripMarkers({ events: [{ t: 450, type: "kill", label: "Killed Zed" }, { t: 900, type: "end", label: "Victory" }, { t: null, type: "end", label: "4th place" }] });
assert.deepStrictEqual(JSON.parse(JSON.stringify(m)).map((x) => [x.left, x.type, x.label]), [[50, "kill", "7:30 Killed Zed"], [100, "end", "15:00 Victory"]]);

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
  assert.strictEqual(r.remove("NA1_555").ok, true);
  assert.strictEqual(r.list().length, 0);
  fs.rmSync(dir, { recursive: true });
  console.log("test-recorder ok");
})().catch((e) => { console.error(e); process.exit(1); });
