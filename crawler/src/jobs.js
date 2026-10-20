// Crawl jobs. Each call does one unit of work and returns whether it did anything; all progress
// lives in the DB, so a restart picks up where it stopped.
const zlib = require("zlib");
const { tx, getMeta, setMeta } = require("./db");
const { ROUTING } = require("./riot");
const champ = require("./agg-champion");
const tftAgg = require("./agg-tft");
const win = require("./agg-window");
const draftAgg = require("./draft");

const TIERS = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
const DAY = 86400000;
const IDS_EVERY = 3600000; // don't re-ask one player for match ids more than hourly
const TRINKETS = new Set([3340, 3363, 3364, 3330]);

// Ladder walk, top down: apex lists, then DIAMOND I..IV, EMERALD I..IV, ... down to minTier.
function ladderSteps(game, minTier) {
  const steps = [];
  for (let t = TIERS.length - 1; t >= TIERS.indexOf(minTier); t--) {
    const tier = TIERS[t], low = tier.toLowerCase();
    if (t >= 7) {
      steps.push({ tier, method: `${game} ${low}`, path: game === "lol" ? `/lol/league/v4/${low}leagues/by-queue/RANKED_SOLO_5x5` : `/tft/league/v1/${low}?queue=RANKED_TFT` });
    } else {
      for (const div of ["I", "II", "III", "IV"]) {
        steps.push({ tier, div, paged: true, method: `${game} entries`, path: game === "lol" ? `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${div}?page=` : `/tft/league/v1/entries/${tier}/${div}?queue=RANKED_TFT&page=` });
      }
    }
  }
  return steps;
}

const APEX_EVERY = 1800000; // the three apex ladders (Master+) are re-read every 30 min so leaderboard LP stays fresh (DONI-508/512)

const upsertPlayer = (db) => db.prepare(`INSERT INTO players (puuid, game, region, tier, tier_n, division, lp, seeded_at, wins, losses) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT (puuid, game) DO UPDATE SET region = excluded.region, tier = excluded.tier, tier_n = excluded.tier_n,
  division = excluded.division, lp = excluded.lp, seeded_at = excluded.seeded_at, wins = excluded.wins, losses = excluded.losses`);
const playerRow = (e, game, region, s, t) => [e.puuid, game, region, s.tier, TIERS.indexOf(s.tier), e.rank || s.div || "I", e.leaguePoints ?? 0, t, e.wins ?? null, e.losses ?? null];

// Walks the whole ladder once a day, one page per call (so the crawl loop can pause between pages for the aggregation's
// swaps), saving its place after every page. Between walks, refreshes the apex ladders.
async function seed(ctx, game, region) {
  const { db, riot, now = Date.now } = ctx;
  const key = `seed:${game}:${region}`;
  let st = getMeta(db, key) || {};
  if (st.doneAt && now() - st.doneAt < DAY) return refreshApex(ctx, game, region);
  if (st.doneAt) st = {};
  const steps = ladderSteps(game, ctx.minTier);
  let i = st.step || 0, page = st.page || 1;
  if (i < steps.length) {
    const s = steps[i], upsert = upsertPlayer(db);
    const res = await riot.get(region, s.paged ? s.path + page : s.path, s.method);
    const entries = (s.paged ? res : res?.entries) || [];
    tx(db, () => {
      for (const e of entries) if (e.puuid) upsert.run(...playerRow(e, game, region, s, now()));
      if (s.paged && entries.length) page++; else { i++; page = 1; }
      setMeta(db, key, { step: i, page });
    });
    if (i < steps.length) return true;
  }
  setMeta(db, key, { doneAt: now() });
  setMeta(db, `apex:${game}:${region}`, now());
  return true;
}

// Three requests: challenger, grandmaster, master. Players who dropped out keep their old apex row until the next daily walk.
async function refreshApex(ctx, game, region) {
  const { db, riot, now = Date.now } = ctx;
  const key = `apex:${game}:${region}`;
  if (now() - (getMeta(db, key) || 0) < APEX_EVERY) return false;
  const upsert = upsertPlayer(db);
  for (const s of ladderSteps(game, "MASTER")) {
    const entries = (await riot.get(region, s.path, s.method))?.entries || [];
    tx(db, () => { for (const e of entries) if (e.puuid) upsert.run(...playerRow(e, game, region, s, now())); });
  }
  setMeta(db, key, now());
  return true;
}

