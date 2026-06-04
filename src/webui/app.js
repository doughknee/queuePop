/* queueBot web UI logic — talks to Python via pywebview.api */

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
let activeMode = "picks"; // "picks" | "bans" — what the grid adds to
let activeSort = "az"; // "az" | "mastery" | "recent" — grid ordering of unselected champs
let masteryById = {}; // championId -> { level, points, lastPlayTime }
let runePageList = []; // user's saved rune pages, loaded live for the loadout editor
let loadoutRole = null; // role whose loadout is open in the editor
let loadoutChamp = 0; // championId whose loadout is open
let customSoundPath = ""; // absolute path to the user's custom alarm file
let previewCtx = null; // lazily-created AudioContext for Settings sound preview

const LEVEL_COLOR = {
  info: "text-blue2",
  success: "text-gold1",
  warning: "text-gold4",
  danger: "text-red-400",
};

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
  // Apex tiers have no division — they rank purely by LP.
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
  replay($(`tab-${tab}`), "fade-up");
  // The PLAY button doubles as the live-route indicator.
  $("play-btn").classList.toggle("live-active", tab === "live");
  // Refresh live rune-page status when entering Settings.
  if (tab === "settings" && typeof refreshRuneInfo === "function") refreshRuneInfo();
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

// --- Quick-queue dropdown: grouped, collapsible, favoritable -----------
// Built from get_quick_queues() → {queues, groups, favorites}. Favorites is a
// reserved section pinned at the top; the rest are grouped by game/mode and
// each section collapses (state persisted in localStorage). A star on each row
// pins/unpins it; the same queue's star stays in sync across both sections.
let qmQueues = [];     // [{id, name, group, ranked}]
let qmGroups = [];     // [{key, label}] — section order
let qmFavorites = [];  // [queueId] — display order of pinned queues
const QM_COLLAPSE_KEY = "qb_qm_collapsed";

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

function qmLoadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(QM_COLLAPSE_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function qmSaveCollapsed(set) {
  try { localStorage.setItem(QM_COLLAPSE_KEY, JSON.stringify([...set])); } catch (_) {}
}
function qmGroupIcon(key) { return QM_ICONS[key] || QM_ICONS.rift; }
function qmQueueById(id) { return qmQueues.find((q) => q.id === Number(id)); }

async function buildQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  let data = {};
  try { data = (await api().get_quick_queues()) || {}; } catch (_) {}
  qmQueues = data.queues || [];
  qmGroups = data.groups || [];
  qmFavorites = (data.favorites || []).filter((id) => qmQueueById(id));
  renderQueueMenu();
  // One delegated handler survives every re-render of the panel's innards.
  menu.addEventListener("click", onQueueMenuClick);
}

function qmRowHtml(q, idx) {
  const fav = qmFavorites.includes(q.id);
  return (
    `<button type="button" class="qm-row" data-qid="${q.id}" style="--i:${idx}">` +
      `<span class="qm-row-content">` +
        `<span class="qm-ico">${qmGroupIcon(q.group)}</span>` +
        `<span class="qm-name">${q.name}</span>` +
        (q.ranked ? '<span class="qm-pill">RANKED</span>' : "") +
      `</span>` +
      `<span class="qm-star${fav ? " on" : ""}" data-fav="${q.id}" ` +
        `title="${fav ? "Unpin from favorites" : "Pin to favorites"}">${QM_STAR}</span>` +
    `</button>`
  );
}

function qmSectionHtml(key, label, queues, collapsed) {
  const isFav = key === "favorites";
  const body = queues.length
    ? queues.map((q, i) => qmRowHtml(q, i)).join("")
    : isFav
      ? '<div class="qm-empty">Tap the <span class="qm-empty-star">☆</span> on any queue to pin it here for one-click access.</div>'
      : '<div class="qm-empty">Nothing here.</div>';
  return (
    `<div class="qm-section${collapsed ? " collapsed" : ""}${isFav ? " qm-fav" : ""}" data-group="${key}">` +
      `<button type="button" class="qm-sec-head" data-toggle="${key}">` +
        `<span class="qm-sec-ico">${QM_ICONS[key] || QM_ICONS.favorites}</span>` +
        `<span class="qm-sec-label">${label}</span>` +
        `<span class="qm-sec-count">${queues.length || ""}</span>` +
        `<span class="qm-chev">${QM_CHEVRON}</span>` +
      `</button>` +
      `<div class="qm-sec-body"><div class="qm-sec-inner">${body}</div></div>` +
    `</div>`
  );
}

function renderQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  const collapsed = qmLoadCollapsed();
  const favQueues = qmFavorites.map(qmQueueById).filter(Boolean);
  let html = '<div class="qm-panel"><div class="qm-title">Choose a queue</div>';
  html += qmSectionHtml("favorites", "Favorites", favQueues, collapsed.has("favorites"));
  for (const g of qmGroups) {
    const qs = qmQueues.filter((q) => q.group === g.key);
    if (qs.length) html += qmSectionHtml(g.key, g.label, qs, collapsed.has(g.key));
  }
  html += "</div>";
  menu.innerHTML = html;
}

// Re-render only the Favorites section so the group sections (and the panel's
// open animation) aren't disturbed when a star is toggled.
function renderFavoritesSection() {
  const sec = $("queue-menu")?.querySelector('.qm-section[data-group="favorites"]');
  if (!sec) return;
  const favQueues = qmFavorites.map(qmQueueById).filter(Boolean);
  sec.querySelector(".qm-sec-inner").innerHTML = favQueues.length
    ? favQueues.map((q, i) => qmRowHtml(q, i)).join("")
    : '<div class="qm-empty">Tap the <span class="qm-empty-star">☆</span> on any queue to pin it here for one-click access.</div>';
  const count = sec.querySelector(".qm-sec-count");
  if (count) count.textContent = favQueues.length || "";
}

// Keep every star for a given queue id in lock-step with qmFavorites.
function qmSyncStars(id) {
  const on = qmFavorites.includes(Number(id));
  $("queue-menu")?.querySelectorAll(`.qm-star[data-fav="${id}"]`).forEach((s) => {
    s.classList.toggle("on", on);
    s.title = on ? "Unpin from favorites" : "Pin to favorites";
  });
}

async function toggleFavorite(id, starEl) {
  id = Number(id);
  const adding = !qmFavorites.includes(id);
  if (adding) qmFavorites.push(id);
  else qmFavorites = qmFavorites.filter((x) => x !== id);
  try { await api().set_favorites(qmFavorites); } catch (_) {}

  if (starEl) replay(starEl, "pop");
  qmSyncStars(id);

  // Unpinning from within the Favorites list: animate that row out first.
  const favSec = $("queue-menu")?.querySelector('.qm-section[data-group="favorites"]');
  if (!adding && starEl && favSec && favSec.contains(starEl)) {
    const row = starEl.closest(".qm-row");
    if (row) {
      row.classList.add("qm-removing");
      setTimeout(renderFavoritesSection, 180);
      return;
    }
  }
  renderFavoritesSection();
}

function toggleSection(key) {
  const sec = $("queue-menu")?.querySelector(`.qm-section[data-group="${key}"]`);
  if (!sec) return;
  const collapsed = qmLoadCollapsed();
  if (sec.classList.toggle("collapsed")) collapsed.add(key);
  else collapsed.delete(key);
  qmSaveCollapsed(collapsed);
}

async function startQuickQueue(id) {
  closeQueueMenu();
  await api().start_queue(id);
  refreshStatus(); // flip PLAY → IN QUEUE
}

