// Leaderboards and any-player lookups (DONI-508 League, DONI-512 TFT).
// Leaderboards read the players table (ladder rank, LP, wins/losses from league-v4 / tft-league-v1; apex ladders refreshed
// every 30 min by the seed loop) and lol_names (Riot ids, both games). Lookups go to Riot on demand: account-v1 + league +
// the last 20 match ids, matches from our DB when we hold the raw JSON, else from Riot. Cached 10 min, at most PER_MIN fresh
// lookups a minute across both games, so the crawl keeps most of the per-host quota (one lookup costs ~23 requests).
const zlib = require("zlib");
const { ROUTING } = require("./riot");
const { TIERS } = require("./jobs");

const r4 = (x) => Math.round(x * 10000) / 10000;
const DIV = "CASE division WHEN 'I' THEN 4 WHEN 'II' THEN 3 WHEN 'III' THEN 2 ELSE 1 END";
const err = (status, msg, extra) => Object.assign(new Error(msg), { status, ...extra });

// Ladder: highest tier, division, LP first. TFT rows also carry what we crawled for that player (all stored boards).
function leaderboard(db, game, q = {}) {
  const limit = Math.min(500, Math.max(1, Number(q.limit) || 100));
  const region = q.region && q.region !== "all" ? q.region : null;
  const rows = db.prepare(`SELECT p.puuid, n.riot_id riotId, p.region, p.tier, p.division, p.lp, p.wins, p.losses, p.seeded_at FROM players p
    LEFT JOIN lol_names n ON n.puuid = p.puuid WHERE p.game = ?${region ? " AND p.region = ?" : ""}
    ORDER BY p.tier_n DESC, ${DIV.replace("division", "p.division")} DESC, p.lp DESC LIMIT ${limit}`).all(game, ...(region ? [region] : []));
  let crawled = new Map();
  if (game === "tft" && rows.length) {
    crawled = new Map(db.prepare(`SELECT puuid, count(*) games, sum(placement) ps, sum(placement <= 4) top4 FROM tft_participants
      WHERE puuid IN (${rows.map(() => "?").join(",")}) GROUP BY puuid`).all(...rows.map((r) => r.puuid)).map((r) => [r.puuid, r]));
  }
  return { game, region: region || "all", players: rows.map((r, i) => {
    const c = crawled.get(r.puuid), ladder = (r.wins ?? 0) + (r.losses ?? 0);
    return { rank: i + 1, riotId: r.riotId, region: r.region, tier: r.tier, division: TIERS.indexOf(r.tier) >= 7 ? null : r.division, lp: r.lp,
      wins: r.wins, losses: r.losses, games: ladder || null, winRate: ladder ? r4(r.wins / ladder) : null, updatedAt: r.seeded_at,
      ...(game === "tft" && { crawled: c ? { games: c.games, avgPlacement: r4(c.ps / c.games), top4Rate: r4(c.top4 / c.games) } : null }) };
  }) };
}

// "Name#TAG" (or "Name-TAG", URL-encoded either way).
function parseRiotId(s) {
  const v = decodeURIComponent(s).trim(), i = Math.max(v.lastIndexOf("#"), v.lastIndexOf("-"));
  if (i <= 0 || i === v.length - 1) throw err(400, "riot id must look like Name#TAG");
  return { name: v.slice(0, i), tag: v.slice(i + 1) };
}

const ranked = (entries) => (entries || []).map((e) => ({ queue: e.queueType, tier: e.tier, division: TIERS.indexOf(e.tier) >= 7 ? null : e.rank,
  lp: e.leaguePoints, wins: e.wins, losses: e.losses }));

