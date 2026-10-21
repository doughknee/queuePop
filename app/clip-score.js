// Smart clips: each clip gets a score (0-100) and a label from what happened in it, so Studio's best moments lead and
// every clip says why it matters ("Triple kill at Dragon", "Shut down Zed (+700g)", "Stole Baron", "Died to Zed's level 6").
// Context comes from the League client's own match history after the game (/lol-match-history/v1/games/<id> and
// /game-timelines/<id>): who played what on which team, every kill (so kill streaks), levels and team gold each minute.
// The "+700g" is your own gold gain on the live poll that saw the kill (recorder.js). Nothing here is guessed: a fact that
// isn't in the data leaves its words out of the label. Pure; app/test-recorder.js checks it.
const SCORE_V = 1; // bump when the scoring changes and old clips should be rescored on load
const MAJOR = { dragon: "Dragon", baron: "Baron", herald: "Herald", voidgrubs: "Voidgrubs" }; // fights "at" these
const OBJ_VALUE = { baron: 50, dragon: 35, herald: 30, inhibitor: 30, voidgrubs: 20, turret: 15 };
const MULTI = { 2: 65, 3: 80, 4: 90, 5: 100 };
const ULT_LEVELS = new Set([6, 11, 16]);
const MONSTER = { DRAGON: "dragon", BARON_NASHOR: "baron", RIFTHERALD: "herald", HORDE: "voidgrubs" };

// The client's game + timeline -> per-event facts for your recording, matched by game time (live and timeline times agree
// within a second or two): champ (victim of your kill/assist, killer of your death), streak (the victim's kills since
// their last death), level (your killer's, only when the minute frames on both sides agree), ally (your team took the
// objective); and gold: your team's total gold minus theirs, per minute. -> { events, gold } or null (you aren't in it).
function matchContext(rec, game, timeline, champName = () => null) {
  if (!game || !timeline || !Array.isArray(timeline.frames)) return null;
  const me = String(rec.player || "").split("#")[0].toLowerCase();
  const ids = game.participantIdentities || [], ps = game.participants || [];
  const myPid = (ids.find((x) => String(x.player && x.player.gameName || "").toLowerCase() === me) || {}).participantId;
  if (!myPid) return null;
  const team = Object.fromEntries(ps.map((p) => [p.participantId, p.teamId])), champ = Object.fromEntries(ps.map((p) => [p.participantId, champName(p.championId) || undefined]));
  const mine = team[myPid], frames = timeline.frames;
  const gold = frames.map((f) => Object.values(f.participantFrames || {}).reduce((d, p) => d + (team[p.participantId] === mine ? 1 : -1) * (p.totalGold || 0), 0));
  const levelAt = (pid, ms) => { const i = Math.floor(ms / 60000), a = frames[i], b = frames[i + 1];
    const la = a && a.participantFrames[pid] && a.participantFrames[pid].level, lb = b && b.participantFrames[pid] && b.participantFrames[pid].level;
    return la && la === lb ? la : null; };
  // Every kill in order, with the victim's streak just before it.
  const streak = {}, kills = [], objs = [];
  for (const e of frames.flatMap((f) => f.events || []).sort((a, b) => a.timestamp - b.timestamp)) {
    if (e.type === "CHAMPION_KILL") { kills.push({ ...e, streak: streak[e.victimId] || 0 }); streak[e.victimId] = 0; if (e.killerId) streak[e.killerId] = (streak[e.killerId] || 0) + 1; }
    else if (e.type === "ELITE_MONSTER_KILL" || e.type === "BUILDING_KILL") objs.push(e);
  }
  const near = (list, t, f) => list.find((e) => Math.abs(e.timestamp - t * 1000) <= 2500 && f(e));
  const events = (rec.events || []).map((e) => {
    if (!Number.isFinite(e.t)) return e;
    const x = { ...e };
    if (e.type === "kill" || e.type === "assist") {
      const k = near(kills, e.t, (k) => e.type === "kill" ? k.killerId === myPid : (k.assistingParticipantIds || []).includes(myPid));
      if (k) Object.assign(x, { champ: champ[k.victimId], streak: k.streak });
    } else if (e.type === "death") {
      const k = near(kills, e.t, (k) => k.victimId === myPid);
      if (k && k.killerId) { x.champ = champ[k.killerId]; const lv = levelAt(k.killerId, k.timestamp); if (lv) x.level = lv; }
    } else if (e.type === "objective") {
      const o = near(objs, e.t, (o) => o.type === "BUILDING_KILL" ? ["turret", "inhibitor"].includes(e.objective) : MONSTER[o.monsterType] === e.objective);
      if (o) x.ally = o.killerId ? team[o.killerId] === mine : o.type === "BUILDING_KILL" ? o.teamId !== mine : undefined;
      if (x.ally === undefined) delete x.ally;
    }
    return x;
  });
  return { events, gold };
}

// A clip's span in game seconds: from the video's offset (full video), else its replay-buffer stamp and the live clock.
function gameSpan(c, rec) {
  if (rec.video && Number.isFinite(rec.video.offset) && Number.isFinite(c.start)) return [c.start - rec.video.offset, c.end - rec.video.offset];
  if (Number.isFinite(c.at) && rec.clock) { const a = (c.at - rec.clock.wall) / 1000 + rec.clock.gameTime; return [a, a + (c.ms || (c.end - c.start) * 1000 || 0) / 1000]; }
  return null;
}

