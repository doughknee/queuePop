// Window size, position and maximised state across launches (DONI-539), in userData/window-state.json; config.json is
// shared with the Python app and saved whole by the renderer, so it is the wrong home for something that changes per drag.
const fs = require("fs");
const path = require("path");

// Saved bounds if at least 120 x 80 px of the title area lands on some display's work area (a monitor that was unplugged
// or a resolution change must not open the window off screen), clamped to the minimum size; otherwise null.
function fitBounds(saved, workAreas, min = [1280, 720]) {
  if (!saved || ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite)) return null;
  const b = { x: Math.round(saved.x), y: Math.round(saved.y), width: Math.max(min[0], Math.round(saved.width)), height: Math.max(min[1], Math.round(saved.height)) };
  const top = { x: b.x, y: b.y, width: b.width, height: 80 };
  const seen = workAreas.some((a) => Math.min(top.x + top.width, a.x + a.width) - Math.max(top.x, a.x) >= 120 && Math.min(top.y + top.height, a.y + a.height) - Math.max(top.y, a.y) >= 40);
  return seen ? b : null;
}

function windowState(file) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch {}
  return {
    // BrowserWindow options to merge: bounds when they still fit, plus whether to maximise once shown.
    options(screen) {
      const b = fitBounds(saved, screen.getAllDisplays().map((d) => d.workArea));
      return b || {};
    },
    maximized: () => !!saved.maximized,
    // Track a window: normal bounds while not maximised, and the flag; written 400 ms after the last change.
    track(win) {
      let t = null;
      const save = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          if (win.isDestroyed() || win.isMinimized()) return;
          saved = { ...(win.isMaximized() ? saved : win.getBounds()), maximized: win.isMaximized() };
          try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(saved)); } catch {}
        }, 400);
      };
      for (const ev of ["resize", "move", "maximize", "unmaximize"]) win.on(ev, save);
    },
  };
}

module.exports = { fitBounds, windowState };
