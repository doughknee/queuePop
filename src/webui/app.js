/* queuePop web UI logic, talks to Python via pywebview.api */

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

let lastEventId = 0;
let roles = [];
let queueMap = {}; // queueId -> display name
let catalog = []; // [{id, name, alias}]
let nameToId = {}; // lowercased name/alias -> id
let plan = {}; // role -> { bans: [name], picks: [name], spells: [id, id] }
let spellList = []; // [{id, name}] summoner spells for the per-role pickers
let activeRole = null; // currently edited role
let activeMode = "picks"; // "picks" | "bans", what the grid adds to
let activeSort = "az"; // "az" | "mastery" | "recent", grid ordering of unselected champs
let masteryById = {}; // championId -> { level, points, lastPlayTime }
let runePageList = []; // user's saved rune pages, loaded live for the loadout editor
let loadoutRole = null; // role whose loadout is open in the editor
let loadoutChamp = 0; // championId whose loadout is open
let customSoundPath = ""; // absolute path to the user's custom alarm file
let previewCtx = null; // lazily-created AudioContext for Settings sound preview

// --- Champion asset helpers --------------------------------------------
function champIcon(name) {
  const id = nameToId[(name || "").toLowerCase()];
  return id ? `assets/champions/${id}.png` : null;
}
function initials(name) {
  return (
    (name || "?")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
function resolveName(raw) {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return null;
  const c =
    catalog.find((c) => c.name.toLowerCase() === key) ||
    catalog.find((c) => (c.alias || "").toLowerCase() === key);
  return c ? c.name : null;
}
function idToName(id) {
  const c = catalog.find((c) => c.id === Number(id));
  return c ? c.name : null;
}

// --- Rank / mastery formatting -----------------------------------------
const TIER_COLORS = {
  IRON: "#7c7166", BRONZE: "#a05a36", SILVER: "#9fb0c2", GOLD: "#e2b24a",
  PLATINUM: "#4ec1b0", EMERALD: "#2faa64", DIAMOND: "#6aa0ff",
  MASTER: "#b552d6", GRANDMASTER: "#e0584f", CHALLENGER: "#f0d27a",
};
const APEX_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);
function tierColor(t) { return TIER_COLORS[(t || "").toUpperCase()] || "#A09B8C"; }
function titleCase(s) { return s ? s.charAt(0) + s.slice(1).toLowerCase() : s; }
// "Gold III" / "Master" (apex tiers have no division); optionally " · 45 LP".
function rankLabel(r, withLp) {
  if (!r || !r.tier) return "";
  const t = titleCase(r.tier);
  const div = APEX_TIERS.has(r.tier.toUpperCase()) ? "" : (r.division || "");
  let s = div ? `${t} ${div}` : t;
  if (withLp && typeof r.lp === "number") s += ` · ${r.lp} LP`;
  return s;
}
function fmtPoints(n) {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}
function spellName(id) {
  const s = spellList.find((s) => s.id === Number(id));
  return s ? s.name : "";
}

// Rank comparison so the badge can show the player's *highest* current rank.
const TIER_ORDER = [
  "IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD",
  "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER",
];
const DIV_VALUE = { I: 4, II: 3, III: 2, IV: 1 };
function rankScore(r) {
  if (!r || !r.tier) return -1;
  const ti = TIER_ORDER.indexOf(r.tier.toUpperCase());
  if (ti < 0) return -1;
  // Apex tiers have no division, they rank purely by LP.
  const div = APEX_TIERS.has(r.tier.toUpperCase())
    ? 0
    : DIV_VALUE[(r.division || "").toUpperCase()] || 0;
  return ti * 1e5 + div * 1e4 + (r.lp || 0);
}
function highestRank(ranked) {
  ranked = ranked || {};
  const cands = [ranked.solo, ranked.flex, ranked.tft, ranked.double_up].filter(Boolean);
  if (!cands.length) return null;
  return cands.reduce((a, b) => (rankScore(b) > rankScore(a) ? b : a));
}

// --- Mastery helpers ----------------------------------------------------
function masteryOf(id) { return masteryById[Number(id)]; }
// Compact "time since" for the Recent sort (epoch ms -> "today"/"3d"/"2w"/…).
function fmtAgo(ms) {
  if (!ms || ms <= 0) return "";
  const days = (Date.now() - ms) / 86400000;
  if (days < 1) return "today";
  if (days < 7) return Math.floor(days) + "d";
  if (days < 30) return Math.floor(days / 7) + "w";
  if (days < 365) return Math.floor(days / 30) + "mo";
  return Math.floor(days / 365) + "y";
}

// --- Route nav (icon tabs + the live route) ----------------------------
// "live" is a routeless tab: it has no nav icon and is reached via the PLAY→LIVE
// button, which glows while it's the active view (see .play-btn.live-active).
let activeTab = "dashboard";
function activateTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-route").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("tab-live").classList.toggle("hidden", tab !== "live");
  $("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
  $("tab-champ").classList.toggle("hidden", tab !== "champ");
  $("tab-settings").classList.toggle("hidden", tab !== "settings");
  $("tab-account").classList.toggle("hidden", tab !== "account");
  replay($(`tab-${tab}`), "fade-up");
  // The PLAY button doubles as the live-route indicator; the summoner badge
  // doubles as the account-route indicator.
  $("play-btn").classList.toggle("live-active", tab === "live");
  $("summoner-btn").classList.toggle("route-active", tab === "account");
  // Refresh live rune-page status when entering Settings.
  if (tab === "settings" && typeof refreshRuneInfo === "function") refreshRuneInfo();
  if (tab === "account" && typeof refreshAccount === "function") refreshAccount();
}
document.querySelectorAll(".nav-route").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// --- Pause toggle (title-strip indicator) ------------------------------
let lastConnected = null; // tracks client connect/disconnect transitions

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
    text = "PLAY"; mode = "launch"; // no client → launch it
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
  label.setAttribute("font-size", text.length > 5 ? "14" : "21");
  btn.disabled = disabled;
  btn.dataset.mode = mode;
  if (mode === "queue") btn.title = "Choose a queue";
}

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

// --- Live summoner badge -----------------------------------------------
async function refreshSummoner() {
  const btn = $("summoner-btn");
  if (!btn) return;
  let info = {};
  try { info = (await api().get_summoner()) || {}; } catch (_) { info = {}; }
  const nameEl = $("summoner-name");
  const lvlEl = $("summoner-level");
  const rankEl = $("summoner-rank");
  const img = $("summoner-icon");
  const ph = $("summoner-ph");
  if (info.connected && info.name) {
    btn.classList.remove("offline");
    nameEl.textContent = info.name;
    btn.title = info.tag ? `${info.name} #${info.tag}` : info.name;
    // Ranked players get their highest current rank in place of the level;
    // unranked players keep the level. (:empty CSS collapses the unused line.)
    const hi = highestRank(info.ranked);
    if (hi) {
      lvlEl.textContent = "";
      if (rankEl) {
        rankEl.textContent = rankLabel(hi, false);
        rankEl.style.color = tierColor(hi.tier);
      }
    } else {
      lvlEl.textContent = info.level ? `Level ${info.level}` : "";
      if (rankEl) rankEl.textContent = "";
    }
    if (info.icon) {
      img.src = info.icon; img.classList.remove("hidden"); ph.classList.add("hidden");
    } else {
      img.classList.add("hidden"); ph.classList.remove("hidden");
    }
    btn.dataset.opgg = info.opgg || "";
  } else {
    btn.classList.add("offline");
    nameEl.textContent = "Offline";
    lvlEl.textContent = "";
    if (rankEl) rankEl.textContent = "";
    img.classList.add("hidden"); ph.classList.remove("hidden");
    btn.dataset.opgg = "";
    btn.title = "";
  }
  renderProfile(info);
}

// One ranked-queue row (rank, record, win-rate bar). Shared by the dashboard
// profile and the account route.
function rankedRowHtml(label, r) {
  if (!r) {
    return `<div class="pr-row"><span class="pr-q">${label}</span>` +
      `<div class="pr-mid"><span class="pr-unranked">Unranked</span></div></div>`;
  }
  const col = tierColor(r.tier);
  const wins = r.wins || 0, losses = r.losses || 0, games = wins + losses;
  const wr = games ? Math.round((wins / games) * 100) : 0;
  return (
    `<div class="pr-row"><span class="pr-q">${label}</span><div class="pr-mid">` +
      `<div class="pr-rankline">` +
        `<span class="pr-rank" style="color:${col}">${rankLabel(r, true)}</span>` +
        `<span class="pr-record">${games ? `${wins}W ${losses}L · ${wr}%` : "No games"}</span>` +
      `</div>` +
      (games ? `<span class="pr-bar"><span style="width:${wr}%;background:${col}"></span></span>` : "") +
    `</div></div>`
  );
}

