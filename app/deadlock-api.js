// Deadlock account id for the stats-first city (DONI-482). Raw read/write of one config key; deadlock-api calls stay
// in the renderer like DONI-446's.
const config = require("./config");

module.exports = {
  get_deadlock_account: () => String(config.get().deadlock_account_id || ""),
  set_deadlock_account: (id) => {
    const cfg = config.get();
    cfg.deadlock_account_id = /^\d+$/.test(String(id)) ? String(id) : "";
    try { config.save(cfg); } catch (e) { return { ok: false, error: e.message }; }
    return { ok: true };
  },
};
