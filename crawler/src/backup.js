// Nightly DB backup (overnight D10): VACUUM INTO a dated file in BACKUP_DIR (compose mounts ./backups there, inside appdata, so
// the server's appdata backup copies it too), then keeps the newest BACKUP_KEEP of the files this function writes. Nothing
// else in the directory is ever touched. Runs in the worker thread (backup-worker.js) because it reads the whole DB.
const fs = require("fs");
const path = require("path");
const { setMeta } = require("./db");

const NAME = /^crawler-\d{8}-\d{4}\.db$/;

function backup(db, dir, keep = 3, now = new Date()) {
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 13); // 20261020-0300
  const file = path.join(dir, `crawler-${stamp}.db`);
  const t = Date.now();
  if (fs.existsSync(file)) fs.unlinkSync(file); // same minute re-run: VACUUM INTO refuses an existing file
  db.prepare("VACUUM INTO ?").run(file);
  const removed = fs.readdirSync(dir).filter((f) => NAME.test(f)).sort().reverse().slice(keep);
  for (const f of removed) fs.unlinkSync(path.join(dir, f));
  const out = { at: now.getTime(), file: path.basename(file), bytes: fs.statSync(file).size, ms: Date.now() - t, removed };
  setMeta(db, "backup", out);
  return out;
}

module.exports = { backup, NAME };
