/* Home (dashboard) page: the Auto-Accept queue picker and the champ-select
   plan board. The hero strip is rendered by features/status.js; the profile
   panel by features/summoner.js; the activity feed by features/activity.js.
   Re-renders on config changes. (The queue picker moved here from the old
   Settings page in Phase 3 — accepting queues is the app's primary task, so
   it lives next to the hero.) */

// --- Auto-Accept: the allowed-queues picker --------------------------------
const QP_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
// Groups the user has expanded; everything starts collapsed so the card stays
// a few compact rows on Home (the per-group "n / total" counts carry the
// state at a glance — expanding is only needed to change it).
const QSEL_OPEN_KEY = "qb_qsel_open";
function qselLoadOpen() {
  try { return new Set(JSON.parse(localStorage.getItem(QSEL_OPEN_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function qselSaveOpen(set) {
  try { localStorage.setItem(QSEL_OPEN_KEY, JSON.stringify([...set])); } catch (_) {}
}

// Render the queue picker as collapsible, grouped sections. Each section has
// a select-all toggle; the checkboxes keep `data-queue` so hydration / sync
// work unchanged.
function renderQueuePicker(queues, groups) {
  const wrap = $("queues");
  if (!wrap) return;
  const open = qselLoadOpen();
  const order = groups && groups.length ? groups : [{ key: "other", label: "Other" }];
  let html = "";
  for (const g of order) {
    const qs = queues.filter((q) => q.group === g.key);
    if (!qs.length) continue;
    const isCol = !open.has(g.key);
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
    const open = qselLoadOpen();
    if (sec.classList.toggle("collapsed")) open.delete(key);
    else open.add(key);
    qselSaveOpen(open);
    return;
  }
  const all = e.target.closest(".qsel-all");
  if (all) {
    const boxes = [...$("queues").querySelectorAll(`input[data-grp="${all.dataset.all}"]`)];
    const turnOn = boxes.some((b) => !b.checked); // all-on ⇒ clear, else select all
    boxes.forEach((b) => { b.checked = turnOn; });
    // The select-all button doesn't fire `input`; sync + save explicitly.
    syncQueuesToStore();
    return;
  }
}

async function buildQueues() {
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
}

// Per-group "n / total" count chips: the collapsed rows still tell you what's
// selected without expanding anything.
function updateQselCounts() {
  document.querySelectorAll("#queues .qsel-group").forEach((sec) => {
    const boxes = sec.querySelectorAll("input[data-queue]");
    const sel = [...boxes].filter((b) => b.checked).length;
    const count = sec.querySelector(".qsel-count");
    if (!count) return;
    count.textContent = sel ? `${sel} / ${boxes.length}` : String(boxes.length);
    count.classList.toggle("on", sel > 0);
  });
}

// Hydrate: store.config → queue DOM.
function hydrateQueues() {
  const allowedIds = (QP.store.config.allowed_queue_ids || []).map(Number);
  const acceptAny = allowedIds.length === 0;
  $("queue_all").checked = acceptAny;
  $("queue-select").classList.toggle("hidden", acceptAny);
  const allowed = new Set(allowedIds);
  document.querySelectorAll("[data-queue]").forEach((cb) => {
    cb.checked = allowed.has(Number(cb.dataset.queue));
  });
  updateQselCounts();
}

// Sync: queue DOM → store.config. "Auto-accept any queue" on ⇒ empty list
// (the backend treats [] as "all"); off ⇒ only the queues the user ticked.
function syncQueuesToStore() {
  const allowed = [];
  if (!$("queue_all").checked) {
    document.querySelectorAll("[data-queue]").forEach((cb) => {
      if (cb.checked) allowed.push(Number(cb.dataset.queue));
    });
  }
  QP.store.config.allowed_queue_ids = allowed;
  updateQselCounts();
  QP.bus.emit("config:changed", { path: "allowed_queue_ids" });
  QP.store.scheduleSave();
}

// Card controls: one delegated listener covers the checkboxes (buttons don't
// fire `input`, so collapse/select-all clicks sync explicitly above).
$("queues-card").addEventListener("input", syncQueuesToStore);

// "Auto-accept any queue" hides/reveals the specific-queue picker.
$("queue_all").addEventListener("change", () => {
  $("queue-select").classList.toggle("hidden", $("queue_all").checked);
});

// --- Champ Select Plan board ------------------------------------------------
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

// Feature-state chips: one glanceable line of what queuePop will do in champ
// select. Every chip clicks through to the champ page (the ARAM chip lands on
// the ARAM tab).
const ARAM_MODE_LABEL = {
  off: "List only", highest: "Highest mastery", lowest: "Lowest mastery",
  rusty: "Rusty", milestone: "Milestone", random: "Random",
};
function planChipsHtml(cs, rolesCfg) {
  const trades = !!(cs.trades && cs.trades.enabled);
  const aram = cs.aram || {};
  const aramOn = !!(aram.enabled || aram.auto_mastery);
  const aramMode = (rolesCfg.aram || {}).mode || "off";
  const chips = [
    { on: !!cs.enabled, label: `Pick/Ban ${cs.enabled ? "on" : "off"}` },
    { on: trades, label: `Trades ${trades ? "on" : "off"}` },
    { on: aramOn, role: "aram",
      label: aramOn ? `ARAM: ${ARAM_MODE_LABEL[aramMode] || aramMode}` : "ARAM off" },
    { on: !!cs.auto_runes, label: `Auto runes ${cs.auto_runes ? "on" : "off"}` },
  ];
  return (
    `<div class="plan-chips">` +
    chips.map((c) =>
      `<button type="button" class="plan-chip${c.on ? "" : " off"}"` +
        (c.role ? ` data-role="${c.role}"` : "") +
        ` title="Edit on the Champ Select page">${c.label}</button>`,
    ).join("") +
    `</div>`
  );
}

// Chips click through to the champ page (and the right tab).
$("plan-panel").addEventListener("click", (e) => {
  const chip = e.target.closest(".plan-chip");
  if (!chip) return;
  activateTab("champ");
  if (chip.dataset.role) selectRole(chip.dataset.role);
});

function renderPlan(c) {
  const cs = c.champ_select || {};
  const rolesCfg = cs.roles || {};
  const panel = $("plan-panel");
  const wrap = $("plan");

  const trades = !!(cs.trades && cs.trades.enabled);
  const aram = !!(cs.aram && (cs.aram.enabled || cs.aram.auto_mastery));
  const loCount = (rc) => Object.keys(rc.loadouts || {}).length;

  const configured = roles.filter((r) => {
    if (r.key === "aram") return false;
    const rc = rolesCfg[r.key] || {};
    return (rc.bans || []).length || (rc.picks || []).length || loCount(rc);
  });

  const showTable = cs.enabled && configured.length;
  if (!showTable && !(trades || aram || cs.auto_runes)) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");

  const slot = (label, name, count, ban) => {
    const extra = count > 1 ? `<span class="plan-extra">+${count - 1}</span>` : "";
    const body = name ? planChampHtml(name, ban) + extra : `<span class="plan-none">, </span>`;
    return `<span class="plan-slot"><span class="plan-slot-label">${label}</span>${body}</span>`;
  };

  const html = (showTable ? configured : [])
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

  wrap.innerHTML = html + planChipsHtml(cs, rolesCfg);
}

// The plan board mirrors live config: re-render on every config change.
QP.bus.on("config:changed", () => {
  if (QP.store.config) renderPlan(QP.store.config);
});

QP._loaded.push("pages/home");
