// Recorder video (DONI-523 / Q21, opt-in, off by default: Settings > Recorder (beta) > Record video). Uses an ffmpeg already
// on PATH (never downloads or installs one): Desktop Duplication (`ddagrab`, works on fullscreen games) of the primary display,
// encoded on the GPU when ffmpeg has one (NVENC, AMF, QSV) else libx264 ultrafast, to <folder>/<matchId>.mkv (mkv survives a
// crash). At game end it cuts a clip around each marked event with stream copy (no re-encode) and keeps the folder under the
// size cap, oldest first. Phase 1 has no audio, no manual clip hotkey, no trim/share.
// Overwolf engine (preferred, docs/recorder-engine.md): when the QueuePop companion (the ow-electron app, loopback port
// 47821) says its recorder is ready, it records instead: game capture + game audio + mic on their own tracks, and each kill,
// multikill, death or objective is clipped live from its replay buffer (10 s before, 5 after) instead of cut after the game.
// ffmpeg is the fallback when the companion isn't running. On ow-electron (`npm run start:ow`) the same recorder runs
// in-process (ow-recorder.js, ctx.ow) and is preferred over the companion: in-process, then companion, then ffmpeg.
const fs = require("fs");
const { forGame } = require("./champ-config");
const path = require("path");
const { execFile, spawn } = require("child_process");
const http = require("http");
const recOptions = require("../src/webui/js/recorder-options.js"); // Studio's options: quality, audio, buffer, clip rules

const PRESETS = { "720p30": { h: 720, fps: 30 }, "1080p30": { h: 1080, fps: 30 }, "1080p60": { h: 1080, fps: 60 } };
const ENCODERS = ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]; // best first
const CLIP = { kill: [10, 5], multikill: [15, 6], death: [10, 3], objective: [10, 6], assist: [8, 4] }; // seconds before, after

// `ffmpeg -encoders` text → the H.264 encoders to try, best first, always ending at libx264. Pure. A full build lists
// every encoder it was built with (NVENC on an AMD card too), so probe() test-encodes a frame with each and keeps the first that works.
function listedEncoders(encodersText) {
  const has = ENCODERS.filter((e) => new RegExp(`\\b${e}\\b`).test(encodersText || ""));
  return has.includes("libx264") ? has : [...has, "libx264"];
}
function pickEncoder(encodersText) { return listedEncoders(encodersText)[0]; }
// ffmpeg arguments for one capture. Pure; app/test-recorder-video.js checks it.
function captureArgs({ encoder, preset, height, fps, out }) {
  const p = height ? { h: height, fps: fps === 30 ? 30 : 60 } : PRESETS[preset] || PRESETS["1080p60"];
  const fmt = encoder === "libx264" ? "yuv420p" : "nv12";
  const enc = {
    h264_nvenc: ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "vbr", "-cq", "23"],
    h264_amf: ["-c:v", "h264_amf", "-quality", "speed", "-rc", "cqp", "-qp_i", "23", "-qp_p", "23"],
    h264_qsv: ["-c:v", "h264_qsv", "-preset", "veryfast", "-global_quality", "23"],
    libx264: ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"],
  }[encoder] || ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23"];
  return ["-hide_banner", "-loglevel", "error", "-y",
    "-filter_complex", `ddagrab=output_idx=0:framerate=${p.fps},hwdownload,format=bgra,scale=-2:${p.h},format=${fmt}`,
    ...enc, "-g", String(p.fps * 2), "-f", "matroska", out];
}
// Events → clip windows in video seconds. offset = video time at game time 0. Overlapping windows merge into one clip.
// Pure; app/test-recorder-video.js checks it.
function clipWindows(events, offset, videoLen, clip = CLIP) {
  const wins = [];
  for (const e of events || []) {
    const span = clip[e.type];
    if (!span || !Number.isFinite(e.t)) continue;
    const at = e.t + offset, start = Math.max(0, at - span[0]), end = Math.min(videoLen, at + span[1]);
    if (end - start >= 2) wins.push({ start, end, ids: [e.id], types: [e.type] });
  }
  wins.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const w of wins) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) { last.end = Math.max(last.end, w.end); last.ids.push(...w.ids); last.types.push(...w.types); }
    else merged.push({ ...w });
  }
  return merged.map((w) => ({ ...w, start: Math.round(w.start * 10) / 10, end: Math.round(w.end * 10) / 10 }));
}
// ffmpeg arguments for one clip, stream copy. Pure.
const clipArgs = (input, start, end, out) => ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(start), "-i", input, "-t", String(Math.round((end - start) * 10) / 10), "-c", "copy", "-avoid_negative_ts", "make_zero", out];
// Files [{path, size, mtime}] → the paths to delete, oldest first, until the rest fit under capBytes. Pure.
// Paths in keep (your favourites) are never chosen, even over the cap.
function chooseDeletions(files, capBytes, keep = new Set()) {
  let total = files.reduce((s, f) => s + f.size, 0);
  const out = [];
  for (const f of [...files].sort((a, b) => a.mtime - b.mtime)) { if (total <= capBytes) break; if (keep.has(f.path)) continue; out.push(f.path); total -= f.size; }
  return out;
}

