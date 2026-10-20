// node test-float.js — the suggestions float may only read (app/float.js, DONI-346).
const assert = require("assert");
const Module = require("module");
const load = Module._load;
Module._load = (req, ...a) => (req === "electron" ? {} : load(req, ...a));
const { FLOAT_METHODS } = require("./float");
Module._load = load;
for (const m of ["get_champ_select", "pick_suggestions", "get_config", "get_champion_catalog", "close_float"]) assert.ok(FLOAT_METHODS.has(m), m);
for (const m of ["save_config", "start_queue", "open_external", "launch_deadlock_overlay", "set_stepping_away", "respond_trade"]) assert.ok(!FLOAT_METHODS.has(m), m);
console.log("test-float ok");