// League modes (D13 ARAM, DONI-596): every queue but solo/duo is stored under "<patch><suffix>" ("16.20-flex", "16.20-aram"),
// so every per-patch aggregate and endpoint serves a mode unchanged (?queue= picks it) and modes never mix.
const MODES = { 420: "", 440: "-flex", 450: "-aram", 400: "-normal", 480: "-swift", 490: "-swift" };
const MODE_RE = /-(flex|aram|normal|swift)$/;
const basePatch = (patch) => (patch || "").replace(MODE_RE, "");
const ARAM = 450;
// Capped discovery: ranked ids() never returns these queues, so capped() asks for them. Ranked players rarely play them (live,
// 2026-10-20: ~9,300 ARAM ids calls on ranked players found 106 ARAM games), so the participants of every capped match fetched
// go into mode_players and are asked next: an ARAM player's ARAM history is mostly ARAM. A queue's discovery runs only while it
// is under its share (ctx.shares, MODE_SHARES) of the region's League matches fetched in the last hour plus its ids still
// waiting, at most one ids call per region and queue per ctx.modeEvery (60 s), so ranked keeps the quota (#182).
const CAPPED = { 450: [450], 400: [400], 480: [480, 490] }; // discovery queue -> stored queues counted against its share
const SHARES = { 450: 0.1, 400: 0.05, 480: 0.05 };
const MODE_EVERY = 60000;
const modeLast = new Map(), reseeded = new Set();
// No live mode player for a queue in a region (first start, or a League key change retired them all, 2026-10-20 22:07Z: ARAM
// fell to 0/h): refetch the region's 5 newest stored matches of that queue (match ids aren't encrypted) and queue their players,
// so the snowball restarts at once instead of from ranked players' ~1% ARAM yield. Once per process per region and queue.
async function reseedMode(ctx, region, q) {
  const { db, riot } = ctx;
  const rows = db.prepare(`SELECT id FROM matches WHERE game = 'lol' AND region = ? AND status = 'done' AND queue IN (${CAPPED[q].join(",")}) ORDER BY started_at DESC LIMIT 5`).all(region);
  const ins = db.prepare("INSERT OR IGNORE INTO mode_players (puuid, region, queue) VALUES (?, ?, ?)");
  for (const { id } of rows) {
    const m = await riot.get(ROUTING[region], `/lol/match/v5/matches/${id}`, "lol match");
    tx(db, () => { for (const p of m?.info?.participants || []) if (p.puuid) ins.run(p.puuid, region, q); });
  }
  return rows.length > 0;
}
async function capped(ctx, region) {
  const { db, riot, now = Date.now } = ctx;
  for (const q of Object.keys(CAPPED).map(Number)) {
    if (!ctx.queues.includes(q)) continue;
    if (now() - (modeLast.get(`${region}:${q}`) || 0) < (ctx.modeEvery ?? MODE_EVERY)) continue;
    if (!reseeded.has(`${region}:${q}`) && !db.prepare("SELECT 1 FROM mode_players WHERE region = ? AND queue = ? LIMIT 1").get(region, q)) {
      reseeded.add(`${region}:${q}`);
      if (await reseedMode(ctx, region, q)) return true;
    }
    const qs = CAPPED[q].join(",");
    const f = db.prepare(`SELECT count(*) n, sum(queue IN (${qs})) mine FROM matches WHERE fetched_at > ? AND game = 'lol' AND region = ?`).get(now() - 3600000, region);
    const waiting = db.prepare(`SELECT count(*) n FROM matches WHERE status = 'new' AND game = 'lol' AND region = ? AND queue IN (${qs})`).get(region).n;
    if (f.n && (f.mine || 0) + waiting >= (ctx.shares?.[q] ?? SHARES[q]) * (f.n + waiting)) continue;
    const fresh = freshFrom(db, "lol"); // during a retirement only players seeded since its epoch
    // a mode player never asked (NULL first) or not asked for 6 h, else a ranked player not yet asked for this queue
    const p = db.prepare(`SELECT x.puuid, x.asked_at, pl.tier FROM mode_players x LEFT JOIN players pl ON pl.puuid = x.puuid AND pl.game = 'lol'
      WHERE x.region = ? AND x.queue = ? AND (x.asked_at IS NULL OR x.asked_at < ?) ORDER BY x.asked_at LIMIT 1`).get(region, q, now() - 6 * IDS_EVERY)
      || db.prepare(`SELECT puuid, tier FROM players p ${fresh ? "INDEXED BY players_seeded" : ""} WHERE game = 'lol' AND region = ?${fresh ? " AND seeded_at >= ?" : ""}
        AND NOT EXISTS (SELECT 1 FROM mode_players x WHERE x.puuid = p.puuid AND x.queue = ?) LIMIT 1`).get(region, ...(fresh ? [fresh] : []), q);
    if (!p) continue;
    modeLast.set(`${region}:${q}`, now());
    const since = Math.floor((p.asked_at || now() - 3 * DAY) / 1000);
    const list = (await riot.get(ROUTING[region], `/lol/match/v5/matches/by-puuid/${p.puuid}/ids?queue=${q}&startTime=${since}&count=20`, "lol ids")) || [];
    const ins = db.prepare(`INSERT OR IGNORE INTO matches (id, game, region, bracket, queue) VALUES (?, 'lol', ?, ?, ${q})`);
    tx(db, () => {
      for (const id of list) ins.run(id, region, p.tier ?? null);
      db.prepare("INSERT INTO mode_players (puuid, region, queue, asked_at) VALUES (?, ?, ?, ?) ON CONFLICT (puuid, queue) DO UPDATE SET asked_at = excluded.asked_at")
        .run(p.puuid, region, q, now());
    });
    return true;
  }
  return false;
}

