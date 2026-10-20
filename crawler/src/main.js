// Entry point: serve the API and, when RIOT_API_KEY is set, crawl every region forever.
//   node src/main.js             crawl + serve
//   node src/main.js aggregate   rebuild all stats_* now and exit
//   node src/main.js backfill-patch  re-parse patch/set from stored raw for '?' rows, drop stale '?' stats, exit
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
  queues: (env.QUEUES || "420,440,1100").split(",").map(Number),
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
let aggregating = false; // true while the aggregation worker runs (see periodic below)
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
if (process.argv[2] === "backup") {
  if (!cfg.backupDir) throw new Error("BACKUP_DIR is not set");
  log("backup", JSON.stringify(require("./backup").backup(db, cfg.backupDir, cfg.backupKeep)));
  process.exit(0);
}
if (process.argv[2] === "backfill-length") {
  log("backfill-length", JSON.stringify(jobs.backfillDuration(db)), "- now run: npm run aggregate");
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
const onAuthFail = (status, msg) => { if (db_.keyHealth(db, cfg.key).valid) log(`Riot key rejected (${status} ${msg}): crawl paused until a new key is posted to /admin/key`); db_.markKeyBad(db, cfg.key, `${status} ${msg}`); };
const ctx = { db, riot: createClient({ key: () => db_.riotKey(db, cfg.key).key, base: cfg.base, limiter, log, onAuthFail }), minTier: cfg.minTier, queues: cfg.queues, timelineSample: cfg.timelineSample };
const games = [cfg.queues.some((q) => q === 420 || q === 440) && "lol", cfg.queues.includes(1100) && "tft"].filter(Boolean);

const lookup = require("./lookup").createLookup({ db, riot: ctx.riot, keyOk: () => db_.keyHealth(db, cfg.key).valid, perMin: Number(env.LOOKUPS_PER_MIN ?? 3) });
createServer({ db, limiter, version, lookup, defaultRegion: cfg.regions[0], adminToken: cfg.adminToken, envKey: cfg.key, dbPath: cfg.dbPath, aggregateEveryMin: cfg.aggregateEveryMin, retentionDays: cfg.retentionDays }).listen(cfg.port, "0.0.0.0", () => log(`API on :${cfg.port}`));

// Ladders live on the platform host, matches on the regional host: separate rate buckets, separate loops.
async function forever(name, step, idle) {
  for (;;) {
    try {
      // No key, or Riot rejected this one (401/403): wait for a key via POST /admin/key instead of hammering Riot.
      if (!db_.keyHealth(db, cfg.key).valid) { await sleep(10000); continue; }
      // The aggregation worker holds the write lock for minutes; wait instead of failing on "database is locked".
      if (aggregating) { await sleep(5000); continue; }
      if (!(await step())) await sleep(idle);
    } catch (e) { if (!e.auth) log(`${name}: ${e.message}`); await sleep(10000); }
  }
}

if (!cfg.key) log("RIOT_API_KEY not set: serving the existing DB until a key is posted to /admin/key");
{
  for (const region of cfg.regions) {
    forever(`seed ${region}`, async () => {
      let did = false;
      for (const g of games) did = (await jobs.seed(ctx, g, region)) || did;
      return did;
    }, 600000);
    forever(`matches ${region}`, async () => {
      let did = false;
      // A match per game per pass; only ask for new ids when there's nothing left to fetch.
      for (const g of games) did = (await jobs.fetchOne(ctx, g, region)) || (await jobs.ids(ctx, g, region)) || did;
      return did;
    }, 60000);
  }
}

// Aggregate on start if due, then every AGGREGATE_EVERY_MIN; unchanged patches are skipped. The pass runs in a worker thread
// with its own connection, so the API keeps answering (WAL readers see the previous stats until it commits) while the crawl
// loops pause. ponytail: an in-memory DB (tests) can't be shared with a worker; tests call jobs.aggregate directly.
(function periodic(minDelay = 0) {
  setTimeout(() => {
    let failed = false;
    aggregating = true;
    const t = Date.now();
    new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath } })
      .once("message", (n) => log(`aggregated ${n} patches in ${Date.now() - t} ms`))
      .once("error", (e) => { failed = true; log(`aggregate: ${e.message}`); })
      .once("exit", () => { aggregating = false; periodic(failed ? 60000 : 0); });
  }, Math.max(minDelay, jobs.nextAggregation(db, cfg.aggregateEveryMin) - Date.now()));
})();

// Raw JSON retention: a minute after start (so a pass has happened), then daily.
function retain() {
  if (aggregating) return log("retention: skipped, aggregation running");
  try { log(`retention: nulled raw on ${jobs.retain(db, cfg.retentionDays)} matches`); } catch (e) { log(`retention: ${e.message}`); }
}
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
  if (aggregating) return setTimeout(runBackup, 600000).unref();
  new (require("worker_threads").Worker)(require("path").join(__dirname, "agg-worker.js"), { workerData: { dbPath: cfg.dbPath, task: "backup", dir: cfg.backupDir, keep: cfg.backupKeep } })
    .once("message", (b) => log(`backup: ${b.file} ${(b.bytes / 1048576).toFixed(0)} MB in ${(b.ms / 1000).toFixed(0)} s${b.removed.length ? ", removed " + b.removed.join(", ") : ""}`))
    .once("error", (e) => log(`backup: ${e.message}`))
    .once("exit", () => setTimeout(runBackup, nextBackup()).unref());
}
if (cfg.backupDir && cfg.dbPath !== ":memory:") setTimeout(runBackup, nextBackup()).unref();
