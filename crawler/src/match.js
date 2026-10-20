// Match detail (overnight D9): GET /lol/match/{id}, /tft/match/{id}. Sources, best first:
//   raw    the stored match JSON (raw retention window): everything below
//   rows   the normalised rows once raw is gone: champions, roles, wins, items, runes, spells (+ skills) / boards, traits, augments;
//          KDA, damage, CS, gold, vision (League) and level, damage, gold (TFT) are null
//   riot   an id we never crawled: fetched on demand through the lookup cap (3/min with player lookups, cached 10 min)
// League adds timeline highlights (purchase order with times, skill order) for matches in the timeline sample.
const zlib = require("zlib");

const runesOf = (p) => (p.perks?.styles || []).map((s) => ({ style: s.style, perks: s.selections.map((x) => x.perk) }));

function lolFromRaw(m) {
  const i = m.info;
  return {
    id: m.metadata.matchId, queueId: i.queueId, patch: (/(\d+\.\d+)/.exec(i.gameVersion || "") || [])[1] || null, startedAt: i.gameStartTimestamp, duration: i.gameDuration,
    teams: i.teams.map((t) => ({ team: t.teamId, win: !!t.win, bans: t.bans.map((b) => b.championId).filter((c) => c > 0),
      objectives: Object.fromEntries(Object.entries(t.objectives || {}).map(([k, v]) => [k, { first: !!v.first, kills: v.kills }])) })),
    participants: i.participants.map((p) => ({
      puuid: p.puuid, riotId: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline || ""}` : null, team: p.teamId, champion: p.championId, role: p.teamPosition || "",
      win: !!p.win, level: p.champLevel, kills: p.kills, deaths: p.deaths, assists: p.assists, cs: (p.totalMinionsKilled ?? 0) + (p.neutralMinionsKilled ?? 0),
      gold: p.goldEarned, damage: p.totalDamageDealtToChampions, damageTaken: p.totalDamageTaken ?? null, vision: p.visionScore,
      items: [0, 1, 2, 3, 4, 5].map((k) => p["item" + k]).filter(Boolean), trinket: p.item6 || null, spells: [p.summoner1Id, p.summoner2Id],
      keystone: p.perks?.styles?.[0]?.selections?.[0]?.perk ?? null, runes: runesOf(p),
      shards: p.perks?.statPerks ? [p.perks.statPerks.offense, p.perks.statPerks.flex, p.perks.statPerks.defense] : null,
    })),
  };
}

function lolFromRows(db, id, mrow) {
  const ps = db.prepare("SELECT p.*, n.riot_id FROM lol_participants p LEFT JOIN lol_names n ON n.puuid = p.puuid WHERE p.match_id = ?").all(id);
  if (!ps.length) return null;
  const bans = db.prepare("SELECT team, champion FROM lol_bans WHERE match_id = ?").all(id);
  const obj = db.prepare("SELECT team, objective, state FROM lol_objectives WHERE match_id = ?").all(id);
  const teams = [100, 200].map((t) => ({ team: t, win: ps.some((p) => p.team === t && p.win), bans: bans.filter((b) => b.team === t).map((b) => b.champion),
    objectives: Object.fromEntries(obj.filter((o) => o.team === t && o.objective !== "side").map((o) => [o.objective, { first: o.state === 1, kills: null }])) }));
  return {
    id, queueId: mrow.queue, patch: mrow.patch, startedAt: mrow.started_at, duration: mrow.duration ?? null, teams,
    participants: ps.map((p) => ({ puuid: p.puuid, riotId: p.riot_id, team: p.team, champion: p.champion, role: p.role, win: !!p.win, level: null, kills: null, deaths: null,
      assists: null, cs: null, gold: null, damage: null, damageTaken: null, vision: null, items: JSON.parse(p.items || "[]"), trinket: null,
      spells: p.spells ? p.spells.split(",").map(Number) : [], keystone: p.keystone, runes: [{ style: null, perks: JSON.parse(p.runes || "[]") }], shards: null })),
  };
}

function tftFromRaw(m) {
  const i = m.info;
  return {
    id: m.metadata.match_id, queueId: i.queue_id, set: i.tft_set_number ?? null, startedAt: i.game_datetime, length: Math.round(i.game_length || 0),
    participants: i.participants.map((p) => ({
      puuid: p.puuid, riotId: p.riotIdGameName ? `${p.riotIdGameName}#${p.riotIdTagline || ""}` : null, placement: p.placement, level: p.level,
      lastRound: p.last_round, goldLeft: p.gold_left, damage: p.total_damage_to_players, eliminated: p.players_eliminated, timeEliminated: Math.round(p.time_eliminated || 0),
      traits: (p.traits || []).filter((t) => t.tier_current > 0).map((t) => [t.name, t.tier_current, t.num_units]),
      units: (p.units || []).map((u) => [u.character_id, u.tier, u.itemNames || []]), augments: p.augments || [],
    })).sort((a, b) => a.placement - b.placement),
  };
}

function tftFromRows(db, id, mrow) {
  const ps = db.prepare("SELECT p.*, n.riot_id FROM tft_participants p LEFT JOIN lol_names n ON n.puuid = p.puuid WHERE p.match_id = ? ORDER BY p.placement").all(id);
  if (!ps.length) return null;
  return { id, queueId: mrow.queue, set: mrow.set ?? null, startedAt: mrow.started_at, length: mrow.duration ?? null,
    participants: ps.map((p) => ({ puuid: p.puuid, riotId: p.riot_id, placement: p.placement, level: null, lastRound: null, goldLeft: null, damage: null, eliminated: null,
      timeEliminated: null, comp: p.comp, traits: JSON.parse(p.traits || "[]"), units: JSON.parse(p.board || "[]"), augments: JSON.parse(p.augments || "[]") })) };
}

// League timeline highlights from lol_timeline (sampled matches only): purchase order with seconds, and skill order.
function highlights(db, id) {
  const rows = db.prepare("SELECT puuid, start, build, skills FROM lol_timeline WHERE match_id = ?").all(id);
  return rows.length ? Object.fromEntries(rows.map((r) => [r.puuid, { start: r.start, build: JSON.parse(r.build || "[]"), skills: r.skills }])) : null;
}

// game "lol" | "tft". Resolves the detail with `source`; rejects .status 404 (unknown and not fetchable) or the lookup's 429/503.
async function matchDetail(db, lookup, game, id) {
  if (!/^[A-Z0-9]+_\d+$/i.test(id)) throw Object.assign(new Error("match id looks like NA1_5663691820"), { status: 400 });
  const mrow = db.prepare('SELECT id, game, queue, patch, "set", started_at, duration, raw FROM matches WHERE id = ? AND game = ? AND status = \'done\'').get(id, game);
  let out = null;
  if (mrow?.raw) out = { source: "raw", ...(game === "lol" ? lolFromRaw : tftFromRaw)(JSON.parse(zlib.gunzipSync(mrow.raw))) };
  else if (mrow) { const r = (game === "lol" ? lolFromRows : tftFromRows)(db, id, mrow); out = r && { source: "rows", ...r }; }
  if (!out) {
    if (!lookup) throw Object.assign(new Error("no such match"), { status: 404 });
    out = { source: "riot", ...(game === "lol" ? lolFromRaw : tftFromRaw)(await lookup.match(game, id)) };
  }
  if (game === "lol") out.timeline = highlights(db, id);
  return out;
}

module.exports = { matchDetail, lolFromRaw, tftFromRaw };
