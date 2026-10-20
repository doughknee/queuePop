// TFT comps, second rule (D14 accuracy audit, 2026-10-20): one comp per carry, labelled with the carry's signature trait.
// The first rule (DONI-502: each board's top trait + carry) split one carry by how far the board progressed: within a carry,
// its sub-comps' average placements differed by 0.6 places (sd, 3,200 live boards), e.g. Executioner Azir 3.01 vs Flora
// Fatalis Azir 5.03, while MetaTFT's single Azir comp sits at 4.10. That split measured the outcome, not the composition.
// Now tft_participants.comp holds the carry (most items, then star, then cost, then name), and each aggregation pass labels
// every carry with the non-unique trait active on most of its boards in that patch (ties: name). The comp id keeps the
// "<trait>,<carry>" shape, e.g. "DA_Riftbeast18,DA_Krug18".
const { getMeta } = require("./db");

function init(db) {
  db.exec("CREATE TEMP TABLE IF NOT EXISTS tft_comp_label (carry TEXT PRIMARY KEY, id TEXT)");
}

// Unique (one-unit) traits never label a comp: /tft/meta breakpoints of length 1, else the name.
function uniqueTraits(db) {
  const t = getMeta(db, "tftMeta")?.traits || {};
  return (name) => (t[name] ? (t[name].breakpoints || []).length <= 1 : /unique/i.test(name));
}

function labelPatch(db, patch) {
  init(db);
  db.exec("DELETE FROM temp.tft_comp_label");
  const isUnique = uniqueTraits(db);
  const best = new Map();
  for (const r of db.prepare(`SELECT p.comp carry, json_extract(t.value, '$[0]') trait, count(*) n FROM tft_participants p
    JOIN matches m ON m.id = p.match_id AND m.patch = ?, json_each(p.traits) t GROUP BY 1, 2`).all(patch)) {
    if (isUnique(r.trait)) continue;
    const b = best.get(r.carry);
    if (!b || r.n > b.n || (r.n === b.n && r.trait < b.trait)) best.set(r.carry, r);
  }
  const ins = db.prepare("INSERT INTO temp.tft_comp_label VALUES (?, ?)");
  for (const [carry, r] of best) ins.run(carry, `${r.trait},${carry}`);
  return best.size;
}

// SQL pieces for jobs.aggregate: join after "tft_participants p", and the comp expression.
const JOIN = "LEFT JOIN temp.tft_comp_label l ON l.carry = p.comp";
const COMP = "coalesce(l.id, 'none,' || p.comp)";

module.exports = { init, labelPatch, JOIN, COMP };
