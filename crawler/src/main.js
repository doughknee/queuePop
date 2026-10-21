// Entry point: serve the API and, when RIOT_API_KEY is set, crawl every region forever.
//   node src/main.js             crawl + serve
//   node src/main.js aggregate   rebuild all stats_* now and exit
//   node src/main.js backfill-patch  re-parse patch/set from stored raw for '?' rows, drop stale '?' stats, exit
//   node src/main.js backfill-modes  give flex (440) etc. their "-flex" patch suffix, mark those patches dirty (DONI-596), exit
//   node src/main.js backup       one VACUUM INTO BACKUP_DIR now (keeps the newest BACKUP_KEEP), exit
//   node src/main.js backfill-length  matches.duration from stored raw (D6 length buckets), exit
//   node src/main.js backfill-comps  re-key TFT boards with the current comp rule from stored raw (DONI-502), exit
//   node src/main.js backfill-players  Riot ids from stored raw into lol_names (DONI-506), exit
//   node src/main.js vacuum      one-time VACUUM that enables auto_vacuum on an old DB, then exit
const db_ = require("./db");
const jobs = require("./jobs");
const { Limiter } = require("./limiter");
const { createClient, ROUTING } = require("./riot");
const { createServer } = require("./server");
const { version } = require("../package.json");

const env = process.env;
const cfg = {
  key: env.RIOT_API_KEY || "",
  base: env.RIOT_BASE_URL || "",
  regions: (env.REGIONS || "na1,kr").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  minTier: (env.MIN_TIER || "EMERALD").toUpperCase(),
  dbPath: env.DB_PATH || "data/crawler.db",
  port: Number(env.PORT) || 47900,
  // 450 ARAM (D13), 400 normal draft, 480/490 swiftplay (DONI-596): capped by ARAM_SHARE / NORMAL_SHARE / SWIFT_SHARE
  queues: (env.QUEUES || "420,440,450,400,480,490,1100,1160").split(",").map(Number), // 1160 TFT Double Up (DONI-615)
  shares: { 450: Number(env.ARAM_SHARE ?? 0.1), 400: Number(env.NORMAL_SHARE ?? 0.05), 480: Number(env.SWIFT_SHARE ?? 0.05) },
  aggregateEveryMin: Number(env.AGGREGATE_EVERY_MIN ?? 60),
  retentionDays: Number(env.RAW_RETENTION_DAYS ?? 7),
  timelineSample: Number(env.TIMELINE_SAMPLE ?? 0.1),
  adminToken: env.ADMIN_TOKEN || "",
  backupDir: env.BACKUP_DIR || "", // empty: no nightly backup
  backupKeep: Number(env.BACKUP_KEEP ?? 3),
  backupHourUtc: Number(env.BACKUP_HOUR_UTC ?? 10),
};
for (const r of cfg.regions) if (!ROUTING[r]) throw new Error(`unknown region ${r}; use platform ids like na1, euw1, kr`);
if (!jobs.TIERS.includes(cfg.minTier)) throw new Error(`MIN_TIER must be one of ${jobs.TIERS.join(", ")}`);

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let aggregating = false; // true while the aggregation worker holds the write lock (see periodic below): the crawl loops wait
let passing = false; // an aggregation pass is running (retention skips it)
let inflight = 0, backingUp = false; // crawl steps in progress; a backup worker running (DONI-568)
// Logged, not fatal: a throw in a request listener must not take the crawler (and a pass in its worker) down (DONI-568).
process.on("uncaughtException", (e) => log(`uncaught: ${e.stack || e.message}`));
const db = db_.open(cfg.dbPath);

if (process.argv[2] === "aggregate") {
  jobs.aggregate(db, Date.now, true);
  log("aggregated");
  process.exit(0);
}
if (process.argv[2] === "backfill-patch") {
  log("backfill-patch", JSON.stringify(jobs.backfillPatch(db)), "- now run: npm run aggregate");
  process.exit(0);
}
if (process.argv[2] === "backfill-modes") {
  log("backfill-modes", JSON.stringify(jobs.backfillModes(db)), "- the next aggregation pass rebuilds those patches");
  process.exit(0);
}
if (process.argv[2] === "backup") {
  if (!cfg.backupDir) throw new Error("BACKUP_DIR is not set");
  log("backup", JSON.stringify(require("./backup").backup(db, cfg.backupDir, cfg.backupKeep)));
  process.exit(0);
}
if (process.argv[2] === "backfill-length") {
  log("backfill-length", JSON.stringify(jobs.backfillDuration(db)), "- now run: npm run aggregate");
  process.exit(0);
}
if (process.argv[2] === "repair-carries") {
  log("repair-carries", JSON.stringify(jobs.repairCarries(db)), "- the next aggregation pass picks it up");
  process.exit(0);
}
if (process.argv[2] === "backfill-comps") {
  log("backfill-comps", JSON.stringify(jobs.backfillComps(db)), "- now run: npm run aggregate");
  process.exit(0);
}
if (process.argv[2] === "backfill-players") {
  log("backfill-players", JSON.stringify(require("./agg-players").backfillPlayers(db)), "- now run: npm run aggregate");
  process.exit(0);
}
if (process.argv[2] === "vacuum") {
  db.exec("PRAGMA auto_vacuum = INCREMENTAL; VACUUM");
  log("vacuumed");
  process.exit(0);
}

