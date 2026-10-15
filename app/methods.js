// Every src/web_api.py bridge method with the empty value a stub returns.
// main.js, host.js and champ-select.js override the ported ones; the rest log once and return this.
const NOT_PORTED = { ok: false, error: "Not available in the Electron host yet" };

const METHODS = {
  get_events: { latest: 0, events: [] },
  set_paused: false,
  refresh_assets: NOT_PORTED,
  toggle_maximize_window: false,
  set_show_last_queue: NOT_PORTED,
  set_favorites: NOT_PORTED,
};

module.exports = { METHODS };
