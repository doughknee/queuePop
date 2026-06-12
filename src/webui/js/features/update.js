/* Self-update: the Python side (updater.py) checks GitHub Releases in the
   background and caches the result; we poll that cache, show a bottom-left
   banner when a newer version exists, and mirror the state (including live
   download progress) on the About page. */

let updateState = null;
let updateDismissed = false; // "Later" hides the banner for this session only
let updating = false;        // an update is downloading/installing
let updatingBtn = null;      // the button that kicked it off (progress mirror)

function showUpdateBanner(show) {
  const b = $("upd-banner");
  if (!b) return;
  if (show) {
    b.classList.add("show");
    requestAnimationFrame(() => b.classList.add("in"));
  } else {
    b.classList.remove("in");
    setTimeout(() => b.classList.remove("show"), 220);
  }
}

function renderUpdate(s) {
  updateState = s || null;
  const has = !!(s && s.available && s.latest);

  // About card, always reflects the most recent check.
  const ver = $("about-version");
  if (ver) ver.textContent = "v" + ((s && s.current) || ", ");
  const msg = $("about-update-msg");
  const aUpd = $("about-update");
  const aNotes = $("about-notes");
  if (has) {
    if (msg) { msg.textContent = `Version v${s.latest} is available.`; msg.className = "upd-msg good"; }
    aUpd && aUpd.classList.remove("hidden");
    if (aNotes && s.url) { aNotes.href = s.url; aNotes.classList.remove("hidden"); }
  } else {
    if (msg) {
      msg.className = "upd-msg";
      // Don't claim "up to date" before the first check has actually run — the
      // background check completes a few seconds after launch. Saying it's
      // current while a check is still pending is the bug that made Settings
      // disagree with the activity feed.
      msg.textContent = s && s.error
        ? "Couldn't reach the update server."
        : (s && s.checked ? "You're up to date." : "Checking for updates…");
    }
    aUpd && aUpd.classList.add("hidden");
    aNotes && aNotes.classList.add("hidden");
  }

  // Banner, only when an update exists and the user hasn't dismissed it.
  const sub = $("upd-sub");
  if (has && sub) sub.textContent = `v${s.current} → v${s.latest}. Update now?`;
  showUpdateBanner(has && !updateDismissed && !updating);
}

async function refreshUpdate(force = false) {
  try {
    const s = force ? await api().check_for_update() : await api().get_update_status();
    renderUpdate(s);
    return s;
  } catch (e) {
    return null;
  }
}

// The activity feed sees "update" events as they stream in; refresh promptly.
QP.bus.on("update:event", () => refreshUpdate());

async function doUpdate(btn) {
  if (updating) return;
  updating = true;
  updatingBtn = btn || null;
  showUpdateBanner(false);
  const label = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
  showToast("Downloading update…");
  try {
    const res = await api().apply_update();
    if (!res || !res.ok) {
      updating = false;
      updatingBtn = null;
      if (btn) { btn.disabled = false; btn.textContent = label; }
      showToast((res && res.error) || "Update failed", false);
      renderUpdate(updateState); // re-show the banner so they can retry
    }
    // On success the app quits and the new build relaunches, nothing more to do.
  } catch (e) {
    updating = false;
    updatingBtn = null;
    if (btn) { btn.disabled = false; btn.textContent = label; }
    showToast("Update failed", false);
  }
}

// While an update runs, updater.py posts coarse progress to the activity feed
// ("Downloading v1.4.0… 40% of 60 MB"); mirror it on the button so the About
// page shows movement instead of a frozen "Updating…".
QP.bus.on("activity:event", (ev) => {
  if (!updating || !updatingBtn || ev.kind !== "update") return;
  const pct = ev.message.match(/(\d+)\s*%/);
  if (pct) updatingBtn.textContent = `Downloading… ${pct[1]}%`;
  else if (/preparing install/i.test(ev.message)) updatingBtn.textContent = "Installing…";
});

$("upd-now") && $("upd-now").addEventListener("click", () => doUpdate($("upd-now")));
$("upd-later") && $("upd-later").addEventListener("click", () => {
  updateDismissed = true;
  showUpdateBanner(false);
});
$("about-update") && $("about-update").addEventListener("click", () => doUpdate($("about-update")));
$("about-check") && $("about-check").addEventListener("click", async () => {
  const btn = $("about-check");
  const t = btn.textContent;
  btn.disabled = true; btn.textContent = "Checking…";
  const s = await refreshUpdate(true);
  btn.disabled = false; btn.textContent = t;
  if (s && !s.available) showToast(s.error ? "Couldn't check" : "You're up to date", !s.error);
});
$("about-notes") && $("about-notes").addEventListener("click", (e) => {
  // Release notes open in the real browser, not inside the WebView.
  if (updateState && updateState.url) { e.preventDefault(); api().open_external(updateState.url); }
});

// Brand links (GitHub, Tip Jar) — open in the real browser, never the WebView.
document.querySelectorAll("[data-ext]").forEach((el) => {
  el.addEventListener("click", (e) => {
    e.preventDefault();
    api().open_external(el.getAttribute("data-ext"));
  });
});

