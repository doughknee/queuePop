// Entry point: serve the API and, when RIOT_API_KEY is set, crawl every region forever.
//   node src/main.js             crawl + serve
//   node src/main.js aggregate   rebuild all stats_* now and exit
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
};
for (const r of cfg.regions) if (!ROUTING[r]) throw new Error(`unknown region ${r}; use platform ids like na1, euw1, kr`);
if (!jobs.TIERS.includes(cfg.minTier)) throw new Error(`MIN_TIER must be one of ${jobs.TIERS.join(", ")}`);

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const db = db_.open(cfg.dbPath);

if (process.argv[2] === "aggregate") {
  jobs.aggregate(db);
  log("aggregated");
  process.exit(0);
}

const limiter = new Limiter();
const ctx = { db, riot: createClient({ key: () => db_.riotKey(db, cfg.key).key, base: cfg.base, limiter, log }), minTier: cfg.minTier, queues: cfg.queues, timelineSample: cfg.timelineSample };
const games = [cfg.queues.some((q) => q === 420 || q === 440) && "lol", cfg.queues.includes(1100) && "tft"].filter(Boolean);

createServer({ db, limiter, version, adminToken: cfg.adminToken, envKey: cfg.key, dbPath: cfg.dbPath, aggregateEveryMin: cfg.aggregateEveryMin, retentionDays: cfg.retentionDays }).listen(cfg.port, "0.0.0.0", () => log(`API on :${cfg.port}`));

// Ladders live on the platform host, matches on the regional host: separate rate buckets, separate loops.
async function forever(name, step, idle) {
  for (;;) {
    try {
      if (!db_.riotKey(db, cfg.key).key) { await sleep(10000); continue; } // waiting for a key via POST /admin/key
      if (!(await step())) await sleep(idle);
    } catch (e) { log(`${name}: ${e.message}`); await sleep(10000); }
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

// Aggregate on start if due, then every AGGREGATE_EVERY_MIN; unchanged patches are skipped.
(function periodic() {
  setTimeout(() => {
    try { const t = Date.now(); const n = jobs.aggregate(db); log(`aggregated ${n} patches in ${Date.now() - t} ms`); } catch (e) { log(`aggregate: ${e.message}`); }
    periodic();
  }, jobs.nextAggregation(db, cfg.aggregateEveryMin) - Date.now());
})();

// Raw JSON retention: a minute after start (so a pass has happened), then daily.
function retain() {
  try { log(`retention: nulled raw on ${jobs.retain(db, cfg.retentionDays)} matches`); } catch (e) { log(`retention: ${e.message}`); }
}
setTimeout(retain, 60000).unref();
setInterval(retain, 86400000).unref();
