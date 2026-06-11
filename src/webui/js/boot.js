/* Boot: asserts the module manifest loaded in order, builds the UI, hydrates
   from the config store, and starts the pollers. Loaded last. */

const QP_MANIFEST = [
  "core/qp", "core/store", "core/poll",
  "ui/ui",
  "data/catalog",
  "features/nav", "features/status", "features/play", "features/summoner",
  "features/activity", "features/update",
  "pages/home", "pages/live", "pages/account", "pages/champ", "pages/loadout",
  "pages/settings", "pages/notifications",
];

(function assertModules() {
  const missing = QP_MANIFEST.filter((m) => !QP._loaded.includes(m));
  const extra = QP._loaded.filter((m) => !QP_MANIFEST.includes(m));
  if (missing.length || extra.length) {
    console.error(
      "queuePop module manifest mismatch — missing:", missing, "extra:", extra,
      "(check the <script> tags in index.html)",
    );
  }
})();

async function boot() {
  // Build the UI; never let a single render error stop status polling.
  try {
    await loadCatalog();
    await buildSettings();
    await buildQueueMenu();
    await QP.store.load();
    hydrateSettings();
    hydrateAlerts();
    hydratePlan();
    renderPlan(QP.store.config);
  } catch (e) {
    console.error("queuePop UI build error:", e);
  }
  await refreshStatus();
  await refreshSummoner();
  await loadMastery();
  await refreshEvents();
  await refreshUpdate();
  QP.poll.register("status", refreshStatus, 1500);
  QP.poll.register("events", refreshEvents, 1000);
  QP.poll.register("summoner", refreshSummoner, 8000); // keep level/icon fresh
  QP.poll.register("update", refreshUpdate, 60000);    // poll the cached update state
  // Gated: started/stopped by the live champ-select takeover (pages/live.js).
  QP.poll.register("champlive", refreshChampLive, 700, { enabled: false });
}

if (window.pywebview && window.pywebview.api) {
  boot();
} else {
  window.addEventListener("pywebviewready", boot);
}
