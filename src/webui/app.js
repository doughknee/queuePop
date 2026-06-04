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
function flashPop() {
  replay($("flash"), "go");
}

let lastEventId = 0;
let roles = [];
let queueMap = {}; // queueId -> display name
let catalog = []; // [{id, name, alias}]
let nameToId = {}; // lowercased name/alias -> id
let plan = {}; // role -> { bans: [name], picks: [name] }
let activeRole = null; // currently edited role
let activeMode = "picks"; // "picks" | "bans" — what the grid adds to
let customSoundPath = ""; // absolute path to the user's custom alarm file
let previewCtx = null; // lazily-created AudioContext for Settings sound preview

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
  return (
    (name || "?")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
function resolveName(raw) {
  const key = (raw || "").trim().toLowerCase();
  if (!key) return null;
  const c =
    catalog.find((c) => c.name.toLowerCase() === key) ||
    catalog.find((c) => (c.alias || "").toLowerCase() === key);
  return c ? c.name : null;
}

// --- Route nav (icon tabs) ---------------------------------------------
function activateTab(tab) {
  document.querySelectorAll(".nav-route").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
  $("tab-champ").classList.toggle("hidden", tab !== "champ");
  $("tab-settings").classList.toggle("hidden", tab !== "settings");
  replay($(`tab-${tab}`), "fade-up");
  const showSave = tab !== "dashboard";
  $("save-bar").classList.toggle("hidden", !showSave);
  $("save-bar").classList.toggle("flex", showSave);
}
document.querySelectorAll(".nav-route").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

// --- Pause toggle (title-strip indicator) ------------------------------
let lastConnected = null; // tracks client connect/disconnect transitions

$("pause-btn").addEventListener("click", async () => {
  const status = await api().get_status();
  const paused = await api().set_paused(!status.paused);
  renderPause(paused);
});

function renderPause(paused) {
  const label = $("pause-label");
  if (label) label.textContent = paused ? "Resume" : "Pause";
  const btn = $("pause-btn");
  if (btn) btn.style.color = paused ? "#C8983C" : ""; // gold4 when paused
  const ico = $("pause-ico");
  if (ico) {
    ico.innerHTML = paused
      ? '<path d="M3 2.2 L10 6 L3 9.8 Z" />' // play (resume)
      : '<rect x="2.6" y="2" width="2.3" height="8" rx="0.4" />' +
        '<rect x="7.1" y="2" width="2.3" height="8" rx="0.4" />'; // pause bars
  }
}

// --- PLAY button (launch client / quick-queue / cancel) ----------------
// Mode is set by updatePlay() from the live gameflow phase.
function updatePlay(s) {
  const btn = $("play-btn");
  const label = $("play-label");
  if (!btn || !label) return;
  let text = "PLAY", mode = "queue", disabled = false;
  if (!s.connected) {
    text = "PLAY"; mode = "launch"; // no client → launch it
  } else {
    switch (s.gameflow_phase) {
      case "Matchmaking": text = "IN QUEUE"; mode = "cancel"; break;
      case "ReadyCheck": text = "READY"; mode = "none"; disabled = true; break;
      case "ChampSelect": text = "CHAMP"; mode = "none"; disabled = true; break;
      case "InProgress": text = "IN GAME"; mode = "none"; disabled = true; break;
      case "PreEndOfGame":
      case "WaitingForStats":
      case "EndOfGame": text = "PLAY"; mode = "queue"; break;
      default: text = "PLAY"; mode = "queue"; // None / Lobby / idle
    }
  }
  label.textContent = text;
  // Shrink the banner text for longer states so it stays inside the tag.
  label.setAttribute("font-size", text.length > 5 ? "14" : "21");
  btn.disabled = disabled;
  btn.dataset.mode = mode;
}

$("play-btn").addEventListener("click", async () => {
  const mode = $("play-btn").dataset.mode || "launch";
  if (mode === "launch") {
    closeQueueMenu();
    await api().launch_league();
  } else if (mode === "cancel") {
    closeQueueMenu();
    await api().cancel_queue();
    refreshStatus();
  } else if (mode === "queue") {
    toggleQueueMenu();
  }
});

async function buildQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  let qs = [];
  try { qs = (await api().get_quick_queues()) || []; } catch (_) {}
  menu.innerHTML =
    '<div class="qm-head">Start a queue</div>' +
    qs.map((q) => `<button type="button" data-qid="${q.id}">${q.name}</button>`).join("");
  menu.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", async () => {
      closeQueueMenu();
      await api().start_queue(b.dataset.qid);
      refreshStatus(); // flip PLAY → IN QUEUE
    }),
  );
}
function openQueueMenu() {
  const menu = $("queue-menu");
  const btn = $("play-btn");
  if (!menu || !btn) return;
  // The menu is position:fixed at the body level, so place it under PLAY.
  const r = btn.getBoundingClientRect();
  menu.style.left = Math.round(r.left) + "px";
  menu.style.top = Math.round(r.bottom + 4) + "px";
  menu.classList.remove("hidden");
}
function toggleQueueMenu() {
  const menu = $("queue-menu");
  if (!menu) return;
  if (menu.classList.contains("hidden")) openQueueMenu();
  else closeQueueMenu();
}
function closeQueueMenu() { $("queue-menu")?.classList.add("hidden"); }
// Click outside closes the queue menu.
document.addEventListener("click", (e) => {
  const menu = $("queue-menu");
  const btn = $("play-btn");
  if (!menu || menu.classList.contains("hidden")) return;
  if (!menu.contains(e.target) && btn && !btn.contains(e.target)) closeQueueMenu();
});

