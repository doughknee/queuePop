// Studio > Publish (docs/clip-publishing.md, 2026-10-21): sends a clip you chose to the crawler's POST /admin/clips. The
// crawler makes the web copy (720p, the mix track only) and serves it at clips.olvyx.com; champion pages list it via
// GET /lol/clips. The crawler's admin token is kept encrypted with Electron safeStorage (Windows DPAPI) in
// userData/publish-token.bin, never in config.json. Unpublish deletes it from the crawler. The clip keeps
// `published: { id, url, poster, at }`.
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

function createPublisher({ app, safeStorage, getConfig, recorder, log = () => {} }) {
  const file = () => path.join(app.getPath("userData"), "publish-token.bin");
  const base = () => String(getConfig().crawler_url || "http://10.205.0.81:47900").replace(/\/+$/, "");
  const token = () => { try { return safeStorage.decryptString(fs.readFileSync(file())); } catch { return ""; } };

  // One request to the crawler -> { status, json }. `upload` streams that file as the body.
  function call(method, pathname, { upload = null, headers = {}, timeout = 15000 } = {}) {
    return new Promise((resolve, reject) => {
      const u = new URL(base() + pathname), lib = u.protocol === "https:" ? https : http;
      const h = { ...headers };
      if (upload) h["content-length"] = fs.statSync(upload).size;
      const r = lib.request(u, { method, headers: h, timeout }, (res) => {
        let t = ""; res.on("data", (c) => { t += c; });
        res.on("end", () => { let json = {}; try { json = JSON.parse(t); } catch {} resolve({ status: res.statusCode, json }); });
      });
      r.on("timeout", () => r.destroy(new Error("the crawler took too long")));
      r.on("error", reject);
      if (upload) fs.createReadStream(upload).on("error", (e) => r.destroy(e)).pipe(r); else r.end();
    });
  }

  function setToken(t) {
    t = String(t || "").trim();
    if (!t) { try { fs.unlinkSync(file()); } catch {} return { ok: true, hasToken: false }; }
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: "Windows can't encrypt the token on this PC" };
    fs.writeFileSync(file(), safeStorage.encryptString(t));
    return { ok: true, hasToken: true };
  }

  async function status() {
    const out = { hasToken: !!token(), crawler: base(), reachable: false, total: 0, bytes: 0 };
    try { const r = await call("GET", "/lol/clips?all=1", { timeout: 5000 }); if (r.status === 200) Object.assign(out, { reachable: true, total: r.json.total || 0, bytes: r.json.bytes || 0 }); } catch {}
    return out;
  }

  // meta from Studio: { champion: League champion id, label, role, patch }.
  async function publish(id, i, meta = {}) {
    const rec = recorder.get(String(id)), c = rec && (rec.clips || [])[i];
    if (!c || !c.file || !fs.existsSync(c.file)) return { ok: false, error: "This clip's file is gone" };
    if (c.published) return { ok: true, published: c.published, already: true };
    const t = token();
    if (!t) return { ok: false, error: "Add the crawler's admin token in Studio › Capture › Publishing first" };
    const champion = Number(meta.champion);
    if (!(Number.isInteger(champion) && champion > 0)) return { ok: false, error: "Couldn't tell which champion this clip is" };
    const q = new URLSearchParams({ game: "lol", champion: String(champion), label: String(meta.label || c.name || c.label || "Clip").slice(0, 80),
      role: String(meta.role || ""), patch: String(meta.patch || ""), match: String(rec.matchId || ""), duration: String(Math.round(((c.end || 0) - (c.start || 0)) * 10) / 10) });
    let r;
    try { r = await call("POST", "/admin/clips?" + q, { upload: c.file, headers: { authorization: "Bearer " + t, "content-type": "video/mp4" }, timeout: 300000 }); }
    catch (e) { return { ok: false, error: `Couldn't reach the crawler (${e.message})` }; }
    if (r.status !== 200 || !r.json.ok) return { ok: false, error: r.status === 401 ? "The crawler didn't accept the admin token" : r.status === 403 ? "Publishing only works from your home network" : r.json.error || `The crawler answered ${r.status}` };
    const p = r.json.clip;
    c.published = { id: p.id, url: p.url, poster: p.poster, at: Date.now() };
    recorder.update(rec.matchId, { clips: rec.clips });
    log(`clip published: ${rec.matchId} #${i} -> ${p.url}`);
    return { ok: true, published: c.published };
  }

  async function unpublish(id, i) {
    const rec = recorder.get(String(id)), c = rec && (rec.clips || [])[i];
    if (!c || !c.published) return { ok: true, already: true };
    const t = token();
    if (!t) return { ok: false, error: "Add the crawler's admin token in Studio › Capture › Publishing first" };
    let r;
    try { r = await call("DELETE", "/admin/clips/" + c.published.id, { headers: { authorization: "Bearer " + t } }); }
    catch (e) { return { ok: false, error: `Couldn't reach the crawler (${e.message})` }; }
    if (r.status !== 200) return { ok: false, error: r.status === 401 ? "The crawler didn't accept the admin token" : r.json.error || `The crawler answered ${r.status}` };
    delete c.published;
    recorder.update(rec.matchId, { clips: rec.clips });
    return { ok: true };
  }

  return { setToken, status, publish, unpublish, hasToken: () => !!token() };
}

module.exports = { createPublisher };
