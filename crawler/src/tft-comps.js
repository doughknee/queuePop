// TFT comps (D14 accuracy audit + DONI-577, 2026-10-20). Each aggregation pass, per patch:
//  1. Carry comps: every board's carry (tft_participants.comp: the unit holding the most items, then star, cost, name) is
//     labelled with the non-unique trait active on most of that carry's boards (ties: name) -> id "<trait>,<carry>".
//  2. Centroids: for each carry with at least CENTROID_MIN boards, the units fielded on >= 30% of its boards (at most 9).
//  3. Every board joins the centroid whose unit set it overlaps most (Jaccard >= 0.3; ties: more boards, then id), else its
//     own carry comp. So a board counts toward the comp it looks like, whoever happens to hold the items.
// Why: keying by the item holder made 5-cost-carry comps read optimistic (a 5-cost only holds most items on boards that lasted):
// Elder Dragon 3.55 vs MetaTFT 4.50, Alune 3.25 vs 4.29. The first rule (DONI-502, each board's top trait) was worse still: it
// split one carry by how far the board got (Executioner Azir 3.01 vs Flora Fatalis Azir 5.03; MetaTFT's Azir 4.10).
// The id keeps the "<trait>,<carry>" shape, e.g. "DA_Riftbeast18,DA_Krug18".
const { getMeta } = require("./db");

const CENTROID_MIN = 200, SHARE = 0.3, MAX_UNITS = 9, MIN_JACCARD = 0.3;

function init(db) {
  if (db.prepare("SELECT 1 FROM temp.sqlite_master WHERE name = 'tft_board_comp'").get()) return;
  // keyed by tft_participants.rowid: (match_id, puuid) is not unique (a few matches carry one placeholder puuid on several boards),
  // which made every pass fail with "UNIQUE constraint failed" from 11:13Z on 2026-10-20 (#189 streamed rows instead of a Map)
  db.exec("DROP TABLE IF EXISTS temp.tft_board_comp; CREATE TEMP TABLE tft_board_comp (rid INTEGER PRIMARY KEY, id TEXT)");
}

// Unique (one-unit) traits never label a comp: /tft/meta breakpoints of length 1, else the name.
function uniqueTraits(db) {
  const t = getMeta(db, "tftMeta")?.traits || {};
  return (name) => (t[name] ? (t[name].breakpoints || []).length <= 1 : /unique/i.test(name));
}

// Two passes over any iterable of boards ({ match_id, puuid, carry, units: [..], traits: [[name, tier]] }), so memory is per carry,
// not per board (holding every board took 527 MB at 400k; Q review 2). makeBoards() returns a fresh iterator each call.
// emit(match_id, puuid, id) receives each board's comp. Returns the centroids.
function clusterStream(makeBoards, emit, isUnique = (n) => /unique/i.test(n)) {
  const stats = new Map(); // carry -> { n, tc: trait counts, uc: unit counts }
  for (const b of makeBoards()) {
    const s = stats.get(b.carry) || stats.set(b.carry, { n: 0, tc: new Map(), uc: new Map() }).get(b.carry);
    s.n++;
    for (const [t] of b.traits) if (!isUnique(t)) s.tc.set(t, (s.tc.get(t) || 0) + 1);
    for (const u of new Set(b.units)) s.uc.set(u, (s.uc.get(u) || 0) + 1);
  }
  const label = new Map(), centroids = [];
  for (const [carry, s] of stats) {
    const trait = [...s.tc].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]?.[0] || "none";
    const id = `${trait},${carry}`;
    label.set(carry, id);
    if (s.n >= CENTROID_MIN) {
      const set = new Set([...s.uc].filter(([, n]) => n >= SHARE * s.n).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, MAX_UNITS).map(([u]) => u));
      if (set.size) centroids.push({ id, n: s.n, set });
    }
  }
  centroids.sort((x, y) => y.n - x.n || (x.id < y.id ? -1 : 1)); // ties resolve to the bigger comp
  for (const b of makeBoards()) {
    const us = [...new Set(b.units)];
    let best = null, bj = -1;
    for (const c of centroids) {
      let i = 0;
      for (const u of us) if (c.set.has(u)) i++;
      const j = i / (us.length + c.set.size - i);
      if (j > bj) { bj = j; best = c; }
    }
    emit(b.match_id, b.puuid, best && bj >= MIN_JACCARD ? best.id : label.get(b.carry));
  }
  return centroids;
}

// Array convenience (tests, scripts): -> { assign: Map("match|puuid" -> id), centroids }
function cluster(boards, isUnique) {
  const assign = new Map();
  const centroids = clusterStream(() => boards, (m, p, id) => assign.set(`${m}|${p}`, id), isUnique);
  return { assign, centroids };
}

function labelPatch(db, patch) {
  init(db);
  db.exec("DELETE FROM temp.tft_board_comp");
  const q = db.prepare(`SELECT p.rowid rid, p.comp carry, p.units, p.traits FROM tft_participants p JOIN matches m ON m.id = p.match_id AND m.patch = ?`);
  function* boards() {
    for (const r of q.iterate(patch)) yield { match_id: r.rid, puuid: "", carry: r.carry, units: JSON.parse(r.units || "[]"), traits: JSON.parse(r.traits || "[]") };
  }
  const ins = db.prepare("INSERT INTO temp.tft_board_comp VALUES (?, ?)");
  // ponytail: the second pass reads the patch again (~2x the I/O of one pass), in exchange for O(carries) memory
  const rows = [];
  const centroids = clusterStream(boards, (rid, _, id) => { rows.push(rid, id); if (rows.length >= 2000) flush(); }, uniqueTraits(db));
  flush();
  function flush() { for (let i = 0; i < rows.length; i += 2) ins.run(rows[i], rows[i + 1]); rows.length = 0; }
  return centroids.length;
}

// SQL pieces for jobs.aggregate: join after "tft_participants p", and the comp expression.
const JOIN = "LEFT JOIN temp.tft_board_comp l ON l.rid = p.rowid";
const COMP = "coalesce(l.id, 'none,' || p.comp)";

module.exports = { init, labelPatch, cluster, clusterStream, JOIN, COMP, CENTROID_MIN };