// Key changed apps (a personal key replacing a development key, 2026-10-20): Riot encrypts puuids per app (and a personal key
// is registered per product, so League and TFT each get their own), so every stored puuid of that game now answers 400
// "Exception decrypting". When the failing puuid is one the crawl still asks, retirePuuids starts that game's retirement: it
// stamps meta retiring:<game> = { epoch }, retires League's mode_players and restarts that game's ladder walk; Master+ comes
// back with fresh puuids within minutes. The player rows themselves (1.5M for League) move in batches (retireBatch, one per
// crawl step): renaming them in one statement re-keyed every index and held the main thread for 5+ min (21:07Z). Moved rows
// are kept as game "lol-stale" (ids(), leaderboards and stats joins stop using them; aggregatePatch still reads their rank).
// Until the move ends, ids() and capped() only ask players seeded after the epoch. Match ids aren't encrypted, so matches and
// stats stay. Returns whether it started a retirement (a late error during or after one is a no-op).
function retirePuuids(db, puuid, game, now = Date.now) {
  if (getMeta(db, `retiring:${game}`)) return false;
  const live = db.prepare("SELECT 1 FROM players WHERE puuid = ? AND game = ? UNION ALL SELECT 1 FROM mode_players WHERE ? = 'lol' AND puuid = ? AND region NOT LIKE '%-stale'").get(puuid, game, game, puuid);
  if (!live) return false;
  tx(db, () => {
    setMeta(db, `retiring:${game}`, { epoch: now(), puuid });
    if (game === "lol") db.exec("UPDATE mode_players SET region = region || '-stale' WHERE region NOT LIKE '%-stale'");
    db.prepare("DELETE FROM meta WHERE k LIKE ? OR k LIKE ?").run(`seed:${game}:%`, `apex:${game}:%`);
    setMeta(db, `puuidsRetired:${game}`, { at: now(), puuid });
  });
  tierCache.clear();
  return true;
}
// One batch of a retirement: moves up to n of the game's rows seeded before the epoch and returns how many (0: done, the
// retirement ends; false: none running).
function retireBatch(db, game, n = 500) {
  const r = getMeta(db, `retiring:${game}`);
  if (!r) return false;
  // two index ranges on players_seeded (game, seeded_at); an OR of them scanned all 1.5M rows per batch
  const move = (w) => Number(db.prepare(`UPDATE OR REPLACE players SET game = game || '-stale' WHERE rowid IN
    (SELECT rowid FROM players INDEXED BY players_seeded WHERE game = ? AND ${w} LIMIT ${n})`).run(game, ...(w.includes("?") ? [r.epoch] : [])).changes);
  const moved = move("seeded_at < ?") || move("seeded_at IS NULL");
  if (!moved) { db.prepare("DELETE FROM meta WHERE k = ?").run(`retiring:${game}`); tierCache.clear(); }
  return moved;
}
// ids()/capped(): during a retirement only players seeded after its epoch (0: everyone)
const freshFrom = (db, game) => getMeta(db, `retiring:${game}`)?.epoch ?? 0;

// Tier-balanced sampling (D14 accuracy audit, 2026-10-20): asking the oldest-asked player first, highest tier among equals,
// spent the first two days on Master+ (95% of matches), so "Emerald+" stats were really Master+. Each ids() call now picks
// the tier furthest below its target share of the region's last-24 h matches; target = the tier's share of seeded players,
// floored at TIER_FLOOR per tier and renormalised (euw1: Emerald ~68%, Diamond ~20%, Master/GM/Challenger 4% each), then the
// oldest-asked player of that tier. Population shares are cached an hour, the recent mix a minute.
const TIER_FLOOR = 0.04;
const tierCache = new Map();
function tierOrder(db, game, region, now) {
  const k = `${game}:${region}`;
  let c = tierCache.get(k);
  if (!c || now - c.popAt > 3600000) {
    const pop = db.prepare("SELECT tier, count(*) n FROM players WHERE game = ? AND region = ? GROUP BY tier").all(game, region).filter((r) => r.tier);
    const total = pop.reduce((s, r) => s + r.n, 0);
    const floored = Object.fromEntries(pop.map((r) => [r.tier, Math.max(TIER_FLOOR, r.n / total)]));
    const sum = Object.values(floored).reduce((s, x) => s + x, 0);
    c = { popAt: now, target: Object.fromEntries(Object.entries(floored).map(([t, x]) => [t, x / sum])), mixAt: 0 };
    tierCache.set(k, c);
  }
  if (now - c.mixAt > 60000) {
    const rows = db.prepare("SELECT bracket, count(*) n FROM matches WHERE fetched_at > ? AND game = ? AND region = ? GROUP BY bracket").all(now - DAY, game, region);
    const n = rows.reduce((s, r) => s + r.n, 0);
    c.mix = Object.fromEntries(rows.map((r) => [r.bracket, n ? r.n / n : 0]));
    c.mixAt = now;
  }
  return Object.keys(c.target).sort((a, b) => (c.target[b] - (c.mix[b] || 0)) - (c.target[a] - (c.mix[a] || 0)));
}

