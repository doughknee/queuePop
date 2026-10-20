// Heavy jobs on their own SQLite connection, off the API's event loop: workerData { dbPath, task: "aggregate" | "backup", dir, keep }.
// aggregate: one pass (a full patch takes minutes), then the raw JSON size for /status (a full scan of every blob, ~7 s).
// backup: VACUUM INTO (src/backup.js). retain: raw JSON retention (an UPDATE + incremental vacuum, ~12 s). Posts the result, or throws.
const { workerData, parentPort } = require("worker_threads");
const { open, setMeta } = require("./db");
const db = open(workerData.dbPath);
if (workerData.task === "retire") {
  // batches of 500 with a 250 ms gap: each holds the write lock ~0.3 s, and a main-thread write waiting on it blocks the API
  const jobs = require("./jobs"), nap = new Int32Array(new SharedArrayBuffer(4));
  let n = 0;
  for (;;) {
    let m = 1;
    try { m = jobs.retireBatch(db, workerData.game, 500); } catch (e) { if (!/locked|busy/.test(e.message)) throw e; } // busy: retry
    if (!m) break;
    n += m === true ? 0 : m;
    Atomics.wait(nap, 0, 0, 250);
  }
  parentPort.postMessage(n);
} else if (workerData.task === "retain") {
  parentPort.postMessage(require("./jobs").retain(db, workerData.days));
} else if (workerData.task === "backup") {
  parentPort.postMessage(require("./backup").backup(db, workerData.dir, workerData.keep));
} else {
  // locked(fn): main pauses the crawl loops, then fn runs the writes (main.js periodic). Everything else here only reads main.
  const lock = workerData.lock && new Int32Array(workerData.lock);
  const locked = (fn) => {
    if (!lock) return fn();
    parentPort.postMessage({ lock: true });
    Atomics.wait(lock, 0, 0);
    try { return fn(); } finally { Atomics.store(lock, 0, 0); parentPort.postMessage({ lock: false }); }
  };
  const n = require("./jobs").aggregate(db, Date.now, false, locked);
  const health = require("./server").health(db);
  // seeded players per game and region, the population weights for region=all rates (server.js regionWeighted)
  const rw = {};
  for (const r of db.prepare("SELECT game, region, count(*) n FROM players GROUP BY 1, 2").all()) (rw[r.game] ??= {})[r.region] = r.n;
  const raw = { ...db.prepare("SELECT coalesce(sum(length(raw)), 0) bytes, count(raw) n FROM matches").get(), at: Date.now() };
  locked(() => { setMeta(db, "health", health); setMeta(db, "regionWeights", rw); setMeta(db, "rawStats", raw); });
  parentPort.postMessage(n);
}
db.close();
