/* The PLAY button (launch client / quick-queue / cancel / live), the pause
   toggle, and the quick-queue dropdown. */

$("pause-btn").addEventListener("click", async () => {
  const status = await api().get_status();
  const paused = await api().set_paused(!status.paused);
  renderPause(paused);
});

function renderPause(paused) {
  const label = $("pause-label");
  if (label) label.textContent = paused ? "Resume" : "Pause";
  const btn = $("pause-btn");
  if (btn) btn.style.color = paused ? "#C8983C" : ""; // gold4 when paused
  const ico = $("pause-ico");
  if (ico) {
    ico.innerHTML = paused
      ? '<path d="M3 2.2 L10 6 L3 9.8 Z" />' // play (resume)
      : '<rect x="2.6" y="2" width="2.3" height="8" rx="0.4" />' +
        '<rect x="7.1" y="2" width="2.3" height="8" rx="0.4" />'; // pause bars
  }
}

// --- PLAY button (launch client / quick-queue / cancel) ----------------
// Mode is set by updatePlay() from the live gameflow phase.
function updatePlay(s) {
  const btn = $("play-btn");
  const label = $("play-label");
  if (!btn || !label) return;
  let text = "PLAY", mode = "queue", disabled = false;
  if (!s.connected) {
    text = "LAUNCH"; mode = "launch"; // no client → launch it
  } else {
    switch (s.gameflow_phase) {
      case "Matchmaking": text = "IN QUEUE"; mode = "cancel"; break;
      case "ReadyCheck": text = "READY"; mode = "none"; disabled = true; break;
      case "ChampSelect": text = "LIVE"; mode = "live"; break; // jump to live view

      case "InProgress": text = "IN GAME"; mode = "none"; disabled = true; break;
      case "PreEndOfGame":
      case "WaitingForStats":
      case "EndOfGame": text = "PLAY"; mode = "queue"; break;
      default: text = "PLAY"; mode = "queue"; // None / Lobby / idle
    }
  }
  label.textContent = text;
  // Shrink the banner text for longer states so it stays inside the tag.
  label.setAttribute("font-size", text.length <= 4 ? "21" : text.length <= 6 ? "17" : "14");
  btn.disabled = disabled;
  btn.dataset.mode = mode;
  if (mode === "queue") btn.title = "Choose a queue";
}

QP.bus.on("status", (s) => {
  updatePlay(s);
  renderPause(s.paused);
});

$("play-btn").addEventListener("click", async () => {
  const mode = $("play-btn").dataset.mode || "launch";
  if (mode === "launch") {
    closeQueueMenu();
    await api().launch_league();
  } else if (mode === "cancel") {
    closeQueueMenu();
    await api().cancel_queue();
    refreshStatus();
  } else if (mode === "live") {
    closeQueueMenu();
    showLiveView();
  } else if (mode === "queue") {
    toggleQueueMenu();
  }
});

// --- Quick-queue dropdown -----------------------------------------------
// Built from get_quick_queues() → {queues, groups, favorites, last, show_last}.
// Clicking PLAY opens the dropdown: a flat, uncluttered list of just the modes
// you chose to show (stored in favorite_queue_ids). If "show last played" is on,
// your most recent mode is pinned on top. An Edit toggle flips to a grouped,
// sorted catalog where you pick which modes appear and toggle the last-played pin.
let qmQueues = [];      // [{id, name, group, ranked}] — curated quick queues
let qmGroups = [];      // [{key, label}] section order (edit mode only)
let qmShown = [];       // [queueId] the user chose to show (persisted as favorites)
let qmLast = null;      // most recently started queue id
let qmShowLast = true;  // pin the last-played mode on top of the dropdown
let qmEditing = false;  // dropdown is in "choose modes" edit mode

// Inline SVG glyphs (currentColor). Row icons key off the queue's group.
const QM_ICONS = {
  favorites:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3.1l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.2l5.8-.8z"/></svg>',
  rift:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M9.5 17.5 21 6V3h-3L6.5 14.5"/><path d="M5 13l6 6"/><path d="M8 16l-4 4"/><path d="M5 21l-2-2"/></svg>',
  aram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>',
  featured:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l1.7 4.9 4.9 1.7-4.9 1.7L12 15.7l-1.7-4.9-4.9-1.7 4.9-1.7z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
  tft:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9l3 2.5L12 5l5 6.5L20 9l-1.5 9h-13z"/><path d="M5.5 18h13"/></svg>',
};
const QM_STAR =
  '<svg viewBox="0 0 24 24"><path d="M12 3.1l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8L3.6 9.2l5.8-.8z"/></svg>';
const QM_CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 7 7 7-7"/></svg>';
const QM_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const QM_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

