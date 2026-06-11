/* Home (dashboard) page: the champ-select plan board. The hero strip is
   rendered by features/status.js; the profile panel by features/summoner.js;
   the activity feed by features/activity.js. Re-renders on config changes. */

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

// The plan board mirrors live config: re-render on every config change.
QP.bus.on("config:changed", () => {
  if (QP.store.config) renderPlan(QP.store.config);
});

QP._loaded.push("pages/home");
