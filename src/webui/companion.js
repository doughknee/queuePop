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
// DONI-328: the QR link's ?t=<token> (the server also set a cookie, which covers a home-screen launch without it).
const TOKEN = new URLSearchParams(location.search).get("t") || "";
if (TOKEN) document.querySelector('link[rel="manifest"]')?.setAttribute("href", "manifest.json?t=" + encodeURIComponent(TOKEN));
const withToken = (u) => (TOKEN ? u + (u.includes("?") ? "&" : "?") + "t=" + encodeURIComponent(TOKEN) : u);

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
    const res = await fetch(withToken("/api/sound"), { cache: "no-store" });
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
  $("decline-msg").textContent = "";
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

// DONI-337: decline from the phone. Penalty-free in the client; auto-accept stands down on its own.
$("decline").addEventListener("click", async () => {
  const b = $("decline"), msg = $("decline-msg");
  b.disabled = true; msg.textContent = "Declining…";
  try {
    const res = await fetch(withToken("/api/decline"), { method: "POST" });
    const r = await res.json().catch(() => ({}));
    if (res.status === 403) msg.textContent = "Scan the QR code in queuePop again";
    else if (r.ok) { msg.textContent = "Declined. No penalty."; setTimeout(stopAlarm, 1500); }
    else msg.textContent = r.error || "Couldn't decline";
  } catch (_) { msg.textContent = "Couldn't reach your PC"; }
  b.disabled = false;
});

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
  const es = new EventSource(withToken(`/api/stream?after=${lastId}`));
  es.addEventListener("log", onLog);
  es.addEventListener("synced", () => (primed = true));
  es.onopen = () => setConn(true, "Watching");
  es.onerror = () => setConn(false, "Reconnecting…"); // EventSource auto-retries
}

// DONI-337: champ select on the phone: your champion, the timer, and Accept / Decline for a trade a teammate offers.
let champTimer = null;
function startChamp() { if (!champTimer) { pollChamp(); champTimer = setInterval(pollChamp, 2000); } }
function stopChamp() { clearInterval(champTimer); champTimer = null; $("cs").hidden = true; }
async function pollChamp() {
  try {
    const r = await (await fetch(withToken("/api/champ"), { cache: "no-store" })).json();
    $("cs").hidden = !r.active;
    if (!r.active) return;
    $("cs-timer").textContent = r.timer_left != null ? Math.ceil(r.timer_left) + " s" : "";
    $("cs-me").textContent = r.champion ? "You: " + r.champion : "No champion yet";
    const box = $("cs-trades"), ids = (r.trades || []).map((t) => t.id).join(",");
    if (box.dataset.ids === ids) return; // don't redraw under a finger mid-tap
    box.dataset.ids = ids;
    box.innerHTML = (r.trades || []).map((t) => `<div class="trade" data-id="${t.id}"><p>A teammate offers <b>${escapeHtml(t.name)}</b> for your champion.</p>
      <div class="row"><button class="btn" data-a="accept">Accept</button><button class="btn no" data-a="decline">Decline</button></div><p class="muted" role="status"></p></div>`).join("");
  } catch (_) { /* the status poll reports a lost connection */ }
}
$("cs-trades").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  const card = b.closest(".trade"), msg = card.querySelector("[role=status]");
  card.querySelectorAll("button").forEach((x) => (x.disabled = true)); msg.textContent = "Sending…";
  try {
    const res = await fetch(withToken(`/api/trade?id=${card.dataset.id}&action=${b.dataset.a}`), { method: "POST" });
    const r = await res.json().catch(() => ({}));
    msg.textContent = r.ok ? (b.dataset.a === "accept" ? "Accepted" : "Declined") : r.error || "Couldn't send it";
    if (!r.ok) card.querySelectorAll("button").forEach((x) => (x.disabled = false));
  } catch (_) { msg.textContent = "Couldn't reach your PC"; card.querySelectorAll("button").forEach((x) => (x.disabled = false)); }
});

// DONI-424: "I'm stepping away" arms the PC for an away player; "I'm back" restores your own settings.
function drawAway(on) {
  const b = $("away"); b.hidden = false; b.classList.toggle("on", on);
  b.textContent = on ? "I'm back" : "I'm stepping away"; $("away-note").hidden = !on; b.dataset.on = on ? "1" : "";
}
$("away").addEventListener("click", async () => {
  const b = $("away"); b.disabled = true;
  try {
    const res = await fetch(withToken("/api/away?on=" + (b.dataset.on ? "0" : "1")), { method: "POST" });
    if (res.ok) drawAway(!!(await res.json()).on); else if (res.status === 403) setConn(false, "Scan the QR code in queuePop again");
  } catch (_) { setConn(false, "Offline"); }
  b.disabled = false;
});

// DONI-423: a live countdown to the next moment the PC told us about (ETA in queue, game start, come back).
let timeline = null;
function drawTimeline() {
  const box = $("tl"), left = timeline ? Math.round((timeline.until - Date.now()) / 1000) : null;
  box.hidden = !timeline || left < -5;
  if (box.hidden) return;
  $("tl-text").textContent = timeline.text;
  const s = Math.max(0, left);
  $("tl-count").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
setInterval(drawTimeline, 1000);

async function pollStatus() {
  try {
    const res = await fetch(withToken("/api/status"), { cache: "no-store" });
    if (res.status === 403) return setConn(false, "Scan the QR code in queuePop again");
    const s = await res.json();
    setConn(!!s.connected, s.connected ? (s.paused ? "Paused" : "Watching") : "Client closed");
    if (s.sound && s.sound !== currentSound) {
      currentSound = s.sound;
      customBuffer = null; // sound changed, re-fetch on demand
    }
    ensureCustomSound();
    timeline = s.timeline || null; drawTimeline();
    drawAway(!!s.away);
    if (s.phase === "ChampSelect") startChamp(); else stopChamp();
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
