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
