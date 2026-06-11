/* Champ Select editor: role tabs, the picks/bans grid, drag-reorder, and the
   plan state. `plan` IS the store's champ_select.roles object — editor
   mutations write straight into the canonical config, so saving is a plain
   debounce with no DOM scraping.
   On-disk shape: champ_select.roles.<role>.{picks,bans,loadouts}. */

let plan = {}; // alias of QP.store.config.champ_select.roles after hydratePlan()
let activeRole = null; // currently edited role
let activeMode = "picks"; // "picks" | "bans", what the grid adds to
let activeSort = "az"; // "az" | "mastery" | "recent", grid ordering of unselected champs
let aramAutoMastery = false; // true when the ARAM champ-priority mode isn't "list" (editor tab locked)

// Inline ARAM glyph (no position SVG exists for it), a 4-way poke/mirror mark.
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
  // Mirror the ARAM glyph into the locked panel so it matches its role tab.
  const lockIco = document.querySelector("#aram-locked .role-ico");
  if (lockIco) lockIco.innerHTML = ARAM_ICON;
  // The champ-priority mode locks/unlocks the ARAM editor tab live (any mode
  // other than the hand-built list means the list is unused).
  $("aram_mode").addEventListener("change", (e) =>
    setAramMode(e.target.value),
  );
  $("aram-goto-settings").addEventListener("click", () => {
    activateTab("settings");
    const a = $("set-champ-aram");
    if (a) a.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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

// Point `plan` at the canonical config's roles object, normalizing each role
// in place so every key exists (older configs may miss arrays).
function hydratePlan() {
  const cs = QP.store.config.champ_select ||= {};
  const rolesCfg = cs.roles ||= {};
  for (const r of roles) {
    const rc = rolesCfg[r.key] ||= {};
    rc.bans ||= [];
    rc.picks ||= [];
    rc.loadouts ||= {};
  }
  plan = rolesCfg;
  // selectRole re-renders both the mode buttons and the catalog grid.
  selectRole(activeRole || roles[0]?.key);
  updateAllBadges();
}

function updateChampView(enabled) {
  $("champ-disabled").classList.toggle("hidden", enabled);
  $("champ-enabled-view").classList.toggle("hidden", !enabled);
}

// When the ARAM priority mode isn't "list", the hand-built ARAM list is unused:
// dim its tab and swap the grid for a notice that links back to the setting.
const ARAM_MODES = ["list", "highest", "lowest", "random", "rusty", "milestone"];
const ARAM_MODE_LABELS = {
  highest: "by highest mastery",
  lowest: "by lowest mastery — learning new champs",
  random: "at random — chaos mode",
  rusty: "by rust — least recently played first",
  milestone: "by mastery milestone — closest level-up first",
};

function setAramMode(mode) {
  aramAutoMastery = mode !== "list";
  const blurb = $("aram-locked-mode");
  if (blurb && ARAM_MODE_LABELS[mode]) blurb.textContent = ARAM_MODE_LABELS[mode];
  updateAramTab();
  applyAramLock();
}

function updateAramTab() {
  const tab = document.querySelector('.role-tab[data-role="aram"]');
  if (tab) tab.classList.toggle("auto", aramAutoMastery);
}

function applyAramLock() {
  const locked = aramAutoMastery && activeRole === "aram";
  $("champ-toolbar").classList.toggle("hidden", locked);
  $("champ-hint").classList.toggle("hidden", locked);
  $("champ-grid").classList.toggle("hidden", locked);
  $("aram-locked").classList.toggle("hidden", !locked);
}

function selectRole(role) {
  activeRole = role;
  document.querySelectorAll(".role-tab").forEach((b) => {
    b.classList.toggle("active", b.dataset.role === role);
  });
  // ARAM has no bans, hide the toggle and force Picks (its picks list doubles
  // as the bench-swap + trade priority order).
  const isAram = role === "aram";
  $("mode-bans").classList.toggle("hidden", isAram);
  if (isAram && activeMode === "bans") activeMode = "picks";
  setMode(activeMode); // refreshes mode buttons, hint, and the grid
  applyAramLock(); // locks the editor when ARAM is on auto-mastery
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
        `Your ARAM <span class="text-gold2">priority list</span>, queuePop grabs ` +
        `the highest-ranked of these off the reroll bench (and trades toward it). ` +
        `Click to add; drag to reorder.`;
    } else {
      const isBan = mode === "bans";
      const word = isBan ? "bans" : "picks";
      const color = isBan ? "text-red-400" : "text-gold2";
      hint.innerHTML =
        `Click to add, your <span class="${color}">${word}</span> move to the front, ` +
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
// passed here, they stay pinned to the front in their priority order.
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

QP._loaded.push("pages/champ");