const limiter = new Limiter();
const onAuthFail = (status, msg, used) => {
  if (db_.keyHealth(db, cfg.key).valid) log(`A Riot key was rejected (${status} ${msg}): crawl paused until a new key is posted to /admin/key`);
  try { db_.markKeyBad(db, cfg.key, `${status} ${msg}`, Date.now(), used); } catch (e) { log(`key health: ${e.message}`); }
};
const ctx = { db, riot: createClient({ key: (game) => db_.riotKey(db, cfg.key, game).key, base: cfg.base, limiter, log, onAuthFail }), minTier: cfg.minTier, queues: cfg.queues, shares: cfg.shares, timelineSample: cfg.timelineSample };
const games = [cfg.queues.some((q) => q === 420 || q === 440) && "lol", cfg.queues.includes(1100) && "tft"].filter(Boolean);

const lookup = require("./lookup").createLookup({ db, riot: ctx.riot, keyOk: (game) => db_.keyHealth(db, cfg.key, game).valid, perMin: Number(env.LOOKUPS_PER_MIN ?? 3) });
createServer({ db, limiter, version, lookup, defaultRegion: cfg.regions[0], adminToken: cfg.adminToken, envKey: cfg.key, dbPath: cfg.dbPath, aggregateEveryMin: cfg.aggregateEveryMin, retentionDays: cfg.retentionDays }).listen(cfg.port, "0.0.0.0", () => log(`API on :${cfg.port}`));

// Ladders live on the platform host, matches on the regional host: separate rate buckets, separate loops; and one loop per
// game, so League and TFT each spend their own key's allowance once they have their own keys.
async function forever(name, game, step, idle) {
  for (;;) {
    try {
      // No key, or Riot rejected this game's (401/403): wait for a key via POST /admin/key instead of hammering Riot.
      if (!db_.keyHealth(db, cfg.key, game).valid) { await sleep(10000); continue; }
      // The aggregation worker holds the write lock for minutes; wait instead of failing on "database is locked".
      if (aggregating) { await sleep(5000); continue; }
      inflight++;
      let did;
      try { did = await step(); } finally { inflight--; }
      // a step that did no I/O (jobs.retireBatch) resolves as a microtask: without a macrotask turn here the loops starved the
      // HTTP server (the API hung during the 21:14 retirement)
      await new Promise((r) => setImmediate(r));
      if (!did) await sleep(idle);
    } catch (e) {
      if (e.decrypt && e.puuid && jobs.retirePuuids(db, e.puuid, e.game)) { log(`${name}: stored ${e.game} puuids belong to another Riot app (the key changed apps): retiring those players, re-seeding from the ladders`); retireWorker(e.game); continue; }
      if (!e.auth && !e.decrypt) log(`${name}: ${e.message}`);
      await sleep(10000);
    }
  }
}

// A retirement's row moves (jobs.retireBatch, 1.5M rows for League) run in a worker on its own connection: on the main thread
// they starved the API (21:07-21:24Z). One per game; a restart resumes an unfinished one.
const retiring = new Set();
function retireWorker(game) {
  if (retiring.has(game) || cfg.dbPath === ":memory:") return;
  retiring.add(game);
  const t = Date.now();
  new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, task: "retire", game } })
    .once("message", (n) => log(`retired ${n} ${game} players in ${Math.round((Date.now() - t) / 1000)} s`))
    .once("error", (e) => log(`retire ${game}: ${e.message}`))
    .once("exit", () => retiring.delete(game));
}
for (const g of games) if (db_.getMeta(db, `retiring:${g}`)) retireWorker(g);
// Start draining the WAL now rather than after the next pass (agg-worker.js truncates it after each pass).
if (cfg.dbPath !== ":memory:") {
  const t = Date.now();
  new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, task: "checkpoint" } })
    .once("message", (r) => log(`wal checkpoint [busy, frames, copied] ${JSON.stringify(r)} in ${Math.round((Date.now() - t) / 1000)} s`))
    .once("error", (e) => log(`wal checkpoint: ${e.message}`));
}

if (!cfg.key) log("RIOT_API_KEY not set: serving the existing DB until a key is posted to /admin/key");
{
  for (const region of cfg.regions) for (const g of games) {
    forever(`seed ${g} ${region}`, g, () => jobs.seed(ctx, g, region), 600000);
    // A match per pass; only ask for new ranked ids when there's nothing left to fetch. Capped modes go first so they don't
    // depend on the ranked queue running dry (DONI-596); each is gated to one call per region and queue a minute, and by share.
    forever(`matches ${g} ${region}`, g, async () => (await jobs.names(ctx, g, region)) || (g === "lol" && (await jobs.capped(ctx, region))) || (await jobs.fetchOne(ctx, g, region)) || (await jobs.ids(ctx, g, region)), 60000);
  }
}