// Dashboard profile: portrait + name, highest rank, a ranked breakdown with
// win-rate bars, and top-5 champion mastery. Hidden unless the client is
// connected and there's at least one thing to show.
function renderProfile(info) {
  const panel = $("profile-panel");
  if (!panel) return;
  const ranked = (info && info.ranked) || {};
  const mastery = (info && info.mastery) || [];
  const hasRanked = ranked.solo || ranked.flex || ranked.tft || ranked.double_up;
  if (!info || !info.connected || (!hasRanked && !mastery.length)) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  // Header: portrait, name (#tag), highest current rank.
  const icon = $("profile-icon");
  if (info.icon) { icon.src = info.icon; icon.style.visibility = ""; }
  else icon.style.visibility = "hidden";
  $("profile-name").textContent = info.name || "Summoner";
  const hi = highestRank(ranked);
  const tier = $("profile-tier");
  if (hi) {
    tier.textContent = rankLabel(hi, true);
    tier.style.color = tierColor(hi.tier);
  } else {
    tier.textContent = "Unranked";
    tier.style.color = "";
  }

  // Solo + Flex always render (everyone has an SR ladder); TFT / Doubles only
  // when ranked, so non-TFT players don't get stray "Unranked" rows.
  $("profile-ranked").innerHTML =
    rankedRowHtml("Solo", ranked.solo) +
    rankedRowHtml("Flex", ranked.flex) +
    (ranked.tft ? rankedRowHtml("TFT", ranked.tft) : "") +
    (ranked.double_up ? rankedRowHtml("Doubles", ranked.double_up) : "");

  $("profile-mastery").innerHTML = mastery
    .slice(0, 5)
    .map((m) => {
      const name = idToName(m.championId) || "";
      const pts = (m.points || 0).toLocaleString();
      const lvl = m.level ?? "";
      const high = (m.level || 0) >= 10 ? " high" : "";
      return (
        `<span class="pm-champ" title="${name}, Mastery ${m.level ?? "?"} · ${pts} pts">` +
          `<span class="pm-portrait">` +
            `<img src="assets/champions/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
            `<span class="pm-lvl${high}">${lvl}</span>` +
          `</span>` +
          `<span class="pm-pts">${fmtPoints(m.points)}</span>` +
        `</span>`
      );
    })
    .join("");
}
$("summoner-btn").addEventListener("click", () => {
  activateTab("account");
});

// --- Account route ------------------------------------------------------
// Reached by clicking the summoner badge. Shows a copyable Riot ID, live stats
// (ranked + mastery + recent matches), and region-aware links to every major
// tracker site (built server-side from the Riot ID).
const QUEUE_SHORT = {
  420: "Ranked Solo/Duo", 440: "Ranked Flex", 430: "Blind Pick", 400: "Draft Pick",
  490: "Quickplay", 450: "ARAM", 2400: "ARAM Mayhem", 700: "Clash", 1700: "Arena", 1900: "URF",
  900: "ARURF", 1090: "TFT", 1100: "Ranked TFT", 1160: "TFT Double Up", 830: "Co-op vs AI",
  840: "Co-op vs AI", 850: "Co-op vs AI",
};
function queueLabel(qid) {
  return QUEUE_SHORT[qid] || queueMap[qid] || (qid ? "Queue " + qid : "Custom");
}

async function refreshAccount() {
  let info = {};
  try { info = (await api().get_summoner()) || {}; } catch (_) {}
  const off = $("account-offline"), content = $("account-content");
  if (!info.connected) {
    off.classList.remove("hidden");
    content.classList.add("hidden");
    return;
  }
  off.classList.add("hidden");
  content.classList.remove("hidden");

  // Riot ID block.
  const icon = $("acct-icon");
  if (info.icon) { icon.src = info.icon; icon.style.visibility = ""; }
  else icon.style.visibility = "hidden";
  $("acct-name").textContent = info.name || "Summoner";
  $("acct-tag").textContent = info.tag ? "#" + info.tag : "";
  const hi = highestRank(info.ranked);
  const tier = $("acct-tier");
  if (hi) { tier.textContent = rankLabel(hi, true); tier.style.color = tierColor(hi.tier); }
  else { tier.textContent = "Unranked"; tier.style.color = ""; }
  $("acct-level").textContent = info.level ? "Level " + info.level : "";
  $("acct-region").textContent = (info.region || "").toUpperCase();
  $("acct-copy-id").dataset.riot = info.tag ? `${info.name}#${info.tag}` : info.name || "";
  $("acct-opgg").dataset.url = info.opgg || "";

  // Ranked breakdown (shared row builder with the dashboard profile).
  const ranked = info.ranked || {};
  $("acct-ranked").innerHTML =
    rankedRowHtml("Solo", ranked.solo) +
    rankedRowHtml("Flex", ranked.flex) +
    (ranked.tft ? rankedRowHtml("TFT", ranked.tft) : "") +
    (ranked.double_up ? rankedRowHtml("Doubles", ranked.double_up) : "");

  // External site links.
  $("acct-links").innerHTML = (info.links || [])
    .map(
      (li) =>
        `<button type="button" class="acct-link" data-url="${li.url}">` +
        `<span>${li.name}</span><span class="acct-link-go">↗</span></button>`,
    )
    .join("");

  renderAccountMastery();
  renderAccountMatches();
}

async function renderAccountMastery() {
  const wrap = $("acct-mastery");
  let mastery = [];
  try { mastery = (await api().get_champion_mastery()) || []; } catch (_) {}
  mastery.sort((a, b) => (b.points || 0) - (a.points || 0));
  if (!mastery.length) {
    wrap.innerHTML = `<p class="text-sm text-subText">Mastery data loads once the client has synced.</p>`;
    return;
  }
  wrap.innerHTML = mastery
    .slice(0, 15)
    .map((m) => {
      const name = idToName(m.championId) || "";
      const high = (m.level || 0) >= 10 ? " high" : "";
      return (
        `<span class="acct-champ" title="${name}, Mastery ${m.level ?? "?"} · ${(m.points || 0).toLocaleString()} pts">` +
          `<span class="acct-champ-portrait">` +
            `<img src="assets/champions/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
            `<span class="pm-lvl${high}">${m.level ?? ""}</span>` +
          `</span>` +
          `<span class="acct-champ-name">${name}</span>` +
          `<span class="acct-champ-pts">${fmtPoints(m.points)}</span>` +
        `</span>`
      );
    })
    .join("");
}

async function renderAccountMatches() {
  const panel = $("acct-matches-panel"), wrap = $("acct-matches");
  let matches = [];
  try { matches = (await api().get_match_history(10)) || []; } catch (_) {}
  if (!matches.length) { panel.classList.add("hidden"); return; }
  panel.classList.remove("hidden");
  wrap.innerHTML = matches
    .map((m) => {
      const name = idToName(m.championId) || "";
      const kda = `${m.kills}/${m.deaths}/${m.assists}`;
      return (
        `<div class="acct-match ${m.win ? "win" : "loss"}">` +
          `<img class="acct-match-champ" src="assets/champions/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
          `<div class="acct-match-main">` +
            `<span class="acct-match-q">${name || queueLabel(m.queueId)}</span>` +
            `<span class="acct-match-kda">${queueLabel(m.queueId)} · ${kda}</span>` +
          `</div>` +
          `<span class="acct-match-res">${m.win ? "WIN" : "LOSS"}</span>` +
          `<span class="acct-match-time">${fmtAgoShort(m.ts)}</span>` +
        `</div>`
      );
    })
    .join("");
}

// Open a tracker site / OP.GG in the browser.
$("acct-links").addEventListener("click", (e) => {
  const b = e.target.closest(".acct-link");
  if (b && b.dataset.url) api().open_external(b.dataset.url);
});
$("acct-opgg").addEventListener("click", () => {
  const u = $("acct-opgg").dataset.url;
  if (u) api().open_external(u);
});
$("acct-copy-id").addEventListener("click", async () => {
  const ok = await copyText($("acct-copy-id").dataset.riot || "");
  const lbl = $("acct-copy-id").querySelector(".acct-copy-label");
  if (lbl) {
    const orig = lbl.textContent;
    lbl.textContent = ok ? "Copied!" : "Failed";
    setTimeout(() => (lbl.textContent = orig), 1400);
  }
});

// --- Live champ-select takeover ----------------------------------------
// While gameflow_phase == ChampSelect, the dashboard swaps to a live read-only
// view of both teams, bans, trades, and the ARAM bench (get_champ_select()).
let champLiveTimer = null;
let inChampSelect = false;

const SPELL_SHORT = {
  4: "Flash", 14: "Ignite", 12: "TP", 11: "Smite", 7: "Heal",
  3: "Exhaust", 21: "Barrier", 6: "Ghost", 1: "Cleanse", 13: "Clarity", 32: "Snowball",
};
function spellShort(id) { return SPELL_SHORT[Number(id)] || spellName(id) || ""; }
function champIconById(id) { return id ? `assets/champions/${id}.png` : null; }

// The live view is its own route. Champ select starting auto-navigates to it and
// begins polling; the PLAY→LIVE button returns to it; the panel's "Dashboard"
// button drops back to the dashboard while staying in champ select.
function enterChampSelect() {
  if (inChampSelect) return;
  inChampSelect = true;
  activateTab("live");
  refreshChampLive();
  if (!champLiveTimer) champLiveTimer = setInterval(refreshChampLive, 700);
}
function exitChampSelect() {
  if (!inChampSelect && !champLiveTimer) return;
  inChampSelect = false;
  if (champLiveTimer) { clearInterval(champLiveTimer); champLiveTimer = null; }
  // Don't strand the user on the (now-empty) live route.
  if (activeTab === "live") activateTab("dashboard");
}
function showLiveView() { activateTab("live"); }   // PLAY = LIVE
$("champ-live").addEventListener("click", (e) => {
  if (e.target.closest("#cs-to-dash")) activateTab("dashboard");
});

async function refreshChampLive() {
  let cs = {};
  try { cs = (await api().get_champ_select()) || {}; } catch (_) { return; }
  if (!cs.active) return; // session not ready yet; keep showing the last frame
  renderChampLive(cs);
}

function csPortrait(p) {
  // Locked champ → solid icon; hovered intent → dashed + dimmed; else empty.
  const locked = p.championId > 0;
  const id = locked ? p.championId : p.intent;
  const icon = champIconById(id);
  const cls = "cs-portrait" + (!locked && p.intent > 0 ? " intent" : "");
  const img = icon
    ? `<img src="${icon}" onerror="this.style.visibility='hidden'" />`
    : "";
  return `<div class="${cls}">${img}</div>`;
}

function csRow(p) {
  const locked = p.championId > 0;
  const name = locked ? p.name : p.intent > 0 ? p.intentName : "";
  const nameCls = "cs-name" + (locked ? "" : " pending");
  const nameTxt = name || (p.intent > 0 ? "Hovering…" : "Picking…");
  const role = p.position
    ? `<img class="cs-role" src="assets/positions/${p.position}.svg" onerror="this.style.display='none'" />`
    : "";
  const spells = [p.spell1Id, p.spell2Id]
    .filter((s) => s > 0)
    .map(
      (s) =>
        `<img class="cs-spell-ico" src="assets/spells/${s}.png" title="${spellShort(s)}" ` +
        `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'cs-spell',textContent:'${spellShort(s)}'}))" />`,
    )
    .join("");
  return (
    `<div class="cs-row${p.isLocal ? " local" : ""}${name ? "" : " empty"}">` +
      csPortrait(p) +
      role +
      `<div class="cs-meta">` +
        `<span class="${nameCls}">${nameTxt}</span>` +
        (spells ? `<span class="cs-spells">${spells}</span>` : "") +
      `</div>` +
    `</div>`
  );
}

function csMini(c, ban) {
  const icon = champIconById(c.championId);
  return (
    `<div class="cs-mini${ban ? " ban" : ""}" title="${c.name || ""}">` +
      (icon ? `<img src="${icon}" onerror="this.style.visibility='hidden'" />` : "") +
    `</div>`
  );
}

function renderChampLive(cs) {
  const phase = (cs.phase || "Champ Select").replace(/_/g, " ");

  const bansMy = (cs.bans?.my || []).map((b) => csMini(b, true)).join("");
  const bansTheir = (cs.bans?.their || []).map((b) => csMini(b, true)).join("");
  const bansStrip =
    bansMy || bansTheir
      ? `<div class="cs-strip"><span class="cs-strip-label">Bans</span>${bansMy}` +
        (bansMy && bansTheir ? `<span class="text-subText px-1">·</span>` : "") +
        `${bansTheir}</div>`
      : "";

  const trades = (cs.trades || [])
    .map(
      (tr) =>
        `<span class="cs-trade">${tr.name || "Cell " + tr.cellId}` +
        `<span class="st">${(tr.state || "").toLowerCase()}</span></span>`,
    )
    .join("");
  const tradesStrip = trades
    ? `<div class="cs-strip"><span class="cs-strip-label">Trades</span>${trades}</div>`
    : "";

  const bench = cs.bench || {};
  const benchStrip =
    bench.enabled && (bench.champions || []).length
      ? `<div class="cs-strip cs-bench"><span class="cs-strip-label">Bench</span>` +
        bench.champions.map((c) => csMini(c, false)).join("") +
        `</div>`
      : "";

  $("champ-live").innerHTML =
    `<div class="cs-head">` +
      `<span class="cs-phase">${phase}</span>` +
      `<button id="cs-to-dash" type="button" class="cs-dash-btn">Dashboard ▸</button>` +
    `</div>` +
    `<div class="cs-teams">` +
      `<div><div class="cs-team-title mine">Your Team</div>` +
        (cs.myTeam || []).map(csRow).join("") +
      `</div>` +
      `<div><div class="cs-team-title theirs">Enemy Team</div>` +
        ((cs.theirTeam || []).length
          ? cs.theirTeam.map(csRow).join("")
          : `<div class="text-subText text-sm italic px-2 py-1">Hidden</div>`) +
      `</div>` +
    `</div>` +
    bansStrip + tradesStrip + benchStrip;
}

// --- Hero "right now" state (from the live gameflow phase) ---------------
const HERO_ICONS = {
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 18.4A9 9 0 0 0 5.6 5.6m12.8 12.8A9 9 0 0 1 5.6 5.6m12.8 12.8L5.6 5.6"/></svg>',
  idle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  lobby: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 13h6l-1 9 10-12h-6z"/></svg>',
  swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M7 12h3M8.5 10.5v3"/><circle cx="16" cy="11" r="1"/><circle cx="18.5" cy="13.5" r="1"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>',
};
function heroLiveState(s) {
  if (!s.connected) return { t: "Client offline", ico: HERO_ICONS.off };
  switch (s.gameflow_phase) {
    case "Matchmaking": return { t: "In queue…", ico: HERO_ICONS.search };
    case "ReadyCheck": return { t: "Queue popped!", ico: HERO_ICONS.bolt };
    case "ChampSelect": return { t: "Champ select", ico: HERO_ICONS.swords };
    case "InProgress": return { t: "In game", ico: HERO_ICONS.game };
    case "PreEndOfGame":
    case "WaitingForStats":
    case "EndOfGame": return { t: "Game ending…", ico: HERO_ICONS.flag };
    case "Lobby": return { t: "In lobby", ico: HERO_ICONS.lobby };
    default: return { t: "Idle, ready", ico: HERO_ICONS.idle };
  }
}

// --- Status polling -----------------------------------------------------
async function refreshStatus() {
  try {
    const s = await api().get_status();
    const ver = $("version");
    if (ver) ver.textContent = s.version;

    // PLAY reflects the live gameflow phase; summoner badge refreshes on
    // connect/disconnect transitions. (Client connection status is shown on
    // the dashboard hero strip via #hero-client below.)
    updatePlay(s);
    // Dashboard takeover: live champ-select view while we're in select.
    if (s.connected && s.gameflow_phase === "ChampSelect") enterChampSelect();
    else exitChampSelect();
    if (s.connected !== lastConnected) {
      lastConnected = s.connected;
      refreshSummoner();
      if (s.connected) loadMastery();
    }

    $("hero-status").textContent = s.paused ? "Paused" : "Monitoring";
    $("hero-status").classList.toggle("paused", !!s.paused);
    $("hero-dot").className =
      "hero-dot " + (s.paused ? "paused" : s.connected ? "live" : "");
    // "Right now", what the client/bot is actually doing.
    const live = heroLiveState(s);
    $("hero-live").textContent = live.t;
    $("hero-live-ico").innerHTML = live.ico;
    $("hero-conn-dot").classList.toggle("on", !!s.connected);
    $("hero-client").textContent = s.connected ? "Connected" : "Waiting…";

    const note = $("companion-note");
    if (note) {
      if (!s.companion_enabled) {
        note.textContent = "";
      } else if (!s.companion_running) {
        note.textContent = "Server not running, save settings, then restart queuePop.";
        note.className = "text-xs text-gold4";
      } else if (s.companion_clients > 0) {
        const n = s.companion_clients;
        note.textContent = `● ${n} phone${n > 1 ? "s" : ""} connected`;
        note.className = "text-xs text-gold2";
      } else {
        note.textContent = "Running, waiting for a phone to connect…";
        note.className = "text-xs text-subText";
      }
    }

    renderPause(s.paused);
  } catch (e) {
    /* window may be mid-teardown; ignore */
  }
}

// --- Activity feed ------------------------------------------------------
// All events are kept in JS (newest-last, capped) and rendered newest-first with
// category filters, relative timestamps, and a divider per game session (a new
// session begins at each queue pop). Re-rendering each poll keeps the relative
// times fresh; no per-row animation so it doesn't flicker on every render.
let activityLog = [];        // [{id, level, message, kind, ts}], chronological
let activityFilter = "all";  // all | match | champ | system
let firstActivityLoad = true;

// kind → filter category. Anything untagged falls to "system" (connect, companion,
// launch, save errors …), which is exactly where those belong.
const EV_CAT = {
  queue_pop: "match", match: "match", queue: "match",
  champ: "champ", spells: "champ", runes: "champ",
  trade: "champ", bench_swap: "champ", skin: "champ",
};
function eventCat(ev) { return EV_CAT[ev.kind] || "system"; }

const CAT_ICON = {
  match:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 13h6l-1 9 10-12h-6z"/></svg>',
  champ:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/></svg>',
  system:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
}
function fmtAgoShort(ts) {
  if (!ts) return "";
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 45) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
function fmtClock(ts) {
  if (!ts) return "";
  try { return new Date(ts * 1000).toLocaleString(); } catch (_) { return ""; }
}

function actRowHtml(ev) {
  const lvl = ev.level || "info";
  return (
    `<div class="act-row">` +
      `<span class="act-ico ${lvl}">${CAT_ICON[eventCat(ev)] || CAT_ICON.system}</span>` +
      `<span class="act-msg">${escapeHtml(ev.message)}</span>` +
      `<span class="act-time" title="${escapeHtml(fmtClock(ev.ts))}">${fmtAgoShort(ev.ts)}</span>` +
    `</div>`
  );
}

function renderActivity() {
  const body = $("activity");
  if (!body) return;
  // Session index per event (a new session starts at each queue pop). Computed
  // over the FULL log so filtering doesn't renumber sessions.
  const sessionOf = {}, sessionStart = {};
  let sess = 0;
  for (const ev of activityLog) {
    if (ev.kind === "queue_pop") { sess++; sessionStart[sess] = ev; }
    sessionOf[ev.id] = sess;
  }
  const shown = activityLog.filter(
    (ev) => activityFilter === "all" || eventCat(ev) === activityFilter,
  );
  if (!shown.length) {
    body.innerHTML = `<p class="act-empty">No events yet.</p>`;
    return;
  }
  const divider = (s) => {
    let label = "Earlier";
    if (s > 0) {
      const ev = sessionStart[s];
      const m = ev && ev.message.match(/Queue popped:\s*(.+?)\s*[, -]/i);
      label = (m ? m[1] : "Queue") + " · " + fmtAgoShort(ev && ev.ts);
    }
    return (
      `<div class="act-divider"><span class="ad-line"></span>` +
      `<span class="ad-label">${escapeHtml(label)}</span><span class="ad-line"></span></div>`
    );
  };
  const rows = [];
  let lastSess = null;
  for (let i = shown.length - 1; i >= 0; i--) { // newest-first
    const ev = shown[i];
    const s = sessionOf[ev.id];
    if (s !== lastSess) { rows.push(divider(s)); lastSess = s; }
    rows.push(actRowHtml(ev));
  }
  const st = body.scrollTop;
  body.innerHTML = rows.join("");
  body.scrollTop = st;
}

async function refreshEvents() {
  try {
    const { events } = await api().get_events(lastEventId);
    let popped = false;
    for (const ev of events) {
      lastEventId = Math.max(lastEventId, ev.id);
      activityLog.push(ev);
      if (ev.kind === "queue_pop" || /queue popped/i.test(ev.message)) popped = true;
    }
    while (activityLog.length > 200) activityLog.shift();
    renderActivity(); // also refreshes relative times when there are no new events
    if (popped && !firstActivityLoad) flashPop(); // celebrate, but not on backfill
    firstActivityLoad = false;
  } catch (e) {
    /* ignore */
  }
}

// Filter chips.
$("act-filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".act-filter");
  if (!btn) return;
  activityFilter = btn.dataset.cat;
  document
    .querySelectorAll("#act-filters .act-filter")
    .forEach((b) => b.classList.toggle("active", b === btn));
  renderActivity();
});

// --- Champion catalog (bundled, offline) -------------------------------
async function loadCatalog() {
  // Read via Python, WebView2 blocks fetch() of local files under file://.
  try {
    catalog = (await api().get_champion_catalog()) || [];
  } catch (e) {
    catalog = [];
  }
  nameToId = {};
  for (const c of catalog) {
    nameToId[c.name.toLowerCase()] = c.id;
    if (c.alias) nameToId[c.alias.toLowerCase()] = c.id;
  }
}

// Full champion mastery (for grid sorting + per-cell badges). Empty until the
// client is connected; refreshed on each connect so it reflects recent games.
async function loadMastery() {
  let list = [];
  try { list = (await api().get_champion_mastery()) || []; } catch (_) {}
  masteryById = {};
  for (const m of list) masteryById[Number(m.championId)] = m;
  // Repaint the grid if it's on screen so badges/sort reflect the new data.
  if (activeRole && !$("tab-champ").classList.contains("hidden")) {
    renderGrid($("champ-search").value);
  }
}

// --- Settings build (queues + role pickers) ----------------------------
const QP_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const QSEL_COLLAPSE_KEY = "qb_qsel_collapsed";
function qselLoadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(QSEL_COLLAPSE_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function qselSaveCollapsed(set) {
  try { localStorage.setItem(QSEL_COLLAPSE_KEY, JSON.stringify([...set])); } catch (_) {}
}

// Render the Allowed-Queues picker as collapsible, grouped sections. Each
// section has a select-all toggle; the checkboxes keep `data-queue` so
// loadConfigIntoForm / gatherConfig work unchanged.
function renderQueuePicker(queues, groups) {
  const wrap = $("queues");
  if (!wrap) return;
  const collapsed = qselLoadCollapsed();
  const order = groups && groups.length ? groups : [{ key: "other", label: "Other" }];
  let html = "";
  for (const g of order) {
    const qs = queues.filter((q) => q.group === g.key);
    if (!qs.length) continue;
    const isCol = collapsed.has(g.key);
    html +=
      `<div class="qsel-group${isCol ? " collapsed" : ""}" data-group="${g.key}">` +
        `<div class="qsel-head">` +
          `<button type="button" class="qsel-toggle" data-toggle="${g.key}">` +
            `<span class="qsel-chev">${QM_CHEVRON}</span>` +
            `<span class="qsel-label">${g.label}</span>` +
            `<span class="qsel-count">${qs.length}</span>` +
          `</button>` +
          `<button type="button" class="qsel-all" data-all="${g.key}">All</button>` +
        `</div>` +
        `<div class="qsel-body"><div class="queue-pills">` +
          qs.map((q) =>
            `<label class="qp" title="${q.name}">` +
              `<input type="checkbox" data-queue="${q.id}" data-grp="${g.key}" />` +
              `<span class="qp-check">${QP_CHECK}</span>` +
              `<span class="qp-name">${q.name}</span>` +
              (q.ranked ? `<span class="qp-rank">RANKED</span>` : "") +
            `</label>`
          ).join("") +
        `</div></div>` +
      `</div>`;
  }
  wrap.innerHTML = html || '<p class="set-row-hint">No queues available.</p>';
}

// One delegated handler: collapse a section, or toggle all of its checkboxes.
function onQueuePickerClick(e) {
  const toggle = e.target.closest(".qsel-toggle");
  if (toggle) {
    const key = toggle.dataset.toggle;
    const sec = $("queues")?.querySelector(`.qsel-group[data-group="${key}"]`);
    if (!sec) return;
    const collapsed = qselLoadCollapsed();
    if (sec.classList.toggle("collapsed")) collapsed.add(key);
    else collapsed.delete(key);
    qselSaveCollapsed(collapsed);
    return;
  }
  const all = e.target.closest(".qsel-all");
  if (all) {
    const boxes = [...$("queues").querySelectorAll(`input[data-grp="${all.dataset.all}"]`)];
    const turnOn = boxes.some((b) => !b.checked); // all-on ⇒ clear, else select all
    boxes.forEach((b) => { b.checked = turnOn; });
    return;
  }
}

async function buildSettings() {
  const data = (await api().get_queue_map()) || {};
  const queues = data.queues || [];
  const groups = data.groups || [];
  queueMap = {};
  for (const q of queues) queueMap[q.id] = q.name;
  renderQueuePicker(queues, groups);
  const wrap = $("queues");
  if (wrap && !wrap.dataset.bound) {
    wrap.dataset.bound = "1";
    wrap.addEventListener("click", onQueuePickerClick);
  }

  roles = await api().get_roles();
  try { spellList = (await api().get_summoner_spells()) || []; } catch (_) { spellList = []; }
  buildChampTab();
}

// --- Champ Select --------------------------------------------------------
// One grid does everything: every champion is shown, and the ones you've
// selected for the active list (Picks or Bans) are pulled to the front in
// priority order, ringed, and numbered. Click to add/remove; drag a numbered
// champ onto another to reorder priority. Search filters the whole grid.
// On-disk shape: champ_select.roles.<role>.{picks,bans}.

// Inline ARAM glyph (no position SVG exists for it), a 4-way poke/mirror mark.
const ARAM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>';

function buildChampTab() {
  const bar = $("role-bar");
  bar.innerHTML = "";
  for (const r of roles) {
    if (!plan[r.key]) plan[r.key] = { bans: [], picks: [], loadouts: {} };
    const short = r.label.replace(/\s*\(.*\)/, ""); // "Bottom (ADC)" -> "Bottom"
    const b = document.createElement("button");
    b.className = "role-tab";
    b.dataset.role = r.key;
    const icon =
      r.key === "aram"
        ? `<span class="role-ico">${ARAM_ICON}</span>`
        : `<span class="role-ico"><img src="assets/positions/${r.key}.svg" onerror="this.style.display='none'" /></span>`;
    b.innerHTML =
      icon +
      `<span class="role-label">${short}</span>` +
      `<span data-dot class="role-dot"></span>`;
    b.addEventListener("click", () => selectRole(r.key));
    bar.appendChild(b);
  }

  $("mode-picks").addEventListener("click", () => setMode("picks"));
  $("mode-bans").addEventListener("click", () => setMode("bans"));
  $("champ-search").addEventListener("input", (e) => renderGrid(e.target.value));
  $("goto-settings").addEventListener("click", () => activateTab("settings"));
  $("champ_enabled").addEventListener("change", (e) =>
    updateChampView(e.target.checked),
  );

  // Sort control: wire the segments and restore the last-used sort.
  document.querySelectorAll("#sort-seg .sort-opt").forEach((b) =>
    b.addEventListener("click", () => setSort(b.dataset.sort)),
  );
  let savedSort = "az";
  try { savedSort = localStorage.getItem("qb_champ_sort") || "az"; } catch (_) {}
  activeSort = SORTS.includes(savedSort) ? savedSort : "az";
  markSort(activeSort);

  wireGridEvents();
  setMode("picks");
}

function updateChampView(enabled) {
  $("champ-disabled").classList.toggle("hidden", enabled);
  $("champ-enabled-view").classList.toggle("hidden", !enabled);
}

function selectRole(role) {
  activeRole = role;
  document.querySelectorAll(".role-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.role === role);
  });
  // ARAM has no bans, hide the toggle and force Picks (its picks list doubles
  // as the bench-swap + trade priority order).
  const isAram = role === "aram";
  $("mode-bans").classList.toggle("hidden", isAram);
  if (isAram && activeMode === "bans") activeMode = "picks";
  setMode(activeMode); // refreshes mode buttons, hint, and the grid
}

function setMode(mode) {
  activeMode = mode;
  ["picks", "bans"].forEach((m) => {
    const btn = $(`mode-${m}`);
    const on = m === mode;
    btn.classList.toggle("text-gold1", on);
    btn.classList.toggle("border-gold2", on);
    btn.classList.toggle("text-icon", !on);
    btn.classList.toggle("border-transparent", !on);
  });
  const hint = $("champ-hint");
  if (hint) {
    if (activeRole === "aram") {
      hint.innerHTML =
        `Your ARAM <span class="text-gold2">priority list</span>, queuePop grabs ` +
        `the highest-ranked of these off the reroll bench (and trades toward it). ` +
        `Click to add; drag to reorder.`;
    } else {
      const isBan = mode === "bans";
      const word = isBan ? "bans" : "picks";
      const color = isBan ? "text-red-400" : "text-gold2";
      hint.innerHTML =
        `Click to add, your <span class="${color}">${word}</span> move to the front, ` +
        `numbered by priority. Drag a numbered champ onto another to reorder.`;
    }
  }
  renderGrid($("champ-search").value);
}

const SORTS = ["az", "mastery", "recent"];
function markSort(sort) {
  document.querySelectorAll("#sort-seg .sort-opt").forEach((b) =>
    b.classList.toggle("active", b.dataset.sort === sort),
  );
}
function setSort(sort) {
  activeSort = SORTS.includes(sort) ? sort : "az";
  markSort(activeSort);
  try { localStorage.setItem("qb_champ_sort", activeSort); } catch (_) {}
  renderGrid($("champ-search").value);
}

// Order the unselected champions by the active sort. Selected champs are never
// passed here, they stay pinned to the front in their priority order.
function sortChamps(arr) {
  const byName = (a, b) => a.name.localeCompare(b.name);
  if (activeSort === "mastery") {
    arr.sort(
      (a, b) =>
        ((masteryOf(b.id) || {}).points || 0) -
          ((masteryOf(a.id) || {}).points || 0) || byName(a, b),
    );
  } else if (activeSort === "recent") {
    arr.sort(
      (a, b) =>
        ((masteryOf(b.id) || {}).lastPlayTime || 0) -
          ((masteryOf(a.id) || {}).lastPlayTime || 0) || byName(a, b),
    );
  } else {
    arr.sort(byName);
  }
}

// Lower-edge overlay for a cell, shown only under the Mastery/Recent sorts (the
// A–Z view stays clean): a gold mastery-level chip plus a contextual stat, 
// points under Mastery, "time ago" under Recent.
function cellMeta(id) {
  if (activeSort !== "mastery" && activeSort !== "recent") return "";
  const m = masteryOf(id);
  if (!m) return "";
  let stat = "";
  if (activeSort === "mastery" && m.points) stat = fmtPoints(m.points);
  else if (activeSort === "recent" && m.lastPlayTime) stat = fmtAgo(m.lastPlayTime);
  const statHtml = stat ? `<span class="cm-stat">${stat}</span>` : "";
  const lvlHtml =
    m.level != null
      ? `<span class="cm-lvl${m.level >= 10 ? " cm-high" : ""}">${m.level}</span>`
      : "";
  return statHtml || lvlHtml ? `<span class="cell-meta">${statHtml}${lvlHtml}</span>` : "";
}

// Render all champions with the active list's selections pulled to the front
// (numbered, in priority order), then the rest by the active sort. Search
// filters everything. Bans tint red so they read apart from picks.
function renderGrid(filter) {
  const grid = $("champ-grid");
  if (!activeRole) return;
  const f = (filter || "").trim().toLowerCase();
  const isBan = activeMode === "bans";
  const selList = plan[activeRole][activeMode] || [];
  const selSet = new Set(selList.map((n) => n.toLowerCase()));

  const byName = (n) =>
    catalog.find((c) => c.name.toLowerCase() === n.toLowerCase());
  const selectedChamps = selList.map(byName).filter(Boolean);
  const rest = catalog.filter((c) => !selSet.has(c.name.toLowerCase()));
  sortChamps(rest);
  const ordered = selectedChamps.concat(rest);

  const frag = document.createDocumentFragment();
  ordered.forEach((c) => {
    if (
      f &&
      !c.name.toLowerCase().includes(f) &&
      !(c.alias || "").toLowerCase().includes(f)
    )
      return;
    const order = selList.findIndex(
      (n) => n.toLowerCase() === c.name.toLowerCase(),
    );
    const isSel = order >= 0;
    const cell = document.createElement("div");
    cell.className = "grid-cell" + (isSel ? " sel" + (isBan ? " ban" : "") : "");
    cell.dataset.name = c.name;
    cell.dataset.id = c.id;
    cell.title = c.name;
    if (isSel) cell.draggable = true;
    // Selected cells get a corner remove-X (on hover). Picks also get a teal dot
    // when a loadout is configured; clicking a pick's body opens its loadout.
    const hasLo = !isBan && !!(plan[activeRole].loadouts || {})[String(c.id)];
    const removeX = isSel
      ? `<span class="cell-x" title="Remove">` +
        `<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3.2" y1="3.2" x2="8.8" y2="8.8"/><line x1="8.8" y1="3.2" x2="3.2" y2="8.8"/></svg>` +
        `</span>`
      : "";
    const loDot = hasLo ? `<span class="cell-loadout" title="Loadout set"></span>` : "";
    // Selected picks get a hover overlay (scrim + gear) cueing "click to edit
    // the loadout". Click-through so the click still opens the loadout.
    const editOverlay =
      isSel && !isBan
        ? `<span class="cell-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>`
        : "";
    cell.innerHTML =
      `<img src="assets/champions/${c.id}.png" width="128" height="128" draggable="false" />` +
      editOverlay +
      (isSel ? `<span class="cell-num${isBan ? " ban" : ""}">${order + 1}</span>` : "") +
      cellMeta(c.id) +
      loDot +
      removeX;
    frag.appendChild(cell);
  });

  const st = grid.scrollTop;
  grid.innerHTML = "";
  grid.appendChild(frag);
  grid.scrollTop = st;
}

function toggleChamp(name) {
  const list = plan[activeRole][activeMode];
  const i = list.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  else list.push(name);
  updateBadge(activeRole);
  renderGrid($("champ-search").value);
  scheduleSave();
}

// A subtle gold dot on a role tab marks it as configured (picks/bans/loadouts).
function updateBadge(role) {
  const dot = document.querySelector(`.role-tab[data-role="${role}"] [data-dot]`);
  if (!dot) return;
  const rc = plan[role] || {};
  const p = (rc.picks || []).length;
  const bn = (rc.bans || []).length;
  const lo = Object.keys(rc.loadouts || {}).length;
  dot.classList.toggle("on", !!(p || bn || lo));
  dot.title = `${p} picks · ${bn} bans · ${lo} loadouts`;
}

function updateAllBadges() {
  for (const r of roles) updateBadge(r.key);
}

// Click a champion to add/remove it from the active list; drag a numbered
// (selected) champ onto another numbered champ to reorder priority.
function wireGridEvents() {
  const grid = $("champ-grid");
  let dragName = null;

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (!cell) return;
    // Corner X removes a selected champ.
    if (e.target.closest(".cell-x")) {
      e.stopPropagation();
      toggleChamp(cell.dataset.name);
      return;
    }
    // Clicking a selected PICK opens its loadout; everything else toggles
    // (add an unselected champ, or remove a selected ban).
    if (cell.classList.contains("sel") && activeMode === "picks") {
      openLoadout(activeRole, Number(cell.dataset.id));
    } else {
      toggleChamp(cell.dataset.name);
    }
  });
  grid.addEventListener("dragstart", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (!cell || !cell.draggable) return;
    dragName = cell.dataset.name;
    e.dataTransfer.effectAllowed = "move";
    cell.classList.add("drag-src");
  });
  grid.addEventListener("dragend", (e) => {
    e.target.closest(".grid-cell")?.classList.remove("drag-src");
    dragName = null;
  });
  grid.addEventListener("dragover", (e) => {
    if (dragName) e.preventDefault();
  });
  grid.addEventListener("drop", (e) => {
    if (!dragName) return;
    e.preventDefault();
    const cell = e.target.closest(".grid-cell");
    if (!cell || !cell.draggable) {
      dragName = null;
      return; // only reorder when dropping onto another selected champ
    }
    const list = plan[activeRole][activeMode];
    const from = list.findIndex(
      (n) => n.toLowerCase() === dragName.toLowerCase(),
    );
    const to = list.findIndex(
      (n) => n.toLowerCase() === cell.dataset.name.toLowerCase(),
    );
    if (from >= 0 && to >= 0 && from !== to) {
      const [m] = list.splice(from, 1);
      list.splice(to, 0, m);
      renderGrid($("champ-search").value);
      scheduleSave();
    }
    dragName = null;
  });
}

