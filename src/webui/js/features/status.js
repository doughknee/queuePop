/* Status polling: fetches get_status() and fans the snapshot out on the bus
   ("status" event). Owns the dashboard hero strip rendering; PLAY/pause, the
   live takeover, the summoner badge, and the companion note all subscribe. */

const HERO_ICONS = {
  off: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18.4 18.4A9 9 0 0 0 5.6 5.6m12.8 12.8A9 9 0 0 1 5.6 5.6m12.8 12.8L5.6 5.6"/></svg>',
  idle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  lobby: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 13h6l-1 9 10-12h-6z"/></svg>',
  swords: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/></svg>',
  game: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M7 12h3M8.5 10.5v3"/><circle cx="16" cy="11" r="1"/><circle cx="18.5" cy="13.5" r="1"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg>',
};
function heroLiveState(s) {
  if (!s.connected) return { t: "Client offline", ico: HERO_ICONS.off };
  switch (s.gameflow_phase) {
    case "Matchmaking": return { t: "In queue…", ico: HERO_ICONS.search };
    case "ReadyCheck": return { t: "Queue popped!", ico: HERO_ICONS.bolt };
    case "ChampSelect": return { t: "Champ select", ico: HERO_ICONS.swords };
    case "InProgress": return { t: "In game", ico: HERO_ICONS.game };
    case "PreEndOfGame":
    case "WaitingForStats":
    case "EndOfGame": return { t: "Game ending…", ico: HERO_ICONS.flag };
    case "Lobby": return { t: "In lobby", ico: HERO_ICONS.lobby };
    default: return { t: "Idle, ready", ico: HERO_ICONS.idle };
  }
}

async function refreshStatus() {
  try {
    const s = await api().get_status();
    const ver = $("version");
    if (ver) ver.textContent = s.version;

    // Hero strip: monitoring/paused state, "right now", client connection.
    $("hero-status").textContent = s.paused ? "Paused" : "Monitoring";
    $("hero-status").classList.toggle("paused", !!s.paused);
    $("hero-dot").className =
      "hero-dot " + (s.paused ? "paused" : s.connected ? "live" : "");
    const live = heroLiveState(s);
    $("hero-live").textContent = live.t;
    $("hero-live-ico").innerHTML = live.ico;
    $("hero-conn-dot").classList.toggle("on", !!s.connected);
    $("hero-client").textContent = s.connected ? "Connected" : "Waiting…";

    // Everything else (PLAY button, pause button, live takeover, summoner
    // refresh on connect transitions, companion note) subscribes to this.
    QP.bus.emit("status", s);
  } catch (e) {
    /* window may be mid-teardown; ignore */
  }
}

QP._loaded.push("features/status");
