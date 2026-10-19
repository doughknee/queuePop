// Queue launcher + account bridge methods (PLAY dropdown, summoner badge, mastery, history). Port of src/web_api.py.
const fs = require("fs");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

const QUEUE_ID_MAP = {
  1090: "TFT Normal", 1100: "TFT Ranked", 1130: "TFT Hyper Roll", 1160: "TFT Double Up", 420: "Ranked Solo/Duo",
  440: "Ranked Flex", 400: "Draft Pick", 430: "Blind Pick", 450: "ARAM", 1700: "Arena", 1220: "Tocker's Trials", 2400: "ARAM Mayhem",
};
const QUEUE_GROUPS = [
  { key: "rift", label: "Summoner's Rift" }, { key: "aram", label: "ARAM" }, { key: "featured", label: "Featured & Rotating" },
  { key: "tft", label: "Teamfight Tactics" }, { key: "clash", label: "Clash" }, { key: "coop", label: "Co-op vs. AI" },
  { key: "tutorial", label: "Tutorial" }, { key: "other", label: "Other" },
];
const QUICK_GROUPS = ["rift", "aram", "featured", "tft"];
const GROUP_ORDER = Object.fromEntries(QUEUE_GROUPS.map((g, i) => [g.key, i]));
const MAP_NAMES = { 11: "Summoner's Rift", 12: "Howling Abyss", 21: "Nexus Blitz", 22: "Convergence", 30: "Rings of Wrath", 33: "The Arena", 35: "Swarm" };
const STATIC_GROUP = { 400: "rift", 430: "rift", 490: "rift", 420: "rift", 440: "rift", 450: "aram", 2400: "aram", 1700: "featured",
  1090: "tft", 1100: "tft", 1130: "tft", 1160: "tft", 1220: "tft" };
const RANKED_IDS = new Set([420, 440, 1100]);

function queueGroup(q) {
  const mode = (q.gameMode || "").toUpperCase(), type = (q.type || "").toUpperCase(), name = (q.name || "").toUpperCase();
  if (mode.includes("TUTORIAL") || type.includes("TUTORIAL")) return "tutorial";
  if (q.category === "VersusAi") return "coop";
  if (mode === "TFT" || type.includes("TFT")) return "tft";
  if (type.includes("CLASH") || name.includes("CLASH")) return "clash";
  if (q.mapId === 12 || mode === "ARAM") return "aram";
  if (q.mapId === 11 && ["CLASSIC", "SWIFTPLAY"].includes(mode)) return "rift";
  return "featured";
}

// Make same-named queues unique: append the first field whose values all differ, else a numeric suffix.
function disambiguate(items) {
  const byName = {};
  for (const it of items) (byName[it.name] ||= []).push(it);
  for (const [base, group] of Object.entries(byName)) {
    if (group.length < 2) continue;
    const field = ["_map", "_mode", "_short", "_desc", "_type"].find((f) => {
      const v = group.map((it) => (it[f] || "").trim());
      return v.every(Boolean) && new Set(v).size === group.length;
    });
    group.forEach((it, i) => { it.name = field ? `${base} · ${it[field].trim()}` : `${base} (${i + 1})`; });
  }
}

function enrichLiveQueues(live) {
  const items = [], seen = new Set();
  for (const q of live) {
    const id = q.id;
    if (!Number.isInteger(id) || id < 0 || seen.has(id) || q.category === "Custom") continue;
    if (q.queueAvailability != null && q.queueAvailability !== "Available") continue;
    const name = (q.name || q.shortName || "").trim();
    if (!name) continue;
    seen.add(id);
    items.push({ id, name, group: queueGroup(q), ranked: !!q.isRanked, _map: MAP_NAMES[q.mapId] || "",
      _mode: (q.gameMode || "").toLowerCase().replace(/^./, (c) => c.toUpperCase()), _short: (q.shortName || "").trim(),
      _desc: (q.description || "").trim(), _type: (q.type || "").trim() });
  }
  disambiguate(items);
  return items.map(({ id, name, group, ranked }) => ({ id, name, group, ranked }));
}

