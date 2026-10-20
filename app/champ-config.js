// Champ-select constants plus the config normalizer from src/web_api.py (_normalize_config and helpers).
// get_config returns normalize(raw); save_config writes it. Ported 1:1, including the legacy-key migrations.

const ROLES = ["top", "jungle", "middle", "bottom", "utility"];
const ARAM_ROLE = "aram";
const EDITOR_ROLES = [...ROLES, ARAM_ROLE];
const ROLE_LABELS = { top: "Top", jungle: "Jungle", middle: "Middle", bottom: "Bottom (ADC)", utility: "Support", aram: "ARAM" };
const MAX_PICKS = 20;
const MAX_BANS = 5;
const DEFAULT_LOCK_SECONDS = 1;
const ARAM_MODES = ["list", "highest", "lowest", "random", "rusty", "milestone"];
const ROLE_MODES = ["off", "highest", "lowest", "random", "rusty", "milestone"];
const SUMMONER_SPELLS = [
  { id: 4, name: "Flash" }, { id: 14, name: "Ignite" }, { id: 12, name: "Teleport" }, { id: 11, name: "Smite" },
  { id: 7, name: "Heal" }, { id: 3, name: "Exhaust" }, { id: 21, name: "Barrier" }, { id: 6, name: "Ghost" },
  { id: 1, name: "Cleanse" }, { id: 13, name: "Clarity" }, { id: 32, name: "Mark/Dash" },
];
const SPELL_IDS = new Set(SUMMONER_SPELLS.map((s) => s.id));
const RUNE_PAGE_NAME = "queuePop (auto)";
const ALARM_SOUNDS = new Set(["chime", "ping", "arcade", "siren", "custom"]);
const MIN_WINDOW_SIZE = [762, 800];
const COMPANION_PORT = 8420;

// Python truthiness: empty list/dict and "" are false.
function T(x) {
  if (Array.isArray(x)) return x.length > 0;
  if (x && typeof x === "object") return Object.keys(x).length > 0;
  return !!x;
}
const or = (a, b) => (T(a) ? a : b);
const has = (o, k) => o != null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const getd = (o, k, d) => (has(o, k) ? o[k] : d); // dict.get(k, d)

