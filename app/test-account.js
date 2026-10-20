// Match history keeps every game it has seen: the client's League history can shrink to one game (DONI-524), and a short
// history is back-filled from the crawler's /lol/summoner lookup.
const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { createAccount } = require("./account");

const file = path.join(os.tmpdir(), `qp-hist-${process.pid}.json`);
const game = (id, ts, win) => ({ gameId: id, mapId: 11, queueId: 420, gameCreation: ts * 1000,
  participants: [{ participantId: 1, championId: 99, stats: { win, kills: 1, deaths: 2, assists: 3 }, timeline: { lane: "MIDDLE", role: "SOLO" } }],
  participantIdentities: [{ participantId: 1, player: { puuid: "me" } }] });
let games = [], asked = [];
const lcu = { request: async (m, uri) => uri.startsWith("/lol-summoner") ? { status: 200, data: { puuid: "me", gameName: "Poop Crayons", tagLine: "mugen" } }
  : uri.startsWith("/riotclient/region-locale") ? { status: 200, data: { region: "NA" } }
  : { status: 200, data: { games: { games } } } };
const crawler = http.createServer((req, res) => {
  asked.push(req.url);
  res.end(JSON.stringify({ matches: [{ id: "NA1_0", queueId: 420, startedAt: 50000, champion: 7, role: "UTILITY", win: true, kills: 0, deaths: 1, assists: 9 },
    { id: "NA1_4", queueId: 420, startedAt: 400000, champion: 99, role: "MIDDLE", win: false, kills: 1, deaths: 2, assists: 3 }] }));
});

(async () => {
  await new Promise((r) => crawler.listen(0, "127.0.0.1", r));
  const acc = createAccount({ lcu, getConfig: () => ({ crawler_url: `http://127.0.0.1:${crawler.address().port}/` }), setConfigKey() {}, push() {}, historyFile: file });
  games = [game(3, 300, true), game(2, 200, false), game(1, 100, true)];
  assert.deepStrictEqual((await acc.getMatchHistory(3)).map((g) => g.gameId), [3, 2, 1]);
  assert.strictEqual(asked.length, 0, "a full history never asks the crawler");
  games = [game(4, 400, false)]; // client shrank to the newest game
  const h = await acc.getMatchHistory(10);
  assert.deepStrictEqual(asked, ["/lol/summoner/Poop%20Crayons%23mugen?region=na1"]);
  assert.deepStrictEqual(h.map((g) => g.gameId), [4, 3, 2, 1, 0], "client game 4 and crawler game 4 merge by id; crawler adds game 0");
  assert.deepStrictEqual([h[4].position, h[4].championId, h[4].ts], ["utility", 7, 50]);
  await acc.getMatchHistory(10);
  assert.strictEqual(asked.length, 1, "the crawler is asked at most every 10 min");
  assert.deepStrictEqual((await acc.getMatchHistory(2)).map((g) => g.gameId), [4, 3]);
  fs.unlinkSync(file);
  crawler.close();
  console.log("account ok");
})().catch((e) => { console.error(e); process.exit(1); });
