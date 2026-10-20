// Read-only JSON API over the stats_* tables. No auth, CORS open: meant for loopback/LAN.
// The one write is POST /admin/key (Bearer ADMIN_TOKEN); it and the status page at / answer loopback/private-LAN only.
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { TIERS, nextAggregation } = require("./jobs");
const { getMeta, setMeta, riotKey, keyHealth } = require("./db");
const champ = require("./agg-champion");
const win = require("./agg-window");

const PAGE = fs.readFileSync(path.join(__dirname, "status.html"));
const KEY_RE = /^RGAPI-[0-9a-f-]{36}$/;
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const lan = (a = "") => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.replace(/^::ffff:/, "")) || a === "::1";

const r4 = (x) => Math.round(x * 10000) / 10000;
const byVersion = (a, b) => { const [x, y] = [a, b].map((v) => v.split(".").map(Number)); return y[0] - x[0] || y[1] - x[1]; };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

// Patch rollover (D11): a request without ?patch gets the newest patch with at least MIN_MATCHES matches (League ~2 h of crawl
// at ~1,000 matches/h; TFT matches = boards / 8), else the patch with the most matches, so a new patch doesn't take over the app
// with a handful of games. /patches lists every patch newest first plus counts, minMatches and that default.
const MIN_MATCHES = { lol: 2000, tft: 1000 };
const pickPatch = (game, list, counts) => list.find((p) => counts[p] >= MIN_MATCHES[game]) || [...list].sort((x, y) => counts[y] - counts[x])[0] || null;
function patches(db) {
  const counts = (t, col, per) => Object.fromEntries(db.prepare(`SELECT patch, sum(${col}) n FROM ${t} GROUP BY patch`).all()
    .filter((r) => r.patch !== "?").map((r) => [r.patch, Math.round(r.n / per)]));
  const all = counts("stats_lol_matches", "matches", 1);
  // ARAM rows live under "<patch>-aram" (D13): listed apart as aram, counted per plain patch
  const aramC = Object.fromEntries(Object.entries(all).filter(([p]) => /-aram$/.test(p)).map(([p, n]) => [p.replace(/-aram$/, ""), n]));
  const c = { lol: Object.fromEntries(Object.entries(all).filter(([p]) => !/-aram$/.test(p))), tft: counts("stats_tft_boards", "boards", 8), aram: aramC };
  const lol = Object.keys(c.lol).sort(byVersion), tft = Object.keys(c.tft).sort(byVersion), aram = Object.keys(aramC).sort(byVersion);
  return { lol, tft, aram, counts: c, minMatches: MIN_MATCHES, default: { lol: pickPatch("lol", lol, c.lol), tft: pickPatch("tft", tft, c.tft) } };
}

// WHERE clause for ?patch&region&bracket. bracket = minimum tier ("emerald" = Emerald and above).
function where(q, patch) {
  const w = ["patch = ?"], a = [patch];
  if (q.region && q.region !== "all") { w.push("region = ?"); a.push(q.region); }
  if (q.bracket && q.bracket !== "all") {
    const i = TIERS.indexOf(q.bracket.toUpperCase());
    if (i < 0) throw bad("bracket must be a tier name or 'all'");
    w.push(`bracket IN (${TIERS.slice(i).map(() => "?").join(",")})`);
    a.push(...TIERS.slice(i));
  }
  return [w.join(" AND "), a];
}

// Rows under min_games (default 200) stay in the response, flagged lowSample so the UI can grey them.
// ?set (TFT set number) picks the newest patch that has matches of that set; it doesn't filter within a patch
// (ponytail: stats_* aren't keyed by set; a patch spanning two sets is rare, add a column if it ever matters).
function head(db, q, game) {
  const bySet = q.set !== undefined && game === "tft" ? new Set(db.prepare('SELECT DISTINCT patch FROM matches WHERE game = ? AND "set" = ?').all(game, Number(q.set)).map((r) => r.patch)) : null;
  const ps = patches(db);
  // ?queue=450|aram (League): the same patch's ARAM rows, stored under "<patch>-aram"; patch in the response keeps the suffix
  const aram = game === "lol" && ["450", "aram"].includes(String(q.queue || "").toLowerCase());
  if (game === "lol" && q.queue && !aram && !["420", "440", "ranked"].includes(String(q.queue).toLowerCase())) throw bad("queue must be ranked (420/440) or aram (450)");
  const base = (q.patch || "").replace(/-aram$/, "") || pickPatch(game, ps[game].filter((p) => !bySet || bySet.has(p)), ps.counts[game]);
  const patch = aram && base ? base + "-aram" : base;
  const minGames = q.min_games === undefined ? 200 : Number(q.min_games);
  if (!(minGames >= 0)) throw bad("min_games must be a number >= 0");
  const days = win.days(q);
  return { patch, ...(aram && { queue: 450 }), ...(bySet && { set: Number(q.set) }), ...(days && { days, since: win.cutoff(days) }), region: q.region || "all", bracket: q.bracket || "all", minGames };
}