// Newest ranked match ids for the oldest-asked player of the tier most under its share (see tierOrder).
async function ids(ctx, game, region) {
  const { db, riot, now = Date.now } = ctx;
  // during a retirement only rows seeded since its epoch, read off players_seeded (a few thousand), never the 1.5M stale ones
  const fresh = freshFrom(db, game);
  const pick = db.prepare(`SELECT puuid, tier, ids_at FROM players ${fresh ? "INDEXED BY players_seeded" : ""} WHERE game = ? AND region = ? AND tier = ?
    AND (ids_at IS NULL OR ids_at < ?)${fresh ? " AND seeded_at >= ?" : ""} ORDER BY ids_at LIMIT 1`);
  let p = null;
  for (const tier of tierOrder(db, game, region, now())) if ((p = pick.get(game, region, tier, now() - IDS_EVERY, ...(fresh ? [fresh] : [])))) break;
  if (!p) return false;
  const since = Math.floor((p.ids_at || now() - 7 * DAY) / 1000);
  const lolQ = ctx.queues.filter((q) => q === 420 || q === 440);
  const path = game === "lol"
    ? `/lol/match/v5/matches/by-puuid/${p.puuid}/ids?${lolQ.length === 1 ? "queue=" + lolQ[0] : "type=ranked"}&startTime=${since}&count=100`
    : `/tft/match/v1/matches/by-puuid/${p.puuid}/ids?startTime=${since}&count=100`;
  const list = (await riot.get(ROUTING[region], path, `${game} ids`)) || [];
  const ins = db.prepare("INSERT OR IGNORE INTO matches (id, game, region, bracket) VALUES (?, ?, ?, ?)");
  tx(db, () => {
    for (const id of list) ins.run(id, game, region, p.tier);
    db.prepare("UPDATE players SET ids_at = ? WHERE puuid = ? AND game = ?").run(now(), p.puuid, game);
  });
  return true;
}

// One match per request: raw JSON gzipped plus normalised participant rows.
async function fetchOne(ctx, game, region) {
  const { db, riot } = ctx;
  const row = db.prepare("SELECT id FROM matches WHERE status = 'new' AND game = ? AND region = ? LIMIT 1").get(game, region);
  if (!row) return false;
  const path = game === "lol" ? `/lol/match/v5/matches/${row.id}` : `/tft/match/v1/matches/${row.id}`;
  const m = await riot.get(ROUTING[region], path, `${game} match`);
  if (!m) db.prepare("UPDATE matches SET status = 'missing', fetched_at = ? WHERE id = ?").run((ctx.now || Date.now)(), row.id);
  else if (store(ctx, game, row.id, m) && game === "lol" && Math.random() < (ctx.timelineSample ?? 0)) {
    // Timelines cost a second request per match, so only a sample get one (skill order).
    const tl = await riot.get(ROUTING[region], `/lol/match/v5/matches/${row.id}/timeline`, "lol timeline");
    if (tl) { storeSkills(db, row.id, tl); champ.storeTimeline(db, row.id, tl); }
  }
  return true;
}

// Skill max order, e.g. "QEW": basic skills in the order they reach 5 points (unfinished ones by points).
function skillOrder(slots) {
  const n = { 1: 0, 2: 0, 3: 0 }, done = [];
  for (const s of slots) if (s in n && ++n[s] === 5) done.push(s);
  const rest = [1, 2, 3].filter((s) => !done.includes(s)).sort((a, b) => n[b] - n[a]);
  return [...done, ...rest].map((s) => "QWE"[s - 1]).join("");
}

function storeSkills(db, id, tl) {
  const slots = {};
  for (const f of tl.info.frames) for (const e of f.events) {
    if (e.type === "SKILL_LEVEL_UP" && e.levelUpType === "NORMAL") (slots[e.participantId] ??= []).push(e.skillSlot);
  }
  const up = db.prepare("UPDATE lol_participants SET skills = ? WHERE match_id = ? AND puuid = ?");
  tx(db, () => { for (const p of tl.info.participants) if (slots[p.participantId]) up.run(skillOrder(slots[p.participantId]), id, p.puuid); });
}

// match-v5 says gameVersion ("16.20.712.1001"), tft-match-v1 says game_version ("Linux Version 16.20.717.3345 (...) [PUBLIC]").
const patchOf = (info) => { const x = /(\d+)\.(\d+)/.exec(info?.gameVersion ?? info?.game_version ?? ""); return x ? `${x[1]}.${x[2]}` : "?"; };
// Riot now sends a placeholder game_version ("TFT Unreal Version ?.?.?.?") for tft-match-v1, so a TFT game's patch is
// the League patch whose first game started latest at or before it (league windows[]: [[firstStart, patch]] ascending).
// Fallbacks: the newest League patch, then `set<N>`. ponytail: a TFT game right after a patch change, before the first
// League game of that patch is crawled, lands on the previous patch; the next backfill-patch/aggregate pass doesn't re-derive it.
const leagueWindows = (db) => db.prepare("SELECT min(started_at) t, patch FROM matches WHERE game = 'lol' AND status = 'done' AND patch <> '?' AND patch NOT LIKE '%-%' AND started_at IS NOT NULL GROUP BY patch ORDER BY t").all().map((r) => [r.t, r.patch]);
const windowsCache = new WeakMap(); // db -> { at, w }; only non-empty tables are cached, 5 min
function tftPatch(info, windows) {
  const t = info?.game_datetime;
  const hit = t != null && windows.filter(([from]) => from <= t).pop();
  return hit ? hit[1] : windows.length ? windows[windows.length - 1][1] : info?.tft_set_number != null ? `set${info.tft_set_number}` : "?";
}
const windowsFor = (db, now = Date.now) => {
  const c = windowsCache.get(db);
  if (c && now() - c.at < 300000) return c.w;
  const w = leagueWindows(db);
  if (w.length) windowsCache.set(db, { at: now(), w });
  return w;
};
const setOf = (info) => info?.tft_set_number ?? null;

