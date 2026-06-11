/* Champ Select page: the whole feature on one surface.

   Layout model (Phase 1 of the UI refactor):
     * Plan tray — your ordered picks (and a compact bans row) with ALL the
       manage affordances: drag to reorder, corner ✕ to remove, click to open
       the loadout, teal dot when a loadout is set.
     * Catalog — add-only. Click adds a pick (or a ban while the ban "+" is
       armed); clicking an already-planned champ pulses its tray slot.
     * Per-tab gating — the five Rift tabs gate on champ_select.enabled, the
       ARAM tab on aram.enabled, each with an inline enable card.
     * Absorbed settings — lock timing, auto-trade, the ARAM priority mode
       cards, and the recommended-runes page manager all live here and write
       straight into QP.store.

   `plan` IS the store's champ_select.roles object (no parallel copy). */

let plan = {}; // alias of QP.store.config.champ_select.roles after hydratePlan()
let activeRole = null; // currently edited role
let activeSort = "az"; // "az" | "mastery" | "recent", catalog ordering
let banArmed = false;  // the catalog's next click adds a ban (one-shot)

// Inline ARAM glyph (no position SVG exists for it), a 4-way poke/mirror mark.
const ARAM_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/><path d="m20 16-4-4 4-4"/><path d="m4 8 4 4-4 4"/><path d="m16 4-4 4-4-4"/><path d="m8 20 4-4 4 4"/></svg>';

// Per-role fallback ranking: the priority order is always the hand-built list
// first, then (unless "off") every remaining champ ranked by the mode. Drives
// the Rift pick fallback, trades, and the ARAM subset/bench.
const ROLE_MODES = ["off", "highest", "lowest", "random", "rusty", "milestone"];
const FALLBACK_MODES = [
  { key: "off", name: "Off", cap: "List only — queuePop never goes beyond your picks." },
  { key: "highest", name: "Highest", cap: "Falls back to your most-played champs." },
  { key: "lowest", name: "Lowest", cap: "Falls back to champs you've barely touched — never-played first." },
  { key: "rusty", name: "Rusty", cap: "Falls back to whatever you haven't played in the longest." },
  { key: "milestone", name: "Milestone", cap: "Falls back to whichever champ is closest to its next mastery level." },
  { key: "random", name: "Random", cap: "Falls back to one shuffled order per lobby. Chaos." },
];

// --- Config accessors ----------------------------------------------------
function champCfg() { return (QP.store.config.champ_select ||= {}); }
function aramCfg() { return (champCfg().aram ||= {}); }
function roleMode(role) {
  const m = (plan[role] || {}).mode;
  return ROLE_MODES.includes(m) ? m : "off";
}
// Legacy ARAM keys kept in sync so a pre-fallback build still reads this config.
function syncAramLegacy() {
  const a = aramCfg();
  const m = roleMode("aram");
  a.mode = m === "off" ? "list" : m;
  a.auto_mastery = !!a.enabled && m === "highest";
}
function featureOn(role) {
  if (role === "aram") {
    const a = aramCfg();
    return !!(a.enabled || a.auto_mastery);
  }
  return !!champCfg().enabled;
}

