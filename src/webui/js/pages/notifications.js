/* Alerts page: desktop notifications, the phone-companion workflow card, and
   Discord. Owns DOM↔store sync for every control on the page (split out of
   the Settings page in Phase 2 of the UI refactor).

   Write path: a delegated `input` listener syncs the page's controls into
   QP.store.config and schedules a save (buttons don't fire `input`, so
   test/preview/copy clicks never trigger a stray save). */

let previewCtx = null;     // lazily-created AudioContext for the sound preview
let customSoundPath = "";  // absolute path to the user's custom alarm file
let companionUrl = "";     // last-known companion URL (status line, copy, QR)

// --- Hydrate: store.config → alerts DOM ------------------------------------
function hydrateAlerts() {
  const c = QP.store.config;
  $("webhook_url").value = c.webhook_url || "";
  $("user_id").value = c.user_id || "";
  $("discord_enabled").checked = !!c.discord_enabled;
  toggleDiscordBody();
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
}

// --- Sync: alerts DOM → store.config ----------------------------------------
function syncAlertsToStore() {
  const c = QP.store.config;
  c.webhook_url = $("webhook_url").value;
  c.user_id = $("user_id").value;
  c.discord_enabled = $("discord_enabled").checked;
  c.desktop_notifications = $("desktop_notifications").checked;
  c.companion = {
    enabled: $("companion_enabled").checked,
    port: Number($("companion_port").value) || 8420,
    sound: $("companion_sound").value,
    sound_file: customSoundPath || "",
  };
  QP.bus.emit("config:changed", { path: "alerts" });
  QP.store.scheduleSave();
}
$("tab-alerts").addEventListener("input", syncAlertsToStore);

// --- Phone companion: the stateful workflow card -----------------------------
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

  companionUrl = info.url || "";
  const qrUrl = $("qr-url");
  if (qrUrl) qrUrl.textContent = companionUrl;
  const qr = $("companion-qr");
  if (info.qr) qr.src = info.qr;
  renderCompanionStatus(); // fold the fresh URL into the status line now
}

// Status line: server state + URL + connected-phone count, from the live
// status snapshot. Amber until a phone has actually paired; teal once one has.
let companionStatusSnap = null;
function renderCompanionStatus() {
  const s = companionStatusSnap;
  const note = $("companion-note");
  const dot = $("companion-status-dot");
  if (!s || !note) return;
  const at = companionUrl ? ` at ${companionUrl}` : "";
  let text, tone, canCopy = false;
  if (!s.companion_running) {
    text = "Not running — save settings, then restart queuePop.";
    tone = "warn";
  } else if (s.companion_clients > 0) {
    const n = s.companion_clients;
    text = `Running${at} — ${n} phone${n > 1 ? "s" : ""} connected`;
    tone = "ok";
    canCopy = true;
  } else {
    text = `Running${at} — no phones connected yet`;
    tone = "warn";
    canCopy = true;
  }
  note.textContent = text;
  note.className = "comp-status-text " + tone;
  dot.className = "comp-dot " + tone;
  $("companion-copy").classList.toggle("hidden", !canCopy || !companionUrl);
}
QP.bus.on("status", (s) => {
  companionStatusSnap = s;
  renderCompanionStatus();
});

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
  if (previewCtx && window.QueuePopAlarm) QueuePopAlarm.play(previewCtx, sel);
});

$("sound-pick").addEventListener("click", async () => {
  const res = await api().pick_sound_file();
  if (res && res.ok) {
    customSoundPath = res.path;
    $("sound-file-name").textContent = res.name || res.path;
    // Picking a file mutates JS state only (no input event); sync + save.
    syncAlertsToStore();
  }
});

$("companion-copy").addEventListener("click", async () => {
  const ok = await copyText(companionUrl);
  const btn = $("companion-copy");
  const orig = btn.textContent;
  btn.textContent = ok ? "Copied!" : "Copy failed";
  setTimeout(() => (btn.textContent = orig), 1500);
});

// QR lives in a modal so it doesn't dominate the page.
$("companion-qr-btn").addEventListener("click", () => {
  refreshCompanion(); // make sure the QR/url are current
  $("qr-modal").classList.remove("hidden");
});
document.querySelectorAll("#qr-modal [data-qr-close]").forEach((el) =>
  el.addEventListener("click", () => $("qr-modal").classList.add("hidden")),
);

$("companion-test").addEventListener("click", async () => {
  const s = $("companion-test-status");
  flashStatus(s, "Sending…", true);
  s.className = "text-xs text-subText";
  const res = await api().test_companion();
  if (res && res.running) {
    flashStatus(s, "✓ Sent, your phone should alarm", true);
  } else {
    flashStatus(s, "Server isn't running yet, restart queuePop", false);
  }
  setTimeout(() => (s.textContent = ""), 4000);
});

// --- Discord -----------------------------------------------------------------
// The setup (webhook, user ID, test, how-to) only shows while the toggle is
// on; the stored values survive an off-spell so it's a true toggle, not a
// reset. The backend skips the ping when discord_enabled is false.
function toggleDiscordBody() {
  $("discord-body").classList.toggle("hidden", !$("discord_enabled").checked);
}
$("discord_enabled").addEventListener("change", toggleDiscordBody);

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

$("discord-test").addEventListener("click", async () => {
  const s = $("discord-test-status");
  s.textContent = "Sending…";
  s.className = "text-xs text-subText";
  const res = await api().test_discord(
    $("webhook_url").value.trim(),
    $("user_id").value.trim(),
  );
  if (res && res.ok) flashStatus(s, "✓ Sent, check Discord", true);
  else flashStatus(s, "✗ " + ((res && res.error) || "Failed"), false);
  setTimeout(() => (s.textContent = ""), 5000);
});

$("discord-docs").addEventListener("click", () => {
  api().open_external(
    "https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks",
  );
});

$("webhook_url").addEventListener("input", validateWebhook);

QP._loaded.push("pages/notifications");
