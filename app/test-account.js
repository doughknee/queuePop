// Match history keeps every game it has seen: the client's League history can shrink to one game (DONI-524).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createAccount } = require("./account");

const file = path.join(os.tmpdir(), `qp-hist-${process.pid}.json`);
const game = (id, ts, win) => ({ gameId: id, mapId: 11, queueId: 420, gameCreation: ts * 1000,
  participants: [{ participantId: 1, championId: 99, stats: { win, kills: 1, deaths: 2, assists: 3 }, timeline: { lane: "MIDDLE", role: "SOLO" } }],
  participantIdentities: [{ participantId: 1, player: { puuid: "me" } }] });
let games = [];
const lcu = { request: async (m, uri) => uri.startsWith("/lol-summoner") ? { status: 200, data: { puuid: "me" } }
  : { status: 200, data: { games: { games } } } };
const acc = createAccount({ lcu, getConfig: () => ({}), setConfigKey() {}, push() {}, historyFile: file });

(async () => {
  games = [game(3, 300, true), game(2, 200, false), game(1, 100, true)];
  assert.deepStrictEqual((await acc.getMatchHistory(10)).map((g) => g.gameId), [3, 2, 1]);
  games = [game(4, 400, false)]; // client shrank to the newest game
  const h = await acc.getMatchHistory(10);
  assert.deepStrictEqual(h.map((g) => g.gameId), [4, 3, 2, 1]);
  assert.strictEqual(h[0].win, false); assert.strictEqual(h[1].championId, 99);
  assert.deepStrictEqual((await acc.getMatchHistory(2)).map((g) => g.gameId), [4, 3]);
  fs.unlinkSync(file);
  console.log("account ok");
})().catch((e) => { console.error(e); process.exit(1); });
