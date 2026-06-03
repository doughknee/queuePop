/* queueBot web UI logic — talks to Python via pywebview.api */

const api = () => window.pywebview.api;
const $ = (id) => document.getElementById(id);

// Retrigger a CSS animation by removing the class, forcing reflow, re-adding.
function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function flashPop() { replay($("flash"), "go"); }

let lastEventId = 0;
let roles = [];
let queueMap = {};          // queueId -> display name
let catalog = [];           // [{id, name, alias}]
let nameToId = {};          // lowercased name/alias -> id
let plan = {};              // role -> { bans: [name], picks: [name] }
let activeRole = null;      // currently edited role
let activeMode = "picks";   // "picks" | "bans" — what the grid adds to

const LEVEL_COLOR = {
  info: "text-blue2",
  success: "text-gold1",
  warning: "text-gold4",
  danger: "text-red-400",
};

// --- Champion asset helpers --------------------------------------------
function champIcon(name) {
  const id = nameToId[(name || "").toLowerCase()];
  return id ? `assets/champions/${id}.png` : null;
}
function initials(name) {
  return (name || "?").replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "?";
}
function resolveName(raw) {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return null;
  const c =
    catalog.find((c) => c.name.toLowerCase() === key) ||
    catalog.find((c) => (c.alias || "").toLowerCase() === key);
  return c ? c.name : null;
}

// --- Tabs ---------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const active = b === btn;
      b.classList.toggle("border-gold2", active);
      b.classList.toggle("text-gold1", active);
      b.classList.toggle("border-transparent", !active);
      b.classList.toggle("text-icon", !active);
    });
    $("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
    $("tab-champ").classList.toggle("hidden", tab !== "champ");
    $("tab-settings").classList.toggle("hidden", tab !== "settings");
    replay($(`tab-${tab}`), "fade-up");
    const showSave = tab !== "dashboard";
    $("save-bar").classList.toggle("hidden", !showSave);
    $("save-bar").classList.toggle("flex", showSave);
  });
});

// --- Pause toggle -------------------------------------------------------
$("pause-btn").addEventListener("click", async () => {
  const status = await api().get_status();
  const paused = await api().set_paused(!status.paused);
  renderPause(paused);
});

function renderPause(paused) {
  const btn = $("pause-btn");
  btn.textContent = paused ? "Resume" : "Pause";
  btn.classList.toggle("text-gold4", paused);
  btn.classList.toggle("text-grey1", !paused);
}

// --- Status polling -----------------------------------------------------
async function refreshStatus() {
  try {
    const s = await api().get_status();
    $("version").textContent = s.version;

    const pill = $("conn-pill");
    pill.textContent = s.connected ? "Client: connected" : "Client: waiting…";
    pill.className = "hextech text-sm px-3 py-1.5 " + (s.connected ? "text-blue2" : "text-subText");

    $("hero-status").textContent = s.paused ? "Paused" : "Monitoring";
    $("hero-status").className =
      "font-display text-2xl leading-tight " + (s.paused ? "text-gold4" : "text-gold1");
    $("hero-dot").className =
      "h-3.5 w-3.5 rounded-full shrink-0 " + (s.paused ? "bg-gold4" : "bg-blue2 dot-pulse");
    $("hero-client").textContent = s.connected ? "Connected" : "Waiting…";
    $("hero-client").className =
      "font-display text-lg leading-tight mt-0.5 " + (s.connected ? "text-blue2" : "text-subText");

    $("stat-champ").textContent = s.champ_select_enabled ? "On" : "Off";
    $("stat-webhook").textContent = s.webhook_configured ? "Configured" : "Disabled";
    $("stat-champs-loaded").textContent = catalog.length || s.champions_loaded || 0;

    renderPause(s.paused);
  } catch (e) {
    /* window may be mid-teardown; ignore */
  }
}

// --- Activity feed ------------------------------------------------------
async function refreshEvents() {
  try {
    const { events } = await api().get_events(lastEventId);
    if (!events.length) return;
    const initial = lastEventId === 0; // backfill on first load — don't animate/flash
    const list = $("activity");
    if (initial) list.innerHTML = "";
    for (const ev of events) {
      lastEventId = Math.max(lastEventId, ev.id);
      const li = document.createElement("li");
      li.className =
        (LEVEL_COLOR[ev.level] || "text-grey1") +
        " border-l-2 border-gold5/40 pl-2" +
        (initial ? "" : " fade-up");
      li.textContent = ev.message;
      list.prepend(li);
      // Celebrate the signature moment.
      if (!initial && /queue popped/i.test(ev.message)) flashPop();
    }
    while (list.children.length > 100) list.removeChild(list.lastChild);
  } catch (e) {
    /* ignore */
  }
}

