// Riot API client: every call goes through the limiter. Platform hosts (na1) serve the ladders;
// regional hosts (americas) serve match-v5 / tft-match-v1.

const ROUTING = {
  na1: "americas", br1: "americas", la1: "americas", la2: "americas",
  euw1: "europe", eun1: "europe", tr1: "europe", ru: "europe", me1: "europe",
  kr: "asia", jp1: "asia",
  oc1: "sea", ph2: "sea", sg2: "sea", th2: "sea", tw2: "sea", vn2: "sea",
};

function createClient({ key, base, limiter, log = () => {} }) {
  // Returns parsed JSON, or null on 404.
  async function get(host, path, method) {
    for (let attempt = 0; ; attempt++) {
      await limiter.take(host, method);
      let res;
      try {
        res = await fetch((base || `https://${host}.api.riotgames.com`) + path, {
          headers: { "X-Riot-Token": key }, signal: AbortSignal.timeout(30000),
        });
      } catch (e) {
        if (attempt >= 3) throw e;
        await limiter.sleep(2000 * (attempt + 1));
        continue;
      }
      limiter.update(host, method, res.headers, res.status);
      if (res.status === 429 && attempt < 5) { log(`429 ${host} ${method}, retry-after ${res.headers.get("retry-after")}`); continue; }
      if (res.status >= 500 && attempt < 3) { await limiter.sleep(2000 * (attempt + 1)); continue; }
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${host}${path}`);
      return res.json();
    }
  }
  return { get };
}

module.exports = { createClient, ROUTING };
