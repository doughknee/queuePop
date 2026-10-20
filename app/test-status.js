// node test-status.js — the status line picks the right problem for the page (src/webui/statusline.js, DONI-541).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "statusline.js"), "utf8"), ctx);
const ids = (f) => ctx.window.statusIssues(f).map((i) => i.id).join(",");
const upd = { available: true, latest: "2.1.0" };

assert.strictEqual(ids({ game: "league", client: false, crawler: "down", update: upd }), "crawler,client");
assert.strictEqual(ids({ game: "league", client: true, crawler: "ok", key: { valid: false, reason: "403 Forbidden" } }), "key");
assert.ok(ctx.window.statusIssues({ game: "tft", crawler: "ok", key: { valid: false, reason: "403 Forbidden" } })[0].text.includes("403 Forbidden"));
assert.strictEqual(ids({ game: "league", client: true, crawler: "ok", key: { valid: true } }), "");
assert.strictEqual(ids({ game: "deadlock", client: false, crawler: "down", update: upd }), ""); // Deadlock needs neither
assert.strictEqual(ids({ game: "home", client: false, crawler: "down", update: upd }), "crawler,update:2.1.0"); // no client nag on home
assert.strictEqual(ids({ game: "settings", update: upd }), "update:2.1.0");
assert.strictEqual(ids({ game: "league" }), ""); // nothing known yet: say nothing
console.log("test-status ok");
