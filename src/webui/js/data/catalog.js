/* Shared data layer: champion catalog, mastery, summoner spells, roles, queue
   names, and the formatting helpers built on them. Loaders read via Python —
   WebView2 blocks fetch() of local files under file://. */

let roles = [];
let queueMap = {}; // queueId -> display name
let catalog = []; // [{id, name, alias}]
let nameToId = {}; // lowercased name/alias -> id
let spellList = []; // [{id, name}] summoner spells for the per-role pickers
let masteryById = {}; // championId -> { level, points, lastPlayTime }
// Champion-portrait URL base. Defaults to the bundled assets; swapped to an
// absolute file:// override dir (set in loadCatalog) once the user refreshes
// champion data on the About page, so a new champ's real portrait can appear
// without shipping a build. One base for every <img>, so a refresh repaints
// all icons consistently.
let champBase = "assets/champions";

// --- Champion asset helpers --------------------------------------------
function champIcon(name) {
  const id = nameToId[(name || "").toLowerCase()];
  return id ? `${champBase}/${id}.png` : null;
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
// Compact "time since" for event rows / matches (epoch SECONDS -> "now"/"3m"/…).
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

// --- Loaders -------------------------------------------------------------
async function loadCatalog() {
  // Read via Python, WebView2 blocks fetch() of local files under file://.
  try {
    catalog = (await api().get_champion_catalog()) || [];
  } catch (e) {
    catalog = [];
  }
  // Portraits load from the bundled assets by default, or an absolute file://
  // override dir once champion data has been refreshed (About page).
  try {
    champBase = (await api().get_champ_asset_base()) || "assets/champions";
  } catch (_) {
    champBase = "assets/champions";
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

QP._loaded.push("data/catalog");
