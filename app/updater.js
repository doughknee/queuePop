// Update check against GitHub releases. Port of src/updater.py's check + release notes.
// Applying an update is NOT ported: apply() only reports where to download it.
const https = require("https");

const REPO = "doughknee/queuePop";
const INTERVAL = 6 * 60 * 60 * 1000;

function parse(v) {
  if (!v) return null;
  const parts = String(v).trim().replace(/^[vV]/, "").split(/[-+]/)[0].split(".");
  const n = parts.slice(0, 3).map((p) => parseInt(p, 10) || 0);
  while (n.length < 3) n.push(0);
  return n;
}

function isNewer(remote, local) {
  const r = parse(remote), l = parse(local);
  if (!r || !l) return false;
  for (let i = 0; i < 3; i++) if (r[i] !== l[i]) return r[i] > l[i];
  return false;
}

function createUpdater({ version, push }) {
  const ua = `queuePop/${version} (+https://github.com/${REPO})`;
  const cache = { checked: false, available: false, current: version, latest: null, notes: "", url: "", assets: [], error: null, status: null };
  let lastCheck = 0;
  let notes = { ts: 0, items: null };

  function get(path) {
    return new Promise((resolve, reject) => {
      const req = https.get({ host: "api.github.com", path, headers: { "User-Agent": ua, Accept: "application/vnd.github+json" }, timeout: 12000 }, (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { code: res.statusCode }));
          try { resolve(JSON.parse(text)); } catch { reject(new Error("bad JSON from GitHub")); } // a throw here was uncaught
        });
      });
      req.on("timeout", () => req.destroy(new Error("timed out")));
      req.on("error", reject);
    });
  }

  async function doCheck() {
    try {
      const d = await get(`/repos/${REPO}/releases/latest`);
      const latest = String(d.tag_name || d.name || "").replace(/^[vV]/, "");
      Object.assign(cache, {
        checked: true, available: isNewer(latest, version), current: version, latest, notes: d.body || "",
        url: d.html_url || `https://github.com/${REPO}/releases/latest`,
        assets: (d.assets || []).filter((a) => a.browser_download_url).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size })),
        error: null, status: null,
      });
    } catch (e) {
      // 404 = no published release yet; "nothing available", not an error in the user's face.
      Object.assign(cache, { checked: true, available: false, error: e.message, status: e.code || null });
    }
    lastCheck = Date.now();
    return { ...cache };
  }

  const check = (force) => (force || !cache.checked || Date.now() - lastCheck > INTERVAL ? doCheck() : { ...cache });

  async function releaseNotes(limit = 10) {
    if (notes.items && Date.now() - notes.ts < INTERVAL) return notes.items;
    try {
      const list = await get(`/repos/${REPO}/releases?per_page=${limit}`);
      const items = list.filter((r) => !r.draft).map((r) => {
        const tag = String(r.tag_name || r.name || "").replace(/^[vV]/, "");
        return { version: tag, name: r.name || `v${tag}`, date: (r.published_at || "").slice(0, 10), notes: r.body || "", url: r.html_url || "" };
      });
      notes = { ts: Date.now(), items };
    } catch {}
    return notes.items || [];
  }

  function startBackground() {
    let lastErr = null;
    const tick = async () => {
      const s = await doCheck();
      if (s.error && s.error !== lastErr) push(`Update check failed: ${s.error}`, "warning", "update");
      lastErr = s.error;
    };
    setTimeout(tick, 4000).unref();
    setInterval(tick, INTERVAL).unref();
  }

  // ponytail: no download/install yet; electron-updater is the upgrade path once releases ship NSIS artifacts.
  const apply = () => ({ ok: false, error: "Automatic install isn't available in the Electron build yet. Download the new version from the release page.", url: cache.url });

  return { status: () => ({ ...cache }), check, releaseNotes, startBackground, apply };
}

module.exports = { createUpdater, isNewer };
