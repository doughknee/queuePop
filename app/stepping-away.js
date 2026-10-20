// "I'm stepping away" (DONI-424): one switch (phone, tray, the status line) that arms everything for an away player
// without touching config.json: champ select automation reads its settings through applyAway while it's on, so turning it
// off restores the user's own settings exactly (nothing was ever written). Auto-accept is unpaused while away.
const SAFE_LOCK_S = 3; // lock in with 3 s left: late enough to change your mind if you're back, never late enough to miss

// The champ_select settings the automation sees while away. Pure; app/test-away.js checks it.
function applyAway(cs) {
  return { ...(cs || {}), enabled: true, instant_lock: false, lock_in_at_seconds: SAFE_LOCK_S };
}

// state: the host's shared state ({paused, away}); push: activity feed.
function createAway(state, push) {
  let wasPaused = false, since = 0;
  function set(on) {
    on = !!on;
    if (on === !!state.away) return status();
    state.away = on;
    if (on) { wasPaused = !!state.paused; state.paused = false; since = Date.now(); }
    else { state.paused = wasPaused; since = 0; }
    push(on ? "Stepping away: auto-accept, auto pick and ban on, locking in with 3 s left" : "Back: your own settings again", on ? "warning" : "success", "away");
    return status();
  }
  const status = () => ({ on: !!state.away, since });
  return { set, status };
}

module.exports = { applyAway, createAway, SAFE_LOCK_S };
