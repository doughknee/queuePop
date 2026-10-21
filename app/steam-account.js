// The Deadlock account fills itself in from Steam on this PC (Brandon, 2026-10-20: "a way I don't have to do anything").
// Steam's config/loginusers.vdf lists the accounts that signed in here, with MostRecent on the last one. The Deadlock
// account id is that SteamID64 minus 76561197960265728. Read-only; nothing leaves the PC. test-steam.js checks the parse.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const BASE = 76561197960265728n;
function accountFromVdf(text) {
  const users = [...String(text || "").matchAll(/"(7656\d{13})"\s*\{([^}]*)\}/g)].map((m) => ({
    id64: m[1], recent: /"MostRecent"\s*"1"/i.test(m[2]), ts: Number((/"Timestamp"\s*"(\d+)"/i.exec(m[2]) || [])[1] || 0) }));
  if (!users.length) return "";
  const u = users.find((x) => x.recent) || users.sort((a, b) => b.ts - a.ts)[0];
  return String(BigInt(u.id64) - BASE);
}
function steamDir() {
  try {
    const out = execFileSync("reg", ["query", "HKCU\Software\Valve\Steam", "/v", "SteamPath"], { encoding: "utf8", windowsHide: true, timeout: 3000 });
    const m = /SteamPath\s+REG_SZ\s+(.+)/.exec(out); if (m) return m[1].trim();
  } catch {}
  return "C:\Program Files (x86)\Steam";
}
function detectDeadlockAccount() {
  if (process.platform !== "win32") return "";
  try { return accountFromVdf(fs.readFileSync(path.join(steamDir(), "config", "loginusers.vdf"), "utf8")); } catch { return ""; }
}
module.exports = { accountFromVdf, detectDeadlockAccount };