function lolTiers(db, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const M = win.src(q, "lol_matches"), B = win.src(q, "lol_bans"), C = win.src(q, "lol_champ");
  const matches = db.prepare(`SELECT sum(matches) n FROM ${M.t} WHERE ${w}${M.d}`).get(...a, ...M.da).n || 0;
  const bans = new Map(db.prepare(`SELECT champion, sum(bans) n FROM ${B.t} WHERE ${w}${B.d} GROUP BY champion`).all(...a, ...B.da).map((r) => [r.champion, r.n]));
  const roleW = q.role ? " AND role = ?" : "";
  const rows = db.prepare(`SELECT champion, role, sum(games) games, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d}${roleW}
    GROUP BY champion, role ORDER BY games DESC`).all(...a, ...C.da, ...(q.role ? [q.role.toUpperCase()] : []));
  // players / gamesPerPlayer (depth) are per patch even with ?days; trend=1 adds the per-day series.
  const depth = win.depthMap(db, w, a), series = q.trend ? win.daily(db, w, a, q, "lol_champ", "champion, role", "sum(games) games, sum(wins) wins") : null;
  return { ...h, role: q.role || "all", matches, champions: rows.map((r) => {
    const players = depth.get(`${r.champion}|${r.role}`) || null;
    return { champion: r.champion, role: r.role, games: r.games, wins: r.wins,
      winRate: r4(r.wins / r.games), pickRate: r4(r.games / matches), banRate: r4((bans.get(r.champion) || 0) / matches), lowSample: r.games < h.minGames,
      players, gamesPerPlayer: players ? r4(r.games / players) : null,
      ...(series && { daily: (series.get(`${r.champion}|${r.role}`) || []).map((d) => ({ day: d.day, games: d.games, winRate: r4(d.wins / d.games) })) }) };
  }) };
}

function lolChampion(db, champion, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  // ?days windows the strip and roles; builds, matchups and the depth blocks stay per patch.
  const M = win.src(q, "lol_matches"), C = win.src(q, "lol_champ"), B = win.src(q, "lol_bans");
  const matches = db.prepare(`SELECT sum(matches) n FROM ${M.t} WHERE ${w}${M.d}`).get(...a, ...M.da).n || 0;
  const roles = db.prepare(`SELECT role, sum(games) games, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d} AND champion = ? GROUP BY role ORDER BY games DESC`).all(...a, ...C.da, champion);
  const role = q.role ? q.role.toUpperCase() : roles[0]?.role;
  const s = roles.find((r) => r.role === role) || { games: 0, wins: 0 };
  const bans = db.prepare(`SELECT sum(bans) n FROM ${B.t} WHERE ${w}${B.d} AND champion = ?`).get(...a, ...B.da, champion).n || 0;
  const builds = { item: [], keystone: [], rune: [], spells: [], skills: [] };
  const rows = db.prepare(`SELECT kind, key, sum(games) games, sum(wins) wins FROM stats_lol_build WHERE ${w} AND champion = ? AND role = ?
    GROUP BY kind, key ORDER BY games DESC`).all(...a, champion, role ?? "");
  // Skill orders come from a timeline sample, so their pick rate is out of the sampled games.
  const skillGames = rows.filter((b) => b.kind === "skills").reduce((n, b) => n + b.games, 0);
  for (const b of rows) {
    if (builds[b.kind].length < 30) builds[b.kind].push({ key: b.key, games: b.games, winRate: r4(b.wins / b.games),
      pickRate: r4(b.games / (b.kind === "skills" ? skillGames : s.games)), lowSample: b.games < h.minGames });
  }
  const matchups = db.prepare(`SELECT opponent, sum(games) games, sum(wins) wins FROM stats_lol_matchup WHERE ${w} AND champion = ? AND role = ?
    GROUP BY opponent ORDER BY games DESC LIMIT 40`).all(...a, champion, role ?? "").map((r) => ({ opponent: r.opponent, games: r.games, winRate: r4(r.wins / r.games), lowSample: r.games < h.minGames }));
  return { ...h, champion, role: role ?? null, roles: roles.map((r) => ({ role: r.role, games: r.games })),
    strip: { games: s.games, wins: s.wins, winRate: s.games ? r4(s.wins / s.games) : 0, pickRate: matches ? r4(s.games / matches) : 0, banRate: matches ? r4(bans / matches) : 0, matches, lowSample: s.games < h.minGames },
    builds, matchups, ...champ.depth(db, w, a, { champion, role: role ?? "", s, minGames: h.minGames, matchups }), ...win.champion(db, w, a, champion, role ?? "") };
}

