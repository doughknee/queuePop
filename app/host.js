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
const { attachTimeline } = require("./timeline");
const { createAway } = require("./stepping-away");
const config = require("./config");

app.setAppUserModelId("com.doughknee.queuepop"); // matches the electron-builder appId so toasts carry our name/icon
if (!app.requestSingleInstanceLock()) app.exit(0);

const ICON = path.join(__dirname, "..", "assets", "queuepop.ico");
const START = Date.now();

// Bridge methods implemented here. The preload builds window.pywebview.api from METHODS plus these.
const NAMES = ["get_status", "get_stats", "test_desktop", "test_discord", "test_companion", "get_companion_info", "get_update_status",
  "check_for_update", "get_release_notes", "apply_update", "get_summoner", "get_queue_map", "get_quick_queues", "start_queue", "cancel_queue",
  "launch_league", "get_champion_mastery", "get_match_history", "get_tft_match_history", "open_external", "open_config_folder", "pick_sound_file", "hide_window",
  "minimize_window", "resize_window", "test_alert", "new_companion_link", "set_stepping_away"];

function init({ win, lcu, state, events, impl, loadConfig, configFile, push, log, version }) {
  let quitting = false;
  const quit = () => { quitting = true; app.quit(); };
  app.on("before-quit", () => { quitting = true; });
  app.on("second-instance", () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });

  // Close hides to the tray unless Settings > App says the ✕ quits (close_to_tray false); tray Quit always quits.
  win.on("close", (e) => { if (!quitting && loadConfig().close_to_tray !== false) { e.preventDefault(); win.hide(); } else quitting = true; });
  if (loadConfig().start_minimized) win.hide();
  // Launch at login (DONI-544): applied at start and whenever Settings saves it. A dev run registers electron.exe + this app.
  const loginItem = (on) => {
    try { app.setLoginItemSettings(app.isPackaged ? { openAtLogin: !!on } : { openAtLogin: !!on, path: process.execPath, args: [app.getAppPath()] }); }
    catch (e) { log("launch at login:", e.message); }
  };
  if (app.getLoginItemSettings().openAtLogin !== !!loadConfig().launch_at_login) loginItem(loadConfig().launch_at_login);

  const notifier = createNotifier({ getConfig: loadConfig, push, log, icon: ICON, Notification,
    onClick: () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
  const timeline = attachTimeline({ lcu, push, notifier, getConfig: loadConfig }); // DONI-423
  const away = createAway(state, push); // DONI-424
  const companion = createCompanion({
    webRoot: path.join(__dirname, "..", "src", "webui"), events, getConfig: loadConfig, push,
    status: () => ({ connected: lcu.connected, paused: state.paused, timeline: timeline.status(), away: away.status().on,
      ready: state.ready && state.ready.state === "InProgress" ? { response: state.ready.playerResponse, timer: state.ready.timer } : null }),
    setAway: (on) => away.set(on),
    // DONI-337: Decline from the phone (penalty-free; the escape hatch when real life interrupts). Token-gated like all /api/*.
    decline: async () => {
      if (!lcu.connected) return { ok: false, error: "The League client isn't running" };
      if (!state.ready || state.ready.state !== "InProgress") return { ok: false, error: "There's no match to decline right now" };
      const r = await lcu.request("post", "/lol-matchmaking/v1/ready-check/decline").catch((e) => ({ status: e.message }));
      const ok = r.status >= 200 && r.status < 300;
      push(ok ? "Match declined from your phone" : `Decline from your phone failed (${r.status})`, ok ? "warning" : "danger", "match");
      return ok ? { ok } : { ok, error: `The client said ${r.status}` };
    },
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
  const tray = createTray({ win, icon: ICON, state, push, quit, lcu, getConfig: loadConfig, startQueue: account.startQueue, names: QUEUE_ID_MAP, setAway: (on) => away.set(on) });

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
  // DONI-328: one random token per install (kept in config.json), in every QR link; a new one cuts off every phone.
  const newToken = () => {
    try { const cfg = config.get(); cfg.companion = { ...(cfg.companion || {}), token: require("crypto").randomBytes(16).toString("hex") }; config.save(cfg); return true; }
    catch (e) { log("companion token:", e.message); return false; }
  };
  if (!/^[0-9a-f]{16,64}$/.test(String(cfgComp().token || ""))) newToken();
  const mine = {
    get_status: () => {
      const cfg = loadConfig();
      return {
        connected: lcu.connected, gameflow_phase: state.phase, paused: state.paused,
        webhook_configured: !!cfg.webhook_url, user_id: cfg.user_id || "", desktop_notifications: !!cfg.desktop_notifications,
        champ_select_enabled: !!(cfg.champ_select || {}).enabled, allowed_queue_count: (cfg.allowed_queue_ids || []).length,
        champions_loaded: 0, companion_enabled: !!cfgComp().enabled, companion_running: companion.isRunning(),
        companion_clients: companion.clientCount(), alert_last: { ...notifier.lastSent }, version, stepping_away: away.status(),
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
    new_companion_link: () => ({ ok: newToken() }),
    set_stepping_away: (on) => away.set(on),
    // One button, the real path (DONI-544): what a queue pop sends, through every channel that is on. -> {ok, channels}
    test_alert: async () => {
      const cfg = loadConfig(), channels = [];
      if (cfg.desktop_notifications) channels.push("Windows");
      if (cfg.webhook_url && (cfg.discord_enabled ?? true)) channels.push("Discord");
      if (companion.isRunning()) { channels.push("your phone"); push("Test queue pop", "danger", "queue_pop"); }
      await notifier.alert("queue_pop", "Queue Popped! (test)", "This is what a queue pop looks like. Nothing was accepted.", "Test queue pop", { test: true, queue: "Test" });
      return { ok: channels.length > 0, channels };
    },
    get_companion_info: async () => {
      const port = companion.boundPort() || Number(cfgComp().port) || DEFAULT_PORT;
      const ip = await lanIp();
      // A phone can't reach 127.0.0.1: no link and no QR rather than one that can never work (DONI-328).
      if (/^127\./.test(ip)) return { enabled: !!cfgComp().enabled, port, lan_ip: ip, url: "", no_lan: true, running: companion.isRunning(), qr: "" };
      const url = `http://${ip}:${port}/?t=${cfgComp().token || ""}`;
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
    hide_window: () => { win.close(); return true; }, // the close handler above hides to the tray or quits (close_to_tray)
    minimize_window: () => { win.minimize(); return true; },
    resize_window: (width, height, edge = "se") => {
      const b = win.getBounds(), [minW, minH] = win.getMinimumSize();
      const w = Math.max(minW, Math.round(width)), h = Math.max(minH, Math.round(height)), e = String(edge).toLowerCase();
      // Pin the edge opposite the one under the cursor.
      win.setBounds({ x: e.includes("w") ? b.x + b.width - w : b.x, y: e.includes("n") ? b.y + b.height - h : b.y, width: w, height: h });
      return true;
    },
  };
  // Settings apply at once: the phone companion restarts when it's switched or its port changes (DONI-543), launch at login
  // follows its switch (DONI-544).
  const saveConfig = impl.save_config;
  if (saveConfig) mine.save_config = async (c) => {
    const before = cfgComp(), r = await saveConfig(c), after = cfgComp();
    const cfg = loadConfig();
    if (app.getLoginItemSettings().openAtLogin !== !!cfg.launch_at_login) loginItem(cfg.launch_at_login);
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
