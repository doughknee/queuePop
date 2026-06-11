/* Phone companion + Discord wiring (the Notifications card on the settings
   page; becomes its own Alerts page in Phase 2). */

let previewCtx = null; // lazily-created AudioContext for the sound preview

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
  const qrUrl = $("qr-url");
  if (qrUrl) qrUrl.textContent = info.url || "";
  const qr = $("companion-qr");
  if (info.qr) qr.src = info.qr;
  // #companion-note (live running / connected-device status) is owned by the
  // status subscriber below so it updates without re-fetching the QR.
}

// Companion server status note: driven by the live status snapshot.
QP.bus.on("status", (s) => {
  const note = $("companion-note");
  if (!note) return;
  if (!s.companion_enabled) {
    note.textContent = "";
  } else if (!s.companion_running) {
    note.textContent = "Server not running, save settings, then restart queuePop.";
    note.className = "text-xs text-gold4";
  } else if (s.companion_clients > 0) {
    const n = s.companion_clients;
    note.textContent = `● ${n} phone${n > 1 ? "s" : ""} connected`;
    note.className = "text-xs text-gold2";
  } else {
    note.textContent = "Running, waiting for a phone to connect…";
    note.className = "text-xs text-subText";
  }
});

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
    syncSettingsToStore();
  }
});

$("companion-copy").addEventListener("click", async () => {
  const ok = await copyText($("companion-url").textContent);
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