// id "<trait>,<carry>" (DONI-502). ponytail: an id left from the old rule (boards whose raw was gone at backfill-comps) reads as
// trait + second trait; there were ~45 such matches on 2026-10-20, they age out with the patch.
const compKey = (id) => { const [t, c] = id.split(","); return { traits: t === "none" ? [] : [t], carry: c || null }; };
const comp = (r, boards, minGames) => ({ id: r.comp, ...compKey(r.comp), games: r.games,
  avgPlacement: r4(r.ps / r.games), top4Rate: r4(r.top4 / r.games), winRate: r4(r.wins / r.games), pickRate: r4(r.games / boards), lowSample: r.games < minGames });

function tftComps(db, q = {}) {
  const h = head(db, q, "tft");
  const [w, a] = where(q, h.patch);
  const Bd = win.src(q, "tft_boards"), C = win.src(q, "tft_comp");
  const boards = db.prepare(`SELECT sum(boards) n FROM ${Bd.t} WHERE ${w}${Bd.d}`).get(...a, ...Bd.da).n || 0;
  const rows = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d}
    GROUP BY comp ORDER BY games DESC LIMIT 200`).all(...a, ...C.da);
  const series = q.trend ? win.daily(db, w, a, q, "tft_comp", "comp", "sum(games) games, sum(placement_sum) ps") : null;
  return { ...h, boards, comps: rows.map((r) => ({ ...comp(r, boards, h.minGames),
    ...(series && { daily: (series.get(r.comp) || []).map((d) => ({ day: d.day, games: d.games, avgPlacement: r4(d.ps / d.games) })) }) })) };
}

function tftComp(db, id, q = {}) {
  const h = head(db, q, "tft");
  const [w, a] = where(q, h.patch);
  // ?days windows the comp row; units, augments and traits stay per patch.
  const Bd = win.src(q, "tft_boards"), C = win.src(q, "tft_comp");
  const boards = db.prepare(`SELECT sum(boards) n FROM ${Bd.t} WHERE ${w}${Bd.d}`).get(...a, ...Bd.da).n || 0;
  const r = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d} AND comp = ? GROUP BY comp`).get(...a, ...C.da, id);
  if (!r) return null;
  const parts = { unit: [], augment: [], trait: [] };
  for (const p of db.prepare(`SELECT kind, key, sum(games) games, sum(placement_sum) ps, sum(top4) top4 FROM stats_tft_part WHERE ${w} AND comp = ?
    GROUP BY kind, key ORDER BY games DESC`).all(...a, id)) {
    if (parts[p.kind].length < 30) parts[p.kind].push({ key: p.key, games: p.games, frequency: r4(p.games / r.games), avgPlacement: r4(p.ps / p.games), top4Rate: r4(p.top4 / p.games), lowSample: p.games < h.minGames });
  }
  // activeTraits: key "<trait>:<tier_current>" (DONI-502), how often the comp runs each trait at each tier.
  return { ...h, ...comp(r, boards, h.minGames), units: parts.unit, augments: parts.augment, activeTraits: parts.trait };
}

// count(*) over ~1M players takes ~0.5 s; /status is polled, so the counts are kept a minute.
let playersCache = { at: 0, v: null };
function playerCounts(db) {
  if (Date.now() - playersCache.at > 60000) playersCache = { at: Date.now(), v: Object.fromEntries(db.prepare("SELECT game, count(*) n FROM players GROUP BY game").all().map((r) => [r.game, r.n])) };
  return playersCache.v;
}