function lolMatch(m, puuid) {
  const i = m.info, p = i.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return { id: m.metadata.matchId, queueId: i.queueId, startedAt: i.gameStartTimestamp, duration: i.gameDuration, champion: p.championId, role: p.teamPosition || "",
    win: !!p.win, kills: p.kills, deaths: p.deaths, assists: p.assists, cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0), gold: p.goldEarned,
    items: [0, 1, 2, 3, 4, 5, 6].map((k) => p["item" + k]).filter(Boolean), spells: [p.summoner1Id, p.summoner2Id],
    keystone: p.perks?.styles?.[0]?.selections?.[0]?.perk ?? null };
}
function tftMatch(m, puuid) {
  const i = m.info, p = i.participants.find((x) => x.puuid === puuid);
  if (!p) return null;
  return { id: m.metadata.match_id, queueId: i.queue_id, startedAt: i.game_datetime, length: Math.round(i.game_length || 0), placement: p.placement, level: p.level,
    traits: (p.traits || []).filter((t) => t.tier_current > 0).map((t) => [t.name, t.tier_current]),
    units: (p.units || []).map((u) => [u.character_id, u.tier, u.itemNames || []]), augments: p.augments || [] };
}

function createLookup({ db, riot, keyOk = () => true, perMin = 3, ttl = 600000, now = Date.now }) {
  const cache = new Map(), recent = [];
  const rawOf = db.prepare("SELECT raw FROM matches WHERE id = ? AND raw IS NOT NULL");

  async function fetchPlayer(game, region, name, tag) {
    const host = ROUTING[region], acct = await riot.get(host === "sea" ? "asia" : host, `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, "account");
    if (!acct) throw err(404, "no such Riot id");
    const puuid = acct.puuid;
    const [summ, league, ids] = await Promise.all([
      game === "lol" ? riot.get(region, `/lol/summoner/v4/summoners/by-puuid/${puuid}`, "lol summoner") : null,
      riot.get(region, game === "lol" ? `/lol/league/v4/entries/by-puuid/${puuid}` : `/tft/league/v1/by-puuid/${puuid}`, `${game} league puuid`),
      riot.get(host, game === "lol" ? `/lol/match/v5/matches/by-puuid/${puuid}/ids?count=20` : `/tft/match/v1/matches/by-puuid/${puuid}/ids?count=20`, `${game} ids`),
    ]);
    const matches = await Promise.all((ids || []).map(async (id) => {
      const have = rawOf.get(id);
      const m = have ? JSON.parse(zlib.gunzipSync(have.raw)) : await riot.get(host, game === "lol" ? `/lol/match/v5/matches/${id}` : `/tft/match/v1/matches/${id}`, `${game} match`);
      return m && (game === "lol" ? lolMatch(m, puuid) : tftMatch(m, puuid));
    }));
    return { game, riotId: `${acct.gameName}#${acct.tagLine}`, puuid, region, ...(summ && { level: summ.summonerLevel, iconId: summ.profileIconId }),
      ranked: ranked(league), matches: matches.filter(Boolean), fetchedAt: now() };
  }

  // game = "lol" | "tft". Rejects with .status 400 (bad id/region), 404 (unknown), 429 (cap, .retryAfter s), 503 (key invalid).
  async function player(game, riotId, region) {
    if (!ROUTING[region]) throw err(400, `unknown region ${region}`);
    const { name, tag } = parseRiotId(riotId);
    const k = `${game}:${region}:${name.toLowerCase()}#${tag.toLowerCase()}`, hit = cache.get(k);
    if (hit && now() - hit.at < ttl) return hit.p;
    if (!keyOk()) throw err(503, "Riot key invalid; lookups resume when a new key is posted");
    while (recent.length && recent[0] <= now() - 60000) recent.shift();
    if (recent.length >= perMin) throw err(429, `at most ${perMin} lookups a minute`, { retryAfter: Math.ceil((recent[0] + 60000 - now()) / 1000) });
    recent.push(now());
    const p = fetchPlayer(game, region, name, tag);
    cache.set(k, { at: now(), p });
    p.catch(() => cache.delete(k)); // failures are not cached
    for (const [key, v] of cache) if (now() - v.at >= ttl) cache.delete(key);
    return p;
  }

  return { player };
}

module.exports = { leaderboard, createLookup, parseRiotId };
