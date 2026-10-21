// Read-only JSON API over the stats_* tables. No auth, CORS open: meant for loopback/LAN.
// The one write is POST /admin/key (Bearer ADMIN_TOKEN); it and the status page at / answer loopback/private-LAN only.
const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { TIERS, nextAggregation, MODES, TFT_MODES, MODE_RE, basePatch } = require("./jobs");
const { getMeta, setMeta, riotKey, setKey, keyHealth, GAMES } = require("./db");
const champ = require("./agg-champion");
const win = require("./agg-window");

const PAGE = fs.readFileSync(path.join(__dirname, "status.html"));
const KEY_RE = /^RGAPI-[0-9a-f-]{36}$/;
const sha = (s) => crypto.createHash("sha256").update(s).digest();
const lan = (a = "") => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.replace(/^::ffff:/, "")) || a === "::1";

const r4 = (x) => Math.round(x * 10000) / 10000;
const byVersion = (a, b) => { const [x, y] = [a, b].map((v) => v.split(".").map(Number)); return y[0] - x[0] || y[1] - x[1]; };
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const dec = (s) => { try { return decodeURIComponent(s); } catch { throw bad("malformed percent-encoding in the path"); } };

// Patch rollover (D11): a request without ?patch gets the newest patch with at least MIN_MATCHES matches (League ~2 h of crawl
// at ~1,000 matches/h; TFT matches = boards / 8), else the patch with the most matches, so a new patch doesn't take over the app
// with a handful of games. /patches lists every patch newest first plus counts, minMatches and that default.
// Each League mode rolls over on its own (DONI-596 follow-up): when solo reaches 2,000 on a new patch, ARAM there may have 30
// games, so a mode keeps its old patch until the new one has 1,000 (the app's "thin sample" line) or more games than the old.
const MIN_MATCHES = { lol: 2000, tft: 1000, flex: 1000, aram: 1000, normal: 1000, swift: 1000, doubleup: 1000 };
const MODE_NAMES = ["flex", "aram", "normal", "swift"];
// ?queue= on League stats: queue id or name -> patch suffix; solo/duo (420, "ranked") is the plain patch
const QUEUE_SFX = { ...MODES, ranked: "", solo: "", ...Object.fromEntries(MODE_NAMES.map((m) => [m, "-" + m])) };
const SFX_QUEUE = { "-flex": 440, "-aram": 450, "-normal": 400, "-swift": 480, "-doubleup": 1160 };
const TFT_QUEUE_SFX = { ...TFT_MODES, ranked: "", doubleup: "-doubleup" }; // ?queue= on TFT stats (DONI-615)
const pickPatch = (game, list, counts) => list.find((p) => counts[p] >= MIN_MATCHES[game]) || [...list].sort((x, y) => counts[y] - counts[x])[0] || null;
// Cached until stats_lol_matches or stats_tft_boards change (max rowid, count, sum: a few hundred rows): every stats request calls it,
// and its two GROUP BYs took seconds while a retirement and a pass were writing (2026-10-20 22:00Z).
const patchesCache = new WeakMap();
function patches(db) {
  const ver = JSON.stringify(db.prepare("SELECT (SELECT max(rowid) || ':' || count(*) || ':' || sum(matches) FROM stats_lol_matches) l, (SELECT max(rowid) || ':' || count(*) || ':' || sum(boards) FROM stats_tft_boards) t").get());
  const c = patchesCache.get(db);
  if (c?.ver === ver) return c.v;
  const v = patchesUncached(db);
  patchesCache.set(db, { ver, v });
  return v;
}
function patchesUncached(db) {
  const counts = (t, col, per) => Object.fromEntries(db.prepare(`SELECT patch, sum(${col}) n FROM ${t} GROUP BY patch`).all()
    .filter((r) => r.patch !== "?").map((r) => [r.patch, Math.round(r.n / per)]));
  // League modes live under "<patch>-<mode>" (D13, DONI-596): lol is solo/duo; flex, aram, normal and swift are listed apart,
  // counted per plain patch
  const c = { lol: {}, tft: {}, ...Object.fromEntries([...MODE_NAMES, "doubleup"].map((m) => [m, {}])) };
  for (const [p, n] of Object.entries(counts("stats_lol_matches", "matches", 1))) (c[MODE_RE.exec(p)?.[1] || "lol"][basePatch(p)] = n);
  for (const [p, n] of Object.entries(counts("stats_tft_boards", "boards", 8))) (c[MODE_RE.exec(p)?.[1] || "tft"][basePatch(p)] = n);
  const lists = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Object.keys(v).sort(byVersion)]));
  return { ...lists, counts: c, minMatches: MIN_MATCHES, default: Object.fromEntries(Object.keys(c).map((k) => [k, pickPatch(k, lists[k], c[k])])) };
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
// windowed: the caller applies ?days (tiers, champion strip, comps); other routes neither echo nor honour it (DONI-568).
function head(db, q, game, windowed = false) {
  const bySet = q.set !== undefined && game === "tft" ? new Set(db.prepare('SELECT DISTINCT patch FROM matches WHERE game = ? AND "set" = ?').all(game, Number(q.set)).map((r) => r.patch)) : null;
  const ps = patches(db);
  // ?queue= (League): 420 solo (default), 440 flex, 450 ARAM, 400 normal, 480/490 swiftplay, or a name; that mode's rows live
  // under "<patch>-<mode>" and patch in the response keeps the suffix. A suffixed ?patch picks its mode too.
  // TFT: ?queue=1100|ranked (default) or 1160|doubleup, or a "-doubleup" ?patch (DONI-615)
  const k = String(q.queue || "").toLowerCase(), qmap = game === "lol" ? QUEUE_SFX : TFT_QUEUE_SFX;
  if (k && !Object.hasOwn(qmap, k)) throw bad(game === "lol" ? "queue must be 420 (solo), 440 (flex), 450 (aram), 400 (normal) or 480/490 (swift)" : "queue must be 1100 (ranked) or 1160 (doubleup)");
  const sfx = k ? qmap[k] : (MODE_RE.exec(q.patch || "") || [""])[0];
  const mode = sfx ? sfx.slice(1) : game; // a mode's own default patch (never one it has no games on)
  const base = basePatch(q.patch) || pickPatch(mode, ps[mode].filter((p) => !bySet || bySet.has(p)), ps.counts[mode]);
  const patch = sfx && base ? base + sfx : base;
  const minGames = q.min_games === undefined ? 200 : Number(q.min_games);
  if (!(minGames >= 0)) throw bad("min_games must be a number >= 0");
  const days = windowed ? win.days(q) : null;
  return { patch, ...(sfx && { queue: SFX_QUEUE[sfx] }), ...(bySet && { set: Number(q.set) }), ...(days && { days, since: win.cutoff(days) }), region: q.region || "all", bracket: q.bracket || "all", minGames };
}

