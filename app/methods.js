// Every src/web_api.py bridge method with the empty value a stub returns.
// main.js overrides the ported ones (champ select: champ-select.js); the rest log once and return this.
const NOT_PORTED = { ok: false, error: "Not available in the Electron host yet" };

const METHODS = {
  get_status: {}, get_events: { latest: 0, events: [] }, set_paused: false,
  get_queue_map: { queues: [], groups: [] },
  get_champion_mastery: [], get_match_history: [],
  refresh_assets: NOT_PORTED,
  get_companion_info: { enabled: false, port: 0, lan_ip: "", url: "", running: false, qr: "" },
  get_update_status: {}, check_for_update: {}, get_release_notes: { releases: [] }, apply_update: NOT_PORTED,
  test_desktop: NOT_PORTED, get_stats: { stats: {}, uptime_seconds: 0, config_dir: "", frozen: false },
  open_config_folder: false, test_discord: NOT_PORTED, test_companion: NOT_PORTED, pick_sound_file: { ok: false },
  open_external: false, hide_window: true, minimize_window: true, toggle_maximize_window: false, resize_window: true,
  launch_league: NOT_PORTED, get_quick_queues: { queues: [], groups: [], favorites: [], last: null, show_last: false },
  set_show_last_queue: NOT_PORTED, set_favorites: NOT_PORTED, start_queue: NOT_PORTED, cancel_queue: NOT_PORTED,
  get_summoner: { connected: false },
};

module.exports = { METHODS };