const staticQueueItems = () => Object.entries(QUEUE_ID_MAP).map(([id, name]) => ({ id: Number(id), name, group: STATIC_GROUP[id] || "other", ranked: RANKED_IDS.has(Number(id)) }));
const sortQueues = (items) => items.sort((a, b) => (GROUP_ORDER[a.group] ?? 99) - (GROUP_ORDER[b.group] ?? 99) || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
const cleanIds = (ids) => { const out = []; for (const v of Array.isArray(ids) ? ids : []) { const n = Number(v); if (Number.isInteger(n) && n >= 0 && !out.includes(n)) out.push(n); } return out; };

const REGIONS = {};
for (const [keys, pair] of [[["NA", "NA1"], ["na", "na1"]], [["EUW", "EUW1"], ["euw", "euw1"]], [["EUNE", "EUN1"], ["eune", "eun1"]], [["KR"], ["kr", "kr"]],
  [["BR", "BR1"], ["br", "br1"]], [["JP", "JP1"], ["jp", "jp1"]], [["OCE", "OC1"], ["oce", "oc1"]], [["LAN", "LA1"], ["lan", "la1"]],
  [["LAS", "LA2"], ["las", "la2"]], [["TR", "TR1"], ["tr", "tr1"]], [["RU"], ["ru", "ru"]], [["PH", "PH2"], ["ph", "ph2"]],
  [["SG", "SG2"], ["sg", "sg2"]], [["TH", "TH2"], ["th", "th2"]], [["TW", "TW2"], ["tw", "tw2"]], [["VN", "VN2"], ["vn", "vn2"]],
  [["ME", "ME1"], ["me", "me1"]]]) for (const k of keys) REGIONS[k] = pair;
const opggRegion = (r) => { r = (r || "").toUpperCase().trim(); return (REGIONS[r] || [r.toLowerCase()])[0]; };
const platform = (r) => { r = (r || "").toUpperCase().trim(); return (REGIONS[r] || [null, r.toLowerCase()])[1]; };

function profileLinks(name, tag, region, plat) {
  if (!name) return [];
  const riot = encodeURIComponent(tag ? `${name}-${tag}` : name), r = region || "", p = plat || region || "";
  return [
    ["OP.GG", `https://op.gg/summoners/${r}/${riot}`], ["U.GG", `https://u.gg/lol/profile/${p}/${riot}/overview`],
    ["League of Graphs", `https://www.leagueofgraphs.com/summoner/${r}/${riot}`], ["Lolalytics", `https://lolalytics.com/summoner/${r}/${riot}/`],
    ["DeepLoL", `https://www.deeplol.gg/summoner/${r}/${riot}`], ["Porofessor", `https://porofessor.gg/live/${r}/${riot}`],
    ["Mobalytics", `https://mobalytics.gg/lol/profile/${r}/${riot}/overview`], ["Blitz", `https://blitz.gg/lol/profile/${r}/${riot}`],
  ].map(([name, url]) => ({ name, url }));
}

const LANES = { TOP: "top", JUNGLE: "jungle", MIDDLE: "middle", MID: "middle" };
function matchPosition(mapId, lane, role) {
  if (mapId !== 11) return null;
  lane = (lane || "").toUpperCase();
  if (lane === "BOTTOM" || lane === "BOT") return (role || "").toUpperCase() === "DUO_SUPPORT" ? "utility" : "bottom";
  return LANES[lane] || null;
}

// ctx: { lcu, getConfig, setConfigKey(key, value), push, getStats(), shell, configDir }
function createAccount(ctx) {
  const { lcu, push } = ctx;
  const iconCache = {};
  const get = (uri, ms) => lcu.request("get", uri).catch(() => null);

  // Binary GET (profile icon); lcu.request only returns parsed text. Null on any failure.
  function rawGet(uri) {
    if (!lcu.creds) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = https.get({ host: "127.0.0.1", port: lcu.creds.port, path: uri, rejectUnauthorized: false, timeout: 5000,
        headers: { Authorization: "Basic " + Buffer.from("riot:" + lcu.creds.password).toString("base64") } }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(res.statusCode === 200 ? Buffer.concat(chunks) : null));
      });
      req.on("timeout", () => req.destroy());
      req.on("error", () => resolve(null));
    });
  }

  async function liveQueues() {
    const r = await get("/lol-game-queues/v1/queues");
    return r && r.status === 200 && Array.isArray(r.data) ? r.data : null;
  }

  async function getQueueMap() {
    const live = await liveQueues();
    const items = live ? enrichLiveQueues(live) : staticQueueItems();
    const have = new Set(items.map((i) => i.id));
    // Never drop a queue the user already allow-listed (it may have rotated out).
    for (let qid of ctx.getConfig().allowed_queue_ids || []) {
      qid = Number(qid);
      if (Number.isNaN(qid) || have.has(qid)) continue;
      items.push({ id: qid, name: QUEUE_ID_MAP[qid] || `Queue ${qid}`, group: STATIC_GROUP[qid] || "other", ranked: RANKED_IDS.has(qid) });
      have.add(qid);
    }
    return { queues: sortQueues(items), groups: QUEUE_GROUPS };
  }

  async function getQuickQueues() {
    const cfg = ctx.getConfig();
    const live = await liveQueues();
    const base = live ? enrichLiveQueues(live) : staticQueueItems();
    return {
      queues: sortQueues(base.filter((i) => QUICK_GROUPS.includes(i.group))),
      groups: QUEUE_GROUPS.filter((g) => QUICK_GROUPS.includes(g.key)),
      favorites: cleanIds(cfg.favorite_queue_ids), last: cfg.last_queue_id ?? null, show_last: cfg.show_last_queue ?? true,
    };
  }

  async function startQueue(queueId) {
    const qid = Number(queueId);
    if (!Number.isInteger(qid)) return { ok: false, error: "Invalid queue" };
    if (!lcu.connected) return { ok: false, error: "Client not connected" };
    try {
      const r = await lcu.request("post", "/lol-lobby/v2/lobby", { queueId: qid });
      if (![200, 201, 204].includes(r.status)) return { ok: false, error: `Lobby error (${r.status})` };
      const s = await lcu.request("post", "/lol-lobby/v2/lobby/matchmaking/search");
      if (![200, 204].includes(s.status)) return { ok: false, error: `Search error (${s.status})` };
    } catch { return { ok: false, error: "Client not connected" }; }
    push(`Queue started: ${QUEUE_ID_MAP[qid] || `queue ${qid}`}`, "success", "queue");
    if (ctx.getConfig().last_queue_id !== qid) ctx.setConfigKey("last_queue_id", qid);
    return { ok: true };
  }

  async function cancelQueue() {
    if (!lcu.connected) return { ok: false, error: "Client not connected" };
    const r = await lcu.request("delete", "/lol-lobby/v2/lobby/matchmaking/search").catch(() => null);
    if (r && [200, 204].includes(r.status)) { push("Matchmaking canceled", "warning", "queue"); return { ok: true }; }
    return { ok: false };
  }

  function launchLeague() {
    try {
      const installs = path.join(process.env.ProgramData || "C:\\ProgramData", "Riot Games", "RiotClientInstalls.json");
      const data = fs.existsSync(installs) ? JSON.parse(fs.readFileSync(installs, "utf8")) : {};
      const rc = data.rc_live || data.rc_default;
      if (!rc || !fs.existsSync(rc)) return { ok: false, error: "Riot Client not found" };
      spawn(rc, ["--launch-product=league_of_legends", "--launch-patchline=live"], { detached: true, stdio: "ignore" }).unref();
      push("Launching League client…", "info");
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  async function getChampionMastery() {
    const r = await get("/lol-champion-mastery/v1/local-player/champion-mastery");
    if (!r || r.status !== 200) return [];
    const list = Array.isArray(r.data) ? r.data : (r.data && r.data.championMasteryList) || [];
    return list.filter((m) => m.championId).map((m) => ({ championId: m.championId, level: m.championLevel, points: m.championPoints ?? 0, lastPlayTime: m.lastPlayTime ?? 0 }));
  }

  async function getMatchHistory(count = 10) {
    count = Math.max(1, Math.min(parseInt(count, 10) || 10, 20));
    const me = await get("/lol-summoner/v1/current-summoner");
    const puuid = me && me.status === 200 ? me.data.puuid : null;
    const r = await get(`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=0&endIndex=${count - 1}`);
    if (!r || r.status !== 200) return [];
    const out = [];
    for (const g of ((r.data && r.data.games) || {}).games || []) {
      const parts = g.participants || [];
      const ident = puuid && (g.participantIdentities || []).find((i) => (i.player || {}).puuid === puuid);
      let part = ident ? parts.find((p) => p.participantId === ident.participantId) : null;
      if (!part && parts.length === 1) part = parts[0]; // endpoint sometimes returns only our participant
      if (!part) continue;
      const st = part.stats || {}, tl = part.timeline || {};
      out.push({ position: matchPosition(g.mapId, tl.lane, tl.role), championId: part.championId, win: !!st.win, kills: st.kills ?? 0,
        deaths: st.deaths ?? 0, assists: st.assists ?? 0, queueId: g.queueId, ts: (g.gameCreation || 0) / 1000 });
    }
    return out;
  }

  // TFT games live under their own product: /lol-match-history/v1/products/tft/{puuid}/matches (checked on the live client
  // 2026-10-19). Returns our board per game; augments are often absent from the client's copy.
  async function getTftMatchHistory(count = 10) {
    count = Math.max(1, Math.min(parseInt(count, 10) || 10, 20));
    const me = await get("/lol-summoner/v1/current-summoner");
    const puuid = me && me.status === 200 ? me.data.puuid : null;
    if (!puuid) return [];
    const r = await get(`/lol-match-history/v1/products/tft/${puuid}/matches?begin=0&count=${count}`);
    if (!r || r.status !== 200) return [];
    const out = [];
    for (const g of (r.data && r.data.games) || []) {
      const j = g.json || {}, p = (j.participants || []).find((x) => x.puuid === puuid);
      if (!p) continue;
      out.push({ id: j.gameId || j.game_id, ts: (j.game_datetime || 0) / 1000, queueId: j.queue_id ?? j.queueId, set: j.tft_set_number,
        length: j.game_length || 0, placement: p.placement, level: p.level, augments: p.augments || [],
        traits: (p.traits || []).filter((t) => t.tier_current > 0).map((t) => ({ key: t.name, units: t.num_units, style: t.style, tier: t.tier_current })),
        units: (p.units || []).map((u) => ({ key: u.character_id, stars: u.tier, items: u.itemNames || [] })) });
    }
    return out;
  }

  async function getSummoner() {
    const r = await get("/lol-summoner/v1/current-summoner");
    if (!r || r.status !== 200) return { connected: false };
    const s = r.data;
    const name = s.gameName || s.displayName || "", tag = s.tagLine || "", iconId = s.profileIconId;
    const rr = await get("/riotclient/region-locale");
    const rawRegion = (rr && rr.status === 200 && rr.data.region) || "";

    const ranked = {};
    const rk = await get("/lol-ranked/v1/current-ranked-stats");
    if (rk && rk.status === 200) {
      const qm = rk.data.queueMap || {};
      const entry = (key) => {
        const e = qm[key] || "", tier = ((e && e.tier) || "").trim();
        if (!tier || ["NONE", "UNRANKED"].includes(tier.toUpperCase())) return null;
        return { tier, division: e.division || "", lp: e.leaguePoints ?? 0, wins: e.wins ?? 0, losses: e.losses ?? 0 };
      };
      Object.assign(ranked, { solo: entry("RANKED_SOLO_5x5"), flex: entry("RANKED_FLEX_SR"), tft: entry("RANKED_TFT"), double_up: entry("RANKED_TFT_DOUBLE_UP") });
    }

    let mastery = [];
    let mr = await get("/lol-champion-mastery/v1/local-player/champion-mastery/top?limit=5");
    if (!mr || mr.status !== 200) mr = await get("/lol-champion-mastery/v1/local-player/champion-mastery");
    if (mr && mr.status === 200) {
      const md = Array.isArray(mr.data) ? mr.data : mr.data.championMasteryList || [];
      mastery = [...md].sort((a, b) => (b.championPoints ?? 0) - (a.championPoints ?? 0)).slice(0, 5)
        .filter((m) => m.championId).map((m) => ({ championId: m.championId, level: m.championLevel, points: m.championPoints ?? 0 }));
    }

    // Profile icon proxied as a data URI (rarely changes, so cached by id).
    if (iconId != null && !(iconId in iconCache)) {
      const icon = await rawGet(`/lol-game-data/assets/v1/profile-icons/${iconId}.jpg`);
      if (icon) iconCache[iconId] = "data:image/jpeg;base64," + icon.toString("base64");
    }

    const region = opggRegion(rawRegion), plat = platform(rawRegion);
    const links = profileLinks(name, tag, region, plat);
    return { connected: true, name, tag, level: s.summonerLevel, icon: iconCache[iconId] ?? null, region, platform: plat,
      opgg: (links.find((l) => l.name === "OP.GG") || {}).url || "", links, ranked, mastery };
  }

  return { getQueueMap, getQuickQueues, startQueue, cancelQueue, launchLeague, getChampionMastery, getMatchHistory, getTftMatchHistory, getSummoner };
}

module.exports = { createAccount, enrichLiveQueues, matchPosition, QUEUE_ID_MAP };