// --- Champion catalog (bundled, offline) -------------------------------
async function loadCatalog() {
  // Read via Python — WebView2 blocks fetch() of local files under file://.
  try {
    catalog = (await api().get_champion_catalog()) || [];
  } catch (e) {
    catalog = [];
  }
  nameToId = {};
  for (const c of catalog) {
    nameToId[c.name.toLowerCase()] = c.id;
    if (c.alias) nameToId[c.alias.toLowerCase()] = c.id;
  }
}

// --- Settings build (queues + role pickers) ----------------------------
async function buildSettings() {
  const queues = await api().get_queue_map();
  queueMap = {};
  for (const q of queues) queueMap[q.id] = q.name;
  const qWrap = $("queues");
  qWrap.innerHTML = "";
  for (const q of queues) {
    const label = document.createElement("label");
    label.className = "flex items-center gap-2.5 text-sm text-grey1 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-queue="${q.id}" class="w-4 h-4" style="accent-color:#C8AA6E;" /><span>${q.name}</span>`;
    qWrap.appendChild(label);
  }

  roles = await api().get_roles();
  buildChampTab();
}

// --- Champ Select: roles on top, selected-first champion grid ----------
function buildChampTab() {
  const bar = $("role-bar");
  bar.innerHTML = "";
  for (const r of roles) {
    if (!plan[r.key]) plan[r.key] = { bans: [], picks: [] };
    const short = r.label.replace(/\s*\(.*\)/, ""); // "Bottom (ADC)" -> "Bottom"
    const b = document.createElement("button");
    b.className =
      "role-tab flex-1 flex items-center justify-center gap-2 px-2 py-2.5 " +
      "border-b-2 border-transparent hover:bg-hextech-black/30 transition";
    b.dataset.role = r.key;
    b.innerHTML = `
      <img src="assets/positions/${r.key}.svg" class="h-6 w-6" onerror="this.style.display='none'" />
      <span class="role-label font-serif text-sm text-grey1">${short}</span>
      <span data-badge class="text-xs text-gold2"></span>`;
    b.addEventListener("click", () => selectRole(r.key));
    bar.appendChild(b);
  }

  $("mode-picks").addEventListener("click", () => setMode("picks"));
  $("mode-bans").addEventListener("click", () => setMode("bans"));
  $("champ-search").addEventListener("input", (e) => renderGrid(e.target.value));
  $("goto-settings").addEventListener("click", () =>
    document.querySelector('.tab-btn[data-tab="settings"]').click()
  );
  $("champ_enabled").addEventListener("change", (e) => updateChampView(e.target.checked));

  wireGridEvents();
  setMode("picks");
}

function updateChampView(enabled) {
  $("champ-disabled").classList.toggle("hidden", enabled);
  $("champ-enabled-view").classList.toggle("hidden", !enabled);
}

function selectRole(role) {
  activeRole = role;
  document.querySelectorAll(".role-tab").forEach((b) => {
    const on = b.dataset.role === role;
    b.classList.toggle("border-gold2", on);
    b.classList.toggle("bg-hextech-black/40", on);
    b.classList.toggle("border-transparent", !on);
    b.querySelector(".role-label")?.classList.toggle("text-gold1", on);
    b.querySelector(".role-label")?.classList.toggle("text-grey1", !on);
  });
  renderGrid($("champ-search").value);
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
  renderGrid($("champ-search").value);
}