// --- Build ----------------------------------------------------------------
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

  $("champ-search").addEventListener("input", (e) => renderGrid(e.target.value));

  // Sort control: wire the segments and restore the last-used sort.
  document.querySelectorAll("#sort-seg .sort-opt").forEach((b) =>
    b.addEventListener("click", () => setSort(b.dataset.sort)),
  );
  let savedSort = "az";
  try { savedSort = localStorage.getItem("qb_champ_sort") || "az"; } catch (_) {}
  activeSort = SORTS.includes(savedSort) ? savedSort : "az";
  markSort(activeSort);

  // Per-tab gate: the toggle enables the active tab's feature in place.
  $("champ-gate-toggle").addEventListener("change", (e) => {
    if (activeRole === "aram") {
      aramCfg().enabled = e.target.checked;
      syncAramLegacy();
    } else {
      champCfg().enabled = e.target.checked;
    }
    QP.bus.emit("config:changed", { path: "champ_select" });
    QP.store.scheduleSave();
    selectRole(activeRole); // re-evaluates the gate + renders the editor
  });

  // Live banner → the live route.
  $("champ-open-live").addEventListener("click", () => showLiveView());
  QP.bus.on("status", (s) => {
    $("champ-live-banner").classList.toggle(
      "hidden", !(s.connected && s.gameflow_phase === "ChampSelect"),
    );
  });

  // Fallback ranking: the small dropdown in the tray label line.
  $("fallback-mode").addEventListener("change", () => {
    plan[activeRole].mode = $("fallback-mode").value;
    if (activeRole === "aram") syncAramLegacy();
    QP.bus.emit("config:changed", { path: "champ_select.roles" });
    QP.store.scheduleSave();
    renderFallback();
    applyAramView();
  });

  // Match behavior: lock timing + trades, written straight to the store.
  document.querySelectorAll("#lock-seg .sort-opt").forEach((b) =>
    b.addEventListener("click", () => {
      QP.store.set("champ_select.instant_lock", b.dataset.lock === "instant");
      hydrateBehavior();
    }),
  );
  $("lock_seconds").addEventListener("input", () => {
    QP.store.set("champ_select.lock_in_at_seconds", Number($("lock_seconds").value) || 0);
  });
  $("trades_enabled").addEventListener("change", () => {
    QP.store.set("champ_select.trades.enabled", $("trades_enabled").checked);
  });
  $("auto_runes").addEventListener("change", () => {
    QP.store.set("champ_select.auto_runes", $("auto_runes").checked);
  });
  $("show_intent").addEventListener("change", () => {
    QP.store.set("champ_select.show_intent", $("show_intent").checked);
  });
  $("spot-seg").addEventListener("click", (e) => {
    const chip = e.target.closest(".sort-opt");
    if (!chip) return;
    QP.store.set("champ_select.pick_spot", chip.dataset.spot);
    hydrateBehavior();
  });
  $("role-seg").addEventListener("click", (e) => {
    const chip = e.target.closest(".sort-opt");
    if (!chip) return;
    QP.store.set("champ_select.preferred_role", chip.dataset.role);
    hydrateBehavior();
  });
  $("delay-seg").addEventListener("click", (e) => {
    const chip = e.target.closest(".sort-opt");
    if (!chip) return;
    aramCfg().bench_delay = Number(chip.dataset.delay) || 0;
    QP.bus.emit("config:changed", { path: "champ_select.aram" });
    QP.store.scheduleSave();
    hydrateBehavior();
  });

  // Per-role default summoner spells: two mini slots in the tray header.
  [0, 1].forEach((slot) =>
    $(`def-spell-${slot}`).addEventListener("click", (e) => {
      e.stopPropagation();
      openDefSpellPicker(slot);
    }),
  );
  $("def-spell-pop").addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.closest(".lo-spell-clear")) { setDefSpell(defSpellSlot, 0); return; }
    const opt = e.target.closest(".lo-spell-opt");
    if (!opt || opt.classList.contains("disabled")) return;
    setDefSpell(defSpellSlot, Number(opt.dataset.spell));
  });
  document.addEventListener("click", (e) => {
    if (!$("def-spell-pop").classList.contains("hidden")
        && !e.target.closest("#def-spells")) {
      $("def-spell-pop").classList.add("hidden");
      defSpellSlot = -1;
    }
  });

  // Match-settings popover: the body overlays the page (no layout reflow, so
  // the open/close transform animates smoothly). Click-outside closes it.
  const settings = $("champ-settings");
  const settingsBody = settings.querySelector(".cs-set-body");
  let settingsAnim = null;
  function openSettings() {
    if (settingsAnim) settingsAnim.cancel();
    settings.open = true;
    refreshRuneInfo();
    settingsAnim = settingsBody.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.985)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 200, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)" },
    );
    settingsAnim.onfinish = () => { settingsAnim = null; };
  }
  function closeSettings() {
    if (!settings.open) return;
    if (settingsAnim) settingsAnim.cancel();
    settingsAnim = settingsBody.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(10px) scale(0.985)" },
      ],
      { duration: 150, easing: "ease-in" },
    );
    settingsAnim.onfinish = () => {
      settings.open = false;
      settingsAnim = null;
    };
  }
  settings.querySelector("summary").addEventListener("click", (e) => {
    e.preventDefault();
    if (settings.open) closeSettings();
    else openSettings();
  });
  document.addEventListener("click", (e) => {
    if (settings.open && !settings.contains(e.target)) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettings();
  });
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

  // Esc disarms the ban-add mode.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && banArmed) setBanArmed(false);
  });

  wireTrayEvents($("pick-tray"), "picks");
  wireTrayEvents($("ban-tray"), "bans");
  wireGridEvents();
}