function lolTiers(db, q = {}) {
  const h = head(db, q, "lol", true);
  const [w, a] = where(q, h.patch);
  const M = win.src(q, "lol_matches"), B = win.src(q, "lol_bans"), C = win.src(q, "lol_champ");
  const matches = db.prepare(`SELECT sum(matches) n FROM ${M.t} WHERE ${w}${M.d}`).get(...a, ...M.da).n || 0;
  const bans = new Map(db.prepare(`SELECT champion, sum(bans) n FROM ${B.t} WHERE ${w}${B.d} GROUP BY champion`).all(...a, ...B.da).map((r) => [r.champion, r.n]));
  const roleW = q.role ? " AND role = ?" : "";
  const rows = db.prepare(`SELECT champion, role, sum(games) games, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d}${roleW}
    GROUP BY champion, role ORDER BY games DESC`).all(...a, ...C.da, ...(q.role ? [q.role.toUpperCase()] : []));
  // players / gamesPerPlayer (depth) are per patch even with ?days; trend=1 adds the per-day series.
  const depth = win.depthMap(db, w, a), series = q.trend ? win.daily(db, w, a, q, "lol_champ", "champion, role", "sum(games) games, sum(wins) wins") : null;
  const wt = regionWeighted(db, q, w, a, M, B, C);
  return { ...h, role: q.role || "all", matches, ...(wt && { weighting: wt.weights }), champions: rows.map((r) => {
    const players = depth.get(`${r.champion}|${r.role}`) || null;
    const v = wt && wt.rates(r.champion, r.role);
    return { champion: r.champion, role: r.role, games: r.games, wins: r.wins,
      winRate: v ? v.winRate : r4(r.wins / r.games), pickRate: v ? v.pickRate : r4(r.games / matches), banRate: v ? v.banRate : r4((bans.get(r.champion) || 0) / matches), lowSample: r.games < h.minGames,
      players, gamesPerPlayer: players ? r4(r.games / players) : null,
      ...(series && { daily: (series.get(`${r.champion}|${r.role}`) || []).map((d) => ({ day: d.day, games: d.games, winRate: r4(d.wins / d.games) })) }) };
  }) };
}