// Renders all champions with the active mode's selections pulled to the front
// (numbered, in priority order), then the rest alphabetically. Search filters all.
function renderGrid(filter) {
  const grid = $("champ-grid");
  if (!activeRole) return;
  const f = (filter || "").trim().toLowerCase();
  const selList = plan[activeRole][activeMode] || [];
  const selSet = new Set(selList.map((n) => n.toLowerCase()));

  const byName = (n) => catalog.find((c) => c.name.toLowerCase() === n.toLowerCase());
  const selectedChamps = selList.map(byName).filter(Boolean);
  const rest = catalog.filter((c) => !selSet.has(c.name.toLowerCase()));
  const ordered = selectedChamps.concat(rest);

  const frag = document.createDocumentFragment();
  ordered.forEach((c) => {
    if (f && !c.name.toLowerCase().includes(f) && !(c.alias || "").toLowerCase().includes(f)) return;
    const order = selList.findIndex((n) => n.toLowerCase() === c.name.toLowerCase());
    const isSel = order >= 0;
    const cell = document.createElement("button");
    cell.className =
      "grid-cell relative h-14 w-14 overflow-hidden border transition " +
      (isSel ? "border-gold2 cursor-grab" : "border-transparent hover:border-gold3");
    cell.dataset.name = c.name;
    cell.title = c.name;
    if (isSel) cell.draggable = true;
    cell.innerHTML =
      `<img src="assets/champions/${c.id}.png" class="w-full h-full object-cover" draggable="false" />` +
      (isSel
        ? `<span class="absolute inset-0 ring-2 ring-inset ring-gold2 bg-gold2/15"></span>
           <span class="absolute top-0 left-0 h-4 min-w-4 px-0.5 grid place-items-center text-xs font-bold bg-gold5 text-hextech-black">${order + 1}</span>`
        : "");
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
}

// Small count badge on each top-bar role button.
function updateBadge(role) {
  const b = document.querySelector(`.role-tab[data-role="${role}"] [data-badge]`);
  if (!b) return;
  const p = (plan[role]?.picks || []).length;
  const bn = (plan[role]?.bans || []).length;
  b.textContent = p || bn ? `${p}·${bn}` : "";
  b.title = `${p} picks · ${bn} bans`;
}

function updateAllBadges() {
  for (const r of roles) updateBadge(r.key);
}

// Click to add/remove; drag a selected (front) champ onto another selected
// champ to reorder priority.
function wireGridEvents() {
  const grid = $("champ-grid");
  let dragName = null;

  grid.addEventListener("click", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (cell) toggleChamp(cell.dataset.name);
  });
  grid.addEventListener("dragstart", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (!cell || !cell.draggable) return;
    dragName = cell.dataset.name;
    e.dataTransfer.effectAllowed = "move";
    cell.classList.add("opacity-40");
  });
  grid.addEventListener("dragend", (e) => {
    const cell = e.target.closest(".grid-cell");
    if (cell) cell.classList.remove("opacity-40");
  });
  grid.addEventListener("dragover", (e) => { if (dragName) e.preventDefault(); });
  grid.addEventListener("drop", (e) => {
    if (!dragName) return;
    e.preventDefault();
    const cell = e.target.closest(".grid-cell");
    if (!cell || !cell.draggable) { dragName = null; return; } // only drop onto a selected champ
    const list = plan[activeRole][activeMode];
    const from = list.findIndex((n) => n.toLowerCase() === dragName.toLowerCase());
    const to = list.findIndex((n) => n.toLowerCase() === cell.dataset.name.toLowerCase());
    if (from >= 0 && to >= 0 && from !== to) {
      const [m] = list.splice(from, 1);
      list.splice(to, 0, m);
      renderGrid($("champ-search").value);
    }
    dragName = null;
  });
}

// --- Config load / gather ----------------------------------------------
async function loadConfig() {
  const c = await api().get_config();
  $("webhook_url").value = c.webhook_url || "";
  $("user_id").value = c.user_id || "";
  $("desktop_notifications").checked = !!c.desktop_notifications;
  const champEnabled = !!(c.champ_select && c.champ_select.enabled);
  $("champ_enabled").checked = champEnabled;
  $("lock_seconds").value = (c.champ_select && c.champ_select.lock_in_at_seconds) ?? 1;
  updateChampView(champEnabled);

  const allowed = new Set((c.allowed_queue_ids || []).map(Number));
  document.querySelectorAll("[data-queue]").forEach((cb) => {
    cb.checked = allowed.has(Number(cb.dataset.queue));
  });

  const rolesCfg = (c.champ_select && c.champ_select.roles) || {};
  for (const r of roles) {
    const rc = rolesCfg[r.key] || {};
    plan[r.key] = {
      bans: [...(rc.bans || [])],
      picks: [...(rc.picks || [])],
    };
  }
  if (!activeRole) {
    selectRole(roles[0]?.key);
  } else {
    renderGrid($("champ-search").value);
  }
  updateAllBadges();

  renderSummary(c);
  renderPlan(c);
}