// Point `plan` at the canonical config's roles object, normalizing each role
// in place so every key exists (older configs may miss arrays), then render.
function hydratePlan() {
  const rolesCfg = (champCfg().roles ||= {});
  for (const r of roles) {
    const rc = rolesCfg[r.key] ||= {};
    rc.bans ||= [];
    rc.picks ||= [];
    rc.loadouts ||= {};
    rc.default_spells ||= [];
    if (!ROLE_MODES.includes(rc.mode)) {
      // Import the pre-fallback ARAM mode keys; Rift roles default to off.
      if (r.key === "aram") {
        const a = aramCfg();
        rc.mode =
          a.mode && a.mode !== "list" && ROLE_MODES.includes(a.mode)
            ? a.mode
            : a.auto_mastery ? "highest" : "off";
      } else {
        rc.mode = "off";
      }
    }
  }
  plan = rolesCfg;
  hydrateBehavior();
  selectRole(activeRole || roles[0]?.key);
  updateAllBadges();
}

function hydrateBehavior() {
  const cs = champCfg();
  const instant = cs.instant_lock ?? true;
  document.querySelectorAll("#lock-seg .sort-opt").forEach((b) =>
    b.classList.toggle("active", (b.dataset.lock === "instant") === instant),
  );
  $("lock-delay-row").classList.toggle("hidden", instant);
  $("lock_seconds").value = cs.lock_in_at_seconds ?? 1;
  $("trades_enabled").checked = !!(cs.trades || {}).enabled;
  $("auto_runes").checked = !!cs.auto_runes;
  $("show_intent").checked = cs.show_intent ?? true;
  const spot = ["off", "1", "2", "3", "4", "5"].includes(String(cs.pick_spot))
    ? String(cs.pick_spot) : "off";
  document.querySelectorAll("#spot-seg .sort-opt").forEach((b) =>
    b.classList.toggle("active", b.dataset.spot === spot),
  );
  const prefer = ["off", "top", "jungle", "middle", "bottom", "utility"]
    .includes(String(cs.preferred_role)) ? String(cs.preferred_role) : "off";
  document.querySelectorAll("#role-seg .sort-opt").forEach((b) =>
    b.classList.toggle("active", b.dataset.role === prefer),
  );
  const delay = String(Math.round(Number(aramCfg().bench_delay) || 0));
  document.querySelectorAll("#delay-seg .sort-opt").forEach((b) =>
    b.classList.toggle("active", b.dataset.delay === (["0","1","2","3"].includes(delay) ? delay : "0")),
  );
}

// --- Per-role default summoner spells ---------------------------------------
let defSpellSlot = -1; // slot whose picker is open (-1 = none)

function renderDefSpells() {
  const ds = (plan[activeRole] || {}).default_spells || [];
  [0, 1].forEach((slot) => {
    const btn = $(`def-spell-${slot}`);
    const id = ds[slot];
    btn.classList.toggle("active", defSpellSlot === slot);
    btn.innerHTML = id
      ? `<img src="assets/spells/${id}.png" alt="${spellName(id)}" title="${spellName(id)}" />`
      : "+";
  });
}

