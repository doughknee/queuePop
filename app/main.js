// queuePop Electron host: one window on the existing webui, LCU auto-accept in the main process.
const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, shell, screen, powerMonitor } = require("electron");
const { windowState } = require("./window-state"); // DONI-539
const { QUEUE_ID_MAP } = require("./account");
const qname = (id) => QUEUE_ID_MAP[id] || (id ? `queue ${id}` : "this queue");
const { createFloat, FLOAT_METHODS } = require("./float"); // DONI-346
let float = null;
const { LCU } = require("./lcu");
const { METHODS } = require("./methods");
const host = require("./host"); // tray, alerts, companion, updater, account (DONI-442)
const { UI_SCALES } = require("./champ-config");

const WEBUI = path.join(__dirname, "..", "src", "webui", "index.html");
// ponytail: read-only view of the Python app's config; save_config stays stubbed until config is ported.
const CONFIG_FILE = path.join(__dirname, "..", "src", "config.json");
const VERSION = (fs.readFileSync(path.join(__dirname, "..", "src", "_version.py"), "utf8").match(/"(.+)"/) || [])[1];

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// Read-only callers get {} when the file can't be read right now; writers use config.get, which throws instead,
// so nothing writes an empty config over the user's (DONI-529).
const config = require("./config");
const loadConfig = () => { try { return config.get(); } catch (e) { log("config unreadable:", e.message); return {}; } };

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
  if (r && r.status === 200) { state.phase = r.data; if (float) float.sync(r.data); } // reconnecting mid champ select opens the float
});
lcu.on("disconnect", () => {
  log("LCU disconnected, waiting for client");
  push("League client disconnected", "warning");
  state.phase = null; state.ready = null;
  if (float) float.sync(null);
});
lcu.on("event", (e) => {
  if (e.uri === "/lol-gameflow/v1/gameflow-phase") { state.phase = e.data; if (float) float.sync(e.data); }
  if (e.uri === "/lol-matchmaking/v1/ready-check") state.ready = e.eventType === "Delete" ? null : e.data; // the phone's Decline (DONI-337)
  if (e.uri === "/lol-matchmaking/v1/ready-check" && e.eventType !== "Delete") readyCheck(e.data);
});