// --- Config load / gather ----------------------------------------------
async function loadConfig() {
  const c = await api().get_config();
  $("webhook_url").value = c.webhook_url || "";
  $("user_id").value = c.user_id || "";
  $("desktop_notifications").checked = !!c.desktop_notifications;

  const comp = c.companion || {};
  $("companion_enabled").checked = !!comp.enabled;
  $("companion_port").value = comp.port || 8420;
  $("companion_sound").value = comp.sound || "chime";
  customSoundPath = comp.sound_file || "";
  $("sound-file-name").textContent = customSoundPath
    ? customSoundPath.split(/[\\/]/).pop()
    : "No file chosen";
  toggleCustomSoundRow();
  refreshCompanion();

  const champEnabled = !!(c.champ_select && c.champ_select.enabled);
  $("champ_enabled").checked = champEnabled;
  $("instant_lock").checked = (c.champ_select && c.champ_select.instant_lock) ?? true;
  $("lock_seconds").value =
    (c.champ_select && c.champ_select.lock_in_at_seconds) ?? 1;
  updateLockDelayRow();
  const csCfg = c.champ_select || {};
  $("trades_enabled").checked = !!(csCfg.trades && csCfg.trades.enabled);
  $("aram_enabled").checked = !!(csCfg.aram && csCfg.aram.enabled);
  updateChampView(champEnabled);

  const allowedIds = (c.allowed_queue_ids || []).map(Number);
  const acceptAny = allowedIds.length === 0;
  $("queue_all").checked = acceptAny;
  $("queue-select").classList.toggle("hidden", acceptAny);
  const allowed = new Set(allowedIds);
  document.querySelectorAll("[data-queue]").forEach((cb) => {
    cb.checked = allowed.has(Number(cb.dataset.queue));
  });

  const rolesCfg = (c.champ_select && c.champ_select.roles) || {};
  for (const r of roles) {
    const rc = rolesCfg[r.key] || {};
    const loadouts = {};
    for (const [cid, lo] of Object.entries(rc.loadouts || {})) {
      loadouts[cid] = {
        spells: [...(lo.spells || [])],
        rune: lo.rune ?? "off",
        skin: Array.isArray(lo.skin) ? [...lo.skin] : lo.skin ?? "off",
      };
    }
    plan[r.key] = {
      bans: [...(rc.bans || [])],
      picks: [...(rc.picks || [])],
      loadouts,
    };
  }
  // selectRole re-renders both the plan chips and the catalog grid.
  selectRole(activeRole || roles[0]?.key);
  updateAllBadges();

  renderPlan(c);
}