// Aggregate on start if due, then every AGGREGATE_EVERY_MIN; unchanged patches are skipped. The pass runs in a worker thread
// with its own connection, so the API keeps answering (WAL readers see the previous stats until it commits). The crawl keeps
// going while the worker computes (into temp tables, jobs.aggregate); it pauses only while the worker holds the write lock: the
// worker posts { lock: true } and blocks on `lock` until the in-flight crawl steps are done, then posts { lock: false }.
// Before (2026-10-20) the crawl paused for the whole pass, ~20 min of every hour. ponytail: an in-memory DB (tests) can't be
// shared with a worker; tests call jobs.aggregate directly.
(function periodic(minDelay = 0) {
  setTimeout(() => {
    let failed = false;
    const t = Date.now(), lock = new Int32Array(new SharedArrayBuffer(4));
    let pausedMs = 0, locks = 0, since = 0; // how long this pass held the crawl (meta aggPause, /status)
    passing = true;
    try {
      new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, lock: lock.buffer } })
        .on("message", async (m) => {
          if (m?.lock === true) {
            aggregating = true; since = Date.now(); locks++;
            // let in-flight steps finish their writes first, at most 3 s: a step waiting on Riot (a 429's retry-after is 20-30 s)
            // held every swap for that long (the 23:41Z pass paused the crawl 284 s over 16 swaps; most was this wait). A step that
            // writes during the swap waits it out (busy_timeout) or fails and retries. The nightly backup only reads: no wait.
            for (let i = 0; i < 60 && inflight > 0; i++) await sleep(50);
            Atomics.store(lock, 0, 1); Atomics.notify(lock, 0);
          } else if (m?.lock === false) { aggregating = false; pausedMs += Date.now() - since; }
          else {
            log(`aggregated ${m} patches in ${Date.now() - t} ms; the crawl paused ${Math.round(pausedMs / 1000)} s over ${locks} swaps`);
            try { db_.setMeta(db, "aggPause", { at: Date.now(), passMs: Date.now() - t, pausedMs, locks }); } catch (e) { log(`aggPause: ${e.message}`); }
          }
        })
        .once("error", (e) => { failed = true; log(`aggregate: ${e.message}`); })
        .once("exit", () => { aggregating = passing = false; periodic(failed ? 60000 : 0); });
    } catch (e) { // e.g. the worker can't be created: never leave the crawl paused behind a stuck flag (Q review 2)
      log(`aggregate: could not start the worker: ${e.message}`);
      aggregating = passing = false;
      periodic(60000);
    }
  }, Math.max(minDelay, jobs.nextAggregation(db, cfg.aggregateEveryMin) - Date.now()));
})();

// Raw JSON retention: a minute after start (so a pass has happened), then daily.
// In the worker too: the UPDATE + incremental vacuum held the API thread ~12 s (seen 2026-10-20 08:02Z).
function retain() {
  if (passing) return log("retention: skipped, aggregation running");
  new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, task: "retain", days: cfg.retentionDays } })
    .once("message", (n) => log(`retention: nulled raw on ${n} matches`))
    .once("error", (e) => log(`retention: ${e.message}`));
}

// Completed-item list for build slots (src/lol-items.js): on start, then daily; a failure keeps the last list.
const items = () => require("./lol-items").refreshItems(db).then((m) => log(`items: ${m.completed.length} completed items (${m.version})`), (e) => log(`items: ${e.message}`));
items(); setInterval(items, 86400000).unref();
setTimeout(retain, 60000).unref();
setInterval(retain, 86400000).unref();

// Nightly backup (D10) at BACKUP_HOUR_UTC, in a worker (VACUUM INTO reads the whole DB; WAL lets the crawl keep writing).
// Waits 10 min while an aggregation pass runs.
function nextBackup(from = Date.now()) {
  const d = new Date(from); d.setUTCHours(cfg.backupHourUtc, 0, 0, 0);
  if (d.getTime() <= from) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() - from;
}
function runBackup() {
  if (passing) return setTimeout(runBackup, 600000).unref();
  backingUp = true;
  new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, task: "backup", dir: cfg.backupDir, keep: cfg.backupKeep } })
    .once("message", (b) => log(`backup: ${b.file} ${(b.bytes / 1048576).toFixed(0)} MB in ${(b.ms / 1000).toFixed(0)} s${b.removed.length ? ", removed " + b.removed.join(", ") : ""}`))
    .once("error", (e) => log(`backup: ${e.message}`))
    .once("exit", () => { backingUp = false; setTimeout(runBackup, nextBackup()).unref(); });
}
if (cfg.backupDir && cfg.dbPath !== ":memory:") setTimeout(runBackup, nextBackup()).unref();
