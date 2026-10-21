// Checks the ad mode pick (qpAdMode in src/webui/ads.js, docs/ads.md).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "ads.js"), "utf8"), ctx);
const mode = ctx.window.qpAdMode;
assert.strictEqual(mode(true, false, false, true), "ad"); // ow-electron, ads live, not a supporter
assert.strictEqual(mode(true, false, false, false), "preview"); // ow-electron before release: placeholder, never your own live ads
assert.strictEqual(mode(true, true, false, true), "off"); // supporters never see it
assert.strictEqual(mode(true, true, true, true), "off"); // not even in preview
assert.strictEqual(mode(false, false, false, true), "off"); // plain Electron: nothing
assert.strictEqual(mode(false, false, true, false), "preview"); // plain Electron + preview flag: the placeholder box
assert.strictEqual(mode(true, false, true, true), "ad"); // a live ad wins over the preview
console.log("ok test-ads");