function gatherConfig() {
  // "Auto-accept any queue" on ⇒ empty list (the backend treats [] as "all").
  // Off ⇒ only the specific queues the user ticked.
  const allowed = [];
  if (!$("queue_all").checked) {
    document.querySelectorAll("[data-queue]").forEach((cb) => {
      if (cb.checked) allowed.push(Number(cb.dataset.queue));
    });
  }

  const rolesOut = {};
  for (const r of roles) {
    rolesOut[r.key] = {
      bans: [...(plan[r.key]?.bans || [])],
      picks: [...(plan[r.key]?.picks || [])],
      loadouts: plan[r.key]?.loadouts || {},
    };
  }

  return {
    webhook_url: $("webhook_url").value,
    user_id: $("user_id").value,
    desktop_notifications: $("desktop_notifications").checked,
    allowed_queue_ids: allowed,
    companion: {
      enabled: $("companion_enabled").checked,
      port: Number($("companion_port").value) || 8420,
      sound: $("companion_sound").value,
      sound_file: customSoundPath || "",
    },
    champ_select: {
      enabled: $("champ_enabled").checked,
      instant_lock: $("instant_lock").checked,
      lock_in_at_seconds: Number($("lock_seconds").value) || 0,
      trades: { enabled: $("trades_enabled").checked },
      aram: { enabled: $("aram_enabled").checked },
      roles: rolesOut,
    },
  };
}

