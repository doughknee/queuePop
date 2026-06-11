/* Activity feed: incremental event polling + the filtered, session-divided
   feed render. All events are kept in JS (newest-last, capped) and rendered
   newest-first; re-rendering each poll keeps the relative times fresh. */

let lastEventId = 0;
let activityLog = [];        // [{id, level, message, kind, ts}], chronological
let activityFilter = "all";  // all | match | champ | system
let firstActivityLoad = true;

// kind → filter category. Anything untagged falls to "system" (connect, companion,
// launch, save errors …), which is exactly where those belong.
const EV_CAT = {
  queue_pop: "match", match: "match", queue: "match",
  champ: "champ", spells: "champ", runes: "champ",
  trade: "champ", bench_swap: "champ", skin: "champ", pick_swap: "champ",
  role_swap: "champ",
};
function eventCat(ev) { return EV_CAT[ev.kind] || "system"; }

const CAT_ICON = {
  match:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 13h6l-1 9 10-12h-6z"/></svg>',
  champ:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/></svg>',
  system:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
};

function actRowHtml(ev) {
  const lvl = ev.level || "info";
  return (
    `<div class="act-row">` +
      `<span class="act-ico ${lvl}">${CAT_ICON[eventCat(ev)] || CAT_ICON.system}</span>` +
      `<span class="act-msg">${escapeHtml(ev.message)}</span>` +
      `<span class="act-time" title="${escapeHtml(fmtClock(ev.ts))}">${fmtAgoShort(ev.ts)}</span>` +
    `</div>`
  );
}

function renderActivity() {
  const body = $("activity");
  if (!body) return;
  // Session index per event (a new session starts at each queue pop). Computed
  // over the FULL log so filtering doesn't renumber sessions.
  const sessionOf = {}, sessionStart = {};
  let sess = 0;
  for (const ev of activityLog) {
    if (ev.kind === "queue_pop") { sess++; sessionStart[sess] = ev; }
    sessionOf[ev.id] = sess;
  }
  const shown = activityLog.filter(
    (ev) => activityFilter === "all" || eventCat(ev) === activityFilter,
  );
  if (!shown.length) {
    body.innerHTML = `<p class="act-empty">No events yet.</p>`;
    return;
  }
  const divider = (s) => {
    let label = "Earlier";
    if (s > 0) {
      const ev = sessionStart[s];
      const m = ev && ev.message.match(/Queue popped:\s*(.+?)\s*[, -]/i);
      label = (m ? m[1] : "Queue") + " · " + fmtAgoShort(ev && ev.ts);
    }
    return (
      `<div class="act-divider"><span class="ad-line"></span>` +
      `<span class="ad-label">${escapeHtml(label)}</span><span class="ad-line"></span></div>`
    );
  };
  const rows = [];
  let lastSess = null;
  for (let i = shown.length - 1; i >= 0; i--) { // newest-first
    const ev = shown[i];
    const s = sessionOf[ev.id];
    if (s !== lastSess) { rows.push(divider(s)); lastSess = s; }
    rows.push(actRowHtml(ev));
  }
  const st = body.scrollTop;
  body.innerHTML = rows.join("");
  body.scrollTop = st;
}

async function refreshEvents() {
  try {
    const { events } = await api().get_events(lastEventId);
    let popped = false;
    let updateEvent = false;
    for (const ev of events) {
      lastEventId = Math.max(lastEventId, ev.id);
      activityLog.push(ev);
      if (ev.kind === "queue_pop" || /queue popped/i.test(ev.message)) popped = true;
      if (ev.kind === "update") updateEvent = true;
      // Per-event fan-out: the live-view ticker and the updater's progress
      // mirroring pick individual events off the bus.
      QP.bus.emit("activity:event", ev);
    }
    while (activityLog.length > 200) activityLog.shift();
    renderActivity(); // also refreshes relative times when there are no new events
    if (popped && !firstActivityLoad) flashPop(); // celebrate, but not on backfill
    // The background updater posts its result to the activity feed (1s poll) long
    // before the 60s update-status poll would notice. Pull the fresh status now so
    // the banner + About card light up in step with the activity line, instead
    // of lagging up to a minute behind it.
    if (updateEvent) QP.bus.emit("update:event");
    firstActivityLoad = false;
  } catch (e) {
    /* ignore */
  }
}

// Filter chips.
$("act-filters").addEventListener("click", (e) => {
  const btn = e.target.closest(".act-filter");
  if (!btn) return;
  activityFilter = btn.dataset.cat;
  document
    .querySelectorAll("#act-filters .act-filter")
    .forEach((b) => b.classList.toggle("active", b === btn));
  renderActivity();
});

QP._loaded.push("features/activity");
