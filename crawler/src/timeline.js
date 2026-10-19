// Match-v5 timeline -> per participant purchase and skill story (DONI-507).
//   start  items bought before 1:30, sorted ids with repeats ("1055,2003,2003"), "" when none
//   early  distinct non-consumable items first bought 1:30..10:00
//   build  final-inventory items in first-purchase order with the purchase second: [[3078, 612], ...]
//          (items never bought, e.g. upgrades and transformations, have no time and are left out)
//   skills every NORMAL skill-up in order, "QWEQQRQ..." (R is 4); EVOLVE level-ups (Kha'Zix, Viktor) are not points
// ITEM_UNDO reverts the participant's last purchase (beforeId) or sale (afterId) of that item.
const START_MS = 90000, EARLY_MS = 600000;
// Potions, wards, elixirs, trinkets and the like: never "early items" or build slots.
const CONSUMABLE = new Set([2003, 2010, 2031, 2033, 2055, 2138, 2139, 2140, 2150, 2151, 2152, 3340, 3363, 3364, 3330, 3513]);

function parseTimeline(tl, finalItems = {}) {
  const buys = {}, skills = {};
  for (const f of tl.info.frames) for (const e of f.events) {
    const b = (buys[e.participantId] ??= []);
    if (e.type === "ITEM_PURCHASED") b.push({ id: e.itemId, t: e.timestamp });
    else if (e.type === "ITEM_UNDO" && e.beforeId) {
      for (let i = b.length - 1; i >= 0; i--) if (b[i].id === e.beforeId) { b.splice(i, 1); break; }
    } else if (e.type === "SKILL_LEVEL_UP" && e.levelUpType === "NORMAL") skills[e.participantId] = (skills[e.participantId] || "") + "QWER"[e.skillSlot - 1];
  }
  const out = {};
  for (const p of tl.info.participants) {
    const b = buys[p.participantId] || [], first = new Map();
    for (const x of b) if (!first.has(x.id)) first.set(x.id, x.t);
    const fin = new Set(finalItems[p.puuid] || []);
    out[p.puuid] = {
      start: b.filter((x) => x.t < START_MS).map((x) => x.id).sort((x, y) => x - y).join(","),
      early: [...first].filter(([id, t]) => t >= START_MS && t < EARLY_MS && !CONSUMABLE.has(id)).map(([id]) => id),
      build: [...first].filter(([id, t]) => fin.has(id) && t >= START_MS && !CONSUMABLE.has(id)).map(([id, t]) => [id, Math.round(t / 1000)]),
      skills: skills[p.participantId] || "",
    };
  }
  return out;
}

module.exports = { parseTimeline, CONSUMABLE };