function openDefSpellPicker(slot) {
  const ds = (plan[activeRole].default_spells ||= []);
  if (defSpellSlot === slot) { // clicking the open slot closes the picker
    defSpellSlot = -1;
    $("def-spell-pop").classList.add("hidden");
    renderDefSpells();
    return;
  }
  defSpellSlot = slot;
  const other = ds[slot === 0 ? 1 : 0];
  const cur = ds[slot];
  $("def-spell-pop").innerHTML =
    spellList
      .map((s) => {
        const dis = s.id === other ? " disabled" : "";
        const sel = s.id === cur ? " sel" : "";
        return (
          `<div class="lo-spell-opt${sel}${dis}" data-spell="${s.id}" title="${s.name}">` +
          `<img src="assets/spells/${s.id}.png" alt="${s.name}" /></div>`
        );
      })
      .join("") +
    (cur ? `<button type="button" class="lo-spell-clear">Clear this slot</button>` : "");
  $("def-spell-pop").classList.remove("hidden");
  renderDefSpells();
}

function setDefSpell(slot, id) {
  const ds = (plan[activeRole].default_spells ||= []);
  const arr = [ds[0] ?? 0, ds[1] ?? 0];
  arr[slot] = id; // 0 clears
  plan[activeRole].default_spells = arr.filter((x) => x > 0);
  defSpellSlot = -1;
  $("def-spell-pop").classList.add("hidden");
  renderDefSpells();
  QP.bus.emit("config:changed", { path: "champ_select.roles" });
  scheduleSave();
}

// --- Role tabs / gating / per-tab views ------------------------------------
function selectRole(role) {
  activeRole = role;
  setBanArmed(false);
  defSpellSlot = -1;
  $("def-spell-pop").classList.add("hidden");
  document.querySelectorAll(".role-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.role === role);
  });
  applyGate();
  applyAramView();
  renderFallback();
  renderDefSpells();
  renderTray();
  renderGrid($("champ-search").value);
}

// The gate replaces the editor when the active tab's feature is off; the
// editor reappears in place the moment the inline toggle flips on.
function applyGate() {
  const on = featureOn(activeRole);
  const gate = $("champ-gate");
  gate.classList.toggle("hidden", on);
  gate.classList.toggle("flex", !on);
  $("champ-editor").classList.toggle("hidden", !on);
  if (on) return;
  const isAram = activeRole === "aram";
  $("champ-gate-ico").innerHTML = isAram
    ? ARAM_ICON
    : `<img src="assets/positions/${activeRole}.svg" style="width:100%;height:100%" onerror="this.style.display='none'" />`;
  $("champ-gate-title").textContent = isAram
    ? "ARAM auto-pilot is off"
    : "Auto Pick / Ban is off";
  $("champ-gate-caption").textContent = isAram
    ? "queuePop picks the best of the 2-3 champs you're offered in under a second, then keeps grabbing upgrades off the bench."
    : "queuePop hovers, bans, picks, and locks for you in Draft and Ranked — in the order you set here.";
  $("champ-gate-toggle").checked = false;
}

// Per-tab chrome: ARAM relabels both trays (its "bans" are the never-play
// avoid list) and gets its own caption. One short line; the fallback details
// live in the dropdown's tooltip.
function applyAramView() {
  const isAram = activeRole === "aram";
  $("pick-tray-label").textContent = isAram ? "Priority list" : "Picks";
  $("ban-tray-label").textContent = isAram ? "Never play" : "Bans";
  $("tray-caption").textContent = isAram
    ? "Chased in order — best offered champ first, then bench upgrades. Never-play champs are never picked or swapped to."
    : "Picked in order — if #1 is gone, queuePop takes #2.";
}

