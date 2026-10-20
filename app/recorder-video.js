// Recorder video (DONI-523 / Q21, opt-in, off by default: Settings > Recorder (beta) > Record video). Uses an ffmpeg already
// on PATH (never downloads or installs one): Desktop Duplication (`ddagrab`, works on fullscreen games) of the primary display,
// encoded on the GPU when ffmpeg has one (NVENC, AMF, QSV) else libx264 ultrafast, to <folder>/<matchId>.mkv (mkv survives a
// crash). At game end it cuts a clip around each marked event with stream copy (no re-encode) and keeps the folder under the
// size cap, oldest first. Phase 1 has no audio, no manual clip hotkey, no trim/share.
const fs = require("fs");
const path = require("path");
const { execFile, spawn } = require("child_process");

const PRESETS = { "720p30": { h: 720, fps: 30 }, "1080p30": { h: 1080, fps: 30 }, "1080p60": { h: 1080, fps: 60 } };
const ENCODERS = ["h264_nvenc", "h264_amf", "h264_qsv", "libx264"]; // best first
const CLIP = { kill: [10, 5], multikill: [15, 6], death: [10, 3], objective: [10, 6], assist: [8, 4] }; // seconds before, after

// `ffmpeg -encoders` text → the best H.264 encoder it has. Pure.
function pickEncoder(encodersText) {
  return ENCODERS.find((e) => new RegExp(`\\b${e}\\b`).test(encodersText || "")) || "libx264";
}
// ffmpeg arguments for one capture. Pure; app/test-recorder-video.js checks it.
function captureArgs({ encoder, preset, out }) {
  const p = PRESETS[preset] || PRESETS["1080p60"];
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
function chooseDeletions(files, capBytes) {
  let total = files.reduce((s, f) => s + f.size, 0);
  const out = [];
  for (const f of [...files].sort((a, b) => a.mtime - b.mtime)) { if (total <= capBytes) break; out.push(f.path); total -= f.size; }
  return out;
}

// The size cap only ever deletes the recorder's own videos: <matchId>.mkv / <matchId>-clipN.mp4 next to <matchId>.json.
// The folder is yours to choose (Videos, say), so anything else in it is never touched. Pure; test-recorder-video.js.
function ownVideos(names) {
  const json = new Set(names.filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)));
  return names.filter((n) => { const m = /^((?:[A-Za-z]+\d*_)?\d+)(?:-clip\d+)?\.(?:mkv|mp4)$/i.exec(n); return m && json.has(m[1]); });
}

// --- runtime -----------------------------------------------------------------------------------------------------------
const run = (bin, args) => new Promise((resolve) => execFile(bin, args, { windowsHide: true, timeout: 120000 }, (err, out) => resolve(err ? null : String(out))));
let probed = null;
// { found, path, version, encoder } — cached; "where ffmpeg" finds it on PATH, nothing is ever downloaded.
async function probe(force) {
  if (probed && !force) return probed;
  const where = await run("where", ["ffmpeg"]);
  const bin = where && where.split(/\r?\n/).find(Boolean);
  if (!bin) return (probed = { found: false });
  const [ver, enc] = await Promise.all([run(bin, ["-hide_banner", "-version"]), run(bin, ["-hide_banner", "-encoders"])]);
  return (probed = { found: !!ver, path: bin.trim(), version: ((ver || "").match(/ffmpeg version (\S+)/) || [])[1] || "", encoder: pickEncoder(enc) });
}

// ctx: { getConfig, dir: () => folder, log, push, recorder: { update } }
function createVideo(ctx) {
  let proc = null, startedAt = 0, file = null, starting = false;
  async function start(rec) {
    const cfg = ctx.getConfig().recorder || {};
    if (proc || starting || !cfg.enabled || !cfg.video) return;
    starting = true; let p; try { p = await probe(); } finally { starting = false; }
    if (proc) return;
    if (!p.found) { ctx.log("recorder video: ffmpeg not found on PATH"); return; }
    fs.mkdirSync(ctx.dir(), { recursive: true });
    file = path.join(ctx.dir(), `${rec.matchId.replace(/[^\w-]/g, "_")}.mkv`);
    proc = spawn(p.path, captureArgs({ encoder: p.encoder, preset: cfg.preset, out: file }), { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    startedAt = Date.now();
    rec.video = { file, encoder: p.encoder, preset: cfg.preset, startedAt };
    proc.stderr.on("data", (d) => ctx.log("ffmpeg:", String(d).trim().slice(0, 300)));
    proc.on("exit", (code) => { if (code) ctx.log("ffmpeg exited", code); });
    ctx.log(`recorder video: ${p.encoder} ${cfg.preset} → ${file}`);
  }
  async function stop(rec) {
    if (!proc) return;
    const p = proc; proc = null;
    await new Promise((resolve) => { p.on("exit", resolve); try { p.stdin.write("q"); } catch { p.kill(); } setTimeout(() => { try { p.kill(); } catch {} resolve(); }, 8000); });
    const len = (Date.now() - startedAt) / 1000;
    // Video time at game time 0: the recorder noted a wall clock + game time pair on its first live poll.
    const offset = rec.clock ? (rec.clock.wall - startedAt) / 1000 - rec.clock.gameTime : 0;
    const wins = clipWindows(rec.events, offset, len), bin = (await probe()).path, clips = [];
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
    for (const p of chooseDeletions(files, capBytes)) { try { fs.unlinkSync(p); ctx.log("recorder: removed", p, "(size cap)"); } catch {} }
  }
  return { start, stop, probe };
}

module.exports = { ownVideos, createVideo, captureArgs, clipWindows, clipArgs, chooseDeletions, pickEncoder, probe, PRESETS };
