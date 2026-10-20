// Heavy jobs on their own SQLite connection, off the API's event loop: workerData { dbPath, task: "aggregate" | "backup", dir, keep }.
// aggregate: one pass (a full patch takes minutes), then the raw JSON size for /status (a full scan of every blob, ~7 s).
// backup: VACUUM INTO (src/backup.js). Posts the result, or throws.
const { workerData, parentPort } = require("worker_threads");
const { open, setMeta } = require("./db");
const db = open(workerData.dbPath);
if (workerData.task === "backup") {
  parentPort.postMessage(require("./backup").backup(db, workerData.dir, workerData.keep));
} else {
  const n = require("./jobs").aggregate(db);
  setMeta(db, "rawStats", { ...db.prepare("SELECT coalesce(sum(length(raw)), 0) bytes, count(raw) n FROM matches").get(), at: Date.now() });
  parentPort.postMessage(n);
}
db.close();
