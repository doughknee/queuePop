// /tft/meta (DONI-502): names, icons and costs for the current set's traits, units, items and augments, from Community
// Dragon's en_us.json (24 MB). Fetched at most once a day; the trimmed result (~200 KB) is kept in meta.tftMeta so a
// restart or a CDragon outage still serves the last good copy.
const { getMeta, setMeta } = require("./db");

const CDRAGON = "https://raw.communitydragon.org/latest/";
const DAY = 86400000;
const png = (p) => (p && p !== "None" && !p.startsWith("{") ? CDRAGON + "game/" + p.toLowerCase().replace(/\.(tex|dds)$/, ".png") : null);

// Pure: en_us.json + set number -> the trimmed meta. Uses setData "TFTSet<N>" (the ranked mode, not PAIRS/TURBO/PVE).
function build(cd, set) {
  const sd = cd.setData.find((s) => s.mutator === `TFTSet${set}`) || cd.setData.filter((s) => s.number === set)[0];
  if (!sd) throw new Error(`set ${set} not in Community Dragon`);
  const traitKey = Object.fromEntries(sd.traits.map((t) => [t.name, t.apiName])); // champions list trait display names
  const items = new Map(cd.items.map((i) => [i.apiName, i]));
  const pick = (keys) => Object.fromEntries(keys.map((k) => items.get(k)).filter(Boolean).map((i) => [i.apiName, { name: i.name, icon: png(i.icon) }]));
  return {
    set, mutator: sd.mutator,
    units: Object.fromEntries(sd.champions.map((c) => [c.apiName, { name: c.name, cost: c.cost, traits: (c.traits || []).map((n) => traitKey[n] || n), icon: png(c.squareIcon || c.tileIcon || c.icon) }])),
    traits: Object.fromEntries(sd.traits.map((t) => [t.apiName, { name: t.name, icon: png(t.icon), breakpoints: (t.effects || []).map((e) => e.minUnits) }])),
    items: pick(sd.items || []),
    augments: pick(sd.augments || []),
  };
}

let inflight = null;
// Cached meta for `set` (newest crawled TFT set when omitted); refetches when older than a day or for another set.
async function tftMeta(db, set, { fetchJson = (u) => fetch(u, { signal: AbortSignal.timeout(120000) }).then((r) => { if (!r.ok) throw new Error(`CDragon ${r.status}`); return r.json(); }), now = Date.now } = {}) {
  // newest fetched TFT match's set, off the matches_fetched index (max("set") scanned every match: ~2 s)
  set ??= db.prepare('SELECT max(s) s FROM (SELECT "set" s FROM matches WHERE game = \'tft\' AND "set" IS NOT NULL ORDER BY fetched_at DESC LIMIT 500)').get()?.s;
  if (set == null) throw Object.assign(new Error("no TFT matches yet"), { status: 404 });
  const have = getMeta(db, "tftMeta");
  if (have && have.set === set && now() - have.fetchedAt < DAY) return have;
  try {
    inflight ??= fetchJson(CDRAGON + "cdragon/tft/en_us.json").finally(() => { inflight = null; });
    const m = { ...build(await inflight, set), fetchedAt: now() };
    setMeta(db, "tftMeta", m);
    return m;
  } catch (e) {
    if (have && have.set === set) return { ...have, stale: true };
    throw Object.assign(e, { status: 503 });
  }
}

module.exports = { tftMeta, build, png };
