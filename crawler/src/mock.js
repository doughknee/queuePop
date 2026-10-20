// Mock Riot API serving crawler/fixtures, for tests and dry runs:
//   node src/mock.js 47901   then   RIOT_BASE_URL=http://127.0.0.1:47901 RIOT_API_KEY=x npm start
// Every region and host maps to the same fixtures. fail429Once makes the first request a 429.
const fs = require("fs");
const path = require("path");
const http = require("http");

const DIR = path.join(__dirname, "..", "fixtures");
const load = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

// rejectKey: requests carrying that key get 403 Forbidden, like an expired development key.
// accountGame: which fixture set account-v1 resolves Riot ids from ("lol" | "tft"); the fixtures give one name a different
// puuid per game, unlike Riot.
function startMock(port = 0, { fail429Once = false, rejectKey = null, accountGame = "lol" } = {}) {
  const matches = {};
  const timelines = {};
  for (const f of fs.readdirSync(DIR).filter((f) => /^(lol|tft)-(match|timeline)-\d+\.json$/.test(f))) {
    const m = load(f);
    (f.includes("timeline") ? timelines : matches)[m.metadata.matchId || m.metadata.match_id] = m;
  }
  const stats = { requests: 0, served429: 0 };
  const server = http.createServer((req, res) => {
    stats.requests++;
    stats.lastKey = req.headers["x-riot-token"];
    const send = (code, body, extra = {}) => {
      res.writeHead(code, { "content-type": "application/json", "x-app-rate-limit": "20:1,100:120", ...extra });
      res.end(JSON.stringify(body));
    };
    if (rejectKey && req.headers["x-riot-token"] === rejectKey) return send(403, { status: { message: "Forbidden", status_code: 403 } });
    if (fail429Once && !stats.served429) {
      stats.served429++;
      return send(429, { status: { message: "Rate limit exceeded", status_code: 429 } }, { "retry-after": "1", "x-rate-limit-type": "application" });
    }
    const u = new URL(req.url, "http://x");
    const p = u.pathname;
    const file = (f) => fs.existsSync(path.join(DIR, f)) ? send(200, load(f)) : send(200, []);
    // ids file picked by a hash of the puuid so players see different but overlapping lists
    const idsFor = (game, puuid) => file(`${game}-ids-${[...puuid].reduce((s, c) => s + c.charCodeAt(0), 0) % 3}.json`);
    let m;
    if ((m = /^\/lol\/league\/v4\/(challenger|grandmaster|master)leagues\/by-queue\//.exec(p))) return send(200, load(`lol-league-${m[1]}.json`));
    if ((m = /^\/tft\/league\/v1\/(challenger|grandmaster|master)$/.exec(p))) return send(200, load(`tft-league-${m[1]}.json`));
    if ((m = /^\/lol\/league\/v4\/entries\/[^/]+\/(\w+)\/(\w+)$/.exec(p)) || (m = /^\/tft\/league\/v1\/entries\/(\w+)\/(\w+)$/.exec(p))) {
      return u.searchParams.get("page") === "1" ? file(`${p.startsWith("/lol") ? "lol" : "tft"}-entries-${m[1]}-${m[2]}.json`) : send(200, []);
    }
    // Lookups (DONI-508/512): Riot ids and puuids come from the fixture matches' participants.
    if ((m = /^\/riot\/account\/v1\/accounts\/by-riot-id\/([^/]+)\/([^/]+)$/.exec(p))) {
      const [name, tag] = [decodeURIComponent(m[1]), decodeURIComponent(m[2])].map((s) => s.toLowerCase());
      const hit = Object.entries(matches).filter(([id]) => id.startsWith(accountGame === "lol" ? "NA1_52" : "NA1_53")).flatMap(([, x]) => x.info.participants).find((x) => x.riotIdGameName?.toLowerCase() === name && x.riotIdTagline?.toLowerCase() === tag);
      return hit ? send(200, { puuid: hit.puuid, gameName: hit.riotIdGameName, tagLine: hit.riotIdTagline }) : send(404, { status: { message: "Data not found", status_code: 404 } });
    }
    if (/^\/lol\/summoner\/v4\/summoners\/by-puuid\//.test(p)) return send(200, { summonerLevel: 321, profileIconId: 29 });
    if (/^\/(lol\/league\/v4\/entries|tft\/league\/v1)\/by-puuid\//.test(p)) {
      return send(200, [{ queueType: p.startsWith("/lol") ? "RANKED_SOLO_5x5" : "RANKED_TFT", tier: "DIAMOND", rank: "II", leaguePoints: 42, wins: 30, losses: 20 }]);
    }
    if ((m = /^\/(lol|tft)\/match\/v[15]\/matches\/by-puuid\/([^/]+)\/ids$/.exec(p))) {
      // A lookup asks without startTime: answer with the fixture matches that player is in.
      if (!u.searchParams.has("startTime")) return send(200, Object.entries(matches).filter(([id, x]) => id.startsWith("NA1_5" + (m[1] === "lol" ? "2" : "3")) && x.info.participants.some((q) => q.puuid === m[2])).map(([id]) => id));
      return idsFor(m[1], m[2]);
    }
    if ((m = /^\/lol\/match\/v5\/matches\/([^/]+)\/timeline$/.exec(p))) return timelines[m[1]] ? send(200, timelines[m[1]]) : send(404, { status: { message: "Data not found", status_code: 404 } });
    if ((m = /^\/(?:lol|tft)\/match\/v[15]\/matches\/([^/]+)$/.exec(p))) {
      return matches[m[1]] ? send(200, matches[m[1]]) : send(404, { status: { message: "Data not found - match file not found", status_code: 404 } });
    }
    send(404, { status: { message: "Not found", status_code: 404 } });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, stats, url: `http://127.0.0.1:${server.address().port}` })));
}

if (require.main === module) startMock(Number(process.argv[2]) || 47901).then((m) => console.log("mock Riot API on " + m.url));

module.exports = { startMock };