const objName = (e) => String(e.label || "").replace(/ \(.*\)$/, "");
const took = (n) => ({ Turret: "a turret", Inhibitor: "an inhibitor" })[n] || n;
// One event alone -> { score, label }.
function rateEvent(e) {
  if (e.type === "multikill") { const n = ({ Double: 2, Triple: 3, Quadra: 4, Penta: 5 })[String(e.label).split(" ")[0]] || parseInt(e.label, 10) || 2; return { score: MULTI[Math.min(5, n)], label: e.label }; }
  if (e.type === "kill") {
    const who = e.champ || String(e.label).replace(/^Killed /, "").replace(/ \(first blood\)$/, ""), fb = / \(first blood\)$/.test(e.label);
    if (e.streak >= 3) return { score: 60, label: `Shut down ${who}`, gold: e.gold, kill: true };
    return { score: fb ? 45 : 40, label: `Killed ${who}${fb ? " (first blood)" : ""}`, kill: true };
  }
  if (e.type === "assist") return { score: e.streak >= 3 ? 30 : 20, label: `${e.streak >= 3 ? "Helped shut down" : "Assist on"} ${e.champ || String(e.label).replace(/^Assist on /, "")}`, kill: true };
  if (e.type === "death") {
    if (!e.champ) return { score: 10, label: e.label };
    return { score: 10, label: ULT_LEVELS.has(e.level) ? `Died to ${e.champ}'s level ${e.level}` : `Died to ${e.champ}` };
  }
  if (e.type === "objective") {
    const n = objName(e), base = OBJ_VALUE[e.objective] || 10, elder = /^Elder/.test(n), ally = e.ally ?? (/\(You\)$/.test(e.label) || undefined);
    if (e.stolen) return ally === false ? { score: 5, label: `${n} stolen from your team` } : { score: elder || e.objective === "baron" ? 90 : 75, label: `Stole ${n}` };
    if (ally === true) return { score: elder ? 55 : base, label: `Took ${took(n)}` };
    if (ally === false) return { score: 8, label: `Enemy took ${took(n)}` };
    return { score: Math.round(base / 2), label: e.label };
  }
  return null;
}

// clip + its recording (events, gold per minute, clock) -> { score 0-100, label }.
function scoreClip(c, rec) {
  const evs = rec.events || [], span = gameSpan(c, rec);
  let mine = (c.ids || []).map((id) => evs.find((e) => e.id === id)).filter(Boolean);
  if (!mine.length && span) mine = evs.filter((e) => Number.isFinite(e.t) && e.t >= span[0] - 1 && e.t <= span[1] + 1 && e.type !== "end");
  const rated = mine.map((e) => ({ e, ...rateEvent(e) })).filter((r) => r.label).sort((a, b) => b.score - a.score);
  const manual = !!c.mine || (c.types || []).includes("manual");
  if (!rated.length) return { score: manual ? 30 : 5, label: manual ? "Your clip" : "Clip" };
  const top = rated[0];
  let score = top.score + Math.min(12, 4 * rated.slice(1).filter((r) => r.kill || r.e.type === "multikill").length), label = top.label;
  // A fight at a big objective: the objective in this clip, or taken within 30 s of it.
  if (top.kill || top.e.type === "multikill") {
    const ts = mine.map((e) => e.t).filter(Number.isFinite), lo = Math.min(...ts) - 30, hi = Math.max(...ts) + 30;
    const obj = evs.find((e) => e.type === "objective" && MAJOR[e.objective] && e.t >= lo && e.t <= hi);
    if (obj) { score += 10; label += ` at ${/^Elder/.test(objName(obj)) ? "Elder" : MAJOR[obj.objective]}`; }
  }
  if (top.gold >= 50) label += ` (+${top.gold}g)`;
  // Gold toward your team across the clip, from the minute before it to the minute after.
  if (span && Array.isArray(rec.gold) && rec.gold.length) {
    const g = rec.gold, at = (i) => g[Math.max(0, Math.min(g.length - 1, i))];
    const swing = at(Math.ceil(span[1] / 60)) - at(Math.floor(span[0] / 60));
    if (swing >= 300) score += Math.min(15, Math.floor(swing / 100));
    if (swing >= 1000) label += ` · +${(swing / 1000).toFixed(1)}k gold swing`;
  }
  if (manual) score += 5;
  return { score: Math.max(0, Math.min(100, Math.round(score))), label };
}

// Every clip of a recording scored in place; true when anything changed (the caller saves it).
function scoreClips(rec) {
  let changed = rec.scoreV !== SCORE_V;
  for (const c of rec.clips || []) {
    const s = scoreClip(c, rec);
    if (c.score !== s.score || c.label !== s.label) { Object.assign(c, s); changed = true; }
  }
  rec.scoreV = SCORE_V;
  return changed;
}

module.exports = { matchContext, scoreClip, scoreClips, gameSpan, SCORE_V };