// --- Live summoner badge -----------------------------------------------
async function refreshSummoner() {
  const btn = $("summoner-btn");
  if (!btn) return;
  let info = {};
  try { info = (await api().get_summoner()) || {}; } catch (_) { info = {}; }
  const nameEl = $("summoner-name");
  const lvlEl = $("summoner-level");
  const img = $("summoner-icon");
  const ph = $("summoner-ph");
  if (info.connected && info.name) {
    btn.classList.remove("offline");
    nameEl.textContent = info.name;
    btn.title = info.tag ? `${info.name} #${info.tag}` : info.name;
    lvlEl.textContent = info.level ? `Level ${info.level}` : "";
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
    img.classList.add("hidden"); ph.classList.remove("hidden");
    btn.dataset.opgg = "";
    btn.title = "";
  }
}
$("summoner-btn").addEventListener("click", () => {
  const url = $("summoner-btn").dataset.opgg;
  if (url) api().open_external(url);
});

// --- Status polling -----------------------------------------------------
async function refreshStatus() {
  try {
    const s = await api().get_status();
    const ver = $("version");
    if (ver) ver.textContent = s.version;

    // Title-strip client indicator (dot + label)
    const dot = $("conn-dot");
    const clabel = $("conn-label");
    if (dot) dot.style.background = s.connected ? "#0AC8B9" : "#5B5A56";
    if (clabel) clabel.textContent = s.connected ? "Client connected" : "Client offline";

    // PLAY reflects the live gameflow phase; summoner badge refreshes on
    // connect/disconnect transitions.
    updatePlay(s);
    if (s.connected !== lastConnected) {
      lastConnected = s.connected;
      refreshSummoner();
    }

    $("hero-status").textContent = s.paused ? "Paused" : "Monitoring";
    $("hero-status").className =
      "font-display text-2xl leading-tight " +
      (s.paused ? "text-gold4" : "text-gold1");
    $("hero-dot").className =
      "h-3.5 w-3.5 rounded-full shrink-0 " +
      (s.paused ? "bg-gold4" : "bg-blue2 dot-pulse");
    $("hero-client").textContent = s.connected ? "Connected" : "Waiting…";
    $("hero-client").className =
      "font-display text-lg leading-tight mt-0.5 " +
      (s.connected ? "text-blue2" : "text-subText");

    $("stat-champ").textContent = s.champ_select_enabled ? "On" : "Off";
    $("stat-webhook").textContent = s.webhook_configured
      ? "Configured"
      : "Disabled";
    $("stat-champs-loaded").textContent =
      catalog.length || s.champions_loaded || 0;

    const note = $("companion-note");
    if (note) {
      if (!s.companion_enabled) {
        note.textContent = "";
      } else if (!s.companion_running) {
        note.textContent = "Server not running — save settings, then restart queueBot.";
        note.className = "text-xs text-gold4";
      } else if (s.companion_clients > 0) {
        const n = s.companion_clients;
        note.textContent = `● ${n} phone${n > 1 ? "s" : ""} connected`;
        note.className = "text-xs text-gold2";
      } else {
        note.textContent = "Running — waiting for a phone to connect…";
        note.className = "text-xs text-subText";
      }
    }

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
      if (!initial && (ev.kind === "queue_pop" || /queue popped/i.test(ev.message)))
        flashPop();
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
    label.className =
      "flex items-center gap-2.5 text-sm text-grey1 cursor-pointer";
    label.innerHTML = `<input type="checkbox" data-queue="${q.id}" class="w-4 h-4" style="accent-color:#C8AA6E;" /><span>${q.name}</span>`;
    qWrap.appendChild(label);
  }

  roles = await api().get_roles();
  buildChampTab();
}

