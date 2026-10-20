// Wires the non-champ-select parts of the Python app into the Electron host: close-to-tray, single instance,
// alerts (Discord + toast), phone companion, updater, queue launcher + account methods. Called once from main.js.
const fs = require("fs");
const path = require("path");
const { app, Notification, dialog, shell } = require("electron");
const { createNotifier } = require("./notifications");
const { createCompanion, lanIp, DEFAULT_PORT } = require("./companion");
const { createUpdater } = require("./updater");
const { createAccount, QUEUE_ID_MAP } = require("./account");
const { createTray } = require("./tray");
const config = require("./config");

app.setAppUserModelId("com.doughknee.queuepop"); // matches the electron-builder appId so toasts carry our name/icon
if (!app.requestSingleInstanceLock()) app.exit(0);

const ICON = path.join(__dirname, "..", "assets", "queuepop.ico");
const START = Date.now();

// Bridge methods implemented here. The preload builds window.pywebview.api from METHODS plus these.
const NAMES = ["get_status", "get_stats", "test_desktop", "test_discord", "test_companion", "get_companion_info", "get_update_status",
  "check_for_update", "get_release_notes", "apply_update", "get_summoner", "get_queue_map", "get_quick_queues", "start_queue", "cancel_queue",
  "launch_league", "get_champion_mastery", "get_match_history", "get_tft_match_history", "open_external", "open_config_folder", "pick_sound_file", "hide_window",
  "minimize_window", "resize_window"];

