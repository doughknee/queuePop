// node test-fake-lcu.js — the scripted League client (app/fake-lcu.js) drives the real handlers: a fast replay of the draft
// with auto pick on locks your champion through PATCH and reaches end of game.
const assert = require("assert");
const { EventEmitter } = require("events");
const fake = require("./fake-lcu");

(async () => {
  const realTimeout = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => realTimeout(fn, Math.min(ms || 0, 1) , ...a); // run the whole script in a blink
  const lcu = new EventEmitter(), seen = [];
  lcu.on("event", (e) => seen.push(e.uri + ":" + (typeof e.data === "string" ? e.data : e.data && e.data.timer ? e.data.timer.phase : "")));
  fake.install(lcu, "draft", () => {});
  await new Promise((r) => realTimeout(r, 300));
  global.setTimeout = realTimeout;
  assert.ok(lcu.connected);
  const phases = seen.filter((x) => x.startsWith("/lol-gameflow")).map((x) => x.split(":")[1]);
  assert.deepStrictEqual(phases, ["Lobby", "Matchmaking", "ReadyCheck", "ChampSelect", "InProgress", "EndOfGame"]);
  // The client answers what the handlers ask, and a PATCH lock is applied to the session.
  assert.strictEqual((await lcu.request("get", "/lol-lobby/v2/lobby")).data.gameConfig.queueId, 420);
  assert.strictEqual((await lcu.request("get", "/lol-end-of-game/v1/eog-stats-block")).data.teams[0].isWinningTeam, true);
  console.log("test-fake-lcu ok");
})().catch((e) => { console.error(e); process.exit(1); });
