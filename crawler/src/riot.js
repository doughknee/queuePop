// Riot API client: every call goes through the limiter. Platform hosts (na1) serve the ladders;
// regional hosts (americas) serve match-v5 / tft-match-v1.

const ROUTING = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe", me1: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

// key is a string, or a function (game) called per request so a rotated key applies without a restart. A call's game is the
// first word of its method ("lol ids", "tft match", "lol account"). When League and TFT have different keys (a personal key per
// product), each key has its own rate limits, so the app bucket is per game: "americas/lol", "americas/tft".
// onAuthFail(status, message) fires on 401/403: Riot's answer to an expired or revoked key.
function createClient({ key, base, limiter, log = () => {}, onAuthFail = () => {} }) {
  // Returns parsed JSON, or null on 404.
  async function get(host, path, method) {
    for (let attempt = 0; ; attempt++) {
      const game = method.split(" ")[0], keyOf = (g) => typeof key === "function" ? key(g) : key;
      const used = keyOf(game), lane = keyOf("lol") !== keyOf("tft") ? `${host}/${game}` : host;
      await limiter.take(lane, method);
      let res;
      try {
        res = await fetch((base || `https://${host}.api.riotgames.com`) + path, { headers: { "X-Riot-Token": used }, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        if (attempt >= 3) throw e;
        await limiter.sleep(2000 * (attempt + 1));
        continue;
      }
      limiter.update(lane, method, res.headers, res.status);
      if (res.status === 429 && attempt < 5) { log(`429 ${host} ${method}, retry-after ${res.headers.get("retry-after")}`); continue; }
      if (res.status >= 500 && attempt < 3) { await limiter.sleep(2000 * (attempt + 1)); continue; }
      if (res.status === 404) return null;
      if (res.status === 401 || res.status === 403) {
        const msg = (await res.json().catch(() => null))?.status?.message || res.statusText;
        onAuthFail(res.status, msg, used);
        throw Object.assign(new Error(`${res.status} ${msg} ${host}${path}`), { auth: true });
      }
      // Riot encrypts puuids per app: a puuid stored under another key's app (a new personal key) answers 400 "Exception
      // decrypting <puuid>". Flagged so the crawl can retire the stored players (jobs.retirePuuids).
      if (res.status === 400) {
        const msg = (await res.json().catch(() => null))?.status?.message || "";
        if (/decrypt/i.test(msg)) throw Object.assign(new Error(`400 ${msg} ${host}${path}`), { decrypt: true, game, puuid: /\/by-puuid\/([^/?]+)/.exec(path)?.[1] ?? null });
      }
      if (!res.ok) throw new Error(`${res.status} ${host}${path}`);
      return res.json();
    }
  }
  return { get };
}

module.exports = { createClient, ROUTING };