// --- Dashboard: champ-select plan --------------------------------------
// A visual per-role board: position, top pick + top ban portraits (with backup
// counts), and a loadout chip (spell icons / runes / skin) for the top pick.
function planChampHtml(name, ban) {
  const icon = champIcon(name);
  const media = icon
    ? `<img src="${icon}" onerror="this.style.visibility='hidden'" />`
    : `<span class="plan-champ-name">${initials(name)}</span>`;
  return `<span class="plan-champ${ban ? " ban" : ""}">${media}<span class="plan-champ-name">${name}</span></span>`;
}

function planLoadoutHtml(rc, pickName) {
  const id = nameToId[(pickName || "").toLowerCase()];
  const lo = id ? (rc.loadouts || {})[String(id)] : null;
  if (!lo) return "";
  const bits = [];
  for (const sid of lo.spells || [])
    bits.push(`<img src="assets/spells/${sid}.png" title="${spellName(sid)}" onerror="this.style.display='none'" />`);
  if (lo.rune && lo.rune !== "off") bits.push(`<span class="plan-lo-badge">Runes</span>`);
  if (lo.skin && lo.skin !== "off")
    bits.push(`<span class="plan-lo-badge">${Array.isArray(lo.skin) ? "Skins" : "Skin"}</span>`);
  return bits.length ? `<span class="plan-lo">${bits.join("")}</span>` : "";
}

