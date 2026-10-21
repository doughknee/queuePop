// Published clips (docs/clip-publishing.md, 2026-10-21). Brandon picks a clip in queuePop's Studio and the app POSTs the file to
// /admin/clips (LAN only, admin token). ffmpeg makes a small web copy (720p30 H.264, the mix track only, so the mic track never
// leaves his PC) and a poster frame. The store keeps them, and champion pages read GET /lol/clips. Unpublish deletes both.
//
// Where clips live is one setting, CLIPS_STORE:
//   local (now): files in CLIPS_DIR, served by this server at /clips/<file>. SWAG exposes only that path at
//                CLIPS_PUBLIC_BASE (https://clips.olvyx.com); the admin routes refuse anything forwarded by a proxy.
//   r2 (later):  Cloudflare R2 behind the same public base. Not built yet; switching is a store swap plus a one-time copy.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const SCHEMA = `CREATE TABLE IF NOT EXISTS clips (id TEXT PRIMARY KEY, game TEXT, champion INT, role TEXT, patch TEXT, label TEXT,
  duration REAL, size INT, match_id TEXT, created_at INT);
CREATE INDEX IF NOT EXISTS clips_champion ON clips (game, champion, created_at);`;
const FILE_RE = /^[a-f0-9]{12}\.(mp4|jpg)$/;

function createStore({ kind = "local", dir = "/clips", publicBase = "" } = {}) {
  if (kind !== "local") throw new Error(`CLIPS_STORE=${kind} isn't built yet; use local`); // ponytail: R2 lands when queuePop goes public
  fs.mkdirSync(dir, { recursive: true });
  const base = String(publicBase || "").replace(/\/+$/, "");
  return {
    kind, dir,
    put(name, from) { fs.copyFileSync(from, path.join(dir, name)); return fs.statSync(path.join(dir, name)).size; },
    remove(name) { try { fs.unlinkSync(path.join(dir, name)); } catch {} },
    url(name) { return base ? `${base}/${name}` : `/clips/${name}`; },
    file(name) { return FILE_RE.test(name) ? path.join(dir, name) : null; },
  };
}

// The web copy: 720p (never upscaled), 30 fps, H.264 about 3 Mbps capped, AAC 128k from the first audio track (the mix), faststart.
const transcodeArgs = (input, out) => ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?",
  "-vf", "scale=-2:'min(720,ih)'", "-r", "30", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-maxrate", "3500k", "-bufsize", "7000k",
  "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out];
const posterArgs = (input, out) => ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", input, "-frames:v", "1", "-vf", "scale=-2:'min(360,ih)'", out];
const run = (bin, args) => new Promise((resolve, reject) => {
  const p = spawn(bin, args, { windowsHide: true }); let err = "";
  p.stderr.on("data", (d) => { err += d; });
  p.on("error", reject);
  p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${err.trim().slice(0, 300)}`))));
});
async function ffmpegTranscode(input, outMp4, outJpg, bin = process.env.FFMPEG || "ffmpeg") {
  await run(bin, transcodeArgs(input, outMp4));
  await run(bin, posterArgs(outMp4, outJpg));
}

// meta from the request: game (lol|tft), champion (League champion id), role, patch, label, match, duration (seconds).
function cleanMeta(q) {
  const game = q.game === "tft" ? "tft" : "lol", champion = Number(q.champion);
  if (game === "lol" && !(Number.isInteger(champion) && champion > 0 && champion < 100000)) return null;
  const s = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, n);
  return { game, champion: game === "lol" ? champion : Number.isInteger(champion) ? champion : 0, role: s(q.role, 12), patch: s(q.patch, 10),
    label: s(q.label, 80) || "Clip", match_id: s(q.match, 40), duration: Math.max(0, Math.min(600, Number(q.duration) || 0)) };
}

async function publish(db, store, transcode, meta, tmpFile) {
  const id = crypto.randomBytes(6).toString("hex"), outMp4 = tmpFile + ".web.mp4", outJpg = tmpFile + ".jpg";
  try {
    await transcode(tmpFile, outMp4, outJpg);
    const size = store.put(id + ".mp4", outMp4);
    store.put(id + ".jpg", outJpg);
    const row = { id, ...meta, size, created_at: Date.now() };
    db.prepare("INSERT INTO clips (id, game, champion, role, patch, label, duration, size, match_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, row.game, row.champion, row.role, row.patch, row.label, row.duration, row.size, row.match_id, row.created_at);
    return view(store, row);
  } finally { for (const f of [outMp4, outJpg]) try { fs.unlinkSync(f); } catch {} }
}
const view = (store, r) => ({ id: r.id, game: r.game, champion: r.champion, role: r.role, patch: r.patch, label: r.label, duration: r.duration,
  size: r.size, matchId: r.match_id, createdAt: r.created_at, url: store.url(r.id + ".mp4"), poster: store.url(r.id + ".jpg") });

// GET /lol/clips?champion=81 (or /tft/clips): newest first, at most 24; ?all=1 lists every clip (Studio's storage count).
function list(db, store, game, q) {
  const champion = Number(q.champion);
  const rows = Number.isInteger(champion) && champion > 0
    ? db.prepare("SELECT * FROM clips WHERE game = ? AND champion = ? ORDER BY created_at DESC LIMIT 24").all(game, champion)
    : db.prepare("SELECT * FROM clips WHERE game = ? ORDER BY created_at DESC LIMIT ?").all(game, q.all ? 5000 : 24);
  const total = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(size), 0) bytes FROM clips").get();
  return { clips: rows.map((r) => view(store, r)), total: total.n, bytes: total.bytes };
}

function unpublish(db, store, id) {
  if (!/^[a-f0-9]{12}$/.test(id || "")) return false;
  const r = db.prepare("DELETE FROM clips WHERE id = ?").run(id);
  store.remove(id + ".mp4"); store.remove(id + ".jpg");
  return r.changes > 0;
}

// /clips/<id>.mp4|jpg from the local store, with byte ranges so the player can seek. Public, cached a day.
function serveFile(store, name, req, res) {
  const f = store.file(name);
  let st; try { st = f && fs.statSync(f); } catch {}
  if (!st) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("no such clip"); }
  const type = name.endsWith(".mp4") ? "video/mp4" : "image/jpeg", head = { "content-type": type, "accept-ranges": "bytes", "cache-control": "public, max-age=86400", "access-control-allow-origin": "*" };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2])), end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
    if (start >= st.size || start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, "content-length": st.size });
  fs.createReadStream(f).pipe(res);
}

module.exports = { SCHEMA, createStore, ffmpegTranscode, transcodeArgs, cleanMeta, publish, list, unpublish, serveFile };
