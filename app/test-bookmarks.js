// node test-bookmarks.js: the bookmarks bar's list logic (src/webui/bookmarks.js).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ctx = { window: {}, document: { getElementById: () => null } };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "src", "webui", "bookmarks.js"), "utf8"), ctx);
const W = ctx.window, J = (x) => JSON.parse(JSON.stringify(x));
const a = { href: "#/league/champion/81", label: "Ezreal", game: "league" }, b = { href: "#/tft/comps", label: "Comps", game: "tft" };
assert.deepStrictEqual(J(W.qpMarksToggle([], a)), [a]);
assert.deepStrictEqual(J(W.qpMarksToggle([a, b], a)), [b]); // pinned again = unpinned
assert.deepStrictEqual(J(W.qpMarksMove([a, b], 1, 0)), [b, a]);
assert.strictEqual(W.qpMarkGame("#/deadlock/heroes/haze"), "deadlock");
assert.strictEqual(W.qpMarkGame("#/settings#tft"), "settings");
assert.strictEqual(W.qpMarkGame("#/"), "home");
// config keeps only in-app pages, once each
const { normalizeConfig } = require("./champ-config");
assert.deepStrictEqual(normalizeConfig({ bookmarks: [a, a, { href: "https://x.com", label: "x" }, { href: "#/x", game: "nope" }] }).bookmarks, [a, { href: "#/x", label: "Page", game: "home" }]);
console.log("test-bookmarks ok");
