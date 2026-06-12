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

// Dashboard profile strip: one line — portrait, name, highest rank, its
// record, and top-3 mastery portraits. The full ranked/mastery breakdown
// lives on the Account page; the whole strip clicks through to it. Hidden
// unless the client is connected.
function renderProfile(info) {
  const strip = $("profile-strip");
  if (!strip) return;
  if (!info || !info.connected || !info.name) {
    strip.classList.add("hidden");
    return;
  }
  strip.classList.remove("hidden");

  const ranked = info.ranked || {};
  const mastery = info.mastery || [];
  const icon = $("profile-icon");
  if (info.icon) { icon.src = info.icon; icon.style.visibility = ""; }
  else icon.style.visibility = "hidden";
  $("profile-name").textContent = info.name || "Summoner";

  const hi = highestRank(ranked);
  const tier = $("profile-tier");
  let record = "";
  if (hi) {
    tier.textContent = rankLabel(hi, true);
    tier.style.color = tierColor(hi.tier);
    const wins = hi.wins || 0, losses = hi.losses || 0, games = wins + losses;
    if (games) record = `${wins}W ${losses}L · ${Math.round((wins / games) * 100)}%`;
  } else {
    tier.textContent = "Unranked";
    tier.style.color = "";
  }
  $("profile-record").textContent = record;

  $("profile-mastery").innerHTML = mastery
    .slice(0, 3)
    .map((m) => {
      const name = idToName(m.championId) || "";
      const pts = (m.points || 0).toLocaleString();
      return (
        `<span class="ps-champ" title="${name}, Mastery ${m.level ?? "?"} · ${pts} pts">` +
          `<img src="assets/champions/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
        `</span>`
      );
    })
    .join("");
}
$("summoner-btn").addEventListener("click", () => {
  activateTab("account");
});
$("profile-strip").addEventListener("click", () => {
  activateTab("account");
});

QP._loaded.push("features/summoner");
