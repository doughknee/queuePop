// Read-only JSON API over the stats_* tables. No auth, CORS open: meant for loopback/LAN.
// The one write is POST /admin/key (Bearer ADMIN_TOKEN); it and the status page at / answer loopback/private-LAN only.
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { TIERS, nextAggregation } = require("./jobs");
const { getMeta, setMeta, riotKey, keyHealth } = require("./db");
const champ = require("./agg-champion");

const PAGE = fs.readFileSync(path.join(__dirname, "status.html"));
const KEY_RE = /^RGAPI-[0-9a-f-]{36}$/;
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const lan = (a = "") => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.replace(/^::ffff:/, "")) || a === "::1";

const r4 = (x) => Math.round(x * 10000) / 10000;
const byVersion = (a, b) => { const [x, y] = [a, b].map((v) => v.split(".").map(Number)); return y[0] - x[0] || y[1] - x[1]; };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

function patches(db) {
  const list = (t) => db.prepare(`SELECT DISTINCT patch FROM ${t}`).all().map((r) => r.patch).filter((p) => p !== "?").sort(byVersion);
  return { lol: list("stats_lol_matches"), tft: list("stats_tft_boards") };
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
  const patch = q.patch || patches(db)[game].find((p) => !bySet || bySet.has(p)) || null;
  const minGames = q.min_games === undefined ? 200 : Number(q.min_games);
  if (!(minGames >= 0)) throw bad("min_games must be a number >= 0");
  return { patch, ...(bySet && { set: Number(q.set) }), region: q.region || "all", bracket: q.bracket || "all", minGames };
}

function lolTiers(db, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const matches = db.prepare(`SELECT sum(matches) n FROM stats_lol_matches WHERE ${w}`).get(...a).n || 0;
  const bans = new Map(db.prepare(`SELECT champion, sum(bans) n FROM stats_lol_bans WHERE ${w} GROUP BY champion`).all(...a).map((r) => [r.champion, r.n]));
  const roleW = q.role ? " AND role = ?" : "";
  const rows = db.prepare(`SELECT champion, role, sum(games) games, sum(wins) wins FROM stats_lol_champ WHERE ${w}${roleW}
    GROUP BY champion, role ORDER BY games DESC`).all(...a, ...(q.role ? [q.role.toUpperCase()] : []));
  return { ...h, role: q.role || "all", matches, champions: rows.map((r) => ({
    champion: r.champion, role: r.role, games: r.games, wins: r.wins,
    winRate: r4(r.wins / r.games), pickRate: r4(r.games / matches), banRate: r4((bans.get(r.champion) || 0) / matches), lowSample: r.games < h.minGames,
  })) };
}

function lolChampion(db, champion, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const matches = db.prepare(`SELECT sum(matches) n FROM stats_lol_matches WHERE ${w}`).get(...a).n || 0;
  const roles = db.prepare(`SELECT role, sum(games) games, sum(wins) wins FROM stats_lol_champ WHERE ${w} AND champion = ? GROUP BY role ORDER BY games DESC`).all(...a, champion);
  const role = q.role ? q.role.toUpperCase() : roles[0]?.role;
  const s = roles.find((r) => r.role === role) || { games: 0, wins: 0 };
  const bans = db.prepare(`SELECT sum(bans) n FROM stats_lol_bans WHERE ${w} AND champion = ?`).get(...a, champion).n || 0;
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
    builds, matchups, ...champ.depth(db, w, a, { champion, role: role ?? "", s, minGames: h.minGames, matchups }) };
}

const comp = (r, boards, minGames) => ({ id: r.comp, traits: r.comp === "none" ? [] : r.comp.split(","), games: r.games,
  avgPlacement: r4(r.ps / r.games), top4Rate: r4(r.top4 / r.games), winRate: r4(r.wins / r.games), pickRate: r4(r.games / boards), lowSample: r.games < minGames });

