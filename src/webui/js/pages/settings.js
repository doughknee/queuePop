/* Settings page: the queue picker, DOM↔store sync for the page's controls,
   and the jump-nav scroll spy. (Champ-select settings live on the Champ
   Select page since Phase 1; this page shrinks further in later phases.)

   Write path: a delegated `input` listener syncs the page's controls into
   QP.store.config and schedules a save (buttons don't fire `input`, so
   test/refresh/preview clicks never trigger a stray save). */

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
// Champ-select settings write straight into the store from their own page;
// this covers every control still living on the Settings page.
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