// Region weighting (2026-10-20 accuracy audit): with region=all and more than one region, the tier list's win/pick/ban rates are
// each region's rates weighted by its share of seeded League players (meta.regionWeights, written by the aggregation worker), the
// way Lolalytics' global view weighs regions by volume. Unweighted, oc1 (5% of players) counted as much as euw1 (40%).
// games/wins stay the raw totals (the sample). Returns null when it doesn't apply.
function regionWeighted(db, q, w, a, M, B, C) {
  if (q.region && q.region !== "all") return null;
  // the weights are seeded Emerald+ solo players: a bracket filter or another mode would give a tiny region its full weight (Q review 2)
  if ((q.bracket && q.bracket !== "all") || MODE_RE.test(a[0] || "")) return null;
  const pop = getMeta(db, "regionWeights")?.lol;
  const mt = Object.fromEntries(db.prepare(`SELECT region, sum(matches) n FROM ${M.t} WHERE ${w}${M.d} GROUP BY region`).all(...a, ...M.da).map((r) => [r.region, r.n]));
  const regions = Object.keys(mt).filter((r) => mt[r] > 0 && pop?.[r]);
  if (regions.length < 2) return null;
  const tot = regions.reduce((s, r) => s + pop[r], 0), weights = Object.fromEntries(regions.map((r) => [r, r4(pop[r] / tot)]));
  const key = (c, r, x) => `${c}|${r}|${x}`, g = new Map(), b = new Map();
  for (const x of db.prepare(`SELECT champion, role, region, sum(games) games, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d} GROUP BY 1, 2, 3`).all(...a, ...C.da)) g.set(key(x.champion, x.role, x.region), x);
  for (const x of db.prepare(`SELECT champion, region, sum(bans) n FROM ${B.t} WHERE ${w}${B.d} GROUP BY 1, 2`).all(...a, ...B.da)) b.set(`${x.champion}|${x.region}`, x.n);
  return { weights, rates(champion, role) {
    let pick = 0, ban = 0, win = 0;
    for (const r of regions) {
      const x = g.get(key(champion, role, r)), wr = weights[r] / mt[r];
      if (x) { pick += wr * x.games; win += wr * x.wins; }
      ban += wr * (b.get(`${champion}|${r}`) || 0);
    }
    return { pickRate: r4(pick), banRate: r4(ban), winRate: pick ? r4(win / pick) : 0 };
  } };
}

