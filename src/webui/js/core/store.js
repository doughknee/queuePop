/* Config store: the canonical in-memory copy of config.json. Loaded once at
   boot and never re-loaded after a save (re-loading would rebuild grids and
   reset focus/scroll mid-edit — JS state is the source of truth while the user
   edits). Pages hydrate from QP.store.config and write back through it; saves
   are debounced so rapid edits (typing, dragging) coalesce into one write.

   The save payload omits the Python-managed keys (favorite_queue_ids,
   last_queue_id, show_last_queue) — save_config()'s server-side merge
   re-injects them, exactly as the old gatherConfig() relied on. */

QP.store = {
  config: null,
  _saveTimer: null,

  async load() {
    this.config = (await api().get_config()) || {};
    return this.config;
  },

  // Dotted-path read, e.g. QP.store.get("champ_select.aram.mode").
  get(path) {
    let cur = this.config;
    for (const key of path.split(".")) {
      if (cur == null) return undefined;
      cur = cur[key];
    }
    return cur;
  },

  // Dotted-path write + debounced save. Missing intermediate objects are
  // created so set() works on configs from older builds.
  set(path, value) {
    const keys = path.split(".");
    let cur = this.config;
    for (const key of keys.slice(0, -1)) cur = cur[key] ||= {};
    cur[keys[keys.length - 1]] = value;
    QP.bus.emit("config:changed", { path });
    this.scheduleSave();
  },

  scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.saveNow(), 350);
  },

  async saveNow() {
    try {
      const payload = JSON.parse(JSON.stringify(this.config));
      delete payload.favorite_queue_ids;
      delete payload.last_queue_id;
      delete payload.show_last_queue;
      const res = await api().save_config(payload);
      if (res && res.ok) showToast("Saved");
      else showToast((res && res.error) || "Save failed", false);
    } catch (e) {
      showToast("Save failed", false);
    }
  },
};

// Champ-editor mutations edit QP.store.config in place (plan IS the config),
// so their save is a plain debounce with no DOM sync. Kept as a global for the
// many existing call sites.
function scheduleSave() {
  QP.store.scheduleSave();
}

QP._loaded.push("core/store");
