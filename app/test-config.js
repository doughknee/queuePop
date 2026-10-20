// node test-config.js — a corrupt config is kept aside, not silently replaced; writes leave no temp file (DONI-529).
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const config = require("./config");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qp-config-"));
const file = path.join(dir, "config.json");

assert.strictEqual(config.get(file).start_minimized, false); // missing -> defaults written
assert.ok(fs.existsSync(file) && !fs.existsSync(file + ".tmp"));

fs.writeFileSync(file, '{"webhook_url": "https://x", '); // torn write
const cfg = config.get(file);
assert.strictEqual(cfg.webhook_url, "");
assert.strictEqual(fs.readFileSync(file + ".corrupt", "utf8"), '{"webhook_url": "https://x", ');
assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")));

fs.rmSync(dir, { recursive: true });
console.log("test-config ok");

// save_config from the renderer keeps file-only keys and cannot add them.
const { mergeForSave } = require("./champ-config");
const merged = mergeForSave({ webhook_url: "", deadlock_overlay_exe: "C:\evil.exe" }, { deadlock_overlay_exe: "C:\ow\overlay.exe", python_only: 1 });
assert.strictEqual(merged.deadlock_overlay_exe, "C:\ow\overlay.exe");
assert.strictEqual(merged.python_only, 1);
assert.strictEqual(mergeForSave({ deadlock_overlay_exe: "C:\evil.exe" }, {}).deadlock_overlay_exe, undefined);
console.log("test-config merge ok");