function lolChampion(db, champion, q = {}) {
  const h = head(db, q, "lol", true);
  const [w, a] = where(q, h.patch);
  // ?days windows the strip and roles; builds, matchups and the depth blocks stay per patch.
  const M = win.src(q, "lol_matches"), C = win.src(q, "lol_champ"), B = win.src(q, "lol_bans");
  const matches = db.prepare(`SELECT sum(matches) n FROM ${M.t} WHERE ${w}${M.d}`).get(...a, ...M.da).n || 0;
  const roles = db.prepare(`SELECT role, sum(games) games, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d} AND champion = ? GROUP BY role ORDER BY games DESC`).all(...a, ...C.da, champion);
  const role = q.role ? q.role.toUpperCase() : roles[0]?.role;
  const s = roles.find((r) => r.role === role) || { games: 0, wins: 0 };
  const bans = db.prepare(`SELECT sum(bans) n FROM ${B.t} WHERE ${w}${B.d} AND champion = ?`).get(...a, ...B.da, champion).n || 0;
  // Builds, matchups and depth are per patch even with ?days (DONI-568): their rates divide by the patch's games, not the window's.
  const sp = C.d ? db.prepare(`SELECT sum(games) games, sum(wins) wins FROM stats_lol_champ WHERE ${w} AND champion = ? AND role = ?`).get(...a, champion, role ?? "") : s;
  const sPatch = { games: sp.games || 0, wins: sp.wins || 0 };
  const builds = { item: [], keystone: [], rune: [], spells: [], skills: [] };
  const rows = db.prepare(`SELECT kind, key, sum(games) games, sum(wins) wins FROM stats_lol_build WHERE ${w} AND champion = ? AND role = ?
    GROUP BY kind, key ORDER BY games DESC`).all(...a, champion, role ?? "");
  // Skill orders come from a timeline sample, so their pick rate is out of the sampled games.
  const skillGames = rows.filter((b) => b.kind === "skills").reduce((n, b) => n + b.games, 0);
  for (const b of rows) {
    if (builds[b.kind].length < 30) builds[b.kind].push({ key: b.key, games: b.games, winRate: r4(b.wins / b.games),
      pickRate: r4(b.games / (b.kind === "skills" ? skillGames : sPatch.games)), lowSample: b.games < h.minGames });
  }
  const matchups = db.prepare(`SELECT opponent, sum(games) games, sum(wins) wins FROM stats_lol_matchup WHERE ${w} AND champion = ? AND role = ?
    GROUP BY opponent ORDER BY games DESC LIMIT 40`).all(...a, champion, role ?? "").map((r) => ({ opponent: r.opponent, games: r.games, winRate: r4(r.wins / r.games), lowSample: r.games < h.minGames }));
  return { ...h, champion, role: role ?? null, roles: roles.map((r) => ({ role: r.role, games: r.games })),
    // same region weighting as the tier list row (regionWeighted), so the strip and the list agree
    strip: { games: s.games, wins: s.wins, winRate: s.games ? r4(s.wins / s.games) : 0, pickRate: matches ? r4(s.games / matches) : 0, banRate: matches ? r4(bans / matches) : 0, matches, lowSample: s.games < h.minGames,
      ...(() => { const wt = s.games && regionWeighted(db, q, w, a, M, B, C); return wt ? { ...wt.rates(champion, role), weighting: wt.weights } : {}; })() },
    builds, matchups, ...champ.depth(db, w, a, { champion, role: role ?? "", s: sPatch, minGames: h.minGames, matchups }), ...win.champion(db, w, a, champion, role ?? "") };
}

// id "<trait>,<carry>" (DONI-502). ponytail: an id left from the old rule (boards whose raw was gone at backfill-comps) reads as
// trait + second trait; there were ~45 such matches on 2026-10-20, they age out with the patch.
const compKey = (id) => { const [t, c] = id.split(","); return { traits: t === "none" ? [] : [t], carry: c || null }; };
const comp = (r, boards, minGames) => ({ id: r.comp, ...compKey(r.comp), games: r.games,
  avgPlacement: r4(r.ps / r.games), top4Rate: r4(r.top4 / r.games), winRate: r4(r.wins / r.games), pickRate: r4(r.games / boards), lowSample: r.games < minGames });

