// 2026-10-20 (DONI-596 follow-up): the crawl paused for the whole aggregation pass (~20 min an hour). A patch is now computed into
// temp tables, so another connection can write main meanwhile; only the swap and meta writes run inside locked().
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs"), os = require("os"), path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { open } = require("../src/db");
const jobs = require("../src/jobs");
const players = require("../src/agg-players");
const { lolTiers } = require("../src/server");

test("another connection writes main while a patch is computed; stats land via locked()", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qp-agg-")), "c.db");
  const db = open(file);
  const m = require("../fixtures/lol-match-1.json");
  db.prepare("INSERT INTO matches (id, game, region, bracket) VALUES (?, 'lol', 'na1', 'DIAMOND')").run(m.metadata.matchId);
  jobs.store({ db, queues: [420] }, "lol", m.metadata.matchId, m);
  const crawl = new DatabaseSync(file);
  crawl.exec("PRAGMA busy_timeout = 0");
  const real = players.aggregatePatch;
  let wrote = 0, inLock = 0, locks = 0;
  players.aggregatePatch = (d, p) => { real(d, p); assert.strictEqual(inLock, 0); crawl.exec("INSERT INTO meta VALUES ('crawl-write', '1')"); wrote++; };
  try {
    jobs.aggregate(db, Date.now, true, (fn) => { inLock++; locks++; try { return fn(); } finally { inLock--; } });
  } finally { players.aggregatePatch = real; }
  assert.strictEqual(wrote, 1, "the crawl connection wrote during the compute phase (would be SQLITE_BUSY under the old one-transaction pass)");
  assert.strictEqual(locks, 3, "raw ingest, one swap group (a small patch), the meta stamps");
  assert.strictEqual(lolTiers(db, {}).matches, 1, "stats reached main and this connection reads main again");
});