// The size cap only ever deletes the recorder's own videos: <matchId>.mkv / <matchId>-clipN.mp4 next to <matchId>.json.
// The folder is yours to choose (Videos, say), so anything else in it is never touched. Pure; test-recorder-video.js.
function ownVideos(names) {
  const json = new Set(names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)));
  return names.filter((n) => { const m = /^((?:[A-Za-z]+\d*_)?\d+)(?:-clip\d+)?\.(?:mkv|mp4)$/i.exec(n); return m && json.has(m[1]); });
}

// Which engine records this game: the companion's Overwolf recorder when it's ready, else ffmpeg when it's on PATH. Pure.
function chooseBackend(health, ff) {
  if (health && health.recorder && health.recorder.ready) return "overwolf";
  return ff && ff.found ? "ffmpeg" : null;
}
// A live event -> the clip to ask the companion for, in seconds: the event's span, minus the time it took to reach us (the
// live API is polled every 2 s), never more than the 30 s buffer holds or the recording has run. null = no clip (no span,
// or an event too old for the buffer, like the backlog after a restart mid-game). Pure.
// clock = {wall, gameTime} from the recorder's first poll; startEpoch = when the recording started.
// clip = the clipped moment types with [before, after] (Studio's rules; default: everything but assists), buffer = its length.
const BUFFER_S = 30, LIVE_CLIP = Object.fromEntries(Object.entries(CLIP).filter(([k]) => k !== "assist"));
const clipsFrom = (r) => Object.fromEntries(recOptions.KINDS.map((k) => [k, recOptions.span(r, k)]).filter(([, s]) => s));
function clipRequest(e, clock, now, startEpoch, clip = LIVE_CLIP, buffer = BUFFER_S) {
  const span = e && clip[e.type];
  if (!span || !Number.isFinite(e.t)) return null;
  const lag = clock ? Math.max(0, (now - (clock.wall + (e.t - clock.gameTime) * 1000)) / 1000) : 0;
  const past = Math.min(span[0] + lag, buffer - 1, (now - startEpoch) / 1000);
  if (lag > buffer - 2 || past < 1) return null;
  return { pastSeconds: Math.round(past * 10) / 10, afterSeconds: Math.round(Math.max(0, span[1] - lag) * 10) / 10 };
}
// Live clips (epoch-stamped: at = first frame, ms = length) -> start/end in video seconds, once the video's first frame is known. Pure.
const placeClips = (clips, videoEpoch) => clips.map((c) => ({ ...c, start: Math.max(0, Math.round((c.at - videoEpoch) / 100) / 10), end: Math.max(0, Math.round((c.at + c.ms - videoEpoch) / 100) / 10) }));
const PROCESS = { league: "League of Legends.exe", tft: "League of Legends.exe", deadlock: "deadlock.exe" };

// --- runtime -----------------------------------------------------------------------------------------------------------
const run = (bin, args) => new Promise((resolve) => execFile(bin, args, { windowsHide: true, timeout: 120000 }, (err, out) => resolve(err ? null : String(out))));
let probed = null, probedAt = 0, probing = null;
// { found, path, version, encoder } — cached; "where ffmpeg" finds it on PATH, nothing is ever downloaded. One probe is up to
// six child processes, so callers share a running one and a forced re-probe reuses a result under 10 s old (Recordings and
// Settings ask on every render).
function probe(force) {
  if (probed && (!force || Date.now() - probedAt < 10000)) return Promise.resolve(probed);
  return probing || (probing = probeNow().then((p) => { probedAt = Date.now(); return p; }).finally(() => { probing = null; }));
}
async function probeNow() {
  const where = await run("where", ["ffmpeg"]);
  const bin = where && where.split(/\r?\n/).find(Boolean);
  if (!bin) return (probed = { found: false });
  const [ver, enc] = await Promise.all([run(bin, ["-hide_banner", "-version"]), run(bin, ["-hide_banner", "-encoders"])]);
  let encoder = "libx264";
  for (const e of listedEncoders(enc)) {
    if (await run(bin.trim(), ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-frames:v", "1", "-c:v", e, "-f", "null", "-"]) !== null) { encoder = e; break; }
  }
  return (probed = { found: !!ver, path: bin.trim(), version: ((ver || "").match(/ffmpeg version (\S+)/) || [])[1] || "", encoder });
}

// The companion's loopback API -> parsed JSON, or null (not running, timed out). X-QueuePop marks the call as ours.
const COMPANION_PORT = 47821;
function companion(pathname, body, timeout = 1000) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: "127.0.0.1", port: COMPANION_PORT, path: pathname, method: data ? "POST" : "GET", timeout,
      headers: data ? { "Content-Type": "application/json", "X-QueuePop": "1", "Content-Length": Buffer.byteLength(data) } : {} }, (res) => {
      let t = ""; res.on("data", (c) => (t += c)); res.on("end", () => { try { resolve(JSON.parse(t)); } catch { resolve(null); } }); res.on("error", () => resolve(null));
    });
    req.on("timeout", () => req.destroy()); req.on("error", () => resolve(null));
    if (data) req.write(data);
    req.end();
  });
}