async function readyCheck(data) {
  if (state.paused || !data) return;
  if (data.state !== "InProgress") { state.accepting = false; state.popPushed = false; return; }
  if (data.playerResponse !== "None" || state.accepting) return;
  state.accepting = true;
  const lobby = await lcu.request("get", "/lol-lobby/v2/lobby").catch(() => null);
  const queueId = lobby && lobby.data && lobby.data.gameConfig ? lobby.data.gameConfig.queueId : null;
  const allowed = loadConfig().allowed_queue_ids || [];
  if (allowed.length && !allowed.includes(queueId)) {
    log(`Ready check for queue ${queueId} skipped (not in allowed list)`);
    push(`Didn't accept ${qname(queueId)}: it isn't one of your queues to auto-accept`, "warning", "match");
    state.accepting = false;
    return;
  }
  // DONI-351: the lasting on/off (Settings > League); Pause stays the for-now switch. Stepping away always accepts.
  // Off still pushes the pop (the phone alarms on it), it just doesn't accept.
  const autoAccept = state.away || loadConfig().auto_accept !== false;
  if (!state.popPushed) push(`Queue popped: ${qname(queueId)}. ${autoAccept ? "Accepting…" : "Accept it in the client."}`, "danger", "queue_pop"); // once per pop, not per retry
  state.popPushed = true;
  if (!autoAccept) { log(`Ready check popped queue=${queueId}; auto-accept is off`); return; } // the latch stays until the check ends
  log(`Ready check popped queue=${queueId}`);
  const delay = Math.min(10, Math.max(0, Number(loadConfig().accept_delay_seconds) || 0));
  if (delay) {
    push(`Accepting in ${delay} s…`, "info", "match");
    await new Promise((r) => setTimeout(r, delay * 1000));
    // A teammate may have declined or the user answered by hand during the wait.
    const rc = await lcu.request("get", "/lol-matchmaking/v1/ready-check").catch(() => null);
    if (!rc || !rc.data || rc.data.state !== "InProgress" || rc.data.playerResponse !== "None") {
      log("Ready check ended during the accept delay; standing down");
      push("The queue pop ended during the wait, so nothing was accepted", "warning", "match");
      state.accepting = false;
      return;
    }
  }
  const r = await lcu.request("post", "/lol-matchmaking/v1/ready-check/accept").catch((err) => ({ status: err.message }));
  // A failed accept frees the latch, so the next ready-check event for this pop tries again (DONI-529).
  if (!(r.status >= 200 && r.status < 300)) {
    state.accepting = false;
    log(`READY CHECK accept failed queue=${queueId} status=${r.status}`);
    push(`Couldn't accept yet (${r.status}), trying again`, "warning", "match");
    return;
  }
  log(`READY CHECK ACCEPTED queue=${queueId} status=${r.status}`);
  push(`Match accepted: ${qname(queueId)}`, "success", "match");
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
  // DONI-516: Settings > Display > Text size. The renderer saves config ui_scale; this applies it.
  close_float: () => (float ? float.dismiss() : false), // the float's ✕: hidden until the next champ select
  set_ui_scale: (f) => { f = Number(f); if (!UI_SCALES.includes(f)) return false; win.webContents.setZoomFactor(f); return true; },
};
Object.assign(impl, require("./champ-select").attach(lcu, impl, push, state)); // DONI-441
Object.assign(impl, require("./overlay")); // DONI-446: Deadlock overlay probe + launch
Object.assign(impl, require("./deadlock-api")); // DONI-482: Deadlock account id
const assets = require("./assets").create(log); // DONI-504: icon packs download themselves
Object.assign(impl, assets.methods(impl));

const stubbed = new Set();
// Only our own page's top frame may call the bridge, by an own method name, with an argument list (DONI-529).
ipcMain.handle("api", async (e, name, args) => {
  const fromFloat = float && e.sender.id === float.id(); // the suggestions float may only read (DONI-346)
  if (!win || (e.sender.id !== win.webContents.id && !fromFloat) || (e.senderFrame && e.senderFrame.parent)) throw new Error("bridge refused: not the app window");
  if (typeof name !== "string" || !Array.isArray(args)) throw new Error("bridge refused: bad call");
  if (fromFloat && !FLOAT_METHODS.has(name)) throw new Error("bridge refused: not for the float");
  if (Object.hasOwn(impl, name)) return impl[name](...args);
  if (!Object.hasOwn(METHODS, name)) throw new Error("unknown bridge method " + name);
  if (!stubbed.has(name)) { stubbed.add(name); log("stub:", name); }
  return METHODS[name];
});

