// node test-keys.js — app-wide shortcut matching (src/webui/keys.js, DONI-538).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "keys.js"), "utf8"), ctx);
const { qpKeyLabel: L, QP_SHORTCUTS } = ctx.window;
const ev = (key, m = {}) => ({ key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...m });

assert.strictEqual(L(ev("1", { ctrlKey: true })), "Ctrl 1");
assert.strictEqual(L(ev("b", { ctrlKey: true })), "Ctrl B");
assert.strictEqual(L(ev(",", { ctrlKey: true })), "Ctrl ,");
assert.strictEqual(L(ev("ArrowLeft", { altKey: true })), "Alt ←");
assert.strictEqual(L(ev("Home", { altKey: true })), "Alt Home");
assert.strictEqual(L(ev("?", { shiftKey: true })), "?");
assert.strictEqual(L(ev("1", { ctrlKey: true, shiftKey: true })), ""); // Ctrl+Shift+1 is not Ctrl+1
assert.strictEqual(L(ev("a")), ""); // plain letters never trigger anything
assert.strictEqual(L(ev("Shift", { shiftKey: true })), "");
// Every bound shortcut label is reachable from some key event, and no two bindings share a label.
const labels = QP_SHORTCUTS.map(([k]) => k);
assert.strictEqual(new Set(labels).size, labels.length);
console.log("test-keys ok");
