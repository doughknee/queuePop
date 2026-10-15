// Every src/web_api.py bridge method with the empty value a stub returns.
// main.js overrides the ported ones; the rest log once and return this.
const NOT_PORTED = { ok: false, error: "Not available in the Electron host yet" };

const METHODS = {
  get_status: {}, get_config: {}, get_events: { latest: 0, events: [] }, set_paused: false,
  get_queue_map: { queues: [], groups: [] }, get_roles: [], get_summoner_spells: [],
  get_champion_mastery: [], get_match_history: [], suggest_picks: { ok: false, roles: {}, queues: {}, last: null },
  get_champ_select: { active: false }, pick_suggestions: { ok: false }, get_champion_catalog: [],
  get_champ_asset_base: "assets/champions", get_champ_data_info: {}, refresh_assets: NOT_PORTED,
  get_champion_skins: [], get_rune_pages: [], get_rune_info: {}, claim_rune_page: NOT_PORTED,
  get_champions: [], get_companion_info: { enabled: false, port: 0, lan_ip: "", url: "", running: false, qr: "" },
  get_update_status: {}, check_for_update: {}, get_release_notes: { releases: [] }, apply_update: NOT_PORTED,
  save_config: NOT_PORTED, test_desktop: NOT_PORTED, get_stats: { stats: {}, uptime_seconds: 0, config_dir: "", frozen: false },
  open_config_folder: false, test_discord: NOT_PORTED, test_companion: NOT_PORTED, pick_sound_file: { ok: false },
  open_external: false, hide_window: true, minimize_window: true, toggle_maximize_window: false, resize_window: true,
  launch_league: NOT_PORTED, get_quick_queues: { queues: [], groups: [], favorites: [], last: null, show_last: false },
  set_show_last_queue: NOT_PORTED, set_favorites: NOT_PORTED, start_queue: NOT_PORTED, cancel_queue: NOT_PORTED,
  get_summoner: { connected: false },
};

module.exports = { METHODS };
