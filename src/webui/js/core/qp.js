/* queuePop UI core: the QP namespace, tiny pubsub bus, and shared utilities.
   Loaded first. All UI files are classic scripts sharing one global scope —
   top-level const/let here are visible everywhere. Cross-module communication
   should prefer QP.bus / QP.store; shared helpers live here. */

window.QP = {
  _loaded: [], // module names, asserted against the manifest in boot.js

  // Minimal pubsub: QP.bus.on("status", fn) / QP.bus.emit("status", payload).
  bus: {
    _subs: {},
    on(evt, fn) {
      (this._subs[evt] ||= []).push(fn);
    },
    off(evt, fn) {
      this._subs[evt] = (this._subs[evt] || []).filter((f) => f !== fn);
    },
    emit(evt, payload) {
      for (const fn of this._subs[evt] || []) {
        try { fn(payload); } catch (e) { console.error(`bus handler (${evt}):`, e); }
      }
    },
  },
};

const api = () => window.pywebview.api;
const $ = (id) => document.getElementById(id);

// Retrigger a CSS animation by removing the class, forcing reflow, re-adding.
function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function flashPop() {
  replay($("flash"), "go");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }
}

function flashStatus(el, text, ok) {
  el.textContent = text;
  el.className = "text-xs " + (ok ? "text-gold2" : "text-red-400");
}

QP._loaded.push("core/qp");