function status(db, limiter, { envKey, dbPath, aggregateEveryMin = 60, retentionDays = 7 } = {}) {
  const k = riotKey(db, envKey);
  const size = (f) => { try { return dbPath && dbPath !== ":memory:" ? fs.statSync(f).size : null; } catch { return null; } };
  // rawStats is measured by the aggregation worker (agg-worker.js); null until its first pass.
  const raw = getMeta(db, "rawStats") || { bytes: null, n: null };
  const matches = {};
  for (const r of db.prepare("SELECT game, status, count(*) n FROM matches GROUP BY 1, 2").all()) (matches[r.game] ??= {})[r.status] = r.n;
  return {
    matches,
    players: playerCounts(db),
    lastFetch: db.prepare("SELECT max(fetched_at) t FROM matches").get().t,
    aggregatedAt: getMeta(db, "aggregatedAt"),
    seed: Object.fromEntries(db.prepare("SELECT k, v FROM meta WHERE k LIKE 'seed:%'").all().map((r) => [r.k.slice(5), JSON.parse(r.v)])),
    rateLimits: limiter ? limiter.state() : {},
    nextAggregation: nextAggregation(db, aggregateEveryMin),
    aggregateEveryMin,
    retentionDays,
    disk: { dbBytes: size(dbPath), walBytes: size(dbPath + "-wal"), rawBytes: raw.bytes, rawMatches: raw.n },
    key: { source: k.source, set_at: k.set_at, ...keyHealth(db, envKey) }, // never the key itself
    aggregates: getMeta(db, "aggregates"),
    backup: getMeta(db, "backup"), // { at, file, bytes, ms, removed } of the last nightly backup
    endpoints: endpoints(db),
  };
}

// What each route serves and how fresh it is (D7): stats routes read the newest patch's last aggregation; leaderboards the
// newest ladder read; /tft/meta its Community Dragon fetch; lookups are live.
function endpoints(db) {
  const ps = patches(db), agg = getMeta(db, "aggregates")?.patches || {};
  const stat = (game, paths) => paths.map((path) => ({ path, game, patch: ps.default[game], updatedAt: agg[ps.default[game]]?.at ?? getMeta(db, "aggregatedAt") }));
  const ladder = (game) => db.prepare("SELECT max(seeded_at) t FROM players WHERE game = ?").get(game).t;
  return [
    ...stat("lol", ["/lol/tiers", "/lol/champion/{id}", "/lol/champion/{id}/players", "/lol/items", "/lol/runes", "/lol/spells"]),
    { path: "/lol/leaderboard", game: "lol", patch: null, updatedAt: ladder("lol") },
    { path: "/lol/summoner/{riotId}", game: "lol", patch: null, updatedAt: null, live: true },
    ...stat("tft", ["/tft/comps", "/tft/comp/{id}", "/tft/units", "/tft/unit/{key}", "/tft/items", "/tft/augments", "/tft/traits"]),
    { path: "/tft/leaderboard", game: "tft", patch: null, updatedAt: ladder("tft") },
    { path: "/tft/player/{riotId}", game: "tft", patch: null, updatedAt: null, live: true },
    { path: "/tft/meta", game: "tft", patch: null, updatedAt: getMeta(db, "tftMeta")?.fetchedAt ?? null },
  ];
}

// Memo for every stats route, keyed by path + query (a cold champion page is ~2 s of SQL on the API thread), dropped whenever an aggregation pass lands.
function memoizer(db) {
  let at = null, cache = new Map();
  return (key, fn) => {
    const now = getMeta(db, "aggregatedAt");
    if (now !== at) { at = now; cache = new Map(); }
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };
}

