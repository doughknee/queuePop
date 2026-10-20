// Runs one aggregation pass on its own SQLite connection, off the API's event loop (a full patch takes minutes).
// main.js starts it with workerData { dbPath }; it posts the number of patches rebuilt, or throws.
const { workerData, parentPort } = require("worker_threads");
const db = require("./db").open(workerData.dbPath);
const n = require("./jobs").aggregate(db);
// Raw JSON size for /status: a full scan of every blob (~7 s on 1.6 GB), so it is measured here, off the API thread.
const { setMeta } = require("./db");
setMeta(db, "rawStats", { ...db.prepare("SELECT coalesce(sum(length(raw)), 0) bytes, count(raw) n FROM matches").get(), at: Date.now() });
parentPort.postMessage(n);
db.close();