// Startup timing (DONI-539): seconds since the process started, logged at each milestone so a slow launch shows where.
const since = () => process.uptime().toFixed(2) + "s";
app.whenReady().then(() => {
  log("startup: app ready at", since());
  const ws = windowState(path.join(app.getPath("userData"), "window-state.json"));
  // Hidden until the first paint, then shown where it was last time (size, position, maximised); no blank frame.
  const bridgeArgs = ["--qp-methods=" + Object.keys({ ...METHODS, ...impl }).concat(host.NAMES)];
  float = createFloat({ preload: path.join(__dirname, "preload.js"), args: bridgeArgs, getConfig: loadConfig, userData: app.getPath("userData"), log });
  win = new BrowserWindow({
    width: 1280, height: 860, ...ws.options(screen), minWidth: 1280, minHeight: 720, frame: false, backgroundColor: "#0A0A0A", show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, additionalArguments: bridgeArgs },
  });
  // The window only ever shows src/webui. Links that leave it open in the browser; nothing else may load here,
  // because any page in this window would get the bridge (DONI-529).
  const external = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => { external(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); external(url); } });
  let reloadedAt = 0; // a renderer that crashes again within 10 s stays down instead of looping
  win.webContents.on("render-process-gone", (_e, d) => {
    log("renderer gone:", d.reason);
    if (d.reason !== "clean-exit" && Date.now() - reloadedAt > 10000) { reloadedAt = Date.now(); win.reload(); }
  });
  // pywebview's drag class -> Electron's app-region; everything else in the bar stays clickable.
  win.webContents.on("did-finish-load", () => {
    win.webContents.insertCSS(".pywebview-drag-region{-webkit-app-region:drag}.appbar>:not(.pywebview-drag-region){-webkit-app-region:no-drag}");
    impl.set_ui_scale(loadConfig().ui_scale) || win.webContents.setZoomFactor(1.25);
  });
  // Ctrl+= / Ctrl+- / Ctrl+0 step the Text size (settings.js qpStepScale saves it); preventDefault also stops Chromium's own zoom keys.
  win.webContents.on("before-input-event", (e, i) => {
    const dir = { "=": 1, "+": 1, "-": -1, "0": 0 }[i.key];
    if (i.type !== "keyDown" || !i.control || i.alt || dir === undefined) return;
    e.preventDefault();
    win.webContents.executeJavaScript(`window.qpStepScale && qpStepScale(${dir})`).catch(() => {});
  });
  win.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") log(`renderer ${e.level}:`, e.message);
  });
  win.once("ready-to-show", () => {
    log("startup: first paint at", since());
    if (loadConfig().start_minimized) return; // tray only; the tray's Open shows it
    if (ws.maximized()) win.maximize();
    win.show();
  });
  // If the first paint never comes (a renderer that crashed on load), show the window anyway after 5 s.
  let shownOnce = false;
  win.once("show", () => { shownOnce = true; if (ws.maximized() && !win.isMaximized()) win.maximize(); }); // also a first show from the tray
  setTimeout(() => { if (!shownOnce && !loadConfig().start_minimized) { log("startup: no paint after 5 s, showing anyway"); win.show(); } }, 5000).unref?.();
  win.webContents.once("did-finish-load", () => {
    log("startup: page loaded at", since());
    win.webContents.executeJavaScript("JSON.stringify(performance.getEntriesByType('paint').map(e => e.name + ' ' + Math.round(e.startTime) + 'ms'))")
      .then((p) => log("startup: renderer", p)).catch(() => {});
  });
  ws.track(win);
  win.on("closed", () => { if (float) float.sync(null); }); // with close-to-tray off, the float mustn't keep the app alive
  const setDl = impl.set_deadlock_account;
  impl.set_deadlock_account = (id) => {
    const r = setDl(id), v = JSON.stringify(require("./deadlock-api").get_deadlock_account());
    win.webContents.executeJavaScript(`window.QP && QP.store.config && (QP.store.config.deadlock_account_id = ${v}, QP.bus.emit("config:changed", { path: "deadlock_account_id" }))`).catch(() => {});
    return r;
  };
  win.loadFile(WEBUI);
  host.init({ win, lcu, state, events, impl, loadConfig, configFile: CONFIG_FILE, push, log, version: VERSION });
  assets.check(); // never awaited: icons fill in as they land
  // Dev: QP_FAKE_CS=draft|aram replays a scripted League client through the same handlers (app/fake-lcu.js).
  if (process.env.QP_FAKE_CS) require("./fake-lcu").install(lcu, process.env.QP_FAKE_CS === "aram" ? "aram" : "draft", log);
  else lcu.start();
  powerMonitor.on("resume", () => { log("system resumed, checking the League client"); lcu.recheck(); }); // DONI-532
  log("Searching for League client...");
});

app.on("window-all-closed", () => app.quit());
// A failed promise or a throw in a timer must not kill the host or vanish: log it and keep running (DONI-529).
process.on("unhandledRejection", (err) => log("unhandled rejection:", (err && err.stack) || err));
process.on("uncaughtException", (err) => log("uncaught exception:", (err && err.stack) || err));
