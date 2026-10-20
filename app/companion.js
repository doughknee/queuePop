// LAN phone companion: read-only HTTP server (companion.html + SSE activity feed). Port of src/companion.py.
// Strictly read-only, which is what makes binding 0.0.0.0 safe.
const fs = require("fs");
const path = require("path");
const http = require("http");
const dgram = require("dgram");

const DEFAULT_PORT = 8420;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf" };

// Best-effort LAN IP: the endpoint the OS would route toward a public address (nothing is sent).
function lanIp() {
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.on("error", () => { s.close(); resolve("127.0.0.1"); });
    s.connect(80, "8.8.8.8", () => { const ip = s.address().address; s.close(); resolve(ip); });
  });
}

// ctx: { webRoot, events (shared array, ascending ids), getConfig, status: () => ({connected, paused}), push }
function createCompanion(ctx) {
  let server = null;
  let boundPort = null;
  let clients = 0;
  const since = (after) => ctx.events.filter((e) => e.id > after).slice(-100);
  const write = (res, e) => res.write(`id: ${e.id}\nevent: log\ndata: ${JSON.stringify(e)}\n\n`);
  const cfgComp = () => ctx.getConfig().companion || {};

  function stream(req, res) {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    clients++;
    const url = new URL(req.url, "http://x");
    let after = parseInt(req.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0, 10) || 0;
    // Replay the backlog, then 'synced' so the phone doesn't alarm on history.
    for (const e of since(after)) { write(res, e); after = e.id; }
    res.write("event: synced\ndata: {}\n\n");
    let beats = 0;
    const timer = setInterval(() => {
      const fresh = since(after);
      for (const e of fresh) { write(res, e); after = e.id; }
      if (!fresh.length && ++beats % 15 === 0) res.write(": ping\n\n");
    }, 1000);
    req.on("close", () => { clearInterval(timer); clients = Math.max(0, clients - 1); });
  }

  function handler(req, res) {
    let p; // a malformed escape (GET /%) from anyone on the LAN threw here and took the whole host down (DONI-529)
    try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end(); }
    if (p === "/api/stream") return stream(req, res);
    if (p === "/api/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ...ctx.status(), sound: cfgComp().sound || "chime" }));
    }
    if (p === "/api/sound") {
      const c = cfgComp();
      if (c.sound === "custom" && /\.(mp3|ogg|wav|m4a)$/i.test(c.sound_file || "") && fs.existsSync(c.sound_file)) return fs.createReadStream(c.sound_file).pipe(res);
      res.writeHead(404); return res.end();
    }
    const file = path.join(ctx.webRoot, p === "/" ? "companion.html" : p);
    if (!file.startsWith(ctx.webRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  }

  // Resolves true when listening. `port` overrides config (tests use 0).
  function start(port) {
    if (server) return Promise.resolve(true);
    port ??= Number(cfgComp().port) || DEFAULT_PORT;
    return new Promise((resolve) => {
      const s = http.createServer(handler);
      s.once("error", (e) => {
        ctx.push(`Phone companion couldn't start on port ${port}`, "warning");
        resolve(false);
      });
      s.listen(port, "0.0.0.0", async () => {
        server = s; boundPort = s.address().port;
        ctx.push(`Phone companion ready at http://${await lanIp()}:${boundPort}`, "success");
        resolve(true);
      });
    });
  }

  function stop() { if (server) { server.close(); server.closeAllConnections?.(); server = null; boundPort = null; clients = 0; } }

  return { start, stop, isRunning: () => !!server, boundPort: () => boundPort, clientCount: () => clients };
}

module.exports = { createCompanion, lanIp, DEFAULT_PORT };
