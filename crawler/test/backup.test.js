// D10: VACUUM INTO a dated file, keep the newest N of our own files, never touch anything else.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { open, getMeta } = require("../src/db");
const { backup } = require("../src/backup");

test("backup writes a readable copy, keeps the newest 3, leaves other files alone", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qp-bak-"));
  const src = path.join(dir, "src.db"), out = path.join(dir, "out");
  const db = open(src);
  db.prepare("INSERT INTO players (puuid, game) VALUES ('p', 'lol')").run();
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, "keep-me.db"), "x");
  for (let d = 1; d <= 5; d++) backup(db, out, 3, new Date(Date.UTC(2026, 9, d, 10)));
  assert.deepStrictEqual(fs.readdirSync(out).sort(), ["crawler-20261003-1000.db", "crawler-20261004-1000.db", "crawler-20261005-1000.db", "keep-me.db"]);
  const copy = open(path.join(out, "crawler-20261005-1000.db"));
  assert.strictEqual(copy.prepare("SELECT count(*) n FROM players").get().n, 1);
  copy.close();
  const m = getMeta(db, "backup");
  assert.strictEqual(m.file, "crawler-20261005-1000.db");
  assert.ok(m.bytes > 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
