// Recorder, phase 1 (DONI-523 / Q20): an event log per game, off by default (Settings > Recorder (beta) > Record game events).
// League: while the game is in progress, Riot's live client data API on 127.0.0.1:2999 (read-only, Riot-sanctioned,
// self-signed certificate) is polled every 2 s; your kills, deaths, assists, multikills, objectives and the result are kept
// with their game time. TFT: game start, end and placement from the League client. One file per game:
// userData/recordings/<matchId>.json (matchId like NA1_5663691820, the same id the crawler and match pages use).
// Video (recorder-video.js) is a separate opt-in that reads these events to cut clips.
const fs = require("fs");
const path = require("path");
const https = require("https");

const { TFT_QUEUES, forGame } = require("./champ-config");
const OBJECTIVES = { DragonKill: "dragon", BaronKill: "baron", HeraldKill: "herald", HordeKill: "voidgrubs", TurretKilled: "turret", InhibKilled: "inhibitor" };

// Riot live events → our markers for the active player `me`. Pure; app/test-recorder.js checks it.
// e = {EventID, EventName, EventTime, KillerName, VictimName, Assisters[], KillStreak, DragonType, Result, ...}
function mapLiveEvents(raw, me) {
  const out = [];
  // Riot sends FirstBlood and a ChampionKill for the same kill: the kill carries the note instead of counting twice (review).
  const fb = (raw || []).filter((e) => e.EventName === "FirstBlood").map((e) => Number(e.EventTime) || 0);
  for (const e of raw || []) {
    const t = Math.round((Number(e.EventTime) || 0) * 10) / 10, id = e.EventID;
    // activeplayername is the Riot ID ("Name#TAG"); event names can be the game name alone.
    const mine = (n) => n && me && (String(n) === String(me) || String(n) === String(me).split("#")[0]);
    if (e.EventName === "ChampionKill") {
      if (mine(e.KillerName)) out.push({ id, t, type: "kill", label: `Killed ${e.VictimName}${fb.some((x) => Math.abs(x - e.EventTime) < 1) ? " (first blood)" : ""}` });
      else if (mine(e.VictimName)) out.push({ id, t, type: "death", label: `Killed by ${e.KillerName}` });
      else if ((e.Assisters || []).some(mine)) out.push({ id, t, type: "assist", label: `Assist on ${e.VictimName}` });
    } else if (e.EventName === "Multikill" && mine(e.KillerName)) {
      const n = Number(e.KillStreak) || 2;
      out.push({ id, t, type: "multikill", label: ({ 2: "Double kill", 3: "Triple kill", 4: "Quadra kill", 5: "Penta kill" })[n] || `${n} kills` });
    } else if (OBJECTIVES[e.EventName]) {
      const what = OBJECTIVES[e.EventName], by = mine(e.KillerName) ? "You" : e.KillerName || "";
      const name = what === "dragon" && e.DragonType ? `${e.DragonType} dragon` : what;
      out.push({ id, t, type: "objective", label: `${name.charAt(0).toUpperCase() + name.slice(1)}${by ? ` (${by})` : ""}`, objective: what, stolen: e.Stolen === "True" });
    } else if (e.EventName === "GameEnd") {
      out.push({ id, t, type: "end", label: e.Result === "Win" ? "Victory" : e.Result === "Lose" ? "Defeat" : "Game over", result: e.Result });
    }
  }
  return out;
}