function qmGroupIcon(key) { return QM_ICONS[key] || QM_ICONS.rift; }
function qmQueueById(id) { return qmQueues.find((q) => q.id === Number(id)); }
// Drop a redundant leading group label so the catalog doesn't read
// "Teamfight Tactics ..." on every TFT row. "Teamfight Tactics (Ranked)" → "Ranked".
function qmStripPrefix(name, label) {
  const n = (name || "").trim();
  const l = (label || "").trim();
  if (l && n.toLowerCase().startsWith(l.toLowerCase())) {
    let rest = n.slice(l.length).replace(/^[\s:·\-–—]+/, "").trim();
    rest = rest.replace(/^\((.*)\)$/, "$1").trim();
    if (rest) return rest;
  }
  return n;
}

async function buildQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  let data = {};
  try { data = (await api().get_quick_queues()) || {}; } catch (_) {}
  qmQueues = data.queues || [];
  qmGroups = data.groups || [];
  qmShown = (data.favorites || []).filter((id) => qmQueueById(id));
  qmLast = qmQueueById(data.last) ? Number(data.last) : null;
  qmShowLast = data.show_last !== false; // default on
  renderQueueMenu();
  // One delegated handler survives every re-render of the panel's innards.
  menu.addEventListener("click", onQueueMenuClick);
}

function qmRowHtml(q, idx, opts) {
  opts = opts || {};
  const pill = opts.replay
    ? '<span class="qm-pill qm-last">LAST</span>'
    : (q.ranked ? '<span class="qm-pill">RANKED</span>' : "");
  return (
    `<button type="button" class="qm-row${opts.replay ? " qm-replay" : ""}" ` +
      `data-qid="${q.id}" style="--i:${idx}">` +
      `<span class="qm-row-content">` +
        `<span class="qm-ico">${qmGroupIcon(q.group)}</span>` +
        `<span class="qm-name">${q.name}</span>` +
        pill +
      `</span>` +
    `</button>`
  );
}

// Normal view: last-played on top (optional), then the chosen modes (or, until
// the user curates any, the full curated list so the menu is never empty). Flat,
// no group headers, no sorting — order is the user's pick / the backend's order.
function qmNormalInner() {
  const last = qmShowLast && qmLast != null ? qmQueueById(qmLast) : null;
  let chosen = qmShown.map(qmQueueById).filter(Boolean);
  if (!chosen.length) chosen = qmQueues.slice();
  if (last) chosen = chosen.filter((q) => q.id !== last.id);

  let rows = last ? qmRowHtml(last, 0, { replay: true }) : "";
  rows += chosen.map((q, i) => qmRowHtml(q, i + 1)).join("");
  if (!rows) {
    rows = '<div class="qm-empty">No modes shown. Tap <span class="qm-empty-star">✎ Edit</span> to choose some.</div>';
  }
  return (
    '<div class="qm-title"><span>Play</span>' +
      `<button type="button" class="qm-edit" data-edit="1">${QM_EDIT}<span>Edit</span></button>` +
    "</div>" +
    `<div class="qm-list">${rows}</div>`
  );
}

// Edit view: the full catalog grouped + sorted, each row a toggle for whether
// it shows in the normal view. Group prefix stripped from names for clarity.
function qmEditInner() {
  let secs = "";
  for (const g of qmGroups) {
    const qs = qmQueues.filter((q) => q.group === g.key);
    if (!qs.length) continue;
    secs +=
      `<div class="qm-egroup"><div class="qm-ehead">${g.label}</div>` +
      qs.map((q) => {
        const on = qmShown.includes(q.id);
        const nm = qmStripPrefix(q.name, g.label);
        return (
          `<button type="button" class="qm-erow${on ? " on" : ""}" data-toggle="${q.id}">` +
            `<span class="qm-echeck">${on ? QM_CHECK : ""}</span>` +
            `<span class="qm-ename">${nm}</span>` +
            (q.ranked ? '<span class="qm-pill">RANKED</span>' : "") +
          "</button>"
        );
      }).join("") +
      "</div>";
  }
  const lastToggle =
    '<button type="button" class="qm-opt" data-showlast="1">' +
      `<span class="qm-optcheck${qmShowLast ? " on" : ""}">${qmShowLast ? QM_CHECK : ""}</span>` +
      '<span class="qm-optlabel">Always show last played mode on top</span>' +
    "</button>";
  return (
    '<div class="qm-title"><span>Choose modes</span>' +
      '<button type="button" class="qm-edit" data-done="1"><span>Done</span></button>' +
    "</div>" +
    `<div class="qm-elist">${lastToggle}${secs}</div>`
  );
}

function qmInner() { return qmEditing ? qmEditInner() : qmNormalInner(); }

