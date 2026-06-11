/* Settings page: the queue picker, DOM↔store sync for every settings control,
   the rune-page management card, and the jump-nav scroll spy.

   Write path: a delegated `input` listener syncs the page's controls into
   QP.store.config and schedules a save (buttons don't fire `input`, so
   test/refresh/preview clicks never trigger a stray save). The champ editor
   writes into the store directly and never passes through here. */

// --- Allowed-queues picker ----------------------------------------------
const QP_CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const QSEL_COLLAPSE_KEY = "qb_qsel_collapsed";
function qselLoadCollapsed() {
  try { return new Set(JSON.parse(localStorage.getItem(QSEL_COLLAPSE_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function qselSaveCollapsed(set) {
  try { localStorage.setItem(QSEL_COLLAPSE_KEY, JSON.stringify([...set])); } catch (_) {}
}

// Render the Allowed-Queues picker as collapsible, grouped sections. Each
// section has a select-all toggle; the checkboxes keep `data-queue` so
// hydration / sync work unchanged.
function renderQueuePicker(queues, groups) {
  const wrap = $("queues");
  if (!wrap) return;
  const collapsed = qselLoadCollapsed();
  const order = groups && groups.length ? groups : [{ key: "other", label: "Other" }];
  let html = "";
  for (const g of order) {
    const qs = queues.filter((q) => q.group === g.key);
    if (!qs.length) continue;
    const isCol = collapsed.has(g.key);
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
    const collapsed = qselLoadCollapsed();
    if (sec.classList.toggle("collapsed")) collapsed.add(key);
    else collapsed.delete(key);
    qselSaveCollapsed(collapsed);
    return;
  }
  const all = e.target.closest(".qsel-all");
  if (all) {
    const boxes = [...$("queues").querySelectorAll(`input[data-grp="${all.dataset.all}"]`)];
    const turnOn = boxes.some((b) => !b.checked); // all-on ⇒ clear, else select all
    boxes.forEach((b) => { b.checked = turnOn; });
    // The select-all button doesn't fire `input`; sync + save explicitly.
    syncSettingsToStore();
    return;
  }
}

async function buildSettings() {
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

  roles = await api().get_roles();
  try { spellList = (await api().get_summoner_spells()) || []; } catch (_) { spellList = []; }
  buildChampTab();
}

// --- Hydrate: store.config → settings DOM --------------------------------
let customSoundPath = ""; // absolute path to the user's custom alarm file

function hydrateSettings() {
  const c = QP.store.config;
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
  $("instant_lock").checked = (c.champ_select && c.champ_select.instant_lock) ?? true;
  $("lock_seconds").value =
    (c.champ_select && c.champ_select.lock_in_at_seconds) ?? 1;
  updateLockDelayRow();
  const csCfg = c.champ_select || {};
  $("trades_enabled").checked = !!(csCfg.trades && csCfg.trades.enabled);
  const aramCfg = csCfg.aram || {};
  $("aram_enabled").checked = !!(aramCfg.enabled || aramCfg.auto_mastery);
  const aramMode = ARAM_MODES.includes(aramCfg.mode)
    ? aramCfg.mode
    : aramCfg.auto_mastery ? "highest" : "list";
  $("aram_mode").value = aramMode;
  setAramMode(aramMode);
  updateChampView(champEnabled);

  const allowedIds = (c.allowed_queue_ids || []).map(Number);
  const acceptAny = allowedIds.length === 0;
  $("queue_all").checked = acceptAny;
  $("queue-select").classList.toggle("hidden", acceptAny);
  const allowed = new Set(allowedIds);
  document.querySelectorAll("[data-queue]").forEach((cb) => {
    cb.checked = allowed.has(Number(cb.dataset.queue));
  });
}

// --- Sync: settings DOM → store.config ------------------------------------
// The champ-select roles/loadouts live in the store already (the editor edits
// them in place); this covers every other control on the page.
function syncSettingsToStore() {
  const c = QP.store.config;
  c.webhook_url = $("webhook_url").value;
  c.user_id = $("user_id").value;
  c.desktop_notifications = $("desktop_notifications").checked;

  // "Auto-accept any queue" on ⇒ empty list (the backend treats [] as "all").
  // Off ⇒ only the specific queues the user ticked.
  const allowed = [];
  if (!$("queue_all").checked) {
    document.querySelectorAll("[data-queue]").forEach((cb) => {
      if (cb.checked) allowed.push(Number(cb.dataset.queue));
    });
  }
  c.allowed_queue_ids = allowed;

  c.companion = {
    enabled: $("companion_enabled").checked,
    port: Number($("companion_port").value) || 8420,
    sound: $("companion_sound").value,
    sound_file: customSoundPath || "",
  };

  const cs = (c.champ_select ||= {});
  cs.enabled = $("champ_enabled").checked;
  cs.instant_lock = $("instant_lock").checked;
  cs.lock_in_at_seconds = Number($("lock_seconds").value) || 0;
  cs.trades = { enabled: $("trades_enabled").checked };
  cs.aram = {
    enabled: $("aram_enabled").checked,
    mode: $("aram_mode").value,
    // Legacy flag kept in sync so a pre-mode build still reads this config.
    auto_mastery: $("aram_enabled").checked && $("aram_mode").value === "highest",
  };

  QP.bus.emit("config:changed", { path: "settings" });
  QP.store.scheduleSave();
}

// Settings controls: one delegated listener covers checkboxes, selects, and the
// number/text fields (Chromium fires `input` for all of them). Buttons don't
// fire `input`, so test/refresh/preview clicks never trigger a stray save.
$("tab-settings").addEventListener("input", syncSettingsToStore);

// "Auto-accept any queue" hides/reveals the specific-queue picker.
$("queue_all").addEventListener("change", () => {
  $("queue-select").classList.toggle("hidden", $("queue_all").checked);
});

// Instant-lock toggle hides the "lock when N seconds left" delay row.
function updateLockDelayRow() {
  $("lock-delay-row").classList.toggle("hidden", $("instant_lock").checked);
}
$("instant_lock").addEventListener("change", updateLockDelayRow);

// --- Recommended Runes: manage queuePop's dedicated rune page ------------
// Recommended-runes writes to one page named "queuePop (auto)". If the user is
// at their rune-page cap with no such page, they pick one here to hand over.
async function refreshRuneInfo() {
  const status = $("rune-managed-status");
  const wrap = $("rune-claim-wrap");
  let info = { pages: [], managed: null, at_cap: false };
  try { info = (await api().get_rune_info()) || info; } catch (_) {}

  if (info.managed) {
    status.innerHTML = `✓ queuePop manages the <span class="text-gold2">${info.managed.name}</span> page.`;
    status.className = "text-sm text-gold2";
    wrap.classList.add("hidden");
    return;
  }
  if (!info.pages.length && !info.at_cap) {
    status.textContent = "Connect the League client to manage rune pages.";
    status.className = "text-sm text-subText";
    wrap.classList.add("hidden");
    return;
  }
  if (info.at_cap) {
    status.textContent = "No dedicated page yet, and your rune pages are full.";
    status.className = "text-sm text-gold4";
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
    status.textContent =
      "queuePop will create its own “queuePop (auto)” page automatically (a slot is free).";
    status.className = "text-sm text-subText";
    wrap.classList.add("hidden");
  }
}

$("rune-refresh").addEventListener("click", refreshRuneInfo);
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

// Refresh live rune-page status when entering Settings.
QP.bus.on("route", ({ tab }) => {
  if (tab === "settings") refreshRuneInfo();
});

// --- Settings jump-nav (sticky sidebar on wide windows) --------------------
(function initSettingsNav() {
  const nav = document.querySelector(".settings-nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll(".snav-link")];
  nav.addEventListener("click", (e) => {
    const link = e.target.closest(".snav-link");
    if (!link) return;
    document.getElementById(link.dataset.jump)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // Scroll-based spy: highlight the last section whose top has passed a line
  // ~110px below the scroll-area top. A dedicated bottom check pins the final
  // section active once the page bottoms out (it can't scroll under the line).
  const main = document.querySelector("main");
  if (!main) return;
  function updateActive() {
    if ($("tab-settings").classList.contains("hidden")) return;
    const line = main.getBoundingClientRect().top + 110;
    let active = links[0]?.dataset.jump;
    for (const l of links) {
      const t = document.getElementById(l.dataset.jump);
      if (t && t.getBoundingClientRect().top <= line) active = l.dataset.jump;
    }
    if (main.scrollTop + main.clientHeight >= main.scrollHeight - 4)
      active = links[links.length - 1]?.dataset.jump; // bottomed out → last
    links.forEach((l) => l.classList.toggle("active", l.dataset.jump === active));
  }
  main.addEventListener("scroll", updateActive, { passive: true });
  // Re-evaluate when the Settings tab is shown.
  document.querySelectorAll('.nav-route[data-tab="settings"]').forEach((b) =>
    b.addEventListener("click", () => setTimeout(updateActive, 60)),
  );
  updateActive();
})();

QP._loaded.push("pages/settings");