// GET a live client path → parsed JSON, or null (not in game yet, closed, timed out).
function liveGet(p, timeout = 1500) {
  return new Promise((resolve) => {
    const req = https.get({ host: "127.0.0.1", port: 2999, path: p, rejectUnauthorized: false, timeout }, (res) => {
      let t = "";
      res.on("data", (c) => (t += c));
      res.on("end", () => { try { resolve(res.statusCode === 200 ? JSON.parse(t) : null); } catch { resolve(null); } });
      res.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

// ctx: { lcu, getConfig, dir, push, log, platform: () => Promise<string>, onGame?: (rec, phase) => void, live?: liveGet }
function attachRecorder(ctx) {
  const live = ctx.live || liveGet;
  let rec = null, timer = null, seen = new Set(), me = null, detached = false, misses = 0;
  const enabled = () => { const c = ctx.getConfig(); return forGame(c, "league").record || forGame(c, "tft").record; }; // DONI-594: each game has its own switch
  const file = (id) => path.join(ctx.dir, `${String(id).replace(/[^\w-]/g, "_")}.json`);
  const save = () => { if (!rec) return; try { fs.mkdirSync(ctx.dir, { recursive: true }); fs.writeFileSync(file(rec.matchId), JSON.stringify(rec)); } catch (e) { ctx.log("recorder: save", e.message); } };

  // TFT: placement (top 4 is a win; in Double Up it's still your 1-8 standing) and, from match history, the final board.
  function setPlacement(r, place) {
    r.placement = place; r.result = place <= 4 ? "win" : "loss";
    if (!r.events.some((e) => e.type === "end")) r.events.push({ id: "end", t: null, type: "end", label: `${place}${["th", "st", "nd", "rd"][place] || "th"} place` });
  }
  // Recordings whose game ended without a placement or board get them from the client's TFT match history, matched by
  // game id. Runs after each TFT game and once whenever the client connects (games recorded while the app restarted).
  async function fillFromHistory(ids) {
    if (!ctx.tftHistory) return;
    const want = (ids || list().filter((r) => r.game === "tft" && r.endedAt && !r.placement).map((r) => r.matchId)).map(read).filter((r) => r && (!r.placement || !r.board));
    if (!want.length) return;
    let games = []; try { games = (await ctx.tftHistory(20)) || []; } catch { return; }
    for (const r of want) {
      const g = games.find((x) => String(x.id) === String(r.gameId) || String(x.id).endsWith(`_${r.gameId}`)); if (!g) continue;
      if (!r.placement && g.placement) setPlacement(r, g.placement);
      r.board = { level: g.level, units: g.units, traits: g.traits, augments: g.augments, length: g.length };
      try { fs.writeFileSync(file(r.matchId), JSON.stringify(r)); } catch (e) { ctx.log("recorder: board", e.message); }
    }
  }
  ctx.lcu.on("connect", () => setTimeout(() => fillFromHistory(), 20000).unref?.());

  async function start() {
    if (rec || !enabled()) return;
    const s = await ctx.lcu.request("get", "/lol-gameflow/v1/session").catch(() => null);
    const gd = (s && s.data && s.data.gameData) || {}, queueId = gd.queue && gd.queue.id;
    const platform = (await Promise.resolve(ctx.platform && ctx.platform()).catch(() => "")) || "";
    const gameId = gd.gameId || Date.now();
    const game = TFT_QUEUES.has(queueId) || gd.queue?.gameMode === "TFT" ? "tft" : "league";
    if (!forGame(ctx.getConfig(), game).record) return; // this game's recording is off
    rec = { matchId: platform ? `${String(platform).toUpperCase()}_${gameId}` : String(gameId), gameId, queueId: queueId || null,
      game, startedAt: Date.now(), endedAt: null, champion: null, result: null, events: [] };
    seen = new Set(); me = null; detached = false; misses = 0;
    ctx.log(`recorder: recording ${rec.game} ${rec.matchId}`);
    ctx.onGame && ctx.onGame(rec, "start");
    if (rec.game === "league") { poll(); timer = setInterval(poll, 2000); }
    save();
  }
  async function poll() {
    if (!rec) return;
    if (!me) { me = await live("/liveclientdata/activeplayername"); if (me && rec) { const p = await live("/liveclientdata/activeplayer"); rec.player = me; rec.champion = (p && p.championName) || rec.champion; } }
    if (rec && !rec.clock) { const gs = await live("/liveclientdata/gamestats"); if (gs && Number.isFinite(gs.gameTime) && rec) rec.clock = { wall: Date.now(), gameTime: gs.gameTime }; }
    const d = await live("/liveclientdata/eventdata");
    // League client closed during the game ("Close client during game"): the live API is the only clock left, so the
    // recording ends on GameEnd or after 30 s of silence instead of at the disconnect.
    if (!d) { if (rec && detached && ++misses >= 15) queue(stop); return; }
    misses = 0;
    if (!rec) return;
    const fresh = mapLiveEvents((d.Events || []).filter((e) => !seen.has(e.EventID)), me);
    for (const e of d.Events || []) seen.add(e.EventID);
    if (!rec.champion) { const ps = await live("/liveclientdata/playerlist"); const mine = (ps || []).find((p) => p.riotIdGameName === me || p.summonerName === me || p.riotId === me); if (mine) rec.champion = mine.championName; }
    if (fresh.length) {
      rec.events.push(...fresh);
      const end = fresh.find((e) => e.type === "end");
      if (end) rec.result = end.result === "Win" ? "win" : end.result === "Lose" ? "loss" : null;
      save();
      if (end && detached) queue(stop);
    }
  }
  async function stop() {
    if (!rec) return;
    clearInterval(timer); timer = null;
    if (rec.game === "league") await poll(); // the GameEnd event often arrives on the last poll
    if (rec.game === "tft") {
      // The end-of-game screen's stats can land after the phase change, so read it a few times.
      for (let i = 0; i < 3 && !rec.placement; i++) {
        if (i) await new Promise((r) => setTimeout(r, 2000));
        const eog = await ctx.lcu.request("get", "/lol-end-of-game/v1/tft-eog-stats").catch(() => null);
        const same = !(eog && eog.data && eog.data.gameId) || String(eog.data.gameId) === String(rec.gameId); // not last game's screen
        const lp = same && eog && eog.data && eog.data.localPlayer;
        if (lp && lp.ffaStanding) setPlacement(rec, lp.ffaStanding);
      }
    }
    rec.endedAt = Date.now();
    save();
    if (rec.game === "tft") { const done = rec; for (const wait of [45000, 180000]) setTimeout(() => fillFromHistory([done.matchId]), wait).unref?.(); } // the board, and the placement if the screen had none
    ctx.onGame && ctx.onGame(rec, "end");
    ctx.push(`Recorded ${rec.game === "tft" ? "TFT" : rec.champion || "League"}: ${rec.events.filter((e) => e.type !== "end").length} moments`, "info", "recorder");
    rec = null;
  }

  // Phase events arrive in bursts; start and stop run one at a time so a game is never recorded twice or half-stopped (review).
  let chain = Promise.resolve();
  function queue(f) { chain = chain.then(f).catch((err) => ctx.log("recorder:", err && err.message || err)); return chain; }
  // TFT's placement is on the end-of-game screen, so TFT ends on EndOfGame (or leaving it); League on the first end phase.
  const ENDS = { league: ["PreEndOfGame", "WaitingForStats", "EndOfGame", "None", "Lobby"], tft: ["EndOfGame", "None", "Lobby"] };
  ctx.lcu.on("event", (e) => {
    if (e.uri !== "/lol-gameflow/v1/gameflow-phase" || e.eventType === "Delete") return;
    if (e.data === "InProgress") queue(() => { if (rec && detached && rec.game === "league") { detached = false; return; } return start(); }); // client came back
    else queue(() => { if (rec && ENDS[rec.game].includes(e.data)) return stop(); });
  });
  ctx.lcu.on("disconnect", () => queue(() => { if (rec && rec.game === "league" && timer) { detached = true; misses = 0; return; } return stop(); }));

  const readOne = (id) => { try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { return null; } };
  // "NA1_123" and "123" name the same game: a recording made while the platform was unknown is stored under the bare id.
  const read = (id) => { id = String(id); const bare = id.replace(/^[A-Za-z]+\d*_/, ""); return readOne(id) || (bare !== id ? readOne(bare) : null)
    || (() => { try { const f = fs.readdirSync(ctx.dir).find((n) => n.endsWith(`_${bare}.json`)); return f ? readOne(f.slice(0, -5)) : null; } catch { return null; } })(); };
  function list() {
    let names = [];
    try { names = fs.readdirSync(ctx.dir).filter((f) => f.endsWith(".json")); } catch { return []; }
    return names.map((f) => read(f.slice(0, -5))).filter((r) => r && Array.isArray(r.events) && r.matchId).sort((a, b) => b.startedAt - a.startedAt).map((r) => ({
      matchId: r.matchId, game: r.game, queueId: r.queueId, champion: r.champion, result: r.result, placement: r.placement || null,
      startedAt: r.startedAt, endedAt: r.endedAt, video: !!r.video, clips: (r.clips || []).length,
      counts: r.events.reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {}) }));
  }
  return {
    list, get: read, live: () => rec, fill: fillFromHistory,
    remove(id) {
      const r = read(id); try { fs.unlinkSync(file(r ? r.matchId : id)); } catch { return { ok: false }; }
      // Its video and clips too, but only files inside the recordings folder (a moved or hand-edited file is left alone).
      const inside = (f) => f && !path.relative(ctx.dir, path.resolve(ctx.dir, f)).startsWith("..") && !path.isAbsolute(path.relative(ctx.dir, path.resolve(ctx.dir, f)));
      for (const f of [r && r.video && r.video.file, ...((r && r.clips) || []).map((c) => c.file)]) if (inside(f)) try { fs.unlinkSync(f); } catch {}
      return { ok: true, video: r && r.video };
    },
    update(id, patch) { const r = read(id); if (!r) return null; Object.assign(r, patch); fs.writeFileSync(file(id), JSON.stringify(r)); return r; },
  };
}

module.exports = { attachRecorder, mapLiveEvents, liveGet, TFT_QUEUES };
