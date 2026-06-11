/* Live champ-select takeover: while gameflow_phase == ChampSelect, the app
   swaps to a live read-only view of both teams, bans, trades, and the ARAM
   bench (get_champ_select()). Poll-gated by the status bus. */

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
  lastAutoEv = null; // each champ select starts with a clean ticker
  activateTab("live");
  refreshChampLive();
  QP.poll.start("champlive");
}
function exitChampSelect() {
  if (!inChampSelect) return;
  inChampSelect = false;
  QP.poll.stop("champlive");
  // Don't strand the user on the (now-empty) live route.
  if (activeTab === "live") activateTab("dashboard");
}
function showLiveView() { activateTab("live"); }   // PLAY = LIVE

QP.bus.on("status", (s) => {
  if (s.connected && s.gameflow_phase === "ChampSelect") enterChampSelect();
  else exitChampSelect();
});

// Automation ticker: the latest thing queuePop did this champ select (lock,
// trade, bench grab, swap, runes, skin), straight off the events bus. Rendered
// as a one-line strip above the teams on the next champ-live poll.
const TICKER_KINDS = new Set([
  "champ", "spells", "trade", "bench_swap", "pick_swap", "role_swap", "runes", "skin",
]);
const TICKER_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 13h6l-1 9 10-12h-6z"/></svg>';
let lastAutoEv = null;
QP.bus.on("activity:event", (ev) => {
  if (TICKER_KINDS.has(ev.kind)) lastAutoEv = ev;
});

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

// Explicit trade-state words (LCU states → what's actually happening).
const TRADE_WORDS = {
  SENT: "requesting…",
  RECEIVED: "incoming offer",
  ACCEPTED: "accepted",
  DECLINED: "declined — cooldown",
  CANCELLED: "cancelled",
};

function renderChampLive(cs) {
  const phase = (cs.phase || "Champ Select").replace(/_/g, " ");

  const ticker = lastAutoEv
    ? `<div class="cs-ticker"><span class="cs-ticker-ico">${TICKER_ICON}</span>` +
      `<span class="cs-ticker-msg">${escapeHtml(lastAutoEv.message)}</span></div>`
    : "";

  const bansMy = (cs.bans?.my || []).map((b) => csMini(b, true)).join("");
  const bansTheir = (cs.bans?.their || []).map((b) => csMini(b, true)).join("");
  const bansStrip =
    bansMy || bansTheir
      ? `<div class="cs-strip"><span class="cs-strip-label">Bans</span>${bansMy}` +
        (bansMy && bansTheir ? `<span class="text-subText px-1">·</span>` : "") +
        `${bansTheir}</div>`
      : "";

  const trades = (cs.trades || [])
    .filter((tr) => TRADE_WORDS[tr.state]) // AVAILABLE/BUSY = nothing happening
    .map(
      (tr) =>
        `<span class="cs-trade">${tr.name || "Cell " + tr.cellId}` +
        `<span class="st">${TRADE_WORDS[tr.state]}</span></span>`,
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
    ticker +
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

QP._loaded.push("pages/live");
