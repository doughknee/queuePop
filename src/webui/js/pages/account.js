/* Account route: reached by clicking the summoner badge. Shows a copyable
   Riot ID, live stats (ranked + mastery + recent matches), and region-aware
   links to every major tracker site (built server-side from the Riot ID). */

const QUEUE_SHORT = {
  420: "Ranked Solo/Duo", 440: "Ranked Flex", 430: "Blind Pick", 400: "Draft Pick",
  490: "Quickplay", 450: "ARAM", 2400: "ARAM Mayhem", 700: "Clash", 1700: "Arena", 1900: "URF",
  900: "ARURF", 1090: "TFT", 1100: "Ranked TFT", 1160: "TFT Double Up", 830: "Co-op vs AI",
  840: "Co-op vs AI", 850: "Co-op vs AI",
};
function queueLabel(qid) {
  return QUEUE_SHORT[qid] || queueMap[qid] || (qid ? "Queue " + qid : "Custom");
}

QP.bus.on("route", ({ tab }) => {
  if (tab === "account") refreshAccount();
});

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
            `<img src="${champBase}/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
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
          `<img class="acct-match-champ" src="${champBase}/${m.championId}.png" onerror="this.style.visibility='hidden'" />` +
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

QP._loaded.push("pages/account");
