/* Self-update: the Python side (updater.py) checks GitHub Releases in the
   background and caches the result; we poll that cache, show a bottom-left
   banner when a newer version exists, and mirror the state in the Settings
   "About & Updates" card. */

let updateState = null;
let updateDismissed = false; // "Later" hides the banner for this session only
let updating = false;        // an update is downloading/installing

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
    if (msg) { msg.textContent = `Version v${s.latest} is available.`; msg.className = "set-row-hint mb-2 text-gold2"; }
    aUpd && aUpd.classList.remove("hidden");
    if (aNotes && s.url) { aNotes.href = s.url; aNotes.classList.remove("hidden"); }
  } else {
    if (msg) {
      msg.className = "set-row-hint mb-2";
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
  showUpdateBanner(false);
  const label = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = "Updating…"; }
  showToast("Downloading update…");
  try {
    const res = await api().apply_update();
    if (!res || !res.ok) {
      updating = false;
      if (btn) { btn.disabled = false; btn.textContent = label; }
      showToast((res && res.error) || "Update failed", false);
      renderUpdate(updateState); // re-show the banner so they can retry
    }
    // On success the app quits and the new build relaunches, nothing more to do.
  } catch (e) {
    updating = false;
    if (btn) { btn.disabled = false; btn.textContent = label; }
    showToast("Update failed", false);
  }
}

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

QP._loaded.push("features/update");
