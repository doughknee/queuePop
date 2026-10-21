// Checks the ad mode pick (qpAdMode in src/webui/ads.js, docs/ads.md).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "ads.js"), "utf8"), ctx);
const mode = ctx.window.qpAdMode;
assert.strictEqual(mode(true, false, false), "ad"); // ow-electron, not a supporter
assert.strictEqual(mode(true, true, false), "off"); // supporters never see it
assert.strictEqual(mode(true, true, true), "off"); // not even in preview
assert.strictEqual(mode(false, false, false), "off"); // plain Electron: nothing
assert.strictEqual(mode(false, false, true), "preview"); // plain Electron + preview flag: the placeholder box
assert.strictEqual(mode(true, false, true), "ad"); // a real ad wins over the preview
console.log("ok test-ads");