// lookup: src/lookup.js createLookup() (absent in tests that don't need Riot); defaultRegion for lookups without ?region.
function createServer({ db, limiter, version, adminToken = "", envKey = "", dbPath, aggregateEveryMin, retentionDays, lookup = null, defaultRegion = "na1" }) {
  const memo = memoizer(db);
  return http.createServer((req, res) => {
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*" });
      res.end(code === 204 ? undefined : JSON.stringify(body));
    };
    if (req.method === "OPTIONS") return send(204);
    const u = new URL(req.url, "http://x");
    const q = Object.fromEntries(u.searchParams);
    const p = u.pathname.replace(/\/+$/, "");
    if ((p === "" || p.startsWith("/admin")) && !lan(req.socket.remoteAddress)) return send(403, { error: "LAN only" });
    if (req.method === "POST" && p === "/admin/key") {
      if (!adminToken) return send(503, { error: "ADMIN_TOKEN is not set" });
      const given = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1] || "";
      if (!crypto.timingSafeEqual(sha(given), sha(adminToken))) return send(401, { error: "bad token" });
      let body = "";
      req.on("data", (c) => { if ((body += c).length > 4096) req.destroy(); });
      return req.on("end", () => {
        let key;
        try { key = JSON.parse(body).key; } catch {}
        if (typeof key !== "string" || !KEY_RE.test(key)) return send(400, { error: "key must look like RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" });
        const set_at = Date.now();
        setMeta(db, "riotKey", { key, set_at });
        send(200, { ok: true, source: "meta", set_at });
      });
    }
    if (req.method !== "GET") return send(405, { error: "read-only" });
    if (p === "") { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end(PAGE); }
    let m;
    try {
      if (p === "/health") return send(200, { ok: true, version });
      if (p === "/status") return send(200, status(db, limiter, { envKey, dbPath, aggregateEveryMin, retentionDays }));
      if (p === "/patches") return send(200, patches(db));
      if (p === "/lol/tiers") return send(200, memo(req.url, () => require("./agg-players").tiersPlus(db, lolTiers(db, q), where, q)));
      if ((m = /^\/lol\/(items|runes|spells)$/.exec(p))) return send(200, memo(req.url, () => require("./agg-rollups").lolRollup(db, head, where, m[1], q)));
      if (p === "/lol/draft") return send(200, memo(req.url, () => require("./draft").draft(db, head, where, q)));
      if ((m = /^\/lol\/plan\/(\d+)$/.exec(p))) {
        const page = memo(`/lol/champion/${m[1]}?${new URLSearchParams({ ...q, enemies: "" })}`, () => lolChampion(db, Number(m[1]), q));
        const [w, a] = where(q, page.patch);
        return send(200, memo(req.url, () => require("./draft").plan(Number(m[1]), page, db, w, a, q.enemies)));
      }
      if ((m = /^\/lol\/champion\/(\d+)\/players$/.exec(p))) return send(200, memo(req.url, () => require("./agg-players").championPlayers(db, head, where, Number(m[1]), q)));
      if ((m = /^\/lol\/champion\/(\d+)$/.exec(p))) return send(200, memo(req.url, () => lolChampion(db, Number(m[1]), q)));
      if (p === "/tft/comps") return send(200, memo(req.url, () => tftComps(db, q)));
      if ((m = /^\/tft\/(units|items|augments|traits)$/.exec(p))) return send(200, memo(req.url, () => require("./agg-tft")[m[1]](db, head, where, q)));
      if ((m = /^\/tft\/unit\/([^/]+)$/.exec(p))) {
        const r = memo(req.url, () => require("./agg-tft").unit(db, head, where, decodeURIComponent(m[1]), q));
        return r ? send(200, r) : send(404, { error: "no such unit on this patch/filter" });
      }
      if ((m = /^\/(lol|tft)\/leaderboard$/.exec(p))) {
        if (m[1] === "lol" && q.champion) return send(200, memo(req.url, () => require("./agg-players").championPlayers(db, head, where, Number(q.champion), q)));
        return send(200, memo(req.url, () => require("./lookup").leaderboard(db, m[1], q)));
      }
      if ((m = /^\/(?:lol\/summoner|tft\/player)\/([^/]+)$/.exec(p))) {
        if (!lookup) return send(503, { error: "lookups are not enabled" });
        return lookup.player(p.startsWith("/lol") ? "lol" : "tft", m[1], (q.region || defaultRegion).toLowerCase()).then((r) => send(200, r), (e) => {
          if (e.retryAfter) res.setHeader("retry-after", String(e.retryAfter));
          send(e.status || 502, { error: e.message });
        });
      }
      if ((m = /^\/(lol|tft)\/match\/([^/]+)$/.exec(p))) {
        return require("./match").matchDetail(db, lookup, m[1], decodeURIComponent(m[2])).then((r) => send(200, r), (e) => {
          if (e.retryAfter) res.setHeader("retry-after", String(e.retryAfter));
          send(e.status || 502, { error: e.message });
        });
      }
      if (p === "/tft/meta") return require("./tft-meta").tftMeta(db, q.set === undefined ? undefined : Number(q.set)).then((m) => send(200, m), (e) => send(e.status || 500, { error: e.message }));
      if ((m = /^\/tft\/comp\/([^/]+)$/.exec(p))) {
        const c = memo(req.url, () => tftComp(db, decodeURIComponent(m[1]), q));
        return c ? send(200, c) : send(404, { error: "no such comp on this patch/filter" });
      }
      send(404, { error: "not found" });
    } catch (e) {
      send(e.status || 500, { error: e.message });
    }
  });
}

module.exports = { createServer, lolTiers, lolChampion, tftComps, tftComp, patches };
