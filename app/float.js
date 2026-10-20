// Floating suggestions (DONI-346): during champ select the main window sits behind the League client, so a small
// always-on-top window shows the draft suggestions and the timer over it. It opens without taking focus when champ select
// starts (config float_window, default on), closes when champ select ends, and remembers where you put it.
const path = require("path");
const { BrowserWindow, screen, shell } = require("electron");
const { windowState } = require("./window-state");

// The float may only read: no settings, no actions. Checked by main.js's bridge guard.
const FLOAT_METHODS = new Set(["get_champ_select", "pick_suggestions", "get_config", "get_champion_catalog", "close_float"]);

// ctx: { preload, args, getConfig, userData, log }
function createFloat(ctx) {
  let win = null, dismissed = false;
  const ws = windowState(path.join(ctx.userData, "float-state.json"), [300, 220]);
  function open() {
    if (win || dismissed || ctx.getConfig().float_window === false) return;
    win = new BrowserWindow({
      width: 380, height: 320, ...ws.options(screen), minWidth: 300, minHeight: 220, frame: false, alwaysOnTop: true,
      skipTaskbar: true, show: false, backgroundColor: "#0A0A0A", title: "queuePop suggestions",
      webPreferences: { preload: ctx.preload, contextIsolation: true, sandbox: true, nodeIntegration: false, additionalArguments: ctx.args },
    });
    win.setAlwaysOnTop(true, "screen-saver"); // above the League client, which is itself a topmost-ish window
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: "deny" }; });
    win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) e.preventDefault(); });
    win.once("ready-to-show", () => win && win.showInactive()); // never steals focus from the client
    win.on("closed", () => { win = null; });
    ws.track(win);
    win.loadFile(path.join(__dirname, "..", "src", "webui", "float.html"));
    ctx.log("float: opened");
  }
  function close() { if (win) { win.close(); win = null; } }
  // Follow the gameflow phase: open in champ select, close otherwise. ✕ on the float hides it until the next champ select.
  function sync(phase) {
    if (phase === "ChampSelect") open();
    else { dismissed = false; close(); }
  }
  return { sync, id: () => (win && !win.isDestroyed() ? win.webContents.id : null), dismiss: () => { dismissed = true; close(); return true; } };
}

module.exports = { createFloat, FLOAT_METHODS };
