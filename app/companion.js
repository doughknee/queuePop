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

// ctx: { webRoot, events (shared array, ascending ids), getConfig, status: () => ({connected, paused, ready}), push, decline }
function createCompanion(ctx) {
  let server = null;
  let boundPort = null;
  let clients = 0;
  const since = (after) => ctx.events.filter((e) => e.id > after).slice(-100);
  const write = (res, e) => res.write(`id: ${e.id}\nevent: log\ndata: ${JSON.stringify(e)}\n\n`);
  const cfgComp = () => ctx.getConfig().companion || {};

  const MAX_CLIENTS = 8; // a phone or two in practice; a cap keeps a stuck LAN client from piling up timers (DONI-534)
  function stream(req, res) {
    if (clients >= MAX_CLIENTS) { res.writeHead(503, { "Retry-After": "30" }); return res.end(); }
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
    let done = false;
    const stop = () => { if (done) return; done = true; clearInterval(timer); clients = Math.max(0, clients - 1); };
    req.on("close", stop);
    res.on("error", stop); // a write to a phone that vanished mid-stream
    res.on("close", stop);
  }

  // DONI-328: the QR link carries ?t=<token>; opening it sets a year-long cookie, so the page, its feed and a home-screen
  // install keep working. Static files stay public (a browser fetches the manifest without cookies); only /api/* needs it.
  const tokenOf = (req, url) => url.searchParams.get("t") || ((req.headers.cookie || "").match(/(?:^|;\s*)qp_t=([0-9a-f]+)/) || [])[1] || "";
  const authorised = (req, url) => { const want = cfgComp().token; return !!want && tokenOf(req, url) === want; };

  function handler(req, res) {
    let p, url; // a malformed escape (GET /%) from anyone on the LAN threw here and took the whole host down (DONI-529)
    try { url = new URL(req.url, "http://x"); p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
    if (p.startsWith("/api/") && !authorised(req, url)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "token", message: "Scan the QR code in queuePop's Settings again." }));
    }
    if (url.searchParams.get("t") && authorised(req, url) && (p === "/" || p.endsWith(".html"))) {
      res.setHeader("Set-Cookie", `qp_t=${cfgComp().token}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Strict`);
    }
    if (p === "/api/stream") return stream(req, res);
    if (p === "/api/away") { // DONI-424: the phone's "I'm stepping away" / "I'm back"
      if (req.method !== "POST" || !ctx.setAway) { res.writeHead(405); return res.end(); }
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(ctx.setAway(url.searchParams.get("on") === "1")));
    }
    if (p === "/api/decline") {
      if (req.method !== "POST" || !ctx.decline) { res.writeHead(405); return res.end(); }
      return Promise.resolve(ctx.decline()).catch((e) => ({ ok: false, error: e.message }))
        .then((r) => { res.writeHead(r.ok ? 200 : 409, { "Content-Type": "application/json" }); res.end(JSON.stringify(r)); });
    }
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