function renderPlan(c) {
  const cs = c.champ_select || {};
  const rolesCfg = cs.roles || {};
  const panel = $("plan-panel");
  const wrap = $("plan");

  const trades = !!(cs.trades && cs.trades.enabled);
  const aram = !!(cs.aram && cs.aram.enabled);
  const aramPicks = ((rolesCfg.aram || {}).picks || []).length;
  const loCount = (rc) => Object.keys(rc.loadouts || {}).length;

  const configured = roles.filter((r) => {
    if (r.key === "aram") return false;
    const rc = rolesCfg[r.key] || {};
    return (rc.bans || []).length || (rc.picks || []).length || loCount(rc);
  });

  const showTable = cs.enabled && configured.length;
  if (!showTable && !(trades || aram)) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const slot = (label, name, count, ban) => {
    const extra = count > 1 ? `<span class="plan-extra">+${count - 1}</span>` : "";
    const body = name ? planChampHtml(name, ban) + extra : `<span class="plan-none">, </span>`;
    return `<span class="plan-slot"><span class="plan-slot-label">${label}</span>${body}</span>`;
  };

  let html = (showTable ? configured : [])
    .map((r) => {
      const rc = rolesCfg[r.key] || {};
      const pick = (rc.picks || [])[0];
      const ban = (rc.bans || [])[0];
      return (
        `<div class="plan-row">` +
          `<span class="plan-role"><img src="assets/positions/${r.key}.svg" onerror="this.style.display='none'" /><span>${r.label}</span></span>` +
          `<span class="plan-pb">` +
            slot("Pick", pick, (rc.picks || []).length, false) +
            slot("Ban", ban, (rc.bans || []).length, true) +
            planLoadoutHtml(rc, pick) +
          `</span>` +
        `</div>`
      );
    })
    .join("");

  const extras = [];
  if (trades) extras.push(["Trades", "Auto-trade toward a higher-priority pick"]);
  if (aram)
    extras.push([
      "ARAM",
      `Bench swap on${aramPicks ? ` · ${aramPicks} champ${aramPicks > 1 ? "s" : ""} ranked` : " · set your list"}`,
    ]);
  if (extras.length) {
    html +=
      `<div class="plan-extras-line">` +
      extras
        .map(([k, v]) => `<div class="plan-extra-row"><span class="k">${k}</span><span class="v">${v}</span></div>`)
        .join("") +
      `</div>`;
  }
  wrap.innerHTML = html;
}

// --- Phone companion + Discord ----------------------------------------
async function refreshCompanion() {
  const live = $("companion-live");
  if (!$("companion_enabled").checked) {
    live.classList.add("hidden");
    return;
  }
  live.classList.remove("hidden");

  let info = {};
  try {
    info = await api().get_companion_info();
  } catch (_) {}

  $("companion-url").textContent = info.url || "";
  const qrUrl = $("qr-url");
  if (qrUrl) qrUrl.textContent = info.url || "";
  const qr = $("companion-qr");
  if (info.qr) qr.src = info.qr;
  // #companion-note (live running / connected-device status) is owned by
  // refreshStatus so it updates on its own without re-fetching the QR.
}

function validateWebhook() {
  const v = $("webhook_url").value.trim();
  const hint = $("webhook_hint");
  if (!v || /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//i.test(v)) {
    hint.classList.add("hidden");
  } else {
    hint.textContent = "That doesn't look like a Discord webhook URL.";
    hint.classList.remove("hidden");
  }
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

function toggleCustomSoundRow() {
  const isCustom = $("companion_sound").value === "custom";
  $("custom-sound-row").classList.toggle("hidden", !isCustom);
}

$("companion_enabled").addEventListener("change", refreshCompanion);
$("companion_sound").addEventListener("change", toggleCustomSoundRow);

$("sound-preview").addEventListener("click", () => {
  const sel = $("companion_sound").value;
  const s = $("companion-test-status");
  if (sel === "custom") {
    flashStatus(s, "Save, then “Test phone alert” to hear a custom sound", false);
    setTimeout(() => (s.textContent = ""), 4000);
    return;
  }
  if (!previewCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    previewCtx = AC ? new AC() : null;
  }
  if (previewCtx && previewCtx.state === "suspended") previewCtx.resume();
  if (previewCtx && window.QueuePopAlarm) QueuePopAlarm.play(previewCtx, sel);
});

$("sound-pick").addEventListener("click", async () => {
  const res = await api().pick_sound_file();
  if (res && res.ok) {
    customSoundPath = res.path;
    $("sound-file-name").textContent = res.name || res.path;
  }
});

$("companion-copy").addEventListener("click", async () => {
  const ok = await copyText($("companion-url").textContent);
  const btn = $("companion-copy");
  const orig = btn.textContent;
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => (btn.textContent = orig), 1500);
});

// QR lives in a modal so it doesn't dominate the page.
$("companion-qr-btn").addEventListener("click", () => {
  refreshCompanion(); // make sure the QR/url are current
  $("qr-modal").classList.remove("hidden");
});
document.querySelectorAll("#qr-modal [data-qr-close]").forEach((el) =>
  el.addEventListener("click", () => $("qr-modal").classList.add("hidden")),
);

$("companion-test").addEventListener("click", async () => {
  const s = $("companion-test-status");
  flashStatus(s, "Sending…", true);
  s.className = "text-xs text-subText";
  const res = await api().test_companion();
  if (res && res.running) {
    flashStatus(s, "✓ Sent, your phone should alarm", true);
  } else {
    flashStatus(s, "Server isn't running yet, restart queuePop", false);
  }
  setTimeout(() => (s.textContent = ""), 4000);
});

$("discord-test").addEventListener("click", async () => {
  const s = $("discord-test-status");
  s.textContent = "Sending…";
  s.className = "text-xs text-subText";
  const res = await api().test_discord(
    $("webhook_url").value.trim(),
    $("user_id").value.trim(),
  );
  if (res && res.ok) flashStatus(s, "✓ Sent, check Discord", true);
  else flashStatus(s, "✗ " + ((res && res.error) || "Failed"), false);
  setTimeout(() => (s.textContent = ""), 5000);
});

$("discord-docs").addEventListener("click", () => {
  api().open_external(
    "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
  );
});

$("webhook_url").addEventListener("input", validateWebhook);

// Instant-lock toggle hides the "lock when N seconds left" delay row.
function updateLockDelayRow() {
  $("lock-delay-row").classList.toggle("hidden", $("instant_lock").checked);
}
$("instant_lock").addEventListener("change", updateLockDelayRow);

// --- Per-champ loadout editor (spells + rune page + skin) ----------------
// Opened from a selected pick's gear. Edits plan[role].loadouts[champId] live;
// empty loadouts are pruned on close. Disk shape is unchanged:
//   { spells:[id,id], rune:"off"|"recommended"|<pageId>,
//     skin:"off"|<skinId>(pick one)|[skinId,…](random favorite) }
let loSpellSlot = -1; // spell slot whose picker is open (-1 = none)
const skinCache = {}; // championId -> [{id,name,rarity,isBase}] (fetched once)

function curLoadout() {
  const los = plan[loadoutRole].loadouts || (plan[loadoutRole].loadouts = {});
  return (los[String(loadoutChamp)] ||= { spells: [], rune: "off", skin: "off" });
}

async function openLoadout(role, champId) {
  loadoutRole = role;
  loadoutChamp = Number(champId);
  loSpellSlot = -1;
  const lo = curLoadout();
  $("lo-name").textContent = idToName(loadoutChamp) || "";
  $("lo-role").textContent = (roles.find((r) => r.key === role) || {}).label || role;
  const icon = champIconById(loadoutChamp);
  $("lo-icon").src = icon || "";
  $("lo-icon").style.visibility = icon ? "" : "hidden";
  // Splash header = base-skin tile (championId * 1000); gracefully blank if absent.
  $("lo-hero-bg").style.backgroundImage = `url("assets/skins/tiles/${loadoutChamp * 1000}.jpg")`;

  renderSpellSlots(lo);
  $("lo-spell-pop").classList.add("hidden");
  buildLoadoutSkin(lo);
  $("loadout-modal").classList.remove("hidden");
  await buildLoadoutRunes(lo); // async (live client), fine to populate after show
}

function closeLoadout() {
  // Prune an empty loadout so the dot/indicator stays honest. A skin of 0 (Pick
  // mode, nothing chosen) or [] (empty favorites) counts as unset.
  const los = plan[loadoutRole]?.loadouts || {};
  const lo = los[String(loadoutChamp)];
  const skinOff =
    lo &&
    (lo.skin === "off" ||
      lo.skin === 0 ||
      (Array.isArray(lo.skin) && lo.skin.length === 0));
  if (lo && !(lo.spells || []).length && lo.rune === "off" && skinOff)
    delete los[String(loadoutChamp)];
  $("loadout-modal").classList.add("hidden");
  renderGrid($("champ-search").value); // refresh the loadout dot
  scheduleSave();
}

