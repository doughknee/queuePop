// System tray icon: open / pause / exit. Port of src/tray.py.
const { Tray, Menu } = require("electron");

// ctx: { win, icon, state, push, quit }
function createTray(ctx) {
  const tray = new Tray(ctx.icon);
  const show = () => { ctx.win.show(); ctx.win.focus(); };
  tray.setToolTip("queuePop");
  tray.on("click", show);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open queuePop", click: show },
    { type: "separator" },
    { label: "Pause/Resume", click: () => {
      ctx.state.paused = !ctx.state.paused;
      ctx.push(ctx.state.paused ? "Monitoring paused" : "Monitoring resumed", ctx.state.paused ? "warning" : "success");
    } },
    { type: "separator" },
    { label: "Exit", click: ctx.quit },
  ]));
  return tray;
}

module.exports = { createTray };