// --- Champ Select --------------------------------------------------------
// One grid does everything: every champion is shown, and the ones you've
// selected for the active list (Picks or Bans) are pulled to the front in
// priority order, ringed, and numbered. Click to add/remove; drag a numbered
// champ onto another to reorder priority. Search filters the whole grid.
// On-disk shape: champ_select.roles.<role>.{picks,bans}.

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
  $("goto-settings").addEventListener("click", () => activateTab("settings"));
  $("champ_enabled").addEventListener("change", (e) =>
    updateChampView(e.target.checked),
  );

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
  const hint = $("champ-hint");
  if (hint) {
    const isBan = mode === "bans";
    const word = isBan ? "bans" : "picks";
    const color = isBan ? "text-red-400" : "text-gold2";
    hint.innerHTML =
      `Click to add — your <span class="${color}">${word}</span> move to the front, ` +
      `numbered by priority. Drag a numbered champ onto another to reorder.`;
  }
  renderGrid($("champ-search").value);
}

// Render all champions with the active list's selections pulled to the front
// (numbered, in priority order), then the rest in catalog order. Search filters
// everything. Bans tint red so they read apart from picks.
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
    cell.title = c.name;
    if (isSel) cell.draggable = true;
    cell.innerHTML =
      `<img src="assets/champions/${c.id}.png" width="128" height="128" draggable="false" />` +
      (isSel ? `<span class="cell-num${isBan ? " ban" : ""}">${order + 1}</span>` : "");
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
  const b = document.querySelector(
    `.role-tab[data-role="${role}"] [data-badge]`,
  );
  if (!b) return;
  const p = (plan[role]?.picks || []).length;
  const bn = (plan[role]?.bans || []).length;
  b.textContent = p || bn ? `${p}·${bn}` : "";
  b.title = `${p} picks · ${bn} bans`;
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
    if (cell) toggleChamp(cell.dataset.name);
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

  const comp = c.companion || {};
  $("companion_enabled").checked = !!comp.enabled;
  $("companion_port").value = comp.port || 8420;
  $("companion_sound").value = comp.sound || "chime";
  customSoundPath = comp.sound_file || "";
  $("sound-file-name").textContent = customSoundPath
    ? customSoundPath.split(/[\\/]/).pop()
    : "No file chosen";
  toggleCustomSoundRow();
  refreshCompanion();

  const champEnabled = !!(c.champ_select && c.champ_select.enabled);
  $("champ_enabled").checked = champEnabled;
  $("lock_seconds").value =
    (c.champ_select && c.champ_select.lock_in_at_seconds) ?? 1;
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
  // selectRole re-renders both the plan chips and the catalog grid.
  selectRole(activeRole || roles[0]?.key);
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
    companion: {
      enabled: $("companion_enabled").checked,
      port: Number($("companion_port").value) || 8420,
      sound: $("companion_sound").value,
      sound_file: customSoundPath || "",
    },
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
  $("sum-champ").textContent = cs.enabled
    ? `On — lock at ${cs.lock_in_at_seconds}s`
    : "Off";
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
      const extra =
        (rc.picks || []).length > 1
          ? ` <span class="text-gold5">+${rc.picks.length - 1}</span>`
          : "";
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

