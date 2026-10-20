// Completed League items (D14 accuracy audit): build slots and the core count only finished items, like Lolalytics. Before,
// components and starters (Kindlegem, Forbidden Idol, Dark Seal) took slots, so cores fragmented (18-146 games each).
// Completed = has a recipe (from), is not a consumable or trinket, and builds into nothing except tier-3 boots or an Ornn
// upgrade. So tier-2 boots, legendaries and the support quest finals count; Doran's, World Atlas, components don't.
// Data Dragon item.json, fetched on start and daily by main.js, kept in meta.lolItems; aggregation loads it into a temp table.
const { getMeta, setMeta } = require("./db");

function completedIds(data) {
  const it = data.data;
  return Object.entries(it).filter(([, x]) => (x.from || []).length && !(x.tags || []).includes("Consumable") && !(x.tags || []).includes("Trinket")
    && (x.into || []).every((i) => (it[i]?.tags || []).includes("Boots") || it[i]?.requiredAlly)).map(([id]) => Number(id)).sort((a, b) => a - b);
}

async function refreshItems(db, { fetchJson = (u) => fetch(u, { signal: AbortSignal.timeout(60000) }).then((r) => { if (!r.ok) throw new Error(`DDragon ${r.status}`); return r.json(); }), now = Date.now } = {}) {
  const v = (await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json"))[0];
  if (getMeta(db, "lolItems")?.version === v) return getMeta(db, "lolItems");
  const m = { version: v, at: now(), completed: completedIds(await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/item.json`)) };
  setMeta(db, "lolItems", m);
  return m;
}

// Fills temp.lol_completed for this connection (empty table = no filter, every item counts, the pre-D14 behaviour).
function loadCompleted(db) {
  db.exec("CREATE TEMP TABLE IF NOT EXISTS lol_completed (id INTEGER PRIMARY KEY); DELETE FROM temp.lol_completed;");
  const ins = db.prepare("INSERT INTO temp.lol_completed VALUES (?)");
  for (const id of getMeta(db, "lolItems")?.completed || []) ins.run(id);
}

module.exports = { completedIds, refreshItems, loadCompleted };
