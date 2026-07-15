// queuePop phone companion, streams the LAN server's activity feed (SSE) and
// alarms when the queue pops. Read-only; no config is ever changed from the phone.
//
// Reliability over plain http (no service worker / background push possible):
//   * NoSleep.js keeps the screen awake (the Wake Lock API is secure-context
//     only, so we use the proven hidden-video trick, works in insecure ctx).
//   * A near-silent WebAudio loop keeps the AudioContext from suspending so the
//     alarm fires instantly; we also resume it whenever the tab regains focus.
// This makes the "phone awake on my desk" case bulletproof. A fully locked phone
// or a switched-away app still can't be woken, that genuinely needs push.

const $ = (id) => document.getElementById(id);

let lastId = 0; // highest event id seen (also the SSE resume cursor)
let primed = false; // true after first 'synced', suppresses alarms on backlog
let armed = false;
let alarming = false;

// --- WebAudio: alarm sound + a silent keep-alive ----------------------------
let audioCtx = null;
let keepOsc = null, keepGain = null;
let alarmTimer = null;
let customSource = null;

let currentSound = "chime"; // which preset/"custom" the server says to use
let customBuffer = null;    // decoded AudioBuffer for the user's custom file

function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

// Inaudible (~-62dB) sub-audible tone. Keeps the context "running" and the tab
// classified as actively playing media, so the browser doesn't suspend it.
function startKeepAlive() {
  if (!audioCtx || keepGain) return;
  keepOsc = audioCtx.createOscillator();
  keepGain = audioCtx.createGain();
  keepGain.gain.value = 0.0008;
  keepOsc.frequency.value = 20;
  keepOsc.connect(keepGain);
  keepGain.connect(audioCtx.destination);
  keepOsc.start();
}

// Fetch + decode the user's custom sound once (played through the already-
// unlocked AudioContext, so there's no separate autoplay restriction).
async function ensureCustomSound() {
  if (currentSound !== "custom" || customBuffer || !audioCtx) return;
  try {
    const res = await fetch("/api/sound", { cache: "no-store" });
    if (!res.ok) return;
    customBuffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
  } catch (_) {}
}

function playOnce() {
  if (!audioCtx) return;
  if (currentSound === "custom") {
    if (customBuffer) {
      customSource = audioCtx.createBufferSource();
      customSource.buffer = customBuffer;
      customSource.connect(audioCtx.destination);
      customSource.start();
      return;
    }
    // Custom file not ready yet, fall back to the default chime.
    if (window.QueuePopAlarm) QueuePopAlarm.play(audioCtx, "chime");
    return;
  }
  if (window.QueuePopAlarm) QueuePopAlarm.play(audioCtx, currentSound);
}

// --- Screen wake ------------------------------------------------------------
let noSleep = null;
let wakeLock = null;

function enableScreenWake() {
  try {
    if (window.NoSleep) {
      noSleep = noSleep || new NoSleep();
      noSleep.enable(); // must be called from a user gesture
    }
  } catch (_) {}
  requestWakeLock();
}

async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    }
  } catch (_) {
    /* unavailable over http, NoSleep covers it */
  }
}

// --- Alert gate: unlock audio + screen wake on the first user gesture --------
$("enable").addEventListener("click", () => {
  initAudio();
  startKeepAlive();
  enableScreenWake();
  try { if (window.Notification) Notification.requestPermission(); } catch (_) {}

  armed = true;
  $("gate").style.display = "none";
  $("armed").textContent = "Armed";
  $("armed").style.color = "#5cb85c";

  connectStream();
  pollStatus();
  setInterval(pollStatus, 4000);
});

// Re-arm audio / wake lock and resume when the tab comes back to the foreground.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  requestWakeLock(); // wake lock is auto-released when hidden
  pollStatus();
});

// --- Alarm ------------------------------------------------------------------
function startAlarm(mode) {
  if (alarming) return;
  alarming = true;
  $("alarm-mode").textContent = mode ? `Mode: ${mode}` : "";
  $("alarm").classList.add("show");
  initAudio();
  playOnce();
  // Pleasant but persistent: replay every ~2.2s until silenced.
  alarmTimer = setInterval(playOnce, 2200);
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 500]); } catch (_) {}
  try {
    if (window.Notification && Notification.permission === "granted") {
      new Notification("⚡ Queue popped!", { body: "Get back to your PC." });
    }
  } catch (_) {}
}

function stopAlarm() {
  alarming = false;
  $("alarm").classList.remove("show");
  if (alarmTimer) { clearInterval(alarmTimer); alarmTimer = null; }
  if (customSource) { try { customSource.stop(); } catch (_) {} customSource = null; }
  try { navigator.vibrate && navigator.vibrate(0); } catch (_) {}
}
$("silence").addEventListener("click", stopAlarm);

// --- Activity stream (SSE) --------------------------------------------------
function onLog(e) {
  let ev;
  try {
    ev = JSON.parse(e.data);
  } catch (_) {
    return;
  }
  lastId = Math.max(lastId, ev.id || 0);
  renderFeed([ev]);
  if (primed && ev.kind === "queue_pop") {
    const m = (ev.message || "").match(/Queue popped:\s*([^, -]+)/i);
    startAlarm(m ? m[1].trim() : "");
  }
}

function connectStream() {
  const es = new EventSource(`/api/stream?after=${lastId}`);
  es.addEventListener("log", onLog);
  es.addEventListener("synced", () => (primed = true));
  es.onopen = () => setConn(true, "Watching");
  es.onerror = () => setConn(false, "Reconnecting…"); // EventSource auto-retries
}

async function pollStatus() {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const s = await res.json();
    setConn(!!s.connected, s.connected ? (s.paused ? "Paused" : "Watching") : "Client closed");
    if (s.sound && s.sound !== currentSound) {
      currentSound = s.sound;
      customBuffer = null; // sound changed, re-fetch on demand
    }
    ensureCustomSound();
  } catch (_) {
    setConn(false, "Offline");
  }
}

// --- Rendering --------------------------------------------------------------
const recent = [];
function renderFeed(evs) {
  for (const e of evs) recent.push(e);
  while (recent.length > 8) recent.shift();
  $("feed").innerHTML = recent
    .slice()
    .reverse()
    .map((e) => `<li><span class="lvl ${e.level || "info"}"></span><span>${escapeHtml(e.message)}</span></li>`)
    .join("");
}

function setConn(ok, label) {
  $("conn-dot").className = "dot " + (ok ? "on" : "off");
  $("conn-txt").textContent = label;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
