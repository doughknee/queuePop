// Crawl jobs. Each call does one unit of work and returns whether it did anything; all progress
// lives in the DB, so a restart picks up where it stopped.
const zlib = require("zlib");
const { tx, getMeta, setMeta } = require("./db");
const { ROUTING } = require("./riot");
const champ = require("./agg-champion");

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

// Walks the whole ladder once a day, saving its place after every page.
async function seed(ctx, game, region) {
  const { db, riot, now = Date.now } = ctx;
  const key = `seed:${game}:${region}`;
  let st = getMeta(db, key) || {};
  if (st.doneAt && now() - st.doneAt < DAY) return false;
  if (st.doneAt) st = {};
  const steps = ladderSteps(game, ctx.minTier);
  const upsert = db.prepare(`INSERT INTO players (puuid, game, region, tier, tier_n, division, lp, seeded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (puuid, game) DO UPDATE SET region = excluded.region, tier = excluded.tier, tier_n = excluded.tier_n,
    division = excluded.division, lp = excluded.lp, seeded_at = excluded.seeded_at`);
  let i = st.step || 0, page = st.page || 1;
  while (i < steps.length) {
    const s = steps[i];
    const res = await riot.get(region, s.paged ? s.path + page : s.path, s.method);
    const entries = (s.paged ? res : res?.entries) || [];
    tx(db, () => {
      for (const e of entries) if (e.puuid) upsert.run(e.puuid, game, region, s.tier, TIERS.indexOf(s.tier), e.rank || s.div || "I", e.leaguePoints ?? 0, now());
      if (s.paged && entries.length) page++; else { i++; page = 1; }
      setMeta(db, key, { step: i, page });
    });
  }
  setMeta(db, key, { doneAt: now() });
  return true;
}

// Newest ranked match ids for the player we asked longest ago (highest tier first among equals).
async function ids(ctx, game, region) {
  const { db, riot, now = Date.now } = ctx;
  const p = db.prepare(`SELECT puuid, tier, ids_at FROM players WHERE game = ? AND region = ? AND (ids_at IS NULL OR ids_at < ?)
    ORDER BY ids_at, tier_n DESC LIMIT 1`).get(game, region, now() - IDS_EVERY);
  if (!p) return false;
  const since = Math.floor((p.ids_at || now() - 7 * DAY) / 1000);
  const lolQ = ctx.queues.filter((q) => q !== 1100);
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
const leagueWindows = (db) => db.prepare("SELECT min(started_at) t, patch FROM matches WHERE game = 'lol' AND status = 'done' AND patch <> '?' AND started_at IS NOT NULL GROUP BY patch ORDER BY t").all().map((r) => [r.t, r.patch]);
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

// TFT comp rule: the sorted set of traits at their 2nd breakpoint or higher (tier_current >= 2).
// Deliberately simple; clustering boards into named comps MetaTFT-style is a later issue.
const compOf = (traits) => traits.filter((t) => t.tier_current >= 2).map((t) => t.name).sort().join(",") || "none";

function store(ctx, game, id, m) {
  const { db, queues, now = Date.now } = ctx;
  const info = m.info;
  const tierOf = db.prepare("SELECT tier FROM players WHERE puuid = ? AND game = ?");
  const tier = (puuid) => tierOf.get(puuid, game)?.tier ?? null;
  const queue = game === "lol" ? info.queueId : info.queue_id;
  // Remakes (< 5 min) and unconfigured queues are kept as ids only.
  const ok = queues.includes(queue) && (game !== "lol" || info.gameDuration >= 300);
  tx(db, () => {
    db.prepare(`UPDATE matches SET status = ?, queue = ?, patch = ?, "set" = ?, started_at = ?, fetched_at = ?, raw = ? WHERE id = ?`).run(
      ok ? "done" : "skip", queue, game === "tft" && patchOf(info) === "?" ? tftPatch(info, windowsFor(db, now)) : patchOf(info), game === "lol" ? null : setOf(info),
      game === "lol" ? info.gameStartTimestamp : info.game_datetime, now(), ok ? zlib.gzipSync(JSON.stringify(m)) : null, id);
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
      const ins = db.prepare("INSERT INTO tft_participants VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
      for (const p of info.participants) {
        ins.run(id, p.puuid, p.placement, tier(p.puuid), compOf(p.traits),
          JSON.stringify(p.traits.filter((t) => t.tier_current > 0).map((t) => [t.name, t.tier_current])),
          JSON.stringify([...new Set(p.units.map((u) => u.character_id))]), JSON.stringify(p.augments || []));
      }
    }
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
    for (const t of ["lol_matches", "lol_champ", "lol_bans", "lol_build", "lol_matchup", "tft_boards", "tft_comp", "tft_part", ...champ.TABLES]) db.exec(`DELETE FROM stats_${t} WHERE patch = '?'`);
  });
  return { scanned: rows.length, fixed, unparsed, sample };
}

// Rebuilds stats_* from the normalised rows, only for patches that got matches since the last pass
// (every patch with force, or when nothing was aggregated yet). A patch's rows are deleted and recomputed whole.
function aggregate(db, now = Date.now, force = false) {
  const last = getMeta(db, "aggregatedAt");
  const all = force || last == null;
  const dirty = db.prepare(all ? "SELECT DISTINCT patch FROM matches WHERE status = 'done'"
    : "SELECT DISTINCT patch FROM matches WHERE status = 'done' AND coalesce(fetched_at, 0) > ?").all(...(all ? [] : [last])).map((r) => r.patch);
  const M = "JOIN matches m ON m.id = p.match_id AND m.patch = ?";
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
    `INSERT INTO stats_tft_comp SELECT ${K}, p.comp, count(*), sum(p.placement), sum(p.placement <= 4), sum(p.placement = 1) FROM tft_participants p ${M} GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_tft_part SELECT ${K}, p.comp, 'unit', j.value, count(*), sum(p.placement), sum(p.placement <= 4) FROM tft_participants p ${M}, json_each(p.units) j GROUP BY 1, 2, 3, 4, 6`,
    `INSERT INTO stats_tft_part SELECT ${K}, p.comp, 'augment', j.value, count(*), sum(p.placement), sum(p.placement <= 4) FROM tft_participants p ${M}, json_each(p.augments) j GROUP BY 1, 2, 3, 4, 6`,
    ...champ.inserts(M, K),
  ].map((q) => db.prepare(q));
  champ.ingestRaw(db);
  tx(db, () => {
    for (const patch of dirty) {
      for (const t of ["lol_matches", "lol_champ", "lol_bans", "lol_build", "lol_matchup", "tft_boards", "tft_comp", "tft_part", ...champ.TABLES]) db.prepare(`DELETE FROM stats_${t} WHERE patch = ?`).run(patch);
      for (const q of inserts) q.run(patch);
    }
    setMeta(db, "aggregatedAt", now());
  });
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

module.exports = { backfillPatch, setOf, TIERS, ladderSteps, seed, ids, fetchOne, store, aggregate, retain, nextAggregation, compOf, patchOf, skillOrder };