// --- About page: release notes ----------------------------------------------
// Fetched on the first visit to the About route (cached Python-side for 6h);
// a failed fetch shows a quiet hint and retries on the next visit.

// Markdown-lite for GitHub release bodies: headings, bullets, bold, code —
// enough for a changelog. Links flatten to their text (no nav in the WebView).
function mdLite(md) {
  const inline = (s) =>
    s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
     .replace(/`([^`]+)`/g, "<code>$1</code>")
     .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  let html = "";
  let inList = false;
  for (const line of escapeHtml(md).split(/\r?\n/)) {
    const li = line.match(/^\s*[-*]\s+(.*)/);
    if (li) {
      if (!inList) { html += '<ul class="rn-list">'; inList = true; }
      html += `<li>${inline(li[1])}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) html += `<p class="rn-h">${inline(h[1])}</p>`;
    else if (line.trim()) html += `<p class="rn-p">${inline(line)}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

function relNoteHtml(r, idx) {
  // The newest release ships expanded; the rest collapse to a version list.
  const cur = updateState && updateState.current === r.version;
  const isNew = !cur && updateState && updateState.available
    && updateState.latest === r.version;
  const pill = cur ? '<span class="rn-pill">Installed</span>'
    : isNew ? '<span class="rn-pill new">New</span>' : "";
  return (
    `<details class="rn-entry"${idx === 0 ? " open" : ""}>` +
      `<summary class="rn-head">` +
        `<svg class="rn-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>` +
        `<span class="rn-ver">v${escapeHtml(r.version || "")}</span>` +
        pill +
        (r.date ? `<span class="rn-date">${escapeHtml(r.date)}</span>` : "") +
      `</summary>` +
      `<div class="rn-body">${mdLite(r.notes || "") || '<p class="rn-p">No notes for this release.</p>'}</div>` +
    `</details>`
  );
}

let releaseNotesLoaded = false;
async function loadReleaseNotes() {
  if (releaseNotesLoaded) return;
  releaseNotesLoaded = true; // claim it so a double-click doesn't double-fetch
  const wrap = $("release-notes");
  let releases = [];
  try {
    releases = ((await api().get_release_notes()) || {}).releases || [];
  } catch (_) {}
  if (!releases.length) {
    wrap.innerHTML =
      '<p class="set-row-hint">Couldn’t load release notes — check back when you’re online.</p>';
    releaseNotesLoaded = false; // retry on the next visit
    return;
  }
  wrap.innerHTML = releases.map(relNoteHtml).join("");
}

// --- About page: service record + diagnostics --------------------------------
let lastStatus = null; // freshest status snapshot, for the diagnostics blob
QP.bus.on("status", (s) => { lastStatus = s; });

const STAT_TILES = [
  ["ready_checks", "Ready checks accepted"],
  ["champ_selects", "Champ selects"],
  ["picks_locked", "Picks locked"],
  ["bench_grabs", "Bench grabs"],
  ["trades", "Trades made"],
  ["games", "Games started"],
];

function fmtUptime(sec) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

let aboutDiag = null; // last get_stats payload, for the copy button
async function renderServiceRecord() {
  let d = null;
  try { d = await api().get_stats(); } catch (_) {}
  if (!d) return;
  aboutDiag = d;
  const st = d.stats || {};
  $("about-stats").innerHTML = STAT_TILES
    .map(([key, label]) =>
      `<div class="stat-tile">` +
        `<span class="stat-num">${(st[key] || 0).toLocaleString()}</span>` +
        `<span class="stat-label">${label}</span>` +
      `</div>`,
    ).join("");
  const s = lastStatus || {};
  $("about-diag").innerHTML =
    `<span>Uptime ${fmtUptime(d.uptime_seconds || 0)}</span>` +
    `<span>${s.connected ? "Client connected" : "Client offline"}</span>` +
    `<span>${d.frozen ? "Packaged build" : "Running from source"}</span>`;
}

$("diag-open").addEventListener("click", () => api().open_config_folder());
$("diag-copy").addEventListener("click", async () => {
  const s = lastStatus || {};
  const blob = {
    version: (updateState && updateState.current) || s.version || "",
    frozen: !!(aboutDiag && aboutDiag.frozen),
    uptime_seconds: (aboutDiag && aboutDiag.uptime_seconds) || 0,
    config_dir: (aboutDiag && aboutDiag.config_dir) || "",
    connected: !!s.connected,
    gameflow_phase: s.gameflow_phase || null,
    companion_running: !!s.companion_running,
    stats: (aboutDiag && aboutDiag.stats) || {},
  };
  const ok = await copyText(JSON.stringify(blob, null, 2));
  const st = $("diag-status");
  flashStatus(st, ok ? "Copied" : "Copy failed", ok);
  setTimeout(() => (st.textContent = ""), 2500);
});

QP.bus.on("route", ({ tab }) => {
  if (tab !== "about") return;
  loadReleaseNotes();
  renderServiceRecord(); // refreshed every visit (counters move during play)
  // If no check has completed yet (dev builds never background-check; packaged
  // ones take a few seconds after launch), run one now instead of leaving the
  // page saying "Checking for updates…" until the button is pressed.
  if (!updateState || !updateState.checked) refreshUpdate(true);
});

QP._loaded.push("features/update");