// TFT comp rule (DONI-502): "<top trait>,<carry unit>", e.g. "DA_18_Invoker,DA_18_Ahri" (comma, so a reader that splits ids
// on "," and names each part keeps working).
// Top trait: the active trait (tier_current >= 1) that is not a one-unit unique trait (tier_total > 1), highest tier_current,
// then most units, then name; "none" when the board has none. Carry: the unit holding the most items, then highest star,
// then highest cost (rarity), then name. On 3,200 live boards (patch 16.20) this left 0% in "none" (the old "traits at
// tier >= 2" rule: 22.5%) and explained 2.7x more placement variance. Deterministic: same board, same key.
const byStrength = (a, b) => b.tier_current - a.tier_current || b.num_units - a.num_units || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const carryOf = (units = []) => [...units].sort((x, y) => (y.itemNames || []).length - (x.itemNames || []).length || y.tier - x.tier
  || (y.rarity ?? 0) - (x.rarity ?? 0) || (x.character_id < y.character_id ? -1 : 1))[0]?.character_id || "";
// Since D14 tft_participants.comp stores the carry only; the comp id "<trait>,<carry>" is labelled per patch at aggregation
// (src/tft-comps.js). The top trait is kept for /tft/player and match views that show a single board.
function compOf(p) {
  return carryOf(p.units) || "none";
}

// Game length from stored raw JSON for matches stored before matches.duration existed (D6). Run `aggregate` after it.
function backfillDuration(db) {
  const rows = db.prepare("SELECT id, raw FROM matches WHERE status = 'done' AND duration IS NULL AND raw IS NOT NULL").all();
  const up = db.prepare("UPDATE matches SET duration = ? WHERE id = ?");
  tx(db, () => { for (const r of rows) up.run(win.durationOf(JSON.parse(zlib.gunzipSync(r.raw)).info), r.id); });
  return { matches: rows.length };
}

// Re-derives tft_participants.comp (current rule) and board from stored raw JSON. Rows whose raw was already dropped by
// retention keep what they had. Run `aggregate` after it.
function backfillComps(db) {
  const up = db.prepare("UPDATE tft_participants SET comp = ?, board = ? WHERE match_id = ? AND puuid = ?");
  let matches = 0, boards = 0;
  const ids = db.prepare("SELECT id FROM matches WHERE game = 'tft' AND status = 'done' AND raw IS NOT NULL").all().map((r) => r.id);
  const raw = db.prepare("SELECT raw FROM matches WHERE id = ?");
  for (let i = 0; i < ids.length; i += 500) {
    tx(db, () => {
      for (const id of ids.slice(i, i + 500)) {
        for (const p of JSON.parse(zlib.gunzipSync(raw.get(id).raw)).info.participants) boards += Number(up.run(compOf(p), tftAgg.boardOf(p), id, p.puuid).changes);
        matches++;
      }
    });
  }
  return { matches, boards, ...repairCarries(db) };
}

// Boards whose raw retention already dropped: the carry comes from tft_participants.board ([[unit, star, items]]: most items,
// then star, then name; cost isn't stored there). Before this, backfill-comps took the part after the first comma of an old
// trait-list id, which left trait names as "carries" (DONI-577 follow-up: "DA_18_Invoker,DA_18_Invoker" comps, 2026-10-20).
function repairCarries(db) {
  const rows = db.prepare("SELECT p.match_id, p.puuid, p.board FROM tft_participants p JOIN matches m ON m.id = p.match_id WHERE m.raw IS NULL").all();
  const up = db.prepare("UPDATE tft_participants SET comp = ? WHERE match_id = ? AND puuid = ?");
  let repaired = 0;
  tx(db, () => {
    for (const r of rows) {
      const units = JSON.parse(r.board || "[]").map(([character_id, tier, itemNames]) => ({ character_id, tier, itemNames }));
      repaired += Number(up.run(carryOf(units) || "none", r.match_id, r.puuid).changes);
    }
  });
  return { repaired };
}

