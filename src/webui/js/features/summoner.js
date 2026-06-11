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

QP._loaded.push("features/summoner");