// The in-process recorder (ow-recorder.js) behind the companion's loopback API, so both engines share one code path. Pure routing.
const ROUTES = { "/recorder/start": "start", "/recorder/clip": "clip", "/recorder/stop": "stop" };
function inProcess(rec) {
  return (pathname, body) => pathname === "/health" ? Promise.resolve({ app: "queuepop", inProcess: true, recorder: rec.status() })
    : Promise.resolve().then(() => rec[ROUTES[pathname]](body || {})).catch((e) => ({ ok: false, error: String((e && e.message) || e) }));
}

// ctx: { getConfig, dir: () => folder, log, push, recorder: { update }, ow? (in-process recorder), companion?, probe? (tests stub the loopback and ffmpeg) }
function createVideo(ctx) {
  const remote = ctx.companion || companion, find = ctx.probe || probe, local = ctx.ow && inProcess(ctx.ow);
  // In-process when its recorder is ready, else the companion. A session keeps the engine it started on.
  let pinned = null;
  const call = (p, b, t) => (pinned || (local && ctx.ow.status().ready ? local : remote))(p, b, t);
  let proc = null, startedAt = 0, file = null, starting = false;
  let ow = null; // the Overwolf session: { matchId, encoder, startEpoch, pending: Set<Promise> }
  // What records the next game, for Settings and Recordings: { engine, encoder, companion: {running, ready, error}, ffmpeg }.
  async function engine() {
    const [health, ff] = await Promise.all([call("/health", null, 800), find(true)]);
    const r = (health && health.recorder) || null, name = chooseBackend(health, ff);
    return { engine: name, encoder: name === "overwolf" ? r.encoder : name === "ffmpeg" ? ff.encoder : null,
      inProcess: !!(health && health.inProcess), companion: { running: !!health, ready: !!(r && r.ready), error: (r && r.error) || null, recording: (r && r.recording) || null }, ffmpeg: ff };
  }
  async function startOverwolf(rec, cfg) {
    const r = await call("/recorder/start", { matchId: rec.matchId.replace(/[^\w-]/g, "_"), processName: PROCESS[rec.game] || PROCESS.league,
      folder: path.resolve(ctx.dir()), height: cfg.height, fps: cfg.fps, mbps: cfg.mbps, encoder: cfg.encoder, audio: cfg.audio,
      bufferS: cfg.buffer_s, clipsOnly: cfg.mode === "clips", display: !!process.env.QP_REC_DISPLAY }, 20000); // dev: QP_REC_DISPLAY=1 records the screen (no game needed)
    if (!r || !r.ok) { ctx.log("recorder video: Overwolf start failed:", (r && r.error) || "no answer"); return false; }
    pinned = local && ctx.ow.status().ready ? local : remote;
    ow = { matchId: rec.matchId, encoder: r.encoder, startEpoch: r.startEpoch || Date.now(), pending: new Set(), clip: clipsFrom(cfg), buffer: cfg.buffer_s };
    rec.video = { file: null, engine: "overwolf", encoder: r.encoder, quality: cfg.quality, mbps: r.mbps, fps: r.fps, tracks: r.tracks, clipsOnly: !!r.clipsOnly, startedAt: ow.startEpoch };
    rec.clips = [];
    ctx.log(`recorder video: Overwolf ${r.encoder} ${r.width}x${r.height}@${r.fps}`);
    return true;
  }
  // New events from the live poll (recorder.js onEvents): clip the ones with a span right away, from the replay buffer.
  function onEvents(rec, fresh) {
    if (!ow || ow.matchId !== rec.matchId) return;
    const s = ow;
    for (const e of fresh) {
      const req = clipRequest(e, rec.clock, Date.now(), s.startEpoch, s.clip, s.buffer); if (!req) continue;
      const job = call("/recorder/clip", req, (req.afterSeconds + 40) * 1000).then((r) => {
        if (!r || !r.ok) return ctx.log("recorder video: clip failed:", (r && r.error) || "no answer");
        rec.clips = rec.clips || [];
        const same = rec.clips.find((c) => c.file === r.file); // an event during a running clip stretched that clip
        if (same) { same.ids.push(e.id); same.types.push(e.type); Object.assign(same, placeClips([{ at: r.startTimeEpoch, ms: r.duration }], s.startEpoch)[0], { ms: r.duration }); }
        else rec.clips.push({ file: r.file, ...placeClips([{ at: r.startTimeEpoch, ms: r.duration }], s.startEpoch)[0], types: [e.type], ids: [e.id] });
        ctx.recorder.update(rec.matchId, { clips: rec.clips });
      }).finally(() => s.pending.delete(job));
      s.pending.add(job);
    }
  }
  async function stopOverwolf(rec) {
    const s = ow; ow = null;
    await Promise.race([Promise.allSettled([...s.pending]), new Promise((r) => setTimeout(r, 70000).unref())]); // clips still running
    const r = (await call("/recorder/stop", {}, 100000)) || {};
    pinned = null;
    if (!r.ok) ctx.log("recorder video: Overwolf stop:", r.error || "no answer");
    // The recording's first frame (it starts when the game is hooked), so markers and clips line up with the video.
    const videoEpoch = r.startTimeEpoch || s.startEpoch, len = (r.duration || 0) / 1000;
    const offset = rec.clock ? (rec.clock.wall - videoEpoch) / 1000 - rec.clock.gameTime : 0;
    const clips = placeClips(rec.clips || [], videoEpoch);
    // Clips-only games keep no full video; their clips stay placed against the replay buffer's start.
    ctx.recorder.update(rec.matchId, { video: r.file ? { ...rec.video, file: r.file, startedAt: videoEpoch, length: Math.round(len), offset: Math.round(offset * 10) / 10 } : null, clips, clipsOnly: !!r.clipsOnly });
    cleanup();
    if (clips.length) ctx.push(`Saved ${clips.length} clip${clips.length > 1 ? "s" : ""} from your game`, "success", "recorder");
  }
  async function start(rec) {
    const full = ctx.getConfig(), cfg = recOptions.normalize(full.recorder); // old presets and partial configs read the same
    if (proc || ow || starting || !forGame(full, rec.game).record || !cfg.video) return; // DONI-594: that game's recording is on
    starting = true; let p;
    try {
      const [health, ff] = await Promise.all([call("/health", null, 800), find()]); p = ff;
      if (chooseBackend(health, p) === "overwolf" && await startOverwolf(rec, cfg)) return;
    } finally { starting = false; }
    if (proc || ow) return;
    if (!p.found) { ctx.log("recorder video: no engine (companion not running, ffmpeg not on PATH)"); return; }
    fs.mkdirSync(ctx.dir(), { recursive: true });
    file = path.join(ctx.dir(), `${rec.matchId.replace(/[^\w-]/g, "_")}.mkv`);
    proc = spawn(p.path, captureArgs({ encoder: p.encoder, height: Math.min(cfg.height, 1440), fps: cfg.fps, out: file }), { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    startedAt = Date.now();
    rec.video = { file, engine: "ffmpeg", encoder: p.encoder, quality: cfg.quality, startedAt, clip: clipsFrom(cfg) };
    proc.stderr.on("data", (d) => ctx.log("ffmpeg:", String(d).trim().slice(0, 300)));
    proc.on("exit", (code) => { if (code) ctx.log("ffmpeg exited", code); });
    ctx.log(`recorder video: ${p.encoder} ${cfg.height}p${cfg.fps} → ${file}`);
  }
  // Studio's hotkey: the last `seconds` of the game you're in, from the replay buffer (Overwolf engine only), as a starred clip.
  async function manualClip(rec, seconds) {
    if (!ow || !rec || ow.matchId !== rec.matchId) return { ok: false, error: "Not recording a game with the Overwolf engine" };
    const s = ow, past = Math.min(Math.max(5, Number(seconds) || 30), s.buffer - 1, (Date.now() - s.startEpoch) / 1000);
    const job = call("/recorder/clip", { pastSeconds: past, afterSeconds: 0 }, 40000).then((r) => {
      if (!r || !r.ok) { ctx.log("recorder video: manual clip failed:", (r && r.error) || "no answer"); return { ok: false, error: (r && r.error) || "no answer" }; }
      rec.clips = rec.clips || [];
      rec.clips.push({ file: r.file, ...placeClips([{ at: r.startTimeEpoch, ms: r.duration }], s.startEpoch)[0], types: ["manual"], ids: [], mine: true, favorite: true });
      ctx.recorder.update(rec.matchId, { clips: rec.clips });
      ctx.push(`Saved the last ${Math.round(past)} s`, "success", "recorder");
      return { ok: true };
    }).finally(() => s.pending.delete(job));
    s.pending.add(job);
    return job;
  }
  async function stop(rec) {
    if (ow && ow.matchId === rec.matchId) return stopOverwolf(rec);
    if (!proc) return;
    const p = proc; proc = null;
    await new Promise((resolve) => { p.on("exit", resolve); try { p.stdin.write("q"); } catch { p.kill(); } setTimeout(() => { try { p.kill(); } catch {} resolve(); }, 8000); });
    const len = (Date.now() - startedAt) / 1000;
    // Video time at game time 0: the recorder noted a wall clock + game time pair on its first live poll.
    const offset = rec.clock ? (rec.clock.wall - startedAt) / 1000 - rec.clock.gameTime : 0;
    const wins = clipWindows(rec.events, offset, len, rec.video.clip || CLIP), bin = (await probe()).path, clips = [];
    for (const [i, w] of wins.entries()) {
      const out = file.replace(/\.mkv$/, `-clip${i + 1}.mp4`);
      if (await run(bin, clipArgs(file, w.start, w.end, out)) !== null) clips.push({ file: out, start: w.start, end: w.end, types: w.types, ids: w.ids });
    }
    ctx.recorder.update(rec.matchId, { video: { ...rec.video, length: Math.round(len), offset: Math.round(offset * 10) / 10 }, clips });
    cleanup();
    if (clips.length) ctx.push(`Cut ${clips.length} clip${clips.length > 1 ? "s" : ""} from your game`, "success", "recorder");
  }
  function cleanup() {
    const capBytes = ((ctx.getConfig().recorder || {}).cap_gb || 50) * 1024 ** 3;
    let files = [];
    try { files = ownVideos(fs.readdirSync(ctx.dir())).map((f) => { const p = path.join(ctx.dir(), f), s = fs.statSync(p); return { path: p, size: s.size, mtime: s.mtimeMs }; }); } catch { return; }
    // A favourite game keeps its video and every clip; a favourite clip keeps itself.
    const keep = new Set();
    for (const s of ctx.recorder.list ? ctx.recorder.list() : []) {
      const r = ctx.recorder.get(s.matchId); if (!r) continue;
      if (r.favorite && r.video && r.video.file) keep.add(path.resolve(r.video.file));
      for (const c of r.clips || []) if (r.favorite || c.favorite) keep.add(path.resolve(c.file));
    }
    files = files.map((f) => ({ ...f, path: path.resolve(f.path) }));
    for (const p of chooseDeletions(files, capBytes, keep)) { try { fs.unlinkSync(p); ctx.log("recorder: removed", p, "(size cap)"); } catch {} }
  }
  // Your own clip from a game's video, stream copy (no re-encode, about a second). Video seconds in, the clip back.
  async function makeClip(id, start, end) {
    const rec = ctx.recorder.get(id), src = rec && rec.video && rec.video.file;
    if (!src || !fs.existsSync(src)) return { ok: false, error: "This game has no video file" };
    start = Math.max(0, Number(start) || 0); end = Math.min(Number(end) || 0, (rec.video.length || Infinity));
    if (!(end - start >= 1)) return { ok: false, error: "A clip needs at least a second" };
    const p = await probe(); if (!p.found) return { ok: false, error: "ffmpeg isn’t installed" };
    const out = src.replace(/\.(mkv|mp4)$/i, "") + `-clip${Date.now()}.mp4`;
    if (await run(p.path, clipArgs(src, start, end, out)) === null) return { ok: false, error: "ffmpeg couldn’t cut that clip" };
    const clip = { file: out, start: Math.round(start * 10) / 10, end: Math.round(end * 10) / 10, types: ["mine"], ids: [], mine: true, favorite: true };
    ctx.recorder.update(rec.matchId, { clips: [...(rec.clips || []), clip] });
    return { ok: true, clip };
  }
  return { start, stop, onEvents, engine, probe, makeClip, manualClip };
}

module.exports = { inProcess, chooseBackend, clipRequest, placeClips, ownVideos, createVideo, captureArgs, clipWindows, clipArgs, chooseDeletions, pickEncoder, listedEncoders, probe, PRESETS };
