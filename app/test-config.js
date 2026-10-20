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

// DONI-522: games_enabled keeps known games in order, never empty.
const { cleanGames, normalizeConfig } = require("./champ-config");
assert.deepStrictEqual(cleanGames(["deadlock", "league", "x", "league"]), ["league", "deadlock"]);
assert.deepStrictEqual(cleanGames([]), ["league", "tft", "deadlock"]);
assert.deepStrictEqual(cleanGames(undefined), ["league", "tft", "deadlock"]);
assert.deepStrictEqual(normalizeConfig({ games_enabled: ["tft"] }).games_enabled, ["tft"]);
console.log("test-config games ok");

// DONI-328: the companion token survives normalize (else every Settings save would cut the phone off); junk is dropped.
assert.strictEqual(normalizeConfig({ companion: { token: "0123456789abcdef0123" } }).companion.token, "0123456789abcdef0123");
assert.strictEqual(normalizeConfig({ companion: { token: "<script>" } }).companion.token, "");
console.log("test-config token ok");
// Night review P1: a stale renderer copy can't put an old companion token back.
assert.strictEqual(mergeForSave({ companion: { token: "aaaaaaaaaaaaaaaaaaaa" } }, { companion: { token: "bbbbbbbbbbbbbbbbbbbb" } }).companion.token, "bbbbbbbbbbbbbbbbbbbb");
console.log("test-config stale token ok");
// DONI-351: auto_accept defaults on and survives normalize.
assert.strictEqual(normalizeConfig({}).auto_accept, true);
assert.strictEqual(normalizeConfig({ auto_accept: false }).auto_accept, false);
console.log("test-config auto_accept ok");
// DONI-425: ntfy settings survive normalize; junk topic dropped.
assert.deepStrictEqual(normalizeConfig({ ntfy: { enabled: true, topic: "queuepop-ab", server: "https://n.example/" } }).ntfy, { enabled: true, server: "https://n.example", topic: "queuepop-ab", token: "" });
assert.strictEqual(normalizeConfig({ ntfy: { topic: "bad topic" } }).ntfy.topic, "");
console.log("test-config ntfy ok");
