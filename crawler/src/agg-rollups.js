// Cross-champion rollups (DONI-509): /lol/items, /lol/runes, /lol/spells. No new tables: stats_lol_build (and
// stats_lol_shards) already hold counts per champion, so a rollup is a GROUP BY key at read time (~300 ms on 45k matches),
// memoised in server.js until the next aggregation.
const r4 = (x) => Math.round(x * 10000) / 10000;

// One kind (item, keystone, rune, spells) or the shards table, in scope; each row carries its top 5 champions.
function rollup(db, w, a, { kind, role, players, minGames, avg }) {
  const table = kind === "shards" ? "stats_lol_shards" : "stats_lol_build";
  const k = kind === "shards" ? "" : " AND kind = ?";
  const args = [...a, ...(kind === "shards" ? [] : [kind]), ...(role ? [role] : [])];
  const r = role ? " AND role = ?" : "";
  const rows = db.prepare(`SELECT key, sum(games) games, sum(wins) wins FROM ${table} WHERE ${w}${k}${r} AND key IS NOT NULL GROUP BY key ORDER BY games DESC`).all(...args);
  const top = new Map();
  for (const c of db.prepare(`SELECT key, champion, sum(games) games, sum(wins) wins FROM ${table} WHERE ${w}${k}${r} GROUP BY key, champion ORDER BY games DESC`).all(...args)) {
    const l = top.get(c.key) || top.set(c.key, []).get(c.key);
    if (l.length < 5) l.push({ champion: c.champion, games: c.games, winRate: r4(c.wins / c.games) });
  }
  return rows.map((x) => ({ key: String(x.key), games: x.games, wins: x.wins, winRate: r4(x.wins / x.games), delta: r4(x.wins / x.games - avg),
    pickRate: players ? r4(x.games / players) : 0, lowSample: x.games < minGames, champions: top.get(x.key) || [] }));
}

const KINDS = { items: ["item"], runes: ["keystone", "rune", "shards"], spells: ["spells"] };
const OUT = { item: "items", keystone: "keystones", rune: "runes", shards: "shards", spells: "spells" };

// page = items | runes | spells. players = champion-games in scope (10 per match, or the role's games), the pick-rate base.
function lolRollup(db, head, where, page, q = {}) {
  const h = head(db, q, "lol");
  const [w, a] = where(q, h.patch);
  const role = q.role && q.role !== "all" ? q.role.toUpperCase() : null;
  const s = db.prepare(`SELECT sum(games) g, sum(wins) w FROM stats_lol_champ WHERE ${w}${role ? " AND role = ?" : ""}`).get(...a, ...(role ? [role] : []));
  const players = s.g || 0, avg = players ? s.w / players : 0.5;
  const out = { ...h, role: role || "all", players, winRate: r4(avg) };
  for (const kind of KINDS[page]) out[OUT[kind]] = rollup(db, w, a, { kind, role, players, minGames: h.minGames, avg });
  return out;
}

module.exports = { lolRollup };
