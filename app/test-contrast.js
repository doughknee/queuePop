// node test-contrast.js — every text colour in the lime theme reads on its background at WCAG AA (4.5:1) (DONI-545).
// --dim and --line are for borders and disabled marks only; never text.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "webui", "theme.css"), "utf8");
const long = (h) => (h.length === 4 ? "#" + [...h.slice(1)].map((c) => c + c).join("") : h); // #555 -> #555555
const tok = Object.fromEntries([...css.matchAll(/--([a-z]+):(#[0-9A-Fa-f]{3,6})[;}]/g)].map((m) => [m[1], long(m[2])]));
const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(tok[a]), lum(tok[b])].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

for (const t of ["fg", "accent", "muted", "neg", "green", "amber", "purple", "blue", "grey"]) assert.ok(ratio(t, "bg") >= 4.5, `--${t} on --bg is ${ratio(t, "bg").toFixed(2)}`);
assert.ok(ratio("bg", "accent") >= 4.5, "--bg on --accent (lime plates, the home bar)");
assert.ok(ratio("dim", "bg") < 4.5); // documents why --dim is never text
console.log("test-contrast ok");
