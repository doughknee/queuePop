// Checks overlay.js launch/status paths with a stubbed config (no real overlay needed).
const assert = require("assert");
const config = require("./config");
let exe = "";
config.get = () => ({ deadlock_overlay_exe: exe });
const overlay = require("./overlay");

(async () => {
  let s = await overlay.deadlock_overlay_status();
  assert.strictEqual(s.configured, false);
  assert.strictEqual(typeof s.connected, "boolean");
  assert.match(overlay.launch_deadlock_overlay().error, /No overlay configured/);
  exe = "C:\\nope\\overlay.exe";
  assert.match(overlay.launch_deadlock_overlay().error, /not found/);
  exe = process.execPath; // any real exe: node exits on the unknown --minimized flag
  assert.deepStrictEqual(overlay.launch_deadlock_overlay(), { ok: true });
  s = await overlay.deadlock_overlay_status();
  assert.strictEqual(s.configured, true);
  console.log("overlay ok", s.connected ? "(overlay running)" : "(overlay not running)");
})();
