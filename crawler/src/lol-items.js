// Completed League items (D14 accuracy audit): build slots and the core count only finished items, like Lolalytics. Before,
// components and starters (Kindlegem, Forbidden Idol, Dark Seal) took slots, so cores fragmented (18-146 games each).
// Completed = has a recipe (from), is not a consumable or trinket, and builds into nothing except tier-3 boots or an Ornn
// upgrade. So tier-2 boots, legendaries and the support quest finals count; Doran's, World Atlas, components don't.
// Data Dragon item.json, fetched on start and daily by main.js: the newest build in meta.lolItems (timelines parsed at fetch
// time), and per patch in meta.lolItems:<patch> for the two newest patches, so a patch's stats use its own item list when a new
// patch arrives (2026-10-21, 16.21: before, 16.20's build slots were filtered with 16.21's items). Aggregation loads one per patch.
const { getMeta, setMeta } = require("./db");

function completedIds(data) {
  const it = data.data;
  return Object.entries(it).filter(([, x]) => (x.from || []).length && !(x.tags || []).includes("Consumable") && !(x.tags || []).includes("Trinket")
    && (x.into || []).every((i) => (it[i]?.tags || []).includes("Boots") || it[i]?.requiredAlly)).map(([id]) => Number(id)).sort((a, b) => a - b);
}

async function refreshItems(db, { fetchJson = (u) => fetch(u, { signal: AbortSignal.timeout(60000) }).then((r) => { if (!r.ok) throw new Error(`DDragon ${r.status}`); return r.json(); }), now = Date.now } = {}) {
  const versions = await fetchJson("https://ddragon.leagueoflegends.com/api/versions.json");
  const patchOf = (v) => v.split(".").slice(0, 2).join(".");
  const newest = [...new Set(versions.map(patchOf))].slice(0, 2).map((p) => versions.find((v) => patchOf(v) === p)); // e.g. 16.21.1, 16.20.1
  const get = async (v) => ({ version: v, at: now(), completed: completedIds(await fetchJson(`https://ddragon.leagueoflegends.com/cdn/${v}/data/en_US/item.json`)) });
  for (const v of newest) if (getMeta(db, `lolItems:${patchOf(v)}`)?.version !== v) setMeta(db, `lolItems:${patchOf(v)}`, await get(v));
  if (getMeta(db, "lolItems")?.version !== versions[0]) setMeta(db, "lolItems", getMeta(db, `lolItems:${patchOf(versions[0])}`));
  return getMeta(db, "lolItems");
}

// Fills temp.lol_completed for this connection with the patch's list ("16.20", no mode suffix), else the newest (empty table =
// no filter, every item counts, the pre-D14 behaviour).
function loadCompleted(db, patch) {
  db.exec("CREATE TEMP TABLE IF NOT EXISTS lol_completed (id INTEGER PRIMARY KEY); DELETE FROM temp.lol_completed;");
  const ins = db.prepare("INSERT INTO temp.lol_completed VALUES (?)");
  for (const id of (patch && getMeta(db, `lolItems:${patch}`) || getMeta(db, "lolItems"))?.completed || []) ins.run(id);
}

module.exports = { completedIds, refreshItems, loadCompleted };