function tftComps(db, q = {}) {
  const h = head(db, q, "tft", true);
  const [w, a] = where(q, h.patch);
  const Bd = win.src(q, "tft_boards"), C = win.src(q, "tft_comp");
  const boards = db.prepare(`SELECT sum(boards) n FROM ${Bd.t} WHERE ${w}${Bd.d}`).get(...a, ...Bd.da).n || 0;
  const rows = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins FROM ${C.t} WHERE ${w}${C.d}
    GROUP BY comp ORDER BY games DESC LIMIT 200`).all(...a, ...C.da);
  const series = q.trend ? win.daily(db, w, a, q, "tft_comp", "comp", "sum(games) games, sum(placement_sum) ps") : null;
  // units: up to 9 units fielded on >= 30% of the comp's boards, most frequent first (the app's comp-board rule), so a list or
  // search needs no /tft/comp/{id} per row. Shares are out of the comp's patch-wide games.
  const compGames = new Map(db.prepare(`SELECT comp, sum(games) g FROM stats_tft_comp WHERE ${w} GROUP BY comp`).all(...a).map((r) => [r.comp, r.g]));
  const units = new Map(), traits = new Map();
  for (const u of db.prepare(`SELECT comp, kind, key, sum(games) g FROM stats_tft_part WHERE ${w} AND kind IN ('unit', 'trait') GROUP BY comp, kind, key ORDER BY g DESC`).all(...a)) {
    if (u.kind === "unit") {
      const l = units.get(u.comp) || units.set(u.comp, []).get(u.comp);
      if (l.length < 9 && u.g >= 0.3 * (compGames.get(u.comp) || Infinity)) l.push(u.key);
    } else {
      // activeTraits: the comp's 8 most frequent "<trait>:<tier>" (same shape as /tft/comp/{id}), so the list draws trait chips alone
      const l = traits.get(u.comp) || traits.set(u.comp, []).get(u.comp);
      if (l.length < 8) l.push({ key: u.key, frequency: r4(u.g / (compGames.get(u.comp) || u.g)) });
    }
  }
  return { ...h, boards, comps: rows.map((r) => ({ ...comp(r, boards, h.minGames), units: units.get(r.comp) || [], activeTraits: traits.get(r.comp) || [],
    ...(series && { daily: (series.get(r.comp) || []).map((d) => ({ day: d.day, games: d.games, avgPlacement: r4(d.ps / d.games) })) }) })) };
}

function tftComp(db, id, q = {}) {
  const h = head(db, q, "tft", true);
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
  const k = riotKey(db, envKey, "lol");
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
    puuidsRetired: Object.fromEntries(GAMES.map((g) => [g, getMeta(db, `puuidsRetired:${g}`)])), // the last key change across Riot apps per game (jobs.retirePuuids)
    requests: limiter ? limiter.requests() : {}, // sent in the last 60 min per host and method: is every bucket spent, and on what
    nextAggregation: nextAggregation(db, aggregateEveryMin),
    aggregateEveryMin,
    retentionDays,
    disk: { dbBytes: size(dbPath), walBytes: size(dbPath + "-wal"), rawBytes: raw.bytes, rawMatches: raw.n },
    // never the key itself. Top level: League's key and the worse health of the two (what the app's status line reads);
    // games: each game's key, which differ once a personal key is registered per product.
    key: { source: k.source, set_at: k.set_at, ...keyHealth(db, envKey),
      games: Object.fromEntries(GAMES.map((g) => { const x = riotKey(db, envKey, g); return [g, { source: x.source, set_at: x.set_at, ...keyHealth(db, envKey, g) }]; })) },
    aggregates: getMeta(db, "aggregates"),
    aggPause: getMeta(db, "aggPause"), // { passMs, pausedMs, locks }: how long the last pass held the crawl (main.js periodic)
    backup: getMeta(db, "backup"), // { at, file, bytes, ms, removed } of the last nightly backup
    endpoints: endpoints(db),
    health: getMeta(db, "health"), // written by the aggregation worker (agg-worker.js)
  };
}

// Data health (D16, the status page's per-game section): matches fetched per region per hour over the last 24 h (oldest
// first, 24 numbers), and the share of the default patch's tier/comp rows under 200 games. ~4 s of SQL on the live DB, so the
// aggregation worker computes it after each pass into meta.health; /status only reads it.
function health(db, now = Date.now()) {
  const from = now - 24 * 3600000, out = {};
  for (const game of ["lol", "tft"]) {
    const hourly = {};
    for (const r of db.prepare("SELECT region, CAST((fetched_at - ?) / 3600000 AS INT) h, count(*) n FROM matches WHERE fetched_at > ? AND game = ? AND status = 'done' GROUP BY 1, 2").all(from, from, game)) {
      (hourly[r.region] ??= Array(24).fill(0))[Math.min(23, r.h)] = r.n;
    }
    // League per mode (DONI-596): matches stored per hour, all regions
    const modes = {};
    if (game === "lol") for (const r of db.prepare("SELECT queue, CAST((fetched_at - ?) / 3600000 AS INT) h, count(*) n FROM matches WHERE fetched_at > ? AND game = 'lol' AND status = 'done' GROUP BY 1, 2").all(from, from)) {
      const m = (MODE_RE.exec(MODES[r.queue] ?? "") || [, "solo"])[1];
      (modes[m] ??= Array(24).fill(0))[Math.min(23, r.h)] += r.n;
    }
    const patch = patches(db).default[game];
    const rows = !patch ? [] : game === "lol"
      ? db.prepare("SELECT sum(games) g FROM stats_lol_champ WHERE patch = ? GROUP BY champion, role").all(patch)
      : db.prepare("SELECT sum(games) g FROM stats_tft_comp WHERE patch = ? GROUP BY comp").all(patch);
    out[game] = { patch, hourly, ...(game === "lol" && { modes }), rows: rows.length, lowSampleShare: rows.length ? r4(rows.filter((r) => r.g < 200).length / rows.length) : null,
      last24h: Object.values(hourly).flat().reduce((s, n) => s + n, 0) };
  }
  return { ...out, at: now };
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
    if (!cache.has(key)) {
      cache.set(key, fn());
      if (cache.size > 2000) cache.delete(cache.keys().next().value); // DONI-568: bound the memo
    }
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
    // DONI-568: /status too; and a request forwarded by a reverse proxy (x-forwarded-for) is never LAN, whatever the peer IP.
    if ((p === "" || p === "/status" || p.startsWith("/admin")) && (!lan(req.socket.remoteAddress) || req.headers["x-forwarded-for"])) return send(403, { error: "LAN only" });
    if (req.method === "POST" && p === "/admin/key") {
      if (!adminToken) return send(503, { error: "ADMIN_TOKEN is not set" });
      const given = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1] || "";
      if (!crypto.timingSafeEqual(sha(given), sha(adminToken))) return send(401, { error: "bad token" });
      let body = "";
      req.on("data", (c) => { if ((body += c).length > 4096) req.destroy(); });
      return req.on("end", () => {
        let key, game;
        try { ({ key, game } = JSON.parse(body)); } catch {}
        if (typeof key !== "string" || !KEY_RE.test(key)) return send(400, { error: "key must look like RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" });
        // game: "lol" | "tft" sets that game's key (a personal key per product); absent: the key both games use unless they have their own
        if (game != null && !GAMES.includes(game)) return send(400, { error: 'game must be "lol", "tft" or absent (both)' });
        const set_at = Date.now();
        // DONI-568: while the aggregation worker holds the write lock this waits busy_timeout and throws; answer 503, never crash.
        try {
          setKey(db, key, game, set_at);
        } catch (e) { return send(503, { error: `database busy (${e.message}); try again in a minute` }); }
        send(200, { ok: true, source: game ? `meta:${game}` : "meta", set_at });
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
        const r = memo(req.url, () => require("./agg-tft").unit(db, head, where, dec(m[1]), q));
        return r ? send(200, r) : send(404, { error: "no such unit on this patch/filter" });
      }
      if ((m = /^\/(lol|tft)\/leaderboard$/.exec(p))) {
        if (m[1] === "lol" && q.champion) return send(200, memo(req.url, () => require("./agg-players").championPlayers(db, head, where, Number(q.champion), q)));
        return send(200, require("./lookup").leaderboard(db, m[1], q));
      }
      if ((m = /^\/(?:lol\/summoner|tft\/player)\/([^/]+)$/.exec(p))) {
        if (!lookup) return send(503, { error: "lookups are not enabled" });
        return lookup.player(p.startsWith("/lol") ? "lol" : "tft", m[1], (q.region || defaultRegion).toLowerCase()).then((r) => send(200, r), (e) => {
          if (e.retryAfter) res.setHeader("retry-after", String(e.retryAfter));
          send(e.status || 502, { error: e.message });
        });
      }
      if ((m = /^\/(lol|tft)\/match\/([^/]+)$/.exec(p))) {
        return require("./match").matchDetail(db, lookup, m[1], dec(m[2])).then((r) => send(200, r), (e) => {
          if (e.retryAfter) res.setHeader("retry-after", String(e.retryAfter));
          send(e.status || 502, { error: e.message });
        });
      }
      if (p === "/tft/meta") return require("./tft-meta").tftMeta(db, q.set === undefined ? undefined : Number(q.set)).then((m) => send(200, m), (e) => send(e.status || 500, { error: e.message }));
      if ((m = /^\/tft\/comp\/([^/]+)$/.exec(p))) {
        const c = memo(req.url, () => tftComp(db, dec(m[1]), q));
        return c ? send(200, c) : send(404, { error: "no such comp on this patch/filter" });
      }
      send(404, { error: "not found" });
    } catch (e) {
      send(e.status || 500, { error: e.message });
    }
  });
}

module.exports = { health, createServer, lolTiers, lolChampion, tftComps, tftComp, patches };
