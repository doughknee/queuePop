/* Live summoner badge (navbar) + the dashboard profile panel. Refreshes on a
   slow poll and on client connect/disconnect transitions (via the status bus). */

let lastConnected = null; // tracks client connect/disconnect transitions

QP.bus.on("status", (s) => {
  if (s.connected !== lastConnected) {
    lastConnected = s.connected;
    refreshSummoner();
    if (s.connected) loadMastery();
  }
});

let lastInfo = null;
const worldOf = () => (/^#\/(league|tft)(?=[\/#]|$)/.exec(location.hash) || [])[1] || "";
function paintRank() {
  const info = lastInfo, lvlEl = $("summoner-level"), rankEl = $("summoner-rank");
  if (!info?.connected || !info.name || !lvlEl) return;
  const pick = sidebarRank(info.ranked, worldOf());
  lvlEl.textContent = pick ? "" : info.level ? `Level ${info.level}` : "";
  if (rankEl) { rankEl.textContent = pick ? pick.prefix + rankLabel(pick.r, false) : ""; if (pick) rankEl.style.color = tierColor(pick.r.tier); }
}
addEventListener("hashchange", paintRank);

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
    // The rank for the world you're in replaces the level (sidebarRank, catalog.js); unranked there keeps the level.
    lastInfo = info;
    paintRank();
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

// (The dashboard has no profile panel/strip anymore — the summoner badge in
// the navbar is the account surface; everything deeper lives on the Account
// page, one click away.)
$("summoner-btn").addEventListener("click", () => {
  activateTab("account");
});

QP._loaded.push("features/summoner");