function gatherConfig() {
  const allowed = [];
  document.querySelectorAll("[data-queue]").forEach((cb) => {
    if (cb.checked) allowed.push(Number(cb.dataset.queue));
  });

  const rolesOut = {};
  for (const r of roles) {
    rolesOut[r.key] = {
      bans: [...(plan[r.key]?.bans || [])],
      picks: [...(plan[r.key]?.picks || [])],
    };
  }

  return {
    webhook_url: $("webhook_url").value,
    user_id: $("user_id").value,
    desktop_notifications: $("desktop_notifications").checked,
    allowed_queue_ids: allowed,
    champ_select: {
      enabled: $("champ_enabled").checked,
      lock_in_at_seconds: Number($("lock_seconds").value) || 0,
      roles: rolesOut,
    },
  };
}

// --- Dashboard: config summary + champ-select plan ---------------------
function renderSummary(c) {
  const ids = c.allowed_queue_ids || [];
  $("sum-queues").textContent = ids.length
    ? ids.map((id) => queueMap[id] || "#" + id).join(", ")
    : "All queues";
  $("sum-notif").textContent = c.desktop_notifications ? "On" : "Off";
  const cs = c.champ_select || {};
  $("sum-champ").textContent = cs.enabled ? `On — lock at ${cs.lock_in_at_seconds}s` : "Off";
}

function planChip(name) {
  const icon = champIcon(name);
  const media = icon
    ? `<img src="${icon}" class="h-5 w-5 object-cover inline-block align-middle" />`
    : `<span class="h-5 w-5 inline-grid place-items-center text-[8px] text-gold1 bg-blue5 align-middle">${initials(name)}</span>`;
  return `<span class="inline-flex items-center gap-1 align-middle">${media}<span class="text-grey1">${name}</span></span>`;
}

function renderPlan(c) {
  const cs = c.champ_select || {};
  const rolesCfg = cs.roles || {};
  const panel = $("plan-panel");
  const wrap = $("plan");

  const configured = roles.filter((r) => {
    const rc = rolesCfg[r.key] || {};
    return (rc.bans || []).length || (rc.picks || []).length;
  });

  if (!cs.enabled || !configured.length) {
    panel.classList.add("hidden");
    return;
  }
  panel.classList.remove("hidden");
  wrap.innerHTML = configured
    .map((r) => {
      const rc = rolesCfg[r.key] || {};
      const pick = (rc.picks || [])[0];
      const ban = (rc.bans || [])[0];
      const extra = (rc.picks || []).length > 1 ? ` <span class="text-gold5">+${rc.picks.length - 1}</span>` : "";
      return `<div class="grid grid-cols-[7rem_1fr_1fr] items-center gap-2 py-0.5">
        <span class="flex items-center gap-1.5">
          <img src="assets/positions/${r.key}.svg" class="h-4 w-4" onerror="this.style.display='none'" />
          <span class="font-serif text-gold2 text-sm">${r.label}</span>
        </span>
        <span class="text-sm"><span class="text-subText text-xs mr-1">PICK</span>${pick ? planChip(pick) : "—"}${extra}</span>
        <span class="text-sm"><span class="text-subText text-xs mr-1">BAN</span>${ban ? planChip(ban) : "—"}</span>
      </div>`;
    })
    .join("");
}

// --- Save ---------------------------------------------------------------
$("save-btn").addEventListener("click", async () => {
  const status = $("save-status");
  status.textContent = "Saving…";
  const res = await api().save_config(gatherConfig());
  if (res && res.ok) {
    status.textContent = "✓ Saved";
    status.className = "text-xs text-gold2";
    await loadConfig();
  } else {
    status.textContent = "✗ " + ((res && res.error) || "Failed");
    status.className = "text-xs text-red-400";
  }
  setTimeout(() => (status.textContent = ""), 2500);
});

// --- Boot ---------------------------------------------------------------
async function boot() {
  // Build the UI; never let a single render error stop status polling.
  try {
    await loadCatalog();
    await buildSettings();
    await loadConfig();
  } catch (e) {
    console.error("queueBot UI build error:", e);
  }
  await refreshStatus();
  await refreshEvents();
  setInterval(refreshStatus, 1500);
  setInterval(refreshEvents, 1000);
}

if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener("pywebviewready", boot);
}
