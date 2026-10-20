// System tray icon (DONI-544): left click opens the window; the menu opens a world, starts a queue, pauses auto-accept, quits.
// Rebuilt on every right click, so it always shows the games you play, whether the client is up, and pause state.
const { Tray, Menu } = require("electron");

const WORLDS = [["league", "League of Legends", "#/league"], ["tft", "Teamfight Tactics", "#/tft"], ["deadlock", "Deadlock", "#/deadlock"]];
const QUEUES = { league: [420, 440, 400, 450], tft: [1090, 1100] };

// Facts → menu rows: {label, act, arg, enabled, checked, type, submenu}. Pure; app/test-tray.js checks it.
// f = { games, connected, paused, away, lastQueue, names: {queueId: name} }
function trayItems(f) {
  const name = (id) => f.names[id] || `Queue ${id}`;
  const queues = [...(f.games.includes("league") ? QUEUES.league : []), ...(f.games.includes("tft") ? QUEUES.tft : [])];
  const items = [{ label: "Open queuePop", act: "open" }, { type: "separator" }];
  for (const [g, label, hash] of WORLDS) if (f.games.includes(g)) items.push({ label, act: "open", arg: hash });
  if (queues.length) {
    items.push({ type: "separator" });
    if (!f.connected) items.push({ label: "Queue up (League client closed)", enabled: false });
    else {
      if (f.lastQueue) items.push({ label: `Queue again: ${name(f.lastQueue)}`, act: "queue", arg: f.lastQueue });
      items.push({ label: "Start a queue", submenu: queues.map((id) => ({ label: name(id), act: "queue", arg: id })) });
    }
  }
  items.push({ type: "separator" }, { label: "I'm stepping away", act: "away", type: "checkbox", checked: !!f.away },
    { label: "Auto-accept paused", act: "pause", type: "checkbox", checked: !!f.paused, enabled: !f.away }, { type: "separator" }, { label: "Quit queuePop", act: "quit" });
  return items;
}

// ctx: { win, icon, state, push, quit, lcu, getConfig, startQueue, names }
function createTray(ctx) {
  const tray = new Tray(ctx.icon);
  const show = (hash) => {
    if (ctx.win.isMinimized()) ctx.win.restore();
    ctx.win.show(); ctx.win.focus();
    if (hash) ctx.win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`).catch(() => {});
  };
  const ACT = {
    open: show,
    queue: async (id) => {
      const r = await ctx.startQueue(id).catch((e) => ({ ok: false, error: e.message }));
      if (r && r.ok === false) ctx.push(`Couldn't start the queue: ${r.error}`, "warning");
    },
    pause: () => {
      ctx.state.paused = !ctx.state.paused;
      ctx.push(ctx.state.paused ? "Auto-accept paused" : "Auto-accept resumed", ctx.state.paused ? "warning" : "success");
    },
    away: () => ctx.setAway && ctx.setAway(!ctx.state.away),
    quit: ctx.quit,
  };
  const toMenu = (rows) => rows.map((r) => r.type === "separator" ? r : {
    label: r.label, type: r.type, checked: r.checked, enabled: r.enabled !== false,
    ...(r.submenu ? { submenu: toMenu(r.submenu) } : { click: () => r.act && ACT[r.act](r.arg) }),
  });
  const facts = () => {
    const cfg = ctx.getConfig();
    const games = Array.isArray(cfg.games_enabled) && cfg.games_enabled.length ? cfg.games_enabled : WORLDS.map((w) => w[0]);
    return { games, connected: ctx.lcu.connected, paused: ctx.state.paused, away: !!ctx.state.away, lastQueue: Number(cfg.last_queue_id) || null, names: ctx.names };
  };
  const tip = () => `queuePop · ${ctx.lcu.connected ? "League client connected" : "League client not running"}${ctx.state.paused ? " · auto-accept paused" : ""}`;
  tray.setToolTip("queuePop");
  tray.on("click", () => show());
  tray.on("right-click", () => { tray.setToolTip(tip()); tray.popUpContextMenu(Menu.buildFromTemplate(toMenu(trayItems(facts())))); });
  tray.on("mouse-move", () => tray.setToolTip(tip()));
  return tray;
}

module.exports = { createTray, trayItems };