function renderFallback() {
  const cur = roleMode(activeRole);
  const sel = $("fallback-mode");
  sel.innerHTML = FALLBACK_MODES
    .map((m) => `<option value="${m.key}">${m.name}</option>`)
    .join("");
  sel.value = cur;
  const mode = FALLBACK_MODES.find((m) => m.key === cur);
  sel.title = mode ? mode.cap : "";
}

// --- Plan tray --------------------------------------------------------------
const TRAY_X =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3.2" y1="3.2" x2="8.8" y2="8.8"/><line x1="8.8" y1="3.2" x2="3.2" y2="8.8"/></svg>';

function traySlotHtml(name, idx, kind) {
  const id = nameToId[(name || "").toLowerCase()];
  const isBan = kind === "bans";
  const hasLo = !isBan && id && !!(plan[activeRole].loadouts || {})[String(id)];
  const media = id
    ? `<img src="assets/champions/${id}.png" draggable="false" onerror="this.style.visibility='hidden'" />`
    : `<span class="tray-initials">${initials(name)}</span>`;
  return (
    `<div class="tray-slot${isBan ? " ban" : ""}" draggable="true" ` +
      `data-name="${escapeHtml(name)}" data-id="${id || 0}" data-kind="${kind}" title="${escapeHtml(name)}">` +
      media +
      `<span class="cell-num${isBan ? " ban" : ""}">${idx + 1}</span>` +
      (hasLo ? `<span class="cell-loadout" title="Loadout set"></span>` : "") +
      `<span class="cell-x" title="Remove">${TRAY_X}</span>` +
    `</div>`
  );
}

function renderTray() {
  if (!activeRole || !plan[activeRole]) return;
  const rc = plan[activeRole];
  $("pick-tray").innerHTML =
    rc.picks.map((n, i) => traySlotHtml(n, i, "picks")).join("") +
    `<div class="tray-slot ghost" role="button" tabindex="0" data-ghost="picks" ` +
      `title="Add a pick — click or drag a champion from the list below">+</div>`;
  const banTitle = activeRole === "aram"
    ? "Add a never-play champ — click to arm the catalog, or drag a champion here"
    : "Add a ban — click to arm the catalog, or drag a champion here";
  $("ban-tray").innerHTML =
    rc.bans.map((n, i) => traySlotHtml(n, i, "bans")).join("") +
    `<div class="tray-slot ghost ban${banArmed ? " armed" : ""}" role="button" tabindex="0" data-ghost="bans" ` +
      `title="${banTitle}">+</div>`;
}

function setBanArmed(on) {
  banArmed = on;
  $("champ-grid").classList.toggle("ban-armed", on);
  const ghost = document.querySelector('#ban-tray .tray-slot.ghost');
  if (ghost) ghost.classList.toggle("armed", on);
}

// Tray interactions: click body → loadout (picks), ✕ → remove, ghost "+" →
// focus the catalog (picks) or arm ban-add (bans). Dragging reorders within a
// tray AND moves champs between the picks and bans trays — drop on a slot to
// insert there, or on empty tray space to append.
let trayDrag = null; // {kind, name} — the slot being dragged (one at a time)