// --- Spells: two icon slots + an inline picker; the spell chosen in one slot
// is disabled in the other so you can't pick the same spell twice. ----------
function spellIcon(id) { return `assets/spells/${id}.png`; }

function renderSpellSlots(lo) {
  const spells = lo.spells || [];
  [0, 1].forEach((slot) => {
    const btn = $(`lo-spell-slot${slot}`);
    const id = spells[slot];
    btn.classList.toggle("active", loSpellSlot === slot);
    if (id) {
      btn.innerHTML =
        `<img src="${spellIcon(id)}" alt="${spellName(id)}" ` +
        `onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'lo-slot-empty',textContent:'+'}))" />`;
      btn.title = spellName(id);
    } else {
      btn.innerHTML = `<span class="lo-slot-empty">+</span>`;
      btn.title = "Choose a summoner spell";
    }
  });
}

function openSpellPicker(slot, lo) {
  loSpellSlot = slot;
  const other = lo.spells?.[slot === 0 ? 1 : 0];
  const cur = lo.spells?.[slot];
  const pop = $("lo-spell-pop");
  pop.innerHTML =
    spellList
      .map((s) => {
        const dis = s.id === other ? " disabled" : "";
        const sel = s.id === cur ? " sel" : "";
        return (
          `<div class="lo-spell-opt${sel}${dis}" data-spell="${s.id}" title="${s.name}">` +
          `<img src="${spellIcon(s.id)}" alt="${s.name}" /></div>`
        );
      })
      .join("") +
    (cur != null
      ? `<button type="button" class="lo-spell-clear">Clear this slot</button>`
      : "");
  pop.classList.remove("hidden");
  renderSpellSlots(lo); // light up the active slot
}

function setSpell(slot, id) {
  const lo = curLoadout();
  const arr = [lo.spells?.[0] ?? 0, lo.spells?.[1] ?? 0];
  arr[slot] = id; // id 0 clears the slot
  lo.spells = arr.filter((x) => x > 0); // compact (slot1, slot2), order preserved
  loSpellSlot = -1;
  $("lo-spell-pop").classList.add("hidden");
  renderSpellSlots(lo);
  scheduleSave();
}

document.querySelectorAll(".lo-spell-slot").forEach((btn) =>
  btn.addEventListener("click", () => {
    const slot = Number(btn.dataset.slot);
    const lo = curLoadout();
    if (loSpellSlot === slot) {
      loSpellSlot = -1; // clicking the open slot again closes the picker
      $("lo-spell-pop").classList.add("hidden");
      renderSpellSlots(lo);
    } else {
      openSpellPicker(slot, lo);
    }
  }),
);
$("lo-spell-pop").addEventListener("click", (e) => {
  if (e.target.closest(".lo-spell-clear")) { setSpell(loSpellSlot, 0); return; }
  const opt = e.target.closest(".lo-spell-opt");
  if (!opt || opt.classList.contains("disabled")) return;
  setSpell(loSpellSlot, Number(opt.dataset.spell));
});

// --- Runes: an enable toggle gates the page picker (off ⇒ rune:"off"). -------
async function buildLoadoutRunes(lo) {
  const on = lo.rune !== "off";
  $("lo-rune-on").checked = on;
  $("lo-rune-body").classList.toggle("hidden", !on);
  const sel = $("lo-rune");
  const hint = $("lo-rune-hint");
  try { runePageList = (await api().get_rune_pages()) || []; } catch (_) { runePageList = []; }
  let opts = '<option value="recommended">Client\'s recommended page</option>';
  for (const p of runePageList) opts += `<option value="${p.id}">${p.name}</option>`;
  // Preserve a saved page id even if the client is closed (page not listed).
  if (typeof lo.rune === "number" && !runePageList.some((p) => p.id === lo.rune))
    opts += `<option value="${lo.rune}">Saved page #${lo.rune}</option>`;
  sel.innerHTML = opts;
  sel.value = lo.rune === "off" ? "recommended" : String(lo.rune);
  hint.textContent = runePageList.length
    ? ""
    : "Open the League client to load your saved rune pages.";
  sel.onchange = () => {
    const v = sel.value;
    lo.rune = v === "recommended" ? v : Number(v);
    scheduleSave();
  };
}

$("lo-rune-on").addEventListener("change", () => {
  const lo = curLoadout();
  if ($("lo-rune-on").checked) {
    if (lo.rune === "off") lo.rune = "recommended";
    $("lo-rune-body").classList.remove("hidden");
    $("lo-rune").value = lo.rune === "recommended" ? "recommended" : String(lo.rune);
  } else {
    lo.rune = "off";
    $("lo-rune-body").classList.add("hidden");
  }
  scheduleSave();
});

// --- Skins: an enable toggle + two modes -----------------------------------
//   "Pick a skin"     → lo.skin is a single skin id; choosing one dims the rest.
//   "Random favorite" → lo.skin is an array of ids; queuePop picks one at random
//                       (from the ones you own) when the champ locks in.
// 0 / [] means "enabled but nothing chosen yet" (pruned to "off" on save).
function skinMode(lo) {
  if (Array.isArray(lo.skin)) return "favorite";
  if (typeof lo.skin === "number") return "pick";
  return ""; // "off"
}

function markSkinMode(lo) {
  const m = skinMode(lo);
  document.querySelectorAll("#lo-skin-modes .lo-mode").forEach((b) =>
    b.classList.toggle("active", b.dataset.mode === m),
  );
  const hint = $("lo-skin-hint");
  if (hint)
    hint.textContent =
      m === "favorite"
        ? "Pick any number, queuePop randomly chooses one of these each game."
        : m === "pick"
          ? "queuePop sets this exact skin (if you own it)."
          : "";
}

function buildLoadoutSkin(lo) {
  const on = lo.skin !== "off";
  $("lo-skin-on").checked = on;
  $("lo-skin-body").classList.toggle("hidden", !on);
  markSkinMode(lo);
  if (on) renderSkinGrid(lo);
  else $("lo-skin-grid").classList.add("hidden");
}

$("lo-skin-on").addEventListener("change", () => {
  const lo = curLoadout();
  if ($("lo-skin-on").checked) {
    if (lo.skin === "off") lo.skin = 0; // default: Pick a skin, awaiting choice
    $("lo-skin-body").classList.remove("hidden");
    markSkinMode(lo);
    renderSkinGrid(lo);
  } else {
    lo.skin = "off";
    $("lo-skin-body").classList.add("hidden");
  }
  scheduleSave();
});

$("lo-skin-modes").addEventListener("click", (e) => {
  const btn = e.target.closest(".lo-mode");
  if (!btn) return;
  const lo = curLoadout();
  const mode = btn.dataset.mode;
  if (mode === "pick" && skinMode(lo) !== "pick") {
    // From favorite → pick: keep the first favorite as the chosen skin, if any.
    lo.skin = Array.isArray(lo.skin) && lo.skin.length ? lo.skin[0] : 0;
  } else if (mode === "favorite" && skinMode(lo) !== "favorite") {
    // From pick → favorite: seed the list with the current pick, if any.
    lo.skin = typeof lo.skin === "number" && lo.skin > 0 ? [lo.skin] : [];
  }
  markSkinMode(lo);
  renderSkinGrid(lo);
  scheduleSave();
});

// Fetch a champion's skins once, then reuse, clicks just retag the selection
// so the grid never re-fetches or flickers.
async function loadSkins(champId) {
  if (skinCache[champId]) return skinCache[champId];
  let skins = [];
  try { skins = (await api().get_champion_skins(champId)) || []; } catch (_) {}
  skinCache[champId] = skins;
  return skins;
}

function skinSelected(lo, id) {
  return Array.isArray(lo.skin) ? lo.skin.includes(id) : id === lo.skin;
}

async function renderSkinGrid(lo) {
  const grid = $("lo-skin-grid");
  grid.classList.remove("hidden");
  const champ = loadoutChamp;
  let skins = skinCache[champ];
  if (!skins) {
    grid.innerHTML = `<p class="skin-empty">Loading skins…</p>`;
    skins = await loadSkins(champ);
    if (champ !== loadoutChamp) return; // a different loadout opened mid-fetch
  }
  if (!skins.length) {
    grid.innerHTML =
      `<p class="skin-empty">No skin data bundled. Run ` +
      `<code>python scripts/fetch_assets.py</code>.</p>`;
    return;
  }
  // In Pick mode, once a skin is chosen the others dim.
  const hasPick = skinMode(lo) === "pick" && typeof lo.skin === "number" && lo.skin > 0;
  grid.innerHTML = skins
    .map((s) => {
      const sel = skinSelected(lo, s.id);
      const dim = hasPick && !sel ? " dim" : "";
      return (
        `<div class="lo-skin-cell${sel ? " on" : ""}${dim}" data-sid="${s.id}" title="${s.name}">` +
          `<img src="assets/skins/tiles/${s.id}.jpg" onerror="this.style.visibility='hidden'" />` +
          `<span class="lo-skin-name">${s.name}</span>` +
        `</div>`
      );
    })
    .join("");
}

$("lo-skin-grid").addEventListener("click", (e) => {
  const cell = e.target.closest(".lo-skin-cell");
  if (!cell) return;
  const lo = curLoadout();
  const id = Number(cell.dataset.sid);
  const grid = $("lo-skin-grid");
  if (skinMode(lo) === "favorite") {
    // Multi-select: toggle this skin in/out of the favorites list (in place).
    const arr = Array.isArray(lo.skin) ? lo.skin.slice() : [];
    const i = arr.indexOf(id);
    if (i >= 0) arr.splice(i, 1);
    else arr.push(id);
    lo.skin = arr;
    cell.classList.toggle("on", arr.includes(id));
  } else {
    // Single-select: choose this skin, dim the rest (in place, no re-fetch).
    lo.skin = id;
    grid.querySelectorAll(".lo-skin-cell").forEach((c) => {
      const on = Number(c.dataset.sid) === id;
      c.classList.toggle("on", on);
      c.classList.toggle("dim", !on);
    });
  }
  markSkinMode(lo); // refresh the hint
  scheduleSave();
});

$("lo-done").addEventListener("click", closeLoadout);
document.querySelectorAll("#loadout-modal [data-lo-close]").forEach((el) =>
  el.addEventListener("click", closeLoadout),
);

