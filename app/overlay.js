// Deadlock overlay handshake. The Overwolf overlay app is a separate install (it holds the game hooks;
// the host never does): probe its loopback /health and, when config names its exe, launch it on demand.
const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const config = require("./config");

const HEALTH = "http://127.0.0.1:47821/health";

function probe(timeout = 800) {
  return new Promise((resolve) => {
    const req = http.get(HEALTH, { timeout }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try { const j = JSON.parse(body); resolve(j.app === "queuepop-overlay" ? j : null); } catch { resolve(null); }
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

const exe = () => String(config.get().deadlock_overlay_exe || "");

// {connected, version, configured}: the Deadlock tab shows connected / "Launch overlay" / not installed.
async function deadlock_overlay_status() {
  const h = await probe();
  return { connected: !!h, version: h ? h.version || "" : "", configured: !!exe() };
}

function launch_deadlock_overlay() {
  const file = exe();
  if (!file) return { ok: false, error: "No overlay configured (deadlock_overlay_exe)" };
  if (!fs.existsSync(file)) return { ok: false, error: "Overlay not found at " + file };
  try {
    spawn(file, ["--minimized"], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Deadlock Play: start the overlay when one is configured (skipped silently otherwise), then the game via Steam.
// open_external only passes http(s), so the steam:// link opens here.
function launch_deadlock() {
  if (exe()) launch_deadlock_overlay();
  require("electron").shell.openExternal("steam://rungameid/1422450");
  return { ok: true };
}

module.exports = { deadlock_overlay_status, launch_deadlock_overlay, launch_deadlock, probe };