function wireTrayEvents(tray, kind) {
  tray.addEventListener("click", (e) => {
    const ghost = e.target.closest(".tray-slot.ghost");
    if (ghost) {
      if (kind === "bans") setBanArmed(!banArmed);
      else { setBanArmed(false); $("champ-search").focus(); }
      return;
    }
    const slot = e.target.closest(".tray-slot");
    if (!slot) return;
    if (e.target.closest(".cell-x")) {
      removeFromPlan(kind, slot.dataset.name);
      return;
    }
    if (kind === "picks" && Number(slot.dataset.id)) {
      openLoadout(activeRole, Number(slot.dataset.id));
    }
  });

  tray.addEventListener("dragstart", (e) => {
    const slot = e.target.closest(".tray-slot:not(.ghost)");
    if (!slot) return;
    trayDrag = { kind: slot.dataset.kind, name: slot.dataset.name };
    e.dataTransfer.effectAllowed = "move";
    slot.classList.add("drag-src");
  });
  tray.addEventListener("dragend", (e) => {
    e.target.closest(".tray-slot")?.classList.remove("drag-src");
    trayDrag = null;
  });
  tray.addEventListener("dragover", (e) => {
    if (!trayDrag) return;
    e.preventDefault(); // accept drops from the other tray AND the catalog
    tray.classList.add("drop-hover");
  });
  tray.addEventListener("dragleave", (e) => {
    if (!tray.contains(e.relatedTarget)) tray.classList.remove("drop-hover");
  });
  tray.addEventListener("drop", (e) => {
    tray.classList.remove("drop-hover");
    if (!trayDrag) return;
    e.preventDefault();
    const src = trayDrag;
    trayDrag = null;
    dropIntoTray(src, kind, e.target.closest(".tray-slot:not(.ghost)"));
  });
}

// Land a dragged champ in a tray: from the other tray (move), from the same
// tray (reorder), or from the catalog (add — or move, if it was already
// planned somewhere). Inserts at the drop slot, appends on empty space.
function dropIntoTray(src, kind, slot) {
  const rc = plan[activeRole];
  const lc = src.name.toLowerCase();
  // Where does this champ currently live? Catalog drags carry kind=null.
  let srcKind = src.kind;
  if (!srcKind) {
    if (rc.picks.some((n) => n.toLowerCase() === lc)) srcKind = "picks";
    else if (rc.bans.some((n) => n.toLowerCase() === lc)) srcKind = "bans";
  }
  const toList = rc[kind];
  let to = slot
    ? toList.findIndex((n) => n.toLowerCase() === slot.dataset.name.toLowerCase())
    : -1;
  if (srcKind) {
    const fromList = rc[srcKind];
    const from = fromList.findIndex((n) => n.toLowerCase() === lc);
    if (from < 0) return;
    if (srcKind === kind && (to === from || (to < 0 && from === fromList.length - 1)))
      return; // dropped where it already is
    const [m] = fromList.splice(from, 1);
    if (srcKind === kind && to > from) to -= 1; // account for the removal
    if (to >= 0) toList.splice(to, 0, m);
    else toList.push(m);
  } else {
    if (to >= 0) toList.splice(to, 0, src.name);
    else toList.push(src.name);
  }
  afterPlanChange();
}

function addToPlan(kind, name) {
  const list = plan[activeRole][kind];
  if (list.some((n) => n.toLowerCase() === name.toLowerCase())) return;
  list.push(name);
  afterPlanChange();
}
function removeFromPlan(kind, name) {
  const list = plan[activeRole][kind];
  const i = list.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  if (i >= 0) list.splice(i, 1);
  afterPlanChange();
}
function afterPlanChange() {
  updateBadge(activeRole);
  renderTray();
  renderGrid($("champ-search").value);
  QP.bus.emit("config:changed", { path: "champ_select.roles" });
  scheduleSave();
}