// Full (re)build — used on open. The panel wraps a single .qm-view that
// swapQueueView() crossfades when flipping between Play and Edit.
function renderQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  menu.innerHTML = `<div class="qm-panel"><div class="qm-view">${qmInner()}</div></div>`;
}

// Smooth Play↔Edit swap: float the old view out of flow and fade it, drop the
// new view in faded/offset, and tween the panel height between the two. Avoids
// the hard innerHTML "cut".
function swapQueueView() {
  const menu = $("queue-menu");
  const panel = menu && menu.querySelector(".qm-panel");
  const oldView = panel && panel.querySelector(".qm-view:not(.qm-view-out)");
  if (!panel || !oldView) { renderQueueMenu(); return; }

  const startH = panel.offsetHeight;

  const newView = document.createElement("div");
  newView.className = "qm-view qm-view-in";
  newView.innerHTML = qmInner();

  oldView.classList.add("qm-view-out"); // position:absolute + fades to 0
  panel.appendChild(newView);

  // Measure the panel's natural height with the new view, then animate to it
  // from the locked start height. (box-sizing:border-box ⇒ offsetHeight == the
  // height we set, so this is exact regardless of padding/border.)
  panel.style.height = "auto";
  const endH = panel.offsetHeight;
  panel.style.height = startH + "px";
  panel.getBoundingClientRect();          // reflow so the next change animates
  panel.style.height = endH + "px";
  requestAnimationFrame(() => newView.classList.remove("qm-view-in"));

  clearTimeout(panel._swapT);
  panel._swapT = setTimeout(() => {
    oldView.remove();
    panel.style.height = ""; // back to auto for content-driven sizing
  }, 320);
}

// Toggle whether a mode shows in the normal view (persisted as favorites).
async function toggleShown(id, rowEl) {
  id = Number(id);
  if (qmShown.includes(id)) qmShown = qmShown.filter((x) => x !== id);
  else qmShown.push(id);
  const on = qmShown.includes(id);
  if (rowEl) {
    rowEl.classList.toggle("on", on);
    const chk = rowEl.querySelector(".qm-echeck");
    if (chk) chk.innerHTML = on ? QM_CHECK : "";
  }
  try { await api().set_favorites(qmShown); } catch (_) {}
}

async function startQuickQueue(id) {
  qmEditing = false;
  closeQueueMenu();
  await api().start_queue(id);
  qmLast = Number(id);
  refreshStatus(); // flip PLAY → IN QUEUE
}

// Toggle the "always show last played on top" preference.
async function toggleShowLast(el) {
  qmShowLast = !qmShowLast;
  if (el) {
    el.classList.toggle("on", qmShowLast);
    el.innerHTML = qmShowLast ? QM_CHECK : "";
  }
  try { await api().set_show_last_queue(qmShowLast); } catch (_) {}
}

function onQueueMenuClick(e) {
  // The menu rewrites its own innerHTML on Edit/Done, which detaches the clicked
  // node — so stop the click here, or the document outside-click handler would
  // see a detached target, think the click was outside, and close the menu.
  e.stopPropagation();
  if (e.target.closest("[data-edit]")) { qmEditing = true; swapQueueView(); return; }
  if (e.target.closest("[data-done]")) { qmEditing = false; swapQueueView(); return; }
  const showlast = e.target.closest("[data-showlast]");
  if (showlast) { toggleShowLast(showlast.querySelector(".qm-optcheck")); return; }
  const tog = e.target.closest("[data-toggle]");
  if (tog) { toggleShown(tog.dataset.toggle, tog); return; }
  const row = e.target.closest(".qm-row");
  if (row) startQuickQueue(row.dataset.qid);
}
function openQueueMenu() {
  const menu = $("queue-menu");
  const btn = $("play-btn");
  if (!menu || !btn) return;
  // The menu is position:fixed at the body level, so place it under PLAY.
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.round(r.left) + "px";
  menu.style.top = Math.round(r.bottom + 4) + "px";
  menu.classList.remove("hidden");
  btn.classList.add("menu-open"); // keep PLAY illuminated while choosing a queue
}
function toggleQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  if (menu.classList.contains("hidden")) openQueueMenu();
  else closeQueueMenu();
}
function closeQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  menu.classList.add("hidden");
  $("play-btn")?.classList.remove("menu-open");
  if (qmEditing) { qmEditing = false; renderQueueMenu(); } // reopen in normal view
}
// Click outside closes the queue menu. The PLAY button toggles it via its own
// handler; clicks inside the menu call stopPropagation, so they never reach here.
document.addEventListener("click", (e) => {
  const menu = $("queue-menu");
  const btn = $("play-btn");
  if (!menu || menu.classList.contains("hidden")) return;
  if (menu.contains(e.target)) return;
  if (btn && btn.contains(e.target)) return;
  closeQueueMenu();
});

QP._loaded.push("features/play");
