/* Polling manager: named, registered pollers replacing ad-hoc setIntervals.
   A poller never overlaps itself — if the previous tick's promise is still
   pending (slow LCU call), the next tick is skipped instead of stacking. */

QP.poll = {
  _defs: {},   // name -> {fn, ms}
  _timers: {}, // name -> interval id
  _busy: {},   // name -> a tick's promise is still pending

  register(name, fn, ms, opts) {
    this._defs[name] = { fn, ms };
    if (!opts || opts.enabled !== false) this.start(name, opts && opts.immediate);
  },

  start(name, immediate) {
    const def = this._defs[name];
    if (!def || this._timers[name]) return;
    const tick = async () => {
      if (this._busy[name]) return; // previous tick still running
      this._busy[name] = true;
      try { await def.fn(); } catch (e) { /* pollers never throw outward */ }
      this._busy[name] = false;
    };
    if (immediate) tick();
    this._timers[name] = setInterval(tick, def.ms);
  },

  stop(name) {
    if (this._timers[name]) {
      clearInterval(this._timers[name]);
      delete this._timers[name];
    }
  },
};

QP._loaded.push("core/poll");