// Briefly pulse a champ's tray slot (clicking a planned champ in the catalog).
function pulseTraySlot(name) {
  const slot = document.querySelector(
    `#tray-wrap .tray-slot[data-name="${CSS.escape(name)}"]`,
  );
  if (slot) replay(slot, "pulse");
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

// --- Catalog (add-only) ------------------------------------------------------
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

// Order the catalog by the active sort.
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

// Render the full catalog in the active sort. Planned champs keep their ring
// (gold pick / red ban) in place for orientation, but the catalog is add-only:
// the tray owns editing.
function renderGrid(filter) {
  const grid = $("champ-grid");
  if (!activeRole || !plan[activeRole]) return;
  const f = (filter || "").trim().toLowerCase();
  const rc = plan[activeRole];
  const pickSet = new Set(rc.picks.map((n) => n.toLowerCase()));
  const banSet = new Set(rc.bans.map((n) => n.toLowerCase()));

  const ordered = catalog.slice();
  sortChamps(ordered);

  const frag = document.createDocumentFragment();
  ordered.forEach((c) => {
    if (
      f &&
      !c.name.toLowerCase().includes(f) &&
      !(c.alias || "").toLowerCase().includes(f)
    )
      return;
    const key = c.name.toLowerCase();
    const isPick = pickSet.has(key);
    const isBan = banSet.has(key);
    const cell = document.createElement("div");
    cell.className = "grid-cell" + (isPick ? " sel" : isBan ? " sel ban" : "");
    cell.dataset.name = c.name;
    cell.dataset.id = c.id;
    cell.title = isPick
      ? `${c.name} — pick #${rc.picks.findIndex((n) => n.toLowerCase() === key) + 1}`
      : isBan
        ? `${c.name} — banned`
        : c.name;
    cell.draggable = true; // drag straight into the picks/bans trays
    cell.innerHTML =
      `<img src="assets/champions/${c.id}.png" width="128" height="128" draggable="false" />` +
      cellMeta(c.id);
    frag.appendChild(cell);
  });

  const st = grid.scrollTop;
  grid.innerHTML = "";
  grid.appendChild(frag);
  grid.scrollTop = st;
}

// Catalog: click to add a pick (or a ban while armed); clicking a planned
// champ pulses its tray slot. Cells are also drag sources for the trays.
function wireGridEvents() {
  const grid = $("champ-grid");
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (!cell) return;
    const name = cell.dataset.name;
    const key = name.toLowerCase();
    const rc = plan[activeRole];
    const planned =
      rc.picks.some((n) => n.toLowerCase() === key) ||
      rc.bans.some((n) => n.toLowerCase() === key);
    if (planned) {
      pulseTraySlot(name);
      return;
    }
    if (banArmed) {
      addToPlan("bans", name);
      setBanArmed(false); // one-shot
    } else {
      addToPlan("picks", name);
    }
  });
  grid.addEventListener("dragstart", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (!cell) return;
    trayDrag = { kind: null, name: cell.dataset.name }; // catalog source
    e.dataTransfer.effectAllowed = "copyMove";
    cell.classList.add("drag-src");
  });
  grid.addEventListener("dragend", (e) => {
    e.target.closest(".grid-cell")?.classList.remove("drag-src");
    trayDrag = null;
    document.querySelectorAll(".tray.drop-hover").forEach((t) =>
      t.classList.remove("drop-hover"),
    );
  });
  // Fade the grid's top edge only once it's actually scrolled (the bottom
  // fade is always on; an unscrolled grid keeps a crisp first row).
  grid.addEventListener(
    "scroll",
    () => grid.classList.toggle("scrolled-top", grid.scrollTop > 4),
    { passive: true },
  );
}

// --- Recommended Runes: manage queuePop's dedicated rune page ---------------
// Recommended-runes writes to one page named "queuePop (auto)". If the user is
// at their rune-page cap with no such page, they pick one here to hand over.
async function refreshRuneInfo() {
  const status = $("rune-managed-status");
  const wrap = $("rune-claim-wrap");
  let info = { pages: [], managed: null, at_cap: false };
  try { info = (await api().get_rune_info()) || info; } catch (_) {}

  if (info.managed) {
    status.innerHTML = `✓ using <span class="text-gold2">${info.managed.name}</span>`;
    status.className = "rune-status text-gold2";
    wrap.classList.add("hidden");
    return;
  }
  if (!info.pages.length && !info.at_cap) {
    status.textContent = "Connect the client to check.";
    status.className = "rune-status text-subText";
    wrap.classList.add("hidden");
    return;
  }
  if (info.at_cap) {
    status.textContent = "Rune pages full — pick one below.";
    status.className = "rune-status text-gold4";
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
    status.textContent = "Ready — nothing to set up.";
    status.className = "rune-status text-subText";
    wrap.classList.add("hidden");
  }
}

QP._loaded.push("pages/champ");
