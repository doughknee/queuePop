// Every src/web_api.py bridge method with the empty value a stub returns.
// main.js and host.js override the ported ones; the rest log once and return this.
const NOT_PORTED = { ok: false, error: "Not available in the Electron host yet" };

const METHODS = {
  get_config: {},
  get_events: { latest: 0, events: [] },
  set_paused: false,
  get_roles: [],
  get_summoner_spells: [],
  suggest_picks: { ok: false, roles: {}, queues: {}, last: null },
  get_champ_select: { active: false },
  pick_suggestions: { ok: false },
  get_champion_catalog: [],
  get_champ_asset_base: "assets/champions",
  get_champ_data_info: {},
  refresh_assets: NOT_PORTED,
  get_champion_skins: [],
  get_rune_pages: [],
  get_rune_info: {},
  claim_rune_page: NOT_PORTED,
  get_champions: [],
  save_config: NOT_PORTED,
  toggle_maximize_window: false,
  set_show_last_queue: NOT_PORTED,
  set_favorites: NOT_PORTED,
};

module.exports = { METHODS };