function onQueueMenuClick(e) {
  const star = e.target.closest(".qm-star");
  if (star) { e.stopPropagation(); toggleFavorite(star.dataset.fav, star); return; }
  const head = e.target.closest(".qm-sec-head");
  if (head) { toggleSection(head.dataset.toggle); return; }
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
function closeQueueMenu() { $("queue-menu")?.classList.add("hidden"); }
// Click outside closes the queue menu.
document.addEventListener("click", (e) => {
  const menu = $("queue-menu");
  const btn = $("play-btn");
  if (!menu || menu.classList.contains("hidden")) return;
  if (!menu.contains(e.target) && btn && !btn.contains(e.target)) closeQueueMenu();
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

// Dashboard profile: ranked (Solo + Flex) + top-3 champion mastery. Hidden
// unless the client is connected and there's at least one to show.
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

  const rankedRow = (label, r) => {
    if (!r) {
      return `<div class="flex items-center gap-3">
        <span class="text-xs uppercase tracking-wide text-subText whitespace-nowrap" style="width:4rem;overflow:hidden">${label}</span>
        <span class="text-sm text-subText italic">Unranked</span></div>`;
    }
    const col = tierColor(r.tier);
    const wins = r.wins || 0, losses = r.losses || 0, games = wins + losses;
    const wr = games ? Math.round((wins / games) * 100) : 0;
    return `<div class="flex items-center gap-3">
      <span class="text-xs uppercase tracking-wide text-subText whitespace-nowrap" style="width:4rem;overflow:hidden">${label}</span>
      <span class="text-sm font-serif" style="color:${col}">${rankLabel(r, true)}</span>
      <span class="text-xs text-subText ml-auto whitespace-nowrap">${
        games ? `${wins}W ${losses}L · ${wr}%` : ""
      }</span>
    </div>`;
  };
  // Solo + Flex always render (everyone has an SR ladder); TFT only when ranked,
  // so non-TFT players don't get a stray "Unranked" row.
  $("profile-ranked").innerHTML =
    rankedRow("Solo", ranked.solo) +
    rankedRow("Flex", ranked.flex) +
    (ranked.tft ? rankedRow("TFT", ranked.tft) : "") +
    (ranked.double_up ? rankedRow("Doubles", ranked.double_up) : "");

  $("profile-mastery").innerHTML = mastery
    .map((m) => {
      const name = idToName(m.championId) || "";
      const pts = (m.points || 0).toLocaleString();
      return `<span class="flex flex-col items-center gap-1"
          title="${name} — Mastery ${m.level ?? "?"} · ${pts} pts">
        <span class="relative inline-block">
          <img src="assets/champions/${m.championId}.png"
            class="h-11 w-11 object-cover" style="outline:1px solid rgba(120,90,40,0.5);outline-offset:-1px;"
            onerror="this.style.visibility='hidden'" />
          <span class="absolute -bottom-1 -right-1 px-1 text-[9px] font-bold leading-tight text-hextech-black bg-gold2">${
            m.level ?? ""
          }</span>
        </span>
        <span class="text-[10px] text-subText">${fmtPoints(m.points)}</span>
      </span>`;
    })
    .join("");
}
$("summoner-btn").addEventListener("click", () => {
  const url = $("summoner-btn").dataset.opgg;
  if (url) api().open_external(url);
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
    $("hero-status").className =
      "font-display text-2xl leading-tight " +
      (s.paused ? "text-gold4" : "text-gold1");
    $("hero-dot").className =
      "h-3.5 w-3.5 rounded-full shrink-0 " +
      (s.paused ? "bg-gold4" : "bg-blue2 dot-pulse");
    $("hero-client").textContent = s.connected ? "Connected" : "Waiting…";
    $("hero-client").className =
      "font-display text-lg leading-tight mt-0.5 " +
      (s.connected ? "text-blue2" : "text-subText");

    $("stat-champ").textContent = s.champ_select_enabled ? "On" : "Off";
    $("stat-webhook").textContent = s.webhook_configured
      ? "Configured"
      : "Disabled";
    $("stat-champs-loaded").textContent =
      catalog.length || s.champions_loaded || 0;

    const note = $("companion-note");
    if (note) {
      if (!s.companion_enabled) {
        note.textContent = "";
      } else if (!s.companion_running) {
        note.textContent = "Server not running — save settings, then restart queueBot.";
        note.className = "text-xs text-gold4";
      } else if (s.companion_clients > 0) {
        const n = s.companion_clients;
        note.textContent = `● ${n} phone${n > 1 ? "s" : ""} connected`;
        note.className = "text-xs text-gold2";
      } else {
        note.textContent = "Running — waiting for a phone to connect…";
        note.className = "text-xs text-subText";
      }
    }

    renderPause(s.paused);
  } catch (e) {
    /* window may be mid-teardown; ignore */
  }
}

// --- Activity feed ------------------------------------------------------
async function refreshEvents() {
  try {
    const { events } = await api().get_events(lastEventId);
    if (!events.length) return;
    const initial = lastEventId === 0; // backfill on first load — don't animate/flash
    const list = $("activity");
    if (initial) list.innerHTML = "";
    for (const ev of events) {
      lastEventId = Math.max(lastEventId, ev.id);
      const li = document.createElement("li");
      li.className =
        (LEVEL_COLOR[ev.level] || "text-grey1") +
        " border-l-2 border-gold5/40 pl-2" +
        (initial ? "" : " fade-up");
      li.textContent = ev.message;
      list.prepend(li);
      // Celebrate the signature moment.
      if (!initial && (ev.kind === "queue_pop" || /queue popped/i.test(ev.message)))
        flashPop();
    }
    while (list.children.length > 100) list.removeChild(list.lastChild);
  } catch (e) {
    /* ignore */
  }
}

// --- Champion catalog (bundled, offline) -------------------------------
async function loadCatalog() {
  // Read via Python — WebView2 blocks fetch() of local files under file://.
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
async function buildSettings() {
  const queues = await api().get_queue_map();
  queueMap = {};
  for (const q of queues) queueMap[q.id] = q.name;
  const qWrap = $("queues");
  qWrap.innerHTML = "";
  const QP_CHECK =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  for (const q of queues) {
    const label = document.createElement("label");
    label.className = "qp";
    label.title = q.name;
    label.innerHTML =
      `<input type="checkbox" data-queue="${q.id}" />` +
      `<span class="qp-check">${QP_CHECK}</span>` +
      `<span class="qp-name">${q.name}</span>`;
    qWrap.appendChild(label);
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

// Inline ARAM glyph (no position SVG exists for it) — a 4-way poke/mirror mark.
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
  // ARAM has no bans — hide the toggle and force Picks (its picks list doubles
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
        `Your ARAM <span class="text-gold2">priority list</span> — queueBot grabs ` +
        `the highest-ranked of these off the reroll bench (and trades toward it). ` +
        `Click to add; drag to reorder.`;
    } else {
      const isBan = mode === "bans";
      const word = isBan ? "bans" : "picks";
      const color = isBan ? "text-red-400" : "text-gold2";
      hint.innerHTML =
        `Click to add — your <span class="${color}">${word}</span> move to the front, ` +
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
// passed here — they stay pinned to the front in their priority order.
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
// A–Z view stays clean): a gold mastery-level chip plus a contextual stat —
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

  renderSummary(c);
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

// --- Dashboard: config summary + champ-select plan ---------------------
function renderSummary(c) {
  const ids = c.allowed_queue_ids || [];
  $("sum-queues").textContent = ids.length
    ? ids.map((id) => queueMap[id] || "#" + id).join(", ")
    : "All queues";
  $("sum-notif").textContent = c.desktop_notifications ? "On" : "Off";
  const cs = c.champ_select || {};
  $("sum-champ").textContent = cs.enabled
    ? cs.instant_lock
      ? "On — instant lock"
      : `On — lock at ${cs.lock_in_at_seconds}s left`
    : "Off";
}

function planChip(name) {
  const icon = champIcon(name);
  const media = icon
    ? `<img src="${icon}" class="h-5 w-5 object-cover inline-block align-middle" />`
    : `<span class="h-5 w-5 inline-grid place-items-center text-[8px] text-gold1 bg-blue5 align-middle">${initials(name)}</span>`;
  return `<span class="inline-flex items-center gap-1 align-middle">${media}<span class="text-grey1">${name}</span></span>`;
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

  // The pick/ban table covers the 5 assigned positions only (ARAM gets its own
  // line below).
  const configured = roles.filter((r) => {
    if (r.key === "aram") return false;
    const rc = rolesCfg[r.key] || {};
    return (rc.bans || []).length || (rc.picks || []).length || loCount(rc);
  });

  const anyExtra = trades || aram;
  const showTable = cs.enabled && configured.length;
  if (!showTable && !anyExtra) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  let html = (showTable ? configured : [])
    .map((r) => {
      const rc = rolesCfg[r.key] || {};
      const pick = (rc.picks || [])[0];
      const ban = (rc.bans || [])[0];
      const extra =
        (rc.picks || []).length > 1
          ? ` <span class="text-gold5">+${rc.picks.length - 1}</span>`
          : "";
      const n = loCount(rc);
      const loadouts = n
        ? `<span class="text-gold2">${n} loadout${n > 1 ? "s" : ""}</span>`
        : '<span class="text-subText">—</span>';
      return `<div class="grid grid-cols-[7rem_1fr_1fr_auto] items-center gap-2 py-0.5">
        <span class="flex items-center gap-1.5">
          <img src="assets/positions/${r.key}.svg" class="h-4 w-4" onerror="this.style.display='none'" />
          <span class="font-serif text-gold2 text-sm">${r.label}</span>
        </span>
        <span class="text-sm"><span class="text-subText text-xs mr-1">PICK</span>${pick ? planChip(pick) : "—"}${extra}</span>
        <span class="text-sm"><span class="text-subText text-xs mr-1">BAN</span>${ban ? planChip(ban) : "—"}</span>
        <span class="text-xs whitespace-nowrap"><span class="text-subText mr-1">SETUP</span>${loadouts}</span>
      </div>`;
    })
    .join("");
  const extras = [];
  if (trades)
    extras.push(["TRADES", "Auto — trade toward a higher-priority pick"]);
  if (aram)
    extras.push([
      "ARAM",
      `Bench swap on${aramPicks ? ` — ${aramPicks} champ${aramPicks > 1 ? "s" : ""} ranked` : " — set your list"}`,
    ]);
  if (extras.length) {
    html +=
      `<div class="pt-2 mt-1 border-t border-t-gold5/20 text-xs space-y-1">` +
      extras
        .map(
          ([k, v]) =>
            `<div><span class="text-subText mr-1">${k}</span><span class="text-gold2">${v}</span></div>`,
        )
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
  if (previewCtx && window.QueueBotAlarm) QueueBotAlarm.play(previewCtx, sel);
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
    flashStatus(s, "✓ Sent — your phone should alarm", true);
  } else {
    flashStatus(s, "Server isn't running yet — restart queueBot", false);
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
  if (res && res.ok) flashStatus(s, "✓ Sent — check Discord", true);
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
  await buildLoadoutRunes(lo); // async (live client) — fine to populate after show
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
//   "Random favorite" → lo.skin is an array of ids; queueBot picks one at random
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
        ? "Pick any number — queueBot randomly chooses one of these each game."
        : m === "pick"
          ? "queueBot sets this exact skin (if you own it)."
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

// Fetch a champion's skins once, then reuse — clicks just retag the selection
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

// --- Recommended Runes: manage queueBot's dedicated rune page ------------
// Recommended-runes writes to one page named "queueBot (auto)". If the user is
// at their rune-page cap with no such page, they pick one here to hand over.
async function refreshRuneInfo() {
  const status = $("rune-managed-status");
  const wrap = $("rune-claim-wrap");
  let info = { pages: [], managed: null, at_cap: false };
  try { info = (await api().get_rune_info()) || info; } catch (_) {}

  if (info.managed) {
    status.innerHTML = `✓ queueBot manages the <span class="text-gold2">${info.managed.name}</span> page.`;
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
      "queueBot will create its own “queueBot (auto)” page automatically (a slot is free).";
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
    flashStatus(s, "✓ queueBot will use that page", true);
    refreshRuneInfo();
  } else {
    flashStatus(s, "✗ " + ((res && res.error) || "Failed"), false);
  }
  setTimeout(() => (s.textContent = ""), 4000);
});

// --- Auto-save ----------------------------------------------------------
// There is no Save button: every settings + champ-select change persists on its
// own. Saves are debounced so rapid edits (typing, dragging) coalesce into one
// write, and a toast confirms. We never re-loadConfig() after saving — that
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
// Picking a custom sound file mutates JS state (no input event) — save it too.
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

// --- Boot ---------------------------------------------------------------
async function boot() {
  // Build the UI; never let a single render error stop status polling.
  try {
    await loadCatalog();
    await buildSettings();
    await buildQueueMenu();
    await loadConfig();
  } catch (e) {
    console.error("queueBot UI build error:", e);
  }
  await refreshStatus();
  await refreshSummoner();
  await loadMastery();
  await refreshEvents();
  setInterval(refreshStatus, 1500);
  setInterval(refreshEvents, 1000);
  setInterval(refreshSummoner, 8000); // keep level/icon fresh
}

if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener("pywebviewready", boot);
}
