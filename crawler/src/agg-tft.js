// TFT parity stats (DONI-510 units, DONI-511 items / augments / traits). tft_participants.board holds each board's units as
// [[unit, star, [items]]] (written on store, back-filled from raw by `backfill-comps`); traits [[name, tier]] and augments
// (pick order = stage 2-1, 3-2, 4-2) were already there. Stats tables hold counts; rates are computed on read.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS stats_tft_unit (patch TEXT, region TEXT, bracket TEXT, unit TEXT, star INT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_unit_item (patch TEXT, region TEXT, bracket TEXT, unit TEXT, kind TEXT, key TEXT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_item (patch TEXT, region TEXT, bracket TEXT, item TEXT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_augment (patch TEXT, region TEXT, bracket TEXT, augment TEXT, stage INT, games INT, placement_sum INT, top4 INT, wins INT);
CREATE TABLE IF NOT EXISTS stats_tft_trait (patch TEXT, region TEXT, bracket TEXT, trait TEXT, tier INT, games INT, placement_sum INT, top4 INT, wins INT);
`;
const TABLES = ["tft_unit", "tft_unit_item", "tft_item", "tft_augment", "tft_trait"];
const STAGES = ["2-1", "3-2", "4-2"];

function migrate(db) {
  if (!db.prepare("PRAGMA table_info(tft_participants)").all().some((c) => c.name === "board")) db.exec("ALTER TABLE tft_participants ADD COLUMN board TEXT");
  db.exec(SCHEMA);
}

// [[unit, star, [items]]] from a tft-match-v1 participant.
const boardOf = (p) => JSON.stringify((p.units || []).map((u) => [u.character_id, u.tier, u.itemNames || []]));

// A unit fielded twice on one board counts once in stats_tft_unit (its highest star), like MetaTFT's frequency (D14).
function inserts(M, K) {
  const P = "count(*), sum(p.placement), sum(p.placement <= 4), sum(p.placement = 1)";
  const U = `FROM tft_participants p ${M}, json_each(p.board) u`;
  return [
    `INSERT INTO stats_tft_unit SELECT patch, region, bracket, unit, star, count(*), sum(placement), sum(placement <= 4), sum(placement = 1)
      FROM (SELECT ${K}, p.placement, json_extract(u.value, '$[0]') unit, max(json_extract(u.value, '$[1]')) star ${U} GROUP BY p.match_id, p.puuid, unit)
      GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_tft_unit_item SELECT ${K}, json_extract(u.value, '$[0]'), 'item', i.value, ${P} ${U}, json_each(u.value, '$[2]') i GROUP BY 1, 2, 3, 4, 6`,
    // the unit's full item set, sorted, "" when it held none
    `INSERT INTO stats_tft_unit_item SELECT ${K}, json_extract(u.value, '$[0]'), 'set',
      (SELECT coalesce(group_concat(value, ','), '') FROM (SELECT value FROM json_each(u.value, '$[2]') ORDER BY value)), ${P} ${U} GROUP BY 1, 2, 3, 4, 6`,
    `INSERT INTO stats_tft_item SELECT ${K}, i.value, ${P} ${U}, json_each(u.value, '$[2]') i GROUP BY 1, 2, 3, 4`,
    `INSERT INTO stats_tft_augment SELECT ${K}, a.value, a.key, ${P} FROM tft_participants p ${M}, json_each(p.augments) a GROUP BY 1, 2, 3, 4, 5`,
    `INSERT INTO stats_tft_trait SELECT ${K}, json_extract(t.value, '$[0]'), json_extract(t.value, '$[1]'), ${P} FROM tft_participants p ${M}, json_each(p.traits) t GROUP BY 1, 2, 3, 4, 5`,
  ];
}

const r4 = (x) => Math.round(x * 10000) / 10000;
const S = "sum(games) games, sum(placement_sum) ps, sum(top4) top4, sum(wins) wins";
// frequency = games / base: boards in scope for list rows, the unit's own games for its items and comps.
const rates = (r, base, minGames) => ({ games: r.games, avgPlacement: r4(r.ps / r.games), top4Rate: r4(r.top4 / r.games), winRate: r4(r.wins / r.games),
  frequency: base ? r4(r.games / base) : 0, lowSample: r.games < minGames });
function groupTop(rows, key, n, f) {
  const m = new Map();
  for (const r of rows) { const l = m.get(r[key]) || m.set(r[key], []).get(r[key]); if (l.length < n) l.push(f(r)); }
  return m;
}

function scope(db, head, where, q) {
  const h = head(db, q, "tft");
  const [w, a] = where(q, h.patch);
  const boards = db.prepare(`SELECT sum(boards) n FROM stats_tft_boards WHERE ${w}`).get(...a).n || 0;
  return { h, w, a, boards };
}

// /tft/units: every unit, its star split and its 3 most-held items.
function units(db, head, where, q = {}) {
  const { h, w, a, boards } = scope(db, head, where, q);
  const stars = groupTop(db.prepare(`SELECT unit, star, ${S} FROM stats_tft_unit WHERE ${w} GROUP BY unit, star ORDER BY star`).all(...a), "unit", 9,
    (r) => ({ star: r.star, ...rates(r, boards, h.minGames) }));
  const items = groupTop(db.prepare(`SELECT unit, key, ${S} FROM stats_tft_unit_item WHERE ${w} AND kind = 'item' GROUP BY unit, key ORDER BY games DESC`).all(...a), "unit", 3,
    (r) => ({ key: r.key, games: r.games, avgPlacement: r4(r.ps / r.games) }));
  const rows = db.prepare(`SELECT unit, ${S} FROM stats_tft_unit WHERE ${w} GROUP BY unit ORDER BY games DESC`).all(...a);
  return { ...h, boards, units: rows.map((r) => ({ key: r.unit, ...rates(r, boards, h.minGames), stars: stars.get(r.unit) || [], items: items.get(r.unit) || [] })) };
}

// /tft/unit/{key}: the row plus single items, full item sets and the comps fielding it (frequencies out of the unit's games).
function unit(db, head, where, key, q = {}) {
  const { h, w, a, boards } = scope(db, head, where, q);
  const r = db.prepare(`SELECT ${S} FROM stats_tft_unit WHERE ${w} AND unit = ?`).get(...a, key);
  if (!r.games) return null;
  const stars = db.prepare(`SELECT star, ${S} FROM stats_tft_unit WHERE ${w} AND unit = ? GROUP BY star ORDER BY star`).all(...a, key)
    .map((s) => ({ star: s.star, ...rates(s, boards, h.minGames) }));
  const part = (kind, n) => db.prepare(`SELECT key, ${S} FROM stats_tft_unit_item WHERE ${w} AND unit = ? AND kind = ? GROUP BY key ORDER BY games DESC LIMIT ${n}`)
    .all(...a, key, kind).map((x) => ({ key: x.key, ...rates(x, r.games, h.minGames) }));
  const comps = db.prepare(`SELECT comp, sum(games) games, sum(placement_sum) ps, sum(top4) top4 FROM stats_tft_part WHERE ${w} AND kind = 'unit' AND key = ?
    GROUP BY comp ORDER BY games DESC LIMIT 20`).all(...a, key)
    .map((c) => ({ id: c.comp, games: c.games, frequency: r4(c.games / r.games), avgPlacement: r4(c.ps / c.games), top4Rate: r4(c.top4 / c.games), lowSample: c.games < h.minGames }));
  return { ...h, boards, key, ...rates(r, boards, h.minGames), stars, items: part("item", 40), itemSets: part("set", 20), comps };
}

// /tft/items: each item with the 5 units that hold it most.
function items(db, head, where, q = {}) {
  const { h, w, a, boards } = scope(db, head, where, q);
  const best = groupTop(db.prepare(`SELECT key, unit, ${S} FROM stats_tft_unit_item WHERE ${w} AND kind = 'item' GROUP BY key, unit ORDER BY games DESC`).all(...a), "key", 5,
    (r) => ({ unit: r.unit, games: r.games, avgPlacement: r4(r.ps / r.games), top4Rate: r4(r.top4 / r.games) }));
  const rows = db.prepare(`SELECT item, ${S} FROM stats_tft_item WHERE ${w} GROUP BY item ORDER BY games DESC`).all(...a);
  return { ...h, boards, items: rows.map((r) => ({ key: r.item, ...rates(r, boards, h.minGames), units: best.get(r.item) || [] })) };
}

// /tft/augments: per augment, overall and by the stage it was taken at.
function augments(db, head, where, q = {}) {
  const { h, w, a, boards } = scope(db, head, where, q);
  const by = groupTop(db.prepare(`SELECT augment, stage, ${S} FROM stats_tft_augment WHERE ${w} GROUP BY augment, stage ORDER BY stage`).all(...a), "augment", 9,
    (r) => ({ stage: STAGES[r.stage] || String(r.stage), ...rates(r, boards, h.minGames) }));
  const rows = db.prepare(`SELECT augment, ${S} FROM stats_tft_augment WHERE ${w} GROUP BY augment ORDER BY games DESC`).all(...a);
  return { ...h, boards, augments: rows.map((r) => ({ key: r.augment, ...rates(r, boards, h.minGames), stages: by.get(r.augment) || [] })),
    ...(!rows.length && boards && { note: "Riot's tft-match-v1 sends no augments for this set (no crawled board carries any), so there is nothing to rank." }) };
}

// /tft/traits: per trait, per active tier (tier_current).
function traits(db, head, where, q = {}) {
  const { h, w, a, boards } = scope(db, head, where, q);
  const tiers = groupTop(db.prepare(`SELECT trait, tier, ${S} FROM stats_tft_trait WHERE ${w} GROUP BY trait, tier ORDER BY tier`).all(...a), "trait", 9,
    (r) => ({ tier: r.tier, ...rates(r, boards, h.minGames) }));
  const rows = db.prepare(`SELECT trait, ${S} FROM stats_tft_trait WHERE ${w} GROUP BY trait ORDER BY games DESC`).all(...a);
  return { ...h, boards, traits: rows.map((r) => ({ key: r.trait, ...rates(r, boards, h.minGames), tiers: tiers.get(r.trait) || [] })) };
}

module.exports = { SCHEMA, TABLES, STAGES, migrate, boardOf, inserts, units, unit, items, augments, traits };
