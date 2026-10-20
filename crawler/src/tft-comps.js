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
  db.exec("CREATE TEMP TABLE IF NOT EXISTS tft_board_comp (match_id TEXT, puuid TEXT, id TEXT, PRIMARY KEY (match_id, puuid))");
}

// Unique (one-unit) traits never label a comp: /tft/meta breakpoints of length 1, else the name.
function uniqueTraits(db) {
  const t = getMeta(db, "tftMeta")?.traits || {};
  return (name) => (t[name] ? (t[name].breakpoints || []).length <= 1 : /unique/i.test(name));
}

// Pure: boards [{ match_id, puuid, carry, units: [..], traits: [[name, tier]] }] -> Map("match|puuid" -> id), plus the centroids.
function cluster(boards, isUnique = (n) => /unique/i.test(n)) {
  const byCarry = new Map();
  for (const b of boards) (byCarry.get(b.carry) || byCarry.set(b.carry, []).get(b.carry)).push(b);
  const label = new Map(), centroids = [];
  for (const [carry, bs] of byCarry) {
    const tc = new Map(), uc = new Map();
    for (const b of bs) {
      for (const [t] of b.traits) if (!isUnique(t)) tc.set(t, (tc.get(t) || 0) + 1);
      for (const u of new Set(b.units)) uc.set(u, (uc.get(u) || 0) + 1);
    }
    const trait = [...tc].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0]?.[0] || "none";
    const id = `${trait},${carry}`;
    label.set(carry, id);
    if (bs.length >= CENTROID_MIN) {
      const set = new Set([...uc].filter(([, n]) => n >= SHARE * bs.length).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, MAX_UNITS).map(([u]) => u));
      if (set.size) centroids.push({ id, n: bs.length, set });
    }
  }
  centroids.sort((x, y) => y.n - x.n || (x.id < y.id ? -1 : 1)); // ties resolve to the bigger comp
  const out = new Map();
  for (const b of boards) {
    const us = [...new Set(b.units)];
    let best = null, bj = -1;
    for (const c of centroids) {
      let i = 0;
      for (const u of us) if (c.set.has(u)) i++;
      const j = i / (us.length + c.set.size - i);
      if (j > bj) { bj = j; best = c; }
    }
    out.set(`${b.match_id}|${b.puuid}`, best && bj >= MIN_JACCARD ? best.id : label.get(b.carry));
  }
  return { assign: out, centroids };
}

function labelPatch(db, patch) {
  init(db);
  db.exec("DELETE FROM temp.tft_board_comp");
  const boards = db.prepare(`SELECT p.match_id, p.puuid, p.comp carry, p.units, p.traits FROM tft_participants p JOIN matches m ON m.id = p.match_id AND m.patch = ?`).all(patch)
    .map((r) => ({ match_id: r.match_id, puuid: r.puuid, carry: r.carry, units: JSON.parse(r.units || "[]"), traits: JSON.parse(r.traits || "[]") }));
  const { assign, centroids } = cluster(boards, uniqueTraits(db));
  const ins = db.prepare("INSERT INTO temp.tft_board_comp VALUES (?, ?, ?)");
  for (const [k, id] of assign) { const i = k.indexOf("|"); ins.run(k.slice(0, i), k.slice(i + 1), id); }
  return centroids.length;
}

// SQL pieces for jobs.aggregate: join after "tft_participants p", and the comp expression.
const JOIN = "LEFT JOIN temp.tft_board_comp l ON l.match_id = p.match_id AND l.puuid = p.puuid";
const COMP = "coalesce(l.id, 'none,' || p.comp)";

module.exports = { init, labelPatch, cluster, JOIN, COMP, CENTROID_MIN };