function store(ctx, game, id, m) {
  const { db, queues, now = Date.now } = ctx;
  const info = m.info;
  const tierOf = db.prepare("SELECT tier FROM players WHERE puuid = ? AND game = ?");
  const tier = (puuid) => tierOf.get(puuid, game)?.tier ?? null;
  const queue = game === "lol" ? info.queueId : info.queue_id;
  // Remakes (< 5 min) and unconfigured queues are kept as ids only.
  const ok = queues.includes(queue) && (game !== "lol" || info.gameDuration >= 300);
  tx(db, () => {
    db.prepare(`UPDATE matches SET status = ?, queue = ?, patch = ?, "set" = ?, started_at = ?, fetched_at = ?, raw = ?, duration = ? WHERE id = ?`).run(
      ok ? "done" : "skip", queue, game === "tft" && patchOf(info) === "?" ? tftPatch(info, windowsFor(db, now)) : patchOf(info) + (game === "lol" ? MODES[queue] ?? "" : ""), game === "lol" ? null : setOf(info),
      game === "lol" ? info.gameStartTimestamp : info.game_datetime, now(), ok ? zlib.gzipSync(JSON.stringify(m)) : null, win.durationOf(info), id);
    if (!ok) return;
    if (game === "lol") {
      const ins = db.prepare("INSERT INTO lol_participants VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
      for (const p of info.participants) {
        const items = [...new Set([0, 1, 2, 3, 4, 5, 6].map((k) => p["item" + k]).filter((x) => x && !TRINKETS.has(x)))];
        const runes = (p.perks?.styles || []).flatMap((s) => s.selections.map((x) => x.perk));
        ins.run(id, p.puuid, p.teamId, p.championId, p.teamPosition || "", p.win ? 1 : 0, tier(p.puuid),
          JSON.stringify(items), runes[0] ?? null, JSON.stringify(runes), [p.summoner1Id, p.summoner2Id].sort((a, b) => a - b).join(","));
      }
      const ban = db.prepare("INSERT INTO lol_bans VALUES (?, ?, ?)");
      for (const t of info.teams) for (const b of t.bans) if (b.championId > 0) ban.run(id, t.teamId, b.championId);
    } else {
      const ins = db.prepare("INSERT INTO tft_participants (match_id, puuid, placement, tier, comp, traits, units, augments, board) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const p of info.participants) {
        ins.run(id, p.puuid, p.placement, tier(p.puuid), compOf(p),
          JSON.stringify(p.traits.filter((t) => t.tier_current > 0).map((t) => [t.name, t.tier_current])),
          JSON.stringify([...new Set(p.units.map((u) => u.character_id))]), JSON.stringify(p.augments || []), tftAgg.boardOf(p));
      }
    }
    // capped modes snowball: this match's players are asked for that queue next (see capped())
    const cq = game === "lol" && Object.keys(CAPPED).find((k) => CAPPED[k].includes(queue));
    if (cq) { const mp = db.prepare("INSERT OR IGNORE INTO mode_players (puuid, region, queue) VALUES (?, (SELECT region FROM matches WHERE id = ?), ?)"); for (const p of info.participants) if (p.puuid) mp.run(p.puuid, id, Number(cq)); }
    // Riot ids per puuid, both games (TFT since DONI-512, for the leaderboard names).
    require("./agg-players").storeNames(db, db.prepare("SELECT region FROM matches WHERE id = ?").get(id).region, info.participants);
  });
  return ok;
}

// Re-derives patch (and TFT set) from the stored raw JSON for rows stuck on '?' or null, then deletes the stale '?'
// rows in stats_*. Idempotent; rows whose raw has no parseable version stay '?'. Run `aggregate` after it.
function backfillPatch(db) {
  const rows = db.prepare("SELECT id, game, raw FROM matches WHERE (patch = '?' OR patch IS NULL) AND raw IS NOT NULL").all();
  const up = db.prepare('UPDATE matches SET patch = ?, "set" = ? WHERE id = ?');
  const windows = leagueWindows(db);
  let fixed = 0, unparsed = 0, sample = null;
  tx(db, () => {
    for (const r of rows) {
      const info = JSON.parse(zlib.gunzipSync(r.raw)).info;
      let patch = patchOf(info);
      if (patch === "?" && r.game === "tft") patch = tftPatch(info, windows);
      if (patch === "?") { unparsed++; sample ??= info?.gameVersion ?? info?.game_version ?? null; continue; }
      up.run(patch, r.game === "tft" ? setOf(info) : null, r.id);
      fixed++;
    }
    for (const t of ["lol_matches", "lol_champ", "lol_bans", "lol_build", "lol_matchup", "tft_boards", "tft_comp", "tft_part", ...champ.TABLES, ...tftAgg.TABLES, ...win.TABLES, ...draftAgg.TABLES]) db.exec(`DELETE FROM stats_${t} WHERE patch = '?'`);
  });
  return { scanned: rows.length, fixed, unparsed, sample };
}

// DONI-596: before it, flex (440) shared the solo patch. Re-tags every League match whose queue has a mode suffix but whose patch
// lacks it (normalised rows follow the patch at aggregation, raw not needed) and queues the old and new patches for the next
// pass (meta dirtyPatches). Also queues the players of capped-mode matches stored before mode_players existed. Idempotent.
function backfillModes(db) {
  const patches = new Set(getMeta(db, "dirtyPatches") || []);
  let retagged = 0, seeded = 0;
  tx(db, () => {
    for (const [q, sfx] of Object.entries(MODES)) {
      if (!sfx) continue;
      const rows = db.prepare("SELECT DISTINCT patch FROM matches WHERE game = 'lol' AND queue = ? AND patch NOT LIKE '%-%' AND patch <> '?'").all(Number(q));
      for (const r of rows) { patches.add(r.patch); patches.add(r.patch + sfx); }
      retagged += Number(db.prepare("UPDATE matches SET patch = patch || ? WHERE game = 'lol' AND queue = ? AND patch NOT LIKE '%-%' AND patch <> '?'").run(sfx, Number(q)).changes);
    }
    setMeta(db, "dirtyPatches", [...patches]);
    seeded = Number(db.prepare(`INSERT OR IGNORE INTO mode_players (puuid, region, queue) SELECT DISTINCT p.puuid, m.region, CASE m.queue WHEN 490 THEN 480 ELSE m.queue END
      FROM lol_participants p JOIN matches m ON m.id = p.match_id WHERE m.game = 'lol' AND m.queue IN (450, 400, 480, 490)`).run().changes);
  });
  return { retagged, patches: [...patches], seeded };
}

// Rebuilds stats_* from the normalised rows, only for patches that got matches since the last pass
// (every patch with force, or when nothing was aggregated yet). A patch's rows are deleted and recomputed whole.
// Write lock (2026-10-20, DONI-596): each patch is computed into same-named TEMP stats_* tables, which shadow main's on this
// connection, so the minutes of GROUP BYs only read main and the crawl keeps writing. Only the writes to main (raw ingest, each
// patch's swap from temp, the meta stamps) run inside locked(fn); the worker passes one that pauses the crawl loops around them.
const SWAP_ROWS = 250000;
function aggregate(db, now = Date.now, force = false, locked = (fn) => fn()) {
  const cut = now(); // DONI-568: stamped as aggregatedAt, so a match committed after the dirty query is dirty next pass
  const last = getMeta(db, "aggregatedAt");
  const all = force || last == null;
  const dirty = db.prepare(all ? "SELECT DISTINCT patch FROM matches WHERE status = 'done'"
    : "SELECT DISTINCT patch FROM matches WHERE status = 'done' AND coalesce(fetched_at, 0) > ?").all(...(all ? [] : [last])).map((r) => r.patch);
  for (const p of getMeta(db, "dirtyPatches") || []) if (!dirty.includes(p)) dirty.push(p); // backfillModes
  // temp.pm: the patch's matches, copied once per patch (narrow, keyed by id), so the ~35 inserts don't each scan the wide matches
  // table (raw blobs): that scan was a ~150 s floor per patch, even for a 35-match mode patch (DONI-596)
  const M = "JOIN temp.pm m ON m.id = p.match_id AND m.patch = ?";
  const K = "m.patch, m.region, m.bracket";
  const inserts = [
    `INSERT INTO stats_lol_matches SELECT patch, region, bracket, count(*) FROM matches WHERE game = 'lol' AND status = 'done' AND patch = ? GROUP BY 1, 2, 3`,
    `INSERT INTO stats_lol_champ SELECT ${K}, p.role, p.champion, count(*), sum(p.win) FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_lol_bans SELECT ${K}, p.champion, count(DISTINCT p.match_id) FROM lol_bans p ${M} GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_lol_build SELECT ${K}, p.role, p.champion, 'item', j.value, count(*), sum(p.win) FROM lol_participants p ${M}, json_each(p.items) j GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_build SELECT ${K}, p.role, p.champion, 'rune', j.value, count(*), sum(p.win) FROM lol_participants p ${M}, json_each(p.runes) j GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_build SELECT ${K}, p.role, p.champion, 'keystone', p.keystone, count(*), sum(p.win) FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_build SELECT ${K}, p.role, p.champion, 'spells', p.spells, count(*), sum(p.win) FROM lol_participants p ${M} GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_build SELECT ${K}, p.role, p.champion, 'skills', p.skills, count(*), sum(p.win) FROM lol_participants p ${M} WHERE p.skills IS NOT NULL GROUP BY 1, 2, 3, 4, 5, 7`,
    `INSERT INTO stats_lol_matchup SELECT ${K}, p.role, p.champion, o.champion, count(*), sum(p.win) FROM lol_participants p
      JOIN lol_participants o ON o.match_id = p.match_id AND o.role = p.role AND o.team <> p.team ${M} WHERE p.role <> '' GROUP BY 1, 2, 3, 4, 5, 6`,
    `INSERT INTO stats_tft_boards SELECT ${K}, count(*) FROM tft_participants p ${M} GROUP BY 1, 2, 3`,
    `INSERT INTO stats_tft_comp SELECT ${K}, ${require("./tft-comps").COMP}, count(*), sum(p.placement), sum(p.placement <= 4), sum(p.placement = 1) FROM tft_participants p ${require("./tft-comps").JOIN} ${M} GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_tft_part SELECT ${K}, ${require("./tft-comps").COMP}, 'unit', j.value, count(*), sum(p.placement), sum(p.placement <= 4) FROM tft_participants p ${require("./tft-comps").JOIN} ${M}, json_each(p.units) j GROUP BY 1, 2, 3, 4, 6`,
    `INSERT INTO stats_tft_part SELECT ${K}, ${require("./tft-comps").COMP}, 'trait', json_extract(j.value, '$[0]') || ':' || json_extract(j.value, '$[1]'), count(*), sum(p.placement), sum(p.placement <= 4) FROM tft_participants p ${require("./tft-comps").JOIN} ${M}, json_each(p.traits) j GROUP BY 1, 2, 3, 4, 6`,
    `INSERT INTO stats_tft_part SELECT ${K}, ${require("./tft-comps").COMP}, 'augment', j.value, count(*), sum(p.placement), sum(p.placement <= 4) FROM tft_participants p ${require("./tft-comps").JOIN} ${M}, json_each(p.augments) j GROUP BY 1, 2, 3, 4, 6`,
    ...champ.inserts(M, K),
    ...tftAgg.inserts(M, K),
    ...win.inserts(M, K),
    ...draftAgg.inserts(M, K),
  ];
  db.exec("DROP TABLE IF EXISTS temp.pm; CREATE TEMP TABLE pm (id TEXT PRIMARY KEY, patch TEXT, region TEXT, bracket TEXT, duration INT, started_at INT)");
  const tables = db.prepare("SELECT name FROM main.sqlite_master WHERE type = 'table' AND name GLOB 'stats_*'").all().map((r) => r.name);
  for (const t of tables) db.exec(`CREATE TEMP TABLE IF NOT EXISTS ${t} AS SELECT * FROM main.${t} WHERE 0`); // before any prepare
  require("./lol-items").loadCompleted(db); // temp.lol_completed before the build-order inserts are prepared
  require("./tft-comps").init(db); // temp.tft_comp_label, filled per patch below
  const prepared = inserts.map((q) => db.prepare(q));
  champ.ingestRaw(db, locked);
  // meta.aggregates (D7, shown on /status): when each patch was last rebuilt and how long it took, plus the last pass.
  const log = getMeta(db, "aggregates") || { patches: {} };
  const t0 = Date.now();
  try {
  for (const patch of dirty) {
    const t1 = Date.now();
    tx(db, () => { // one read snapshot of main per patch; writes go to temp only
      for (const t of tables) db.exec(`DELETE FROM temp.${t}`);
      db.exec("DELETE FROM temp.pm");
      db.prepare("INSERT INTO temp.pm SELECT id, patch, region, bracket, duration, started_at FROM matches WHERE patch = ?").run(patch);
      require("./tft-comps").labelPatch(db, patch);
      for (const q of prepared) q.run(patch);
      require("./agg-players").aggregatePatch(db, patch);
    });
    const t2 = Date.now();
    // Swapped in groups of ~SWAP_ROWS new rows, one locked transaction each: as one, 16.20's took 94 s of crawl pause (21:48Z,
    // ~3M rows); per table, each lock's drain of the in-flight crawl steps (~1-2 s) times ~40 tables cost as much. The crawl
    // runs between groups (API readers may see one table a pass ahead of another for seconds).
    const swap = (group) => locked(() => tx(db, () => { for (const t of group) { db.prepare(`DELETE FROM main.${t} WHERE patch = ?`).run(patch); db.exec(`INSERT INTO main.${t} SELECT * FROM temp.${t}`); } }));
    let group = [], rows = 0;
    for (const t of tables) {
      group.push(t); rows += db.prepare(`SELECT count(*) n FROM temp.${t}`).get().n;
      if (rows >= SWAP_ROWS) { swap(group); group = []; rows = 0; }
    }
    if (group.length) swap(group);
    log.patches[patch] = { at: now(), ms: Date.now() - t1, swapMs: Date.now() - t2 };
  }
  locked(() => tx(db, () => {
    setMeta(db, "aggregatedAt", cut);
    setMeta(db, "dirtyPatches", []);
    setMeta(db, "aggregates", { ...log, at: now(), ms: Date.now() - t0, dirty });
  }));
  } finally { for (const t of [...tables, "pm"]) db.exec(`DROP TABLE IF EXISTS temp.${t}`); } // this connection reads main's stats again
  return dirty.length;
}

// Nulls matches.raw for matches older than `days` that an aggregation pass has already counted
// (fetched_at <= aggregatedAt). Normalised rows are never touched. Returns how many were nulled.
// ponytail: one UPDATE + a full incremental_vacuum, both block the loop; batch them if they ever take long.
function retain(db, days, now = Date.now) {
  const done = getMeta(db, "aggregatedAt");
  if (done == null) return 0;
  const n = db.prepare("UPDATE matches SET raw = NULL WHERE raw IS NOT NULL AND started_at < ? AND fetched_at <= ?").run(now() - days * DAY, done).changes;
  if (n) db.exec("PRAGMA incremental_vacuum");
  return Number(n);
}

// When the next periodic aggregation is due (now if overdue or never run).
const nextAggregation = (db, everyMin, now = Date.now) => Math.max(now(), (getMeta(db, "aggregatedAt") ?? 0) + everyMin * 60000);

module.exports = { retirePuuids, retireBatch, repairCarries, tierOrder, ARAM, MODES, MODE_RE, basePatch, capped, backfillModes, backfillDuration, backfillComps, backfillPatch, setOf, TIERS, ladderSteps, seed, ids, fetchOne, store, aggregate, retain, nextAggregation, compOf, patchOf, skillOrder };
