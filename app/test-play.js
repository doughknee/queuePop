// node test-play.js: PLAY's state on any page (src/webui/js/features/play.js qpPlayState).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const el = () => ({ addEventListener() {}, classList: { toggle() {}, add() {}, remove() {} } });
const ctx = { window: {}, $: el, QP: { bus: { on() {} }, _loaded: [] }, document: { body: { className: "" }, addEventListener() {} } };
try { vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "js", "features", "play.js"), "utf8"), ctx); } catch {} // the DOM half needs a page
const S = (s, page) => JSON.parse(JSON.stringify(ctx.window.qpPlayState(s, page)));
// A TFT queue shows on every page, with TFT's logo, and can be left from anywhere.
for (const page of ["home", "league", "deadlock"]) assert.deepStrictEqual(S({ connected: true, gameflow_phase: "Matchmaking", client_game: "tft" }, page), { text: "IN QUEUE", mode: "cancel", game: "tft", disabled: false });
assert.strictEqual(S({ connected: true, gameflow_phase: "ChampSelect", client_game: "league" }, "deadlock").mode, "live");
assert.strictEqual(S({ connected: true, gameflow_phase: "InProgress", client_game: "tft" }, "league").disabled, true);
// Idle: the page decides.
assert.deepStrictEqual(S({ connected: true, gameflow_phase: "Lobby" }, "deadlock"), { text: "PLAY", mode: "deadlock", game: "deadlock", disabled: false });
assert.strictEqual(S({ connected: true, gameflow_phase: "None" }, "home").mode, "queue");
assert.strictEqual(S({ connected: false }, "tft").mode, "launch");
console.log("test-play ok");
