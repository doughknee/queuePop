/* First-run "Set me up" wizard: one screen seeded from the player's own
   mastery + recent matches (api().suggest_picks()). Opens by itself on a fresh
   config once the client is connected; the Dashboard's "Set me up" button
   reopens it any time. Done writes through QP.store (the same save path every
   page uses) and sets setup_done; Skip sets only setup_done. */

const SETUP_ROLES = ["top", "jungle", "middle", "bottom", "utility"];
const SETUP_DEFAULT_QUEUES = [420, 400, 450]; // Ranked Solo/Duo, Draft, ARAM
const DISCORD_WEBHOOK_RE = /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//i;
let setupAutoShown = false; // auto-open at most once per session
let setupPaused = false;    // last status snapshot's paused flag

function setupTileHtml(role, name) {
  const icon = champIcon(name);
  const media = icon
    ? `<img src="${icon}" onerror="this.style.visibility='hidden'" />`
    : `<span class="setup-ini">${initials(name)}</span>`;
  return (
    `<label class="setup-tile"><input type="checkbox" data-role="${role}" data-champ="${escapeHtml(name)}" checked />` +
    `${media}<span class="setup-name">${escapeHtml(name)}</span></label>`
  );
}

async function openSetup() {
  $("setup-modal").classList.remove("hidden");
  $("setup-roles").innerHTML = '<p class="set-row-hint">Reading your mastery…</p>';
  $("setup-queues").innerHTML = "";
  let s = {};
  try { s = (await api().suggest_picks()) || {}; } catch (_) {}
  const c = QP.store.config;

  // (1) Queues: keep an existing allow-list, else the last-played queue, else
  // the common three. data-sq, not data-queue: home.js scans [data-queue].
  const queues = s.queues || [];
  const ids = new Set(queues.map((q) => q.id));
  const allowed = (c.allowed_queue_ids || []).map(Number);
  const ticked = new Set(
    allowed.length ? allowed : ids.has(Number(s.last)) ? [Number(s.last)] : SETUP_DEFAULT_QUEUES,
  );
  $("setup-queues").innerHTML = queues
    .map((q) =>
      `<label class="qp" title="${escapeHtml(q.name)}">` +
        `<input type="checkbox" data-sq="${q.id}"${ticked.has(q.id) ? " checked" : ""} />` +
        `<span class="qp-check">${QP_CHECK}</span><span class="qp-name">${escapeHtml(q.name)}</span>` +
      `</label>`,
    )
    .join("");

  // (2) Role cards. Non-empty lists are only replaced when the user says so.
  const rolesCfg = (c.champ_select && c.champ_select.roles) || {};
  const hasLists = SETUP_ROLES.some((r) => ((rolesCfg[r] || {}).picks || []).length);
  $("setup-replace-row").classList.toggle("hidden", !hasLists);
  $("setup_replace").checked = false;
  $("setup-picks-note").textContent = s.ok
    ? "From your mastery and recent games. Untick anything you don't play."
    : "Open the League client to get suggestions from your mastery.";
  const sug = s.roles || {};
  $("setup-roles").innerHTML = SETUP_ROLES.map((r) => {
    const label = (roles.find((x) => x.key === r) || {}).label || r;
    const names = sug[r] || [];
    return (
      `<div class="setup-role"><div class="setup-role-head">` +
        `<img src="assets/positions/${r}.svg" onerror="this.style.display='none'" />${label}</div>` +
        (names.length
          ? names.map((n) => setupTileHtml(r, n)).join("")
          : '<span class="setup-role-empty">No suggestions</span>') +
      `</div>`
    );
  }).join("");

  // (3) Toggles mirror the current state; off-by-default stays off.
  $("setup_accept").checked = !setupPaused;
  $("setup_pick").checked = !!(c.champ_select || {}).enabled;
  $("setup_discord").checked = !!c.discord_enabled;
  $("setup_webhook").value = c.webhook_url || "";
  $("setup_webhook").classList.toggle("hidden", !c.discord_enabled);
  $("setup-webhook-hint").classList.add("hidden");
}

function closeSetup() {
  $("setup-modal").classList.add("hidden");
  $("setup-hint").classList.add("hidden");
}

async function finishSetup() {
  const c = QP.store.config;
  const discord = $("setup_discord").checked;
  const url = $("setup_webhook").value.trim();
  if (discord && !DISCORD_WEBHOOK_RE.test(url)) {
    const hint = $("setup-webhook-hint");
    hint.textContent = "Paste a Discord webhook URL, or turn the Discord ping off.";
    hint.classList.remove("hidden");
    return;
  }

  c.allowed_queue_ids = [...document.querySelectorAll("#setup-queues input:checked")]
    .map((b) => Number(b.dataset.sq));
  const cs = (c.champ_select ||= {});
  const rolesCfg = (cs.roles ||= {});
  const replace = $("setup_replace").checked;
  for (const r of SETUP_ROLES) {
    const picks = [...document.querySelectorAll(`#setup-roles input[data-role="${r}"]:checked`)]
      .map((b) => b.dataset.champ);
    const rc = (rolesCfg[r] ||= {});
    if (picks.length && (replace || !(rc.picks || []).length)) rc.picks = picks;
  }
  cs.enabled = $("setup_pick").checked;
  c.discord_enabled = discord;
  c.webhook_url = url;
  c.setup_done = true;

  // Auto-accept is on unless monitoring is paused (pausing is per-session).
  const pause = !$("setup_accept").checked;
  if (pause !== setupPaused) await api().set_paused(pause);

  await QP.store.saveNow();
  closeSetup();
  hydrateQueues();
  hydratePlan();
  hydrateAlerts();
  QP.bus.emit("config:changed", { path: "setup" });
}

async function skipSetup() {
  QP.store.config.setup_done = true;
  await QP.store.saveNow();
  closeSetup();
}

$("setup-open").addEventListener("click", openSetup);
$("setup-done").addEventListener("click", finishSetup);
$("setup-skip").addEventListener("click", skipSetup);
$("setup_discord").addEventListener("change", () => {
  $("setup_webhook").classList.toggle("hidden", !$("setup_discord").checked);
});

// First run: open once the client is up and champions are loaded (names are
// needed for suggestions); while offline, show a one-line hint instead.
QP.bus.on("status", (s) => {
  setupPaused = !!s.paused;
  const c = QP.store.config;
  if (!c || c.setup_done) return;
  $("setup-hint").classList.toggle("hidden", !!s.connected);
  if (s.connected && s.champions_loaded && !setupAutoShown) {
    setupAutoShown = true;
    openSetup();
  }
});

QP._loaded.push("pages/setup");