// --- Recommended Runes: manage queuePop's dedicated rune page ------------
// Recommended-runes writes to one page named "queuePop (auto)". If the user is
// at their rune-page cap with no such page, they pick one here to hand over.
async function refreshRuneInfo() {
  const status = $("rune-managed-status");
  const wrap = $("rune-claim-wrap");
  let info = { pages: [], managed: null, at_cap: false };
  try { info = (await api().get_rune_info()) || info; } catch (_) {}

  if (info.managed) {
    status.innerHTML = `✓ queuePop manages the <span class="text-gold2">${info.managed.name}</span> page.`;
    status.className = "text-sm text-gold2";
    wrap.classList.add("hidden");
    return;
  }
  if (!info.pages.length && !info.at_cap) {
    status.textContent = "Connect the League client to manage rune pages.";
    status.className = "text-sm text-subText";
    wrap.classList.add("hidden");
    return;
  }
  if (info.at_cap) {
    status.textContent = "No dedicated page yet, and your rune pages are full.";
    status.className = "text-sm text-gold4";
    $("rune-claim-list").innerHTML = info.pages
      .map(
        (p) =>
          `<div class="flex items-center justify-between gap-3 text-sm">` +
            `<span class="text-grey1">${p.name}</span>` +
            `<button class="hextech px-3 py-1 text-xs text-gold2 hover:text-gold1 cursor-pointer" ` +
            `data-claim="${p.id}">Use this page</button>` +
          `</div>`,
      )
      .join("");
    wrap.classList.remove("hidden");
  } else {
    status.textContent =
      "queuePop will create its own “queuePop (auto)” page automatically (a slot is free).";
    status.className = "text-sm text-subText";
    wrap.classList.add("hidden");
  }
}

$("rune-refresh").addEventListener("click", refreshRuneInfo);
$("rune-claim-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-claim]");
  if (!btn) return;
  const s = $("rune-claim-status");
  s.textContent = "Assigning…";
  s.className = "text-xs text-subText";
  const res = await api().claim_rune_page(btn.dataset.claim);
  if (res && res.ok) {
    flashStatus(s, "✓ queuePop will use that page", true);
    refreshRuneInfo();
  } else {
    flashStatus(s, "✗ " + ((res && res.error) || "Failed"), false);
  }
  setTimeout(() => (s.textContent = ""), 4000);
});

// --- Auto-save ----------------------------------------------------------
// There is no Save button: every settings + champ-select change persists on its
// own. Saves are debounced so rapid edits (typing, dragging) coalesce into one
// write, and a toast confirms. We never re-loadConfig() after saving, that
// would rebuild the grids and reset focus/scroll mid-edit; JS state is the
// source of truth while the user is editing.
let saveTimer = null;
let toastTimer = null;

function showToast(msg, ok = true) {
  const t = $("toast");
  if (!t) return;
  $("toast-msg").textContent = msg;
  t.classList.toggle("err", !ok);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

async function saveNow() {
  try {
    const res = await api().save_config(gatherConfig());
    if (res && res.ok) showToast("Saved");
    else showToast((res && res.error) || "Save failed", false);
  } catch (e) {
    showToast("Save failed", false);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 350);
}

// Settings controls: one delegated listener covers checkboxes, selects, and the
// number/text fields (Chromium fires `input` for all of them). Buttons don't
// fire `input`, so test/refresh/preview clicks never trigger a stray save.
$("tab-settings").addEventListener("input", scheduleSave);
// Picking a custom sound file mutates JS state (no input event), save it too.
$("sound-pick").addEventListener("click", () => setTimeout(scheduleSave, 0));

// "Auto-accept any queue" hides/reveals the specific-queue picker.
$("queue_all").addEventListener("change", () => {
  $("queue-select").classList.toggle("hidden", $("queue_all").checked);
});

// --- Tooltips: any [data-tip] element shows a floating panel on hover --------
(function initTooltips() {
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  let cur = null;
  function position(el) {
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    let top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8; // flip up
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }
  function show(el) {
    cur = el;
    tip.textContent = el.getAttribute("data-tip") || "";
    position(el); // measure with text in place
    tip.classList.add("show");
  }
  function hide() { cur = null; tip.classList.remove("show"); }
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el !== cur) show(el);
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el === cur && !el.contains(e.relatedTarget)) hide();
  });
})();

// --- Settings jump-nav (sticky sidebar on wide windows) ----------------------
(function initSettingsNav() {
  const nav = document.querySelector(".settings-nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll(".snav-link")];
  nav.addEventListener("click", (e) => {
    const link = e.target.closest(".snav-link");
    if (!link) return;
    document.getElementById(link.dataset.jump)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // Scroll-based spy: highlight the last section whose top has passed a line
  // ~110px below the scroll-area top. A dedicated bottom check pins the final
  // section active once the page bottoms out (it can't scroll under the line).
  const main = document.querySelector("main");
  if (!main) return;
  function updateActive() {
    if ($("tab-settings").classList.contains("hidden")) return;
    const line = main.getBoundingClientRect().top + 110;
    let active = links[0]?.dataset.jump;
    for (const l of links) {
      const t = document.getElementById(l.dataset.jump);
      if (t && t.getBoundingClientRect().top <= line) active = l.dataset.jump;
    }
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4)
      active = links[links.length - 1]?.dataset.jump; // bottomed out → last
    links.forEach((l) => l.classList.toggle("active", l.dataset.jump === active));
  }
  main.addEventListener("scroll", updateActive, { passive: true });
  // Re-evaluate when the Settings tab is shown.
  document.querySelectorAll('.nav-route[data-tab="settings"]').forEach((b) =>
    b.addEventListener("click", () => setTimeout(updateActive, 60)),
  );
  updateActive();
})();

// --- Self-update --------------------------------------------------------
// The Python side (updater.py) checks GitHub Releases in the background and
// caches the result; we poll that cache, show a bottom-left banner when a newer
// version exists, and mirror the state in the Settings "About & Updates" card.
let updateState = null;
let updateDismissed = false; // "Later" hides the banner for this session only
let updating = false;        // an update is downloading/installing

function showUpdateBanner(show) {
  const b = $("upd-banner");
  if (!b) return;
  if (show) {
    b.classList.add("show");
    requestAnimationFrame(() => b.classList.add("in"));
  } else {
    b.classList.remove("in");
    setTimeout(() => b.classList.remove("show"), 220);
  }
}

function renderUpdate(s) {
  updateState = s || null;
  const has = !!(s && s.available && s.latest);

  // About card, always reflects the most recent check.
  const ver = $("about-version");
  if (ver) ver.textContent = "v" + ((s && s.current) || ", ");
  const msg = $("about-update-msg");
  const aUpd = $("about-update");
  const aNotes = $("about-notes");
  if (has) {
    if (msg) { msg.textContent = `Version v${s.latest} is available.`; msg.className = "set-row-hint mb-2 text-gold2"; }
    aUpd && aUpd.classList.remove("hidden");
    if (aNotes && s.url) { aNotes.href = s.url; aNotes.classList.remove("hidden"); }
  } else {
    if (msg) {
      msg.className = "set-row-hint mb-2";
      msg.textContent = s && s.error ? "Couldn't reach the update server." : "You're up to date.";
    }
    aUpd && aUpd.classList.add("hidden");
    aNotes && aNotes.classList.add("hidden");
  }

  // Banner, only when an update exists and the user hasn't dismissed it.
  const sub = $("upd-sub");
  if (has && sub) sub.textContent = `v${s.current} → v${s.latest}. Update now?`;
  showUpdateBanner(has && !updateDismissed && !updating);
}

async function refreshUpdate(force = false) {
  try {
    const s = force ? await api().check_for_update() : await api().get_update_status();
    renderUpdate(s);
    return s;
  } catch (e) {
    return null;
  }
}

async function doUpdate(btn) {
  if (updating) return;
  updating = true;
  showUpdateBanner(false);
  const label = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
  showToast("Downloading update…");
  try {
    const res = await api().apply_update();
    if (!res || !res.ok) {
      updating = false;
      if (btn) { btn.disabled = false; btn.textContent = label; }
      showToast((res && res.error) || "Update failed", false);
      renderUpdate(updateState); // re-show the banner so they can retry
    }
    // On success the app quits and the new build relaunches, nothing more to do.
  } catch (e) {
    updating = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
    showToast("Update failed", false);
  }
}

$("upd-now") && $("upd-now").addEventListener("click", () => doUpdate($("upd-now")));
$("upd-later") && $("upd-later").addEventListener("click", () => {
  updateDismissed = true;
  showUpdateBanner(false);
});
$("about-update") && $("about-update").addEventListener("click", () => doUpdate($("about-update")));
$("about-check") && $("about-check").addEventListener("click", async () => {
  const btn = $("about-check");
  const t = btn.textContent;
  btn.disabled = true; btn.textContent = "Checking…";
  const s = await refreshUpdate(true);
  btn.disabled = false; btn.textContent = t;
  if (s && !s.available) showToast(s.error ? "Couldn't check" : "You're up to date", !s.error);
});
$("about-notes") && $("about-notes").addEventListener("click", (e) => {
  // Release notes open in the real browser, not inside the WebView.
  if (updateState && updateState.url) { e.preventDefault(); api().open_external(updateState.url); }
});

// Brand links (GitHub, Tip Jar) — open in the real browser, never the WebView.
document.querySelectorAll("[data-ext]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    api().open_external(el.getAttribute("data-ext"));
  });
});

// --- Boot ---------------------------------------------------------------
async function boot() {
  // Build the UI; never let a single render error stop status polling.
  try {
    await loadCatalog();
    await buildSettings();
    await buildQueueMenu();
    await loadConfig();
  } catch (e) {
    console.error("queuePop UI build error:", e);
  }
  await refreshStatus();
  await refreshSummoner();
  await loadMastery();
  await refreshEvents();
  await refreshUpdate();
  setInterval(refreshStatus, 1500);
  setInterval(refreshEvents, 1000);
  setInterval(refreshSummoner, 8000); // keep level/icon fresh
  setInterval(refreshUpdate, 60000);  // poll the cached update state
}

if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener("pywebviewready", boot);
}