function tftComps(db, q = {}) {
  const h = head(db, q, "tft");
  const [w, a] = where(q, h.patch);
  const boards = db.prepare(`SELECT sum(boards) n FROM stats_tft_boards WHERE ${w}`).get(...a).n || 0;
  const rows = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins FROM stats_tft_comp WHERE ${w}
    GROUP BY comp ORDER BY games DESC LIMIT 200`).all(...a);
  return { ...h, boards, comps: rows.map((r) => comp(r, boards, h.minGames)) };
}

function tftComp(db, id, q = {}) {
  const h = head(db, q, "tft");
  const [w, a] = where(q, h.patch);
  const boards = db.prepare(`SELECT sum(boards) n FROM stats_tft_boards WHERE ${w}`).get(...a).n || 0;
  const r = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins FROM stats_tft_comp WHERE ${w} AND comp = ? GROUP BY comp`).get(...a, id);
  if (!r) return null;
  const parts = { unit: [], augment: [] };
  for (const p of db.prepare(`SELECT kind, key, sum(games) games, sum(placement_sum) ps, sum(top4) top4 FROM stats_tft_part WHERE ${w} AND comp = ?
    GROUP BY kind, key ORDER BY games DESC`).all(...a, id)) {
    if (parts[p.kind].length < 30) parts[p.kind].push({ key: p.key, games: p.games, frequency: r4(p.games / r.games), avgPlacement: r4(p.ps / p.games), top4Rate: r4(p.top4 / p.games), lowSample: p.games < h.minGames });
  }
  return { ...h, ...comp(r, boards, h.minGames), units: parts.unit, augments: parts.augment };
}

function status(db, limiter, { envKey, dbPath, aggregateEveryMin = 60, retentionDays = 7 } = {}) {
  const k = riotKey(db, envKey);
  const size = (f) => { try { return dbPath && dbPath !== ":memory:" ? fs.statSync(f).size : null; } catch { return null; } };
  const raw = db.prepare("SELECT coalesce(sum(length(raw)), 0) bytes, count(raw) n FROM matches").get();
  const matches = {};
  for (const r of db.prepare("SELECT game, status, count(*) n FROM matches GROUP BY 1, 2").all()) (matches[r.game] ??= {})[r.status] = r.n;
  return {
    matches,
    players: Object.fromEntries(db.prepare("SELECT game, count(*) n FROM players GROUP BY game").all().map((r) => [r.game, r.n])),
    lastFetch: db.prepare("SELECT max(fetched_at) t FROM matches").get().t,
    aggregatedAt: getMeta(db, "aggregatedAt"),
    seed: Object.fromEntries(db.prepare("SELECT k, v FROM meta WHERE k LIKE 'seed:%'").all().map((r) => [r.k.slice(5), JSON.parse(r.v)])),
    rateLimits: limiter ? limiter.state() : {},
    nextAggregation: nextAggregation(db, aggregateEveryMin),
    aggregateEveryMin,
    retentionDays,
    disk: { dbBytes: size(dbPath), walBytes: size(dbPath + "-wal"), rawBytes: raw.bytes, rawMatches: raw.n },
    key: { source: k.source, set_at: k.set_at, ...keyHealth(db, envKey) }, // never the key itself
  };
}

function createServer({ db, limiter, version, adminToken = "", envKey = "", dbPath, aggregateEveryMin, retentionDays }) {
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
      if (p === "/lol/tiers") return send(200, require("./agg-players").tiersPlus(db, lolTiers(db, q), where, q));
      if ((m = /^\/lol\/champion\/(\d+)\/players$/.exec(p))) return send(200, require("./agg-players").championPlayers(db, head, where, Number(m[1]), q));
      if ((m = /^\/lol\/champion\/(\d+)$/.exec(p))) return send(200, lolChampion(db, Number(m[1]), q));
      if (p === "/tft/comps") return send(200, tftComps(db, q));
      if ((m = /^\/tft\/comp\/([^/]+)$/.exec(p))) {
        const c = tftComp(db, decodeURIComponent(m[1]), q);
        return c ? send(200, c) : send(404, { error: "no such comp on this patch/filter" });
      }
      send(404, { error: "not found" });
    } catch (e) {
      send(e.status || 500, { error: e.message });
    }
  });
}

module.exports = { createServer, lolTiers, lolChampion, tftComps, tftComp, patches };