function init({ win, lcu, state, events, impl, loadConfig, configFile, push, log, version }) {
  let quitting = false;
  const quit = () => { quitting = true; app.quit(); };
  app.on("before-quit", () => { quitting = true; });
  app.on("second-instance", () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });

  // Close hides to the tray; only tray Exit / app.quit() really closes.
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  const tray = createTray({ win, icon: ICON, state, push, quit });
  if (loadConfig().start_minimized) win.hide();

  const notifier = createNotifier({ getConfig: loadConfig, push, log, icon: ICON, Notification });
  const companion = createCompanion({
    webRoot: path.join(__dirname, "..", "src", "webui"), events, getConfig: loadConfig, push,
    status: () => ({ connected: lcu.connected, paused: state.paused }),
  });
  if ((loadConfig().companion || {}).enabled) companion.start();
  const updater = createUpdater({ version, push });
  updater.startBackground();

  const setConfigKey = (key, value) => {
    try {
      const cfg = config.get(); // throws when unreadable, so a failed read never writes {key} over the whole file
      cfg[key] = value;
      config.save(cfg);
    } catch (e) { log("could not save", key, e.message); }
  };
  const account = createAccount({ lcu, getConfig: loadConfig, setConfigKey, push });

  // --- alerts, driven by LCU events (a mock run emits these on `lcu` directly) ---
  let queueName = null;
  let popAlerted = false;
  lcu.on("event", async (e) => {
    if (state.paused) return;
    if (e.uri === "/lol-matchmaking/v1/ready-check" && e.eventType !== "Delete" && e.data) {
      if (e.data.state !== "InProgress") { popAlerted = false; return; }
      if (e.data.playerResponse !== "None" || popAlerted) return;
      popAlerted = true;
      const lobby = await lcu.request("get", "/lol-lobby/v2/lobby").catch(() => null);
      const qid = lobby && lobby.data && lobby.data.gameConfig ? lobby.data.gameConfig.queueId : null;
      const allowed = loadConfig().allowed_queue_ids || [];
      if (allowed.length && !allowed.includes(qid)) return; // main.js already logged the skip
      queueName = QUEUE_ID_MAP[qid] || (qid ? `Queue ${qid}` : "Unknown");
      notifier.alert("queue_pop", "Queue Popped!", "Accepting your match automatically, get back to your PC!", "Queue pop", { queue: queueName });
    } else if (e.uri === "/lol-gameflow/v1/gameflow-phase" && e.eventType !== "Delete") {
      if (e.data === "ChampSelect") notifier.alert("champ_select", "⚔️ Champ select started", "Champ select has started.", "Champ select", { queue: queueName });
      else if (e.data === "InProgress") notifier.alert("game_start", "🎮 Game starting", "Your game is starting.", "Game start", { queue: queueName });
    }
  });
  lcu.on("disconnect", () => notifier.alert("disconnect", "🔌 Client disconnected", "The League client closed or lost its connection.", "Client disconnected"));

  const cfgComp = () => loadConfig().companion || {};
  const mine = {
    get_status: () => {
      const cfg = loadConfig();
      return {
        connected: lcu.connected, gameflow_phase: state.phase, paused: state.paused,
        webhook_configured: !!cfg.webhook_url, user_id: cfg.user_id || "", desktop_notifications: !!cfg.desktop_notifications,
        champ_select_enabled: !!(cfg.champ_select || {}).enabled, allowed_queue_count: (cfg.allowed_queue_ids || []).length,
        champions_loaded: 0, companion_enabled: !!cfgComp().enabled, companion_running: companion.isRunning(),
        companion_clients: companion.clientCount(), alert_last: { ...notifier.lastSent }, version,
      };
    },
    get_stats: () => {
      let stats = {};
      try { stats = JSON.parse(fs.readFileSync(path.join(path.dirname(configFile), "stats.json"), "utf8")); } catch {}
      return { stats, uptime_seconds: Math.floor((Date.now() - START) / 1000), config_dir: path.dirname(configFile), frozen: app.isPackaged };
    },
    test_desktop: () => {
      const ok = notifier.desktop("queuePop test", "Desktop notifications are working.", "Test message");
      if (ok) push("Desktop test notification sent", "success");
      return { ok, error: ok ? null : "Couldn't show a notification" };
    },
    test_discord: async (url, userId) => {
      const cfg = loadConfig();
      const r = await notifier.testDiscord((url || cfg.webhook_url || "").trim(), (userId || cfg.user_id || "").trim());
      push(r.ok ? "Discord test message sent" : `Discord test failed: ${r.error}`, r.ok ? "success" : "warning");
      return r;
    },
    test_companion: () => { push("Test phone alert", "danger", "queue_pop"); return { ok: true, running: companion.isRunning() }; },
    get_companion_info: async () => {
      const port = companion.boundPort() || Number(cfgComp().port) || DEFAULT_PORT;
      const ip = await lanIp();
      const url = `http://${ip}:${port}`;
      return { enabled: !!cfgComp().enabled, port, lan_ip: ip, url, running: companion.isRunning(), qr: await require("qrcode").toDataURL(url).catch(() => "") }; // qrcode loads on first use, ~35 ms off startup (DONI-539)
    },
    get_update_status: () => updater.status(),
    check_for_update: () => updater.check(true),
    get_release_notes: async () => ({ releases: await updater.releaseNotes() }),
    apply_update: () => updater.apply(),
    get_summoner: account.getSummoner, get_queue_map: account.getQueueMap, get_quick_queues: account.getQuickQueues,
    start_queue: account.startQueue, cancel_queue: account.cancelQueue, launch_league: account.launchLeague,
    get_champion_mastery: account.getChampionMastery, get_match_history: account.getMatchHistory, get_tft_match_history: account.getTftMatchHistory,
    open_external: (url) => { if (!/^https?:\/\//i.test(String(url))) return false; shell.openExternal(String(url)); return true; },
    open_config_folder: async () => {
      const err = await shell.openPath(path.dirname(configFile));
      return err ? { ok: false, error: err } : { ok: true };
    },
    pick_sound_file: async () => {
      const r = await dialog.showOpenDialog(win, { properties: ["openFile"],
        filters: [{ name: "Audio Files", extensions: ["mp3", "ogg", "wav", "m4a"] }, { name: "All files", extensions: ["*"] }] });
      return r.canceled || !r.filePaths[0] ? { ok: false } : { ok: true, path: r.filePaths[0], name: path.basename(r.filePaths[0]) };
    },
    hide_window: () => { win.hide(); return true; },
    minimize_window: () => { win.minimize(); return true; },
    resize_window: (width, height, edge = "se") => {
      const b = win.getBounds(), [minW, minH] = win.getMinimumSize();
      const w = Math.max(minW, Math.round(width)), h = Math.max(minH, Math.round(height)), e = String(edge).toLowerCase();
      // Pin the edge opposite the one under the cursor.
      win.setBounds({ x: e.includes("w") ? b.x + b.width - w : b.x, y: e.includes("n") ? b.y + b.height - h : b.y, width: w, height: h });
      return true;
    },
  };
  // The phone companion applies at once: turning it on/off or changing its port in Settings restarts the server (Q7).
  const saveConfig = impl.save_config;
  if (saveConfig) mine.save_config = async (c) => {
    const before = cfgComp(), r = await saveConfig(c), after = cfgComp();
    if (!!before.enabled !== !!after.enabled || Number(before.port) !== Number(after.port)) {
      companion.stop();
      if (after.enabled) await companion.start();
    }
    return r;
  };
  for (const k of Object.keys(mine)) if (k !== "save_config" && !NAMES.includes(k)) throw new Error("host.js: " + k + " missing from NAMES");
  Object.assign(impl, mine);
  return { notifier, companion, updater, tray };
}

module.exports = { init, NAMES };
