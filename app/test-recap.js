// node test-recap.js — draft recap after each game (app/recap.js, DONI-349).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { recapRow, hitRate, eogResult, attachRecap } = require("./recap");

assert.strictEqual(recapRow(null, { win: true }), null);
assert.strictEqual(recapRow({ picked: 103 }, null), null);
const r = recapRow({ picked: 103, suggested: 103, role: "middle" }, { gameId: 5, win: true });
assert.strictEqual(r.followed, true);
assert.strictEqual(recapRow({ picked: 99, suggested: 103 }, { win: false }).followed, false);
assert.strictEqual(recapRow({ picked: 99, suggested: null }, { win: false }).followed, false);
assert.deepStrictEqual(hitRate([{ suggested: 1, followed: true, win: true }, { suggested: 1, followed: true, win: false }, { suggested: 2, followed: false, win: true }, { suggested: null, win: true }]),
  { followed: { games: 2, wins: 1 }, ignored: { games: 1, wins: 1 } });
assert.deepStrictEqual(eogResult({ gameId: 7, teams: [{ isPlayerTeam: false, isWinningTeam: true }, { isPlayerTeam: true, isWinningTeam: false }] }), { gameId: 7, win: false });
assert.deepStrictEqual(eogResult({ localPlayer: { stats: { WIN: 1 } } }), { gameId: null, win: true });
assert.strictEqual(eogResult({}), null);

// Flow: lock (top suggestion was Ahri, you picked Lux) → game ends in a win → one row, a feed line, record updated, saved.
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qp-recap-")), file = path.join(dir, "r.json"), pushed = [];
  global.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ champion: 103, score: 0.9 }] }) });
  const lcu = new EventEmitter();
  lcu.request = async () => ({ status: 200, data: { gameId: 42, teams: [{ isPlayerTeam: true, isWinningTeam: true }] } });
  const rc = attachRecap({ lcu, push: (m) => pushed.push(m), getConfig: () => ({}), file, names: (id) => ({ 103: "Ahri", 99: "Lux" })[id], log: () => {} });
  lcu.emit("event", { uri: "/lol-champ-select/v1/session", eventType: "Update", data: { gameId: 42, localPlayerCellId: 0,
    myTeam: [{ cellId: 0, championId: 99, assignedPosition: "middle" }], theirTeam: [], actions: [[{ actorCellId: 0, type: "pick", completed: true }]] } });
  await new Promise((res) => setTimeout(res, 10));
  lcu.emit("event", { uri: "/lol-gameflow/v1/gameflow-phase", eventType: "Update", data: "EndOfGame" });
  await new Promise((res) => setTimeout(res, 10));
  assert.deepStrictEqual(pushed, ["Recap: you picked Lux (suggested Ahri), win"]);
  assert.deepStrictEqual(rc.list().record, { followed: { games: 0, wins: 0 }, ignored: { games: 1, wins: 1 } });
  assert.strictEqual(JSON.parse(fs.readFileSync(file, "utf8")).length, 1);
  fs.rmSync(dir, { recursive: true });
  console.log("test-recap ok");
})().catch((e) => { console.error(e); process.exit(1); });
