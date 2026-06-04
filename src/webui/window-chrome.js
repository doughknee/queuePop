/* Frameless window chrome — minimize / maximize / close + edge resize.
   The window is created frameless (main.py), so this draws-as-native: it drives
   the pywebview window through the methods exposed in web_api.py. Dragging is
   handled by pywebview itself via the .pywebview-drag-region class on the bar. */
(function () {
  const api = () => (window.pywebview && window.pywebview.api) || null;
  const $ = (id) => document.getElementById(id);

  // Keep in sync with main.py min_size / web_api.py MIN_WINDOW_SIZE.
  const MIN_W = 620;
  const MIN_H = 700;

  const ICON_MAXIMIZE =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">' +
    '<rect x="2.2" y="2.2" width="7.6" height="7.6" /></svg>';
  // Two offset squares = the familiar "restore down" glyph.
  const ICON_RESTORE =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2">' +
    '<rect x="2.2" y="3.6" width="6.2" height="6.2" />' +
    '<path d="M4 3.6 V2 H10 V8 H8.4" /></svg>';

  let maximized = false;

  function applyMaxState() {
    const btn = $("win-max");
    if (btn) {
      btn.innerHTML = maximized ? ICON_RESTORE : ICON_MAXIMIZE;
      btn.title = maximized ? "Restore" : "Maximize";
      btn.setAttribute("aria-label", btn.title);
    }
    document.body.classList.toggle("maximized", maximized);
  }

  async function toggleMaximize() {
    const a = api();
    if (!a) return;
    maximized = !!(await a.toggle_maximize_window());
    applyMaxState();
  }

  function wireButtons() {
    $("win-min") && ($("win-min").onclick = () => api() && api().minimize_window());
    // Closing hides to the tray (matches the old native ✕ → on_closing behaviour).
    $("win-close") && ($("win-close").onclick = () => api() && api().hide_window());
    $("win-max") && ($("win-max").onclick = toggleMaximize);
    // Double-clicking the draggable header areas toggles maximize, like a
    // native title bar.
    document
      .querySelectorAll(".pywebview-drag-region")
      .forEach((el) => el.addEventListener("dblclick", toggleMaximize));
  }

  // --- Edge / corner resize ------------------------------------------------
  // Track the pointer in screen coordinates and resize the window so the edge
  // opposite the one under the cursor stays pinned (web_api.resize_window maps
  // the dragged edge to the right FixPoint). rAF-throttled to one call/frame.
  function wireResize() {
    document.querySelectorAll(".resize-grip").forEach((grip) => {
      let drag = null;
      let pending = null;
      let raf = 0;

      const flush = () => {
        raf = 0;
        if (drag && pending && api()) api().resize_window(pending.w, pending.h, drag.edge);
        pending = null;
      };

      grip.addEventListener("pointerdown", (e) => {
        if (maximized || e.button !== 0) return;
        e.preventDefault();
        grip.setPointerCapture(e.pointerId);
        drag = {
          edge: grip.dataset.edge,
          startX: e.screenX,
          startY: e.screenY,
          startW: window.innerWidth,
          startH: window.innerHeight,
        };
      });

      grip.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.screenX - drag.startX;
        const dy = e.screenY - drag.startY;
        let w = drag.startW;
        let h = drag.startH;
        if (drag.edge.includes("e")) w = drag.startW + dx;
        if (drag.edge.includes("w")) w = drag.startW - dx;
        if (drag.edge.includes("s")) h = drag.startH + dy;
        if (drag.edge.includes("n")) h = drag.startH - dy;
        pending = { w: Math.max(MIN_W, Math.round(w)), h: Math.max(MIN_H, Math.round(h)) };
        if (!raf) raf = requestAnimationFrame(flush);
      });

      const end = (e) => {
        if (!drag) return;
        drag = null;
        try {
          grip.releasePointerCapture(e.pointerId);
        } catch (_) {}
      };
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
  }

  function init() {
    wireButtons();
    wireResize();
    applyMaxState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
