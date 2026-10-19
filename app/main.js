// queuePop Electron host: one window on the existing webui, LCU auto-accept in the main process.
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { LCU } = require("./lcu");
const { METHODS } = require("./methods");
const host = require("./host"); // tray, alerts, companion, updater, account (DONI-442)

const WEBUI = path.join(__dirname, "..", "src", "webui", "index.html");
// ponytail: read-only view of the Python app's config; save_config stays stubbed until config is ported.
const CONFIG_FILE = path.join(__dirname, "..", "src", "config.json");
const VERSION = (fs.readFileSync(path.join(__dirname, "..", "src", "_version.py"), "utf8").match(/"(.+)"/) || [])[1];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); } catch { return {}; }
}

// Activity feed, same shape as src/events.py.
const events = [];
let seq = 0;
function push(message, level = "info", kind = null) {
  events.push({ id: ++seq, level, message, kind, ts: Date.now() / 1000 });
  if (events.length > 200) events.shift();
}

const lcu = new LCU();
const state = { paused: false, phase: null, accepting: false };

lcu.on("connect", async () => {
  log("LCU connected on port", lcu.creds.port);
  push("League client connected", "success");
  const r = await lcu.request("get", "/lol-gameflow/v1/gameflow-phase").catch(() => null);
  if (r && r.status === 200) state.phase = r.data;
});
lcu.on("disconnect", () => {
  log("LCU disconnected, waiting for client");
  push("League client disconnected", "warning");
  state.phase = null;
});
lcu.on("event", (e) => {
  if (e.uri === "/lol-gameflow/v1/gameflow-phase") state.phase = e.data;
  if (e.uri === "/lol-matchmaking/v1/ready-check" && e.eventType !== "Delete") readyCheck(e.data);
});

async function readyCheck(data) {
  if (state.paused || !data) return;
  if (data.state !== "InProgress") { state.accepting = false; return; }
  if (data.playerResponse !== "None" || state.accepting) return;
  state.accepting = true;
  const lobby = await lcu.request("get", "/lol-lobby/v2/lobby").catch(() => null);
  const queueId = lobby && lobby.data && lobby.data.gameConfig ? lobby.data.gameConfig.queueId : null;
  const allowed = loadConfig().allowed_queue_ids || [];
  if (allowed.length && !allowed.includes(queueId)) {
    log(`Ready check for queue ${queueId} skipped (not in allowed list)`);
    push(`Skipped queue ${queueId} (not in allowed list)`, "warning", "match");
    state.accepting = false;
    return;
  }
  push(`Queue popped (queue ${queueId}), accepting…`, "danger", "queue_pop");
  log(`Ready check popped queue=${queueId}`);
  const delay = Math.min(10, Math.max(0, Number(loadConfig().accept_delay_seconds) || 0));
  if (delay) {
    push(`Accepting in ${delay}s…`, "info", "match");
    await new Promise((r) => setTimeout(r, delay * 1000));
    // A teammate may have declined or the user answered by hand during the wait.
    const rc = await lcu.request("get", "/lol-matchmaking/v1/ready-check").catch(() => null);
    if (!rc || !rc.data || rc.data.state !== "InProgress" || rc.data.playerResponse !== "None") {
      log("Ready check ended during the accept delay; standing down");
      push("Ready check ended during the wait — not accepted", "warning", "match");
      state.accepting = false;
      return;
    }
  }
  const r = await lcu.request("post", "/lol-matchmaking/v1/ready-check/accept").catch((err) => ({ status: err.message }));
  log(`READY CHECK ACCEPTED queue=${queueId} status=${r.status}`);
  push(`Match accepted (queue ${queueId})`, "success", "match");
}

let win;
const impl = {
  get_status: () => ({
    connected: lcu.connected, gameflow_phase: state.phase, paused: state.paused,
    webhook_configured: false, user_id: "", desktop_notifications: false,
    champ_select_enabled: false, allowed_queue_count: (loadConfig().allowed_queue_ids || []).length,
    champions_loaded: 0, companion_enabled: false, companion_running: false, companion_clients: 0,
    alert_last: {}, version: VERSION,
  }),
  get_config: () => loadConfig(),
  get_events: (after = 0) => ({ latest: seq, events: events.filter((e) => e.id > Number(after || 0)) }),
  set_paused: (p) => { state.paused = !!p; return state.paused; },
  minimize_window: () => win.minimize(),
  toggle_maximize_window: () => { win.isMaximized() ? win.unmaximize() : win.maximize(); return win.isMaximized(); },
  hide_window: () => win.close(), // ponytail: no tray yet, so close quits
};
Object.assign(impl, require("./champ-select").attach(lcu, impl, push, state)); // DONI-441
Object.assign(impl, require("./overlay")); // DONI-446: Deadlock overlay probe + launch
Object.assign(impl, require("./deadlock-api")); // DONI-482: Deadlock account id
const assets = require("./assets").create(log); // DONI-504: icon packs download themselves
Object.assign(impl, assets.methods(impl));

const stubbed = new Set();
ipcMain.handle("api", async (_e, name, args) => {
  if (impl[name]) return impl[name](...args);
  if (!(name in METHODS)) throw new Error("unknown bridge method " + name);
  if (!stubbed.has(name)) { stubbed.add(name); log("stub:", name); }
  return METHODS[name];
});

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 1280, minHeight: 720, frame: false, backgroundColor: "#010a13",
    webPreferences: { preload: path.join(__dirname, "preload.js"), additionalArguments: ["--qp-methods=" + Object.keys({ ...METHODS, ...impl }).concat(host.NAMES)] },
  });
  // pywebview's drag class -> Electron's app-region; everything else in the bar stays clickable.
  win.webContents.on("did-finish-load", () => win.webContents.insertCSS(
    ".pywebview-drag-region{-webkit-app-region:drag}.appbar>:not(.pywebview-drag-region){-webkit-app-region:no-drag}"));
  win.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") log(`renderer ${e.level}:`, e.message);
  });
  win.loadFile(WEBUI);
  host.init({ win, lcu, state, events, impl, loadConfig, configFile: CONFIG_FILE, push, log, version: VERSION });
  assets.check(); // never awaited: icons fill in as they land
  lcu.start();
  log("Searching for League client...");
});

app.on("window-all-closed", () => app.quit());