// --- Phone companion + Discord ----------------------------------------
async function refreshCompanion() {
  const live = $("companion-live");
  if (!$("companion_enabled").checked) {
    live.classList.add("hidden");
    return;
  }
  live.classList.remove("hidden");

  let info = {};
  try {
    info = await api().get_companion_info();
  } catch (_) {}

  $("companion-url").textContent = info.url || "";
  const qr = $("companion-qr");
  if (info.qr) {
    qr.src = info.qr;
    qr.classList.remove("hidden");
  } else {
    qr.classList.add("hidden");
  }
  // #companion-note (live running / connected-device status) is owned by
  // refreshStatus so it updates on its own without re-fetching the QR.
}

function validateWebhook() {
  const v = $("webhook_url").value.trim();
  const hint = $("webhook_hint");
  if (!v || /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//i.test(v)) {
    hint.classList.add("hidden");
  } else {
    hint.textContent = "That doesn't look like a Discord webhook URL.";
    hint.classList.remove("hidden");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch (_) {
      return false;
    }
  }
}

function flashStatus(el, text, ok) {
  el.textContent = text;
  el.className = "text-xs " + (ok ? "text-gold2" : "text-red-400");
}

function toggleCustomSoundRow() {
  const isCustom = $("companion_sound").value === "custom";
  $("custom-sound-row").classList.toggle("hidden", !isCustom);
}

$("companion_enabled").addEventListener("change", refreshCompanion);
$("companion_sound").addEventListener("change", toggleCustomSoundRow);

$("sound-preview").addEventListener("click", () => {
  const sel = $("companion_sound").value;
  const s = $("companion-test-status");
  if (sel === "custom") {
    flashStatus(s, "Save, then “Test phone alert” to hear a custom sound", false);
    setTimeout(() => (s.textContent = ""), 4000);
    return;
  }
  if (!previewCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    previewCtx = AC ? new AC() : null;
  }
  if (previewCtx && previewCtx.state === "suspended") previewCtx.resume();
  if (previewCtx && window.QueueBotAlarm) QueueBotAlarm.play(previewCtx, sel);
});

$("sound-pick").addEventListener("click", async () => {
  const res = await api().pick_sound_file();
  if (res && res.ok) {
    customSoundPath = res.path;
    $("sound-file-name").textContent = res.name || res.path;
  }
});

$("companion-copy").addEventListener("click", async () => {
  const ok = await copyText($("companion-url").textContent);
  const btn = $("companion-copy");
  const orig = btn.textContent;
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => (btn.textContent = orig), 1500);
});

$("companion-test").addEventListener("click", async () => {
  const s = $("companion-test-status");
  flashStatus(s, "Sending…", true);
  s.className = "text-xs text-subText";
  const res = await api().test_companion();
  if (res && res.running) {
    flashStatus(s, "✓ Sent — your phone should alarm", true);
  } else {
    flashStatus(s, "Server isn't running yet — restart queueBot", false);
  }
  setTimeout(() => (s.textContent = ""), 4000);
});

$("discord-test").addEventListener("click", async () => {
  const s = $("discord-test-status");
  s.textContent = "Sending…";
  s.className = "text-xs text-subText";
  const res = await api().test_discord(
    $("webhook_url").value.trim(),
    $("user_id").value.trim(),
  );
  if (res && res.ok) flashStatus(s, "✓ Sent — check Discord", true);
  else flashStatus(s, "✗ " + ((res && res.error) || "Failed"), false);
  setTimeout(() => (s.textContent = ""), 5000);
});

$("discord-docs").addEventListener("click", () => {
  api().open_external(
    "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
  );
});

$("webhook_url").addEventListener("input", validateWebhook);

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
    await buildQueueMenu();
    await loadConfig();
  } catch (e) {
    console.error("queueBot UI build error:", e);
  }
  await refreshStatus();
  await refreshSummoner();
  await refreshEvents();
  setInterval(refreshStatus, 1500);
  setInterval(refreshEvents, 1000);
  setInterval(refreshSummoner, 8000); // keep level/icon fresh
}

if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener("pywebviewready", boot);
}