// int(x) / float(x): null where Python raises.
function pyInt(v) {
  if (typeof v === "boolean") return +v;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : null;
  if (typeof v === "string" && /^\s*[-+]?\d+\s*$/.test(v)) return parseInt(v, 10);
  return null;
}
function pyFloat(v) {
  if (typeof v === "boolean") return +v;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function textToList(text) {
  if (Array.isArray(text)) return text.map((s) => String(s).trim()).filter(Boolean);
  return String(text || "").split(",").map((p) => p.trim()).filter(Boolean);
}

function cleanSpells(val) {
  const out = [];
  for (const raw of (or(val, [])).slice(0, 2)) {
    const s = pyInt(raw);
    if (s !== null && SPELL_IDS.has(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function cleanLoadout(lo) {
  lo = or(lo, {});
  const spells = cleanSpells(lo.spells);
  let rune = getd(lo, "rune", "off");
  if (rune !== "off" && rune !== "recommended") { rune = pyInt(rune); if (rune === null) rune = "off"; }
  let skin = getd(lo, "skin", "off");
  if (Array.isArray(skin)) {
    const ids = [];
    for (const raw of skin) { const x = pyInt(raw); if (x !== null && x > 0 && !ids.includes(x)) ids.push(x); }
    skin = ids.length ? ids : "off";
  } else if (skin !== "off") {
    const x = pyInt(skin) || 0;
    skin = x > 0 ? x : "off";
  }
  if (!spells.length && rune === "off" && skin === "off") return null;
  return { spells, rune, skin };
}

function cleanLoadouts(val) {
  const out = {};
  for (const [k, lo] of Object.entries(or(val, {}))) {
    const cid = pyInt(k);
    if (cid === null) continue;
    const clean = cleanLoadout(lo);
    if (clean !== null) out[String(cid)] = clean;
  }
  return out;
}

function cleanWindow(val) {
  val = or(val, {});
  const w = pyInt(val.width), h = pyInt(val.height);
  if (w === null || h === null) return null;
  return { width: Math.max(MIN_WINDOW_SIZE[0], w), height: Math.max(MIN_WINDOW_SIZE[1], h) };
}

function normalizeChampSelect(cs) {
  cs = or(cs, {});
  const rolesIn = or(cs.roles, {});
  const aramIn = or(cs.aram, {});
  const roles = {};
  for (const role of EDITOR_ROLES) {
    const rc = or(rolesIn[role], {});
    let mode = ROLE_MODES.includes(rc.mode) ? rc.mode : null;
    if (role === ARAM_ROLE && mode === null) {
      if (ARAM_MODES.includes(aramIn.mode) && aramIn.mode !== "list") mode = aramIn.mode;
      else if (T(aramIn.auto_mastery)) mode = "highest";
    }
    const spells = cleanSpells(rc.default_spells);
    let bans = textToList(rc.bans), picks = textToList(rc.picks);
    if (role !== ARAM_ROLE) { bans = bans.slice(0, MAX_BANS); picks = picks.slice(0, MAX_PICKS); }
    roles[role] = { bans, picks, loadouts: cleanLoadouts(rc.loadouts), mode: mode || "off", default_spells: spells.length === 2 ? spells : [] };
  }
  let lock = pyInt(getd(cs, "lock_in_at_seconds", DEFAULT_LOCK_SECONDS));
  if (lock === null) lock = DEFAULT_LOCK_SECONDS;
  let pickSpot = String(getd(cs, "pick_spot", "off"));
  if (!["off", "1", "2", "3", "4", "5"].includes(pickSpot)) pickSpot = "off";
  let preferred = String(getd(cs, "preferred_role", "off"));
  if (preferred !== "off" && !ROLES.includes(preferred)) preferred = "off";

  const prio = (key, valid, legacy) => {
    const out = [];
    for (const raw of or(cs[key], [])) { const v = String(raw); if (valid.includes(v) && !out.includes(v)) out.push(v); }
    if (!out.length && legacy !== "off" && !has(cs, key)) out.push(legacy);
    return out;
  };
  const spotPriority = prio("spot_priority", ["1", "2", "3", "4", "5"], pickSpot);
  const rolePriority = prio("role_priority", ROLES, preferred);
  return {
    enabled: T(getd(cs, "enabled", false)),
    instant_lock: T(getd(cs, "instant_lock", true)),
    lock_in_at_seconds: Math.max(0, lock),
    pick_spot: spotPriority[0] || "off",
    preferred_role: rolePriority[0] || "off",
    spot_priority: spotPriority,
    role_priority: rolePriority,
    show_intent: T(getd(cs, "show_intent", true)),
    show_suggestions: T(getd(cs, "show_suggestions", true)),
    auto_runes: T(getd(cs, "auto_runes", false)),
    roles,
    trades: { enabled: T(getd(or(cs.trades, {}), "enabled", false)) },
    aram: normalizeAram(aramIn, roles[ARAM_ROLE].mode),
  };
}

function normalizeAram(aram, aramRoleMode) {
  aram = or(aram, {});
  const enabled = T(getd(aram, "enabled", false)) || T(getd(aram, "auto_mastery", false));
  let delay = pyFloat(or(getd(aram, "bench_delay", 0), 0));
  delay = delay === null ? 0 : Math.min(3, Math.max(0, delay));
  return { enabled, mode: aramRoleMode === "off" ? "list" : aramRoleMode, auto_mastery: enabled && aramRoleMode === "highest", bench_delay: delay };
}

function normalizeCompanion(comp) {
  comp = or(comp, {});
  let port = pyInt(getd(comp, "port", COMPANION_PORT));
  if (port === null || port < 1024 || port > 65535) port = COMPANION_PORT;
  const sound = ALARM_SOUNDS.has(comp.sound) ? comp.sound : "chime";
  return { enabled: T(getd(comp, "enabled", false)), port, sound, sound_file: String(comp.sound_file || "").trim() };
}

function cleanQueueIds(ids, keepOrder = false) {
  const clean = [];
  for (const raw of or(ids, [])) {
    const q = pyInt(raw);
    if (q === null) continue;
    if (!keepOrder || !clean.includes(q)) clean.push(q);
  }
  return keepOrder ? clean : [...new Set(clean)].sort((a, b) => a - b);
}

const coerceQueueId = (v) => pyInt(v);

function acceptDelay(v) {
  const f = pyFloat(or(v, 0));
  return f === null ? 0 : Math.trunc(Math.min(10, Math.max(0, f)));
}

const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5];
function normalizeConfig(data) {
  data = or(data, {});
  const webhook = String(data.webhook_url || "").trim();
  const alerts = or(data.alert_events, {});
  return {
    webhook_url: webhook,
    user_id: String(data.user_id || "").trim(),
    discord_enabled: T(getd(data, "discord_enabled", !!webhook)),
    desktop_notifications: T(getd(data, "desktop_notifications", true)),
    alert_events: Object.fromEntries(["queue_pop", "champ_select", "game_start", "disconnect", "locked_pick"]
      .map((k) => [k, T(getd(alerts, k, k === "queue_pop"))])),
    allowed_queue_ids: cleanQueueIds(data.allowed_queue_ids),
    accept_delay_seconds: acceptDelay(data.accept_delay_seconds),
    favorite_queue_ids: cleanQueueIds(data.favorite_queue_ids, true),
    last_queue_id: coerceQueueId(data.last_queue_id),
    show_last_queue: T(getd(data, "show_last_queue", true)),
    start_minimized: T(getd(data, "start_minimized", false)),
    // App-level keys (Settings page, DONI-489): without them every save_config would drop them.
    deadlock_account_id: /^\d+$/.test(String(data.deadlock_account_id || "")) ? String(data.deadlock_account_id) : "",
    crawler_url: String(data.crawler_url || "").trim().replace(/\/+$/, ""),
    ui_scale: UI_SCALES.includes(Number(data.ui_scale)) ? Number(data.ui_scale) : 1.25, // DONI-516 Text size (zoom factor)
    setup_done: T(getd(data, "setup_done", T(data.allowed_queue_ids))),
    companion: normalizeCompanion(data.companion),
    champ_select: normalizeChampSelect(data.champ_select),
    window: cleanWindow(data.window),
  };
}

// save_config: the Settings form omits these, so keep the previous values (web_api.save_config).
function mergeForSave(newConfig, prev) {
  const cfg = normalizeConfig(newConfig);
  newConfig = newConfig || {};
  prev = prev || {};
  if (!has(newConfig, "favorite_queue_ids")) cfg.favorite_queue_ids = cleanQueueIds(prev.favorite_queue_ids, true);
  if (!has(newConfig, "last_queue_id")) cfg.last_queue_id = coerceQueueId(prev.last_queue_id);
  if (!has(newConfig, "show_last_queue")) cfg.show_last_queue = T(getd(prev, "show_last_queue", true));
  if (!has(newConfig, "window")) cfg.window = cleanWindow(prev.window);
  // Keys only the file knows (deadlock_overlay_exe, the Python app's extras) survive a save from the renderer,
  // which can't set them: they come from prev, never from newConfig (DONI-529).
  for (const k of Object.keys(prev)) if (!has(cfg, k)) cfg[k] = prev[k];
  return cfg;
}

module.exports = {
  ROLES, ARAM_ROLE, EDITOR_ROLES, ROLE_LABELS, DEFAULT_LOCK_SECONDS, ARAM_MODES, ROLE_MODES, SUMMONER_SPELLS,
  RUNE_PAGE_NAME, T, or, getd, pyInt, pyFloat, normalizeConfig, mergeForSave, UI_SCALES,
};
