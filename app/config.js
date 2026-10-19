// config.json shared with the Python app (src/config.py): same path, same shape, same json.dump(indent=4) bytes.
// Plain load/save/get; normalization lives with the callers (see champ-config.js).
const fs = require("fs");
const path = require("path");

const CONFIG_FILE = path.join(__dirname, "..", "src", "config.json");

function defaultConfig() {
  const role = (mode = "off") => ({ bans: [], picks: [], loadouts: {}, mode, default_spells: [] });
  return {
    webhook_url: "", user_id: "", discord_enabled: false, desktop_notifications: true,
    alert_events: { queue_pop: true, champ_select: false, game_start: false, disconnect: false, locked_pick: false },
    allowed_queue_ids: [], accept_delay_seconds: 0, favorite_queue_ids: [], last_queue_id: null,
    show_last_queue: true, start_minimized: false, setup_done: false,
    deadlock_account_id: "",
    companion: { enabled: false, port: 8420, sound: "chime", sound_file: "" },
    champ_select: {
      enabled: false, instant_lock: true, lock_in_at_seconds: 1, spot_priority: [], pick_spot: "off",
      auto_runes: false, show_intent: true, show_suggestions: true, role_priority: [], preferred_role: "off",
      roles: { top: role(), jungle: role(), middle: role(), bottom: role(), utility: role(), aram: role("highest") },
      trades: { enabled: false },
      aram: { enabled: false, mode: "highest", auto_mastery: false, bench_delay: 0 },
    },
  };
}

// Python's json.dump(cfg, f, indent=4): same layout as JSON.stringify, plus ensure_ascii escaping and
// float rendering for the one float key (bench_delay: 0 -> 0.0).
// ponytail: integer-like dict keys (loadouts) come out sorted, Python keeps insertion order; both read either.
function dump(cfg) {
  return JSON.stringify(cfg, null, 4)
    .replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
    .replace(/("bench_delay": )(-?\d+)(?=[,\n}])/g, "$1$2.0");
}

// Python's text-mode write on Windows turns every \n into \r\n.
const write = (cfg) => fs.writeFileSync(CONFIG_FILE, dump(cfg).replace(/\n/g, "\r\n"));

// Like load_or_create_config: a missing or corrupt file is replaced with defaults. Read fresh every call
// (a ~7KB file) because host.js and the Python app write it too; a cache would overwrite their keys on save.
function get() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    const cfg = defaultConfig();
    try { write(cfg); } catch {}
    return cfg;
  }
}

// Throws on write failure so the caller can report it (save_config returns {ok: false, error}).
function save(cfg) {
  write(cfg);
  return cfg;
}

module.exports = { CONFIG_FILE, defaultConfig, dump, get, save };
