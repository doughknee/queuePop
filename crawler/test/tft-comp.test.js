// DONI-502: comp rule (top trait + carry), backfill from raw, /tft/meta builder.
const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");
const { open } = require("../src/db");
const { compOf, backfillComps } = require("../src/jobs");
const { build, tftMeta } = require("../src/tft-meta");
const cd = require("../fixtures/cdragon-tft.json");

const T = (name, num_units, tier_current, tier_total = 4) => ({ name, num_units, tier_current, tier_total });
const U = (character_id, tier, rarity, items = 0) => ({ character_id, tier, rarity, itemNames: Array(items).fill("I") });

test("comp = top non-unique trait | carry unit", () => {
  const p = { traits: [T("Lunar", 3, 2), T("Invoker", 4, 2), T("Unique", 1, 1, 1), T("Off", 1, 0)], units: [U("Varus", 2, 0), U("Ahri", 2, 4, 3), U("Amumu", 3, 3, 3)] };
  assert.strictEqual(compOf(p), "Invoker,Amumu"); // tie on tier -> more units; tie on items -> higher star
  assert.strictEqual(compOf({ traits: [T("Inferno", 2, 1), T("Adaptor", 2, 1)], units: [U("A", 2, 1, 1), U("B", 2, 2, 1)] }), "Adaptor,B"); // tier 1 counts; name breaks ties
  assert.strictEqual(compOf({ traits: [T("Unique", 1, 1, 1)], units: [] }), "none,");
  const again = { ...p, units: [...p.units].reverse(), traits: [...p.traits].reverse() };
  assert.strictEqual(compOf(again), compOf(p), "order of the input does not matter");
});

test("backfill-comps re-keys boards from raw; rows without raw keep their key", () => {
  const db = open(":memory:");
  const raw = { info: { participants: [{ puuid: "a", traits: [T("Invoker", 4, 2)], units: [U("Ahri", 2, 4, 3)] }] } };
  db.prepare("INSERT INTO matches (id, game, region, status, raw) VALUES ('M', 'tft', 'na1', 'done', ?), ('N', 'tft', 'na1', 'done', NULL)").run(zlib.gzipSync(JSON.stringify(raw)));
  db.prepare("INSERT INTO tft_participants (match_id, puuid, comp) VALUES ('M', 'a', 'Invoker'), ('N', 'b', 'old')").run();
  assert.deepStrictEqual(backfillComps(db), { matches: 1, boards: 1 });
  assert.deepStrictEqual(db.prepare("SELECT comp FROM tft_participants ORDER BY match_id").all().map((r) => r.comp), ["Invoker,Ahri", "old"]);
});

test("/tft/meta: ranked set data, icon URLs, cached a day, stale copy on a CDragon failure", async () => {
  const m = build(cd, 18);
  assert.strictEqual(m.mutator, "TFTSet18");
  assert.deepStrictEqual(m.units.DA_18_Ahri, { name: "Ahri", cost: 4, traits: ["DA_18_Blossom", "Spellweaver"],
    icon: "https://raw.communitydragon.org/latest/game/assets/characters/tft18_ahri/skins/base/images/tft18_ahri_splash_tile_27.png" });
  assert.ok(m.traits.DA_18_Invoker.breakpoints.length > 1 && m.traits.DA_18_Invoker.icon.endsWith(".png"));
  assert.strictEqual(m.items.DA_SpearOfShojin.name, "Spear of Shojin");
  assert.strictEqual(Object.keys(m.augments).length, 1);

  const db = open(":memory:");
  db.prepare(`INSERT INTO matches (id, game, "set") VALUES ('X', 'tft', 18)`).run();
  let calls = 0, t = 1000;
  const opts = { fetchJson: async () => { calls++; return cd; }, now: () => t };
  assert.strictEqual((await tftMeta(db, undefined, opts)).set, 18);
  await tftMeta(db, undefined, opts);
  assert.strictEqual(calls, 1, "second call is served from meta");
  t += 86400001;
  const stale = await tftMeta(db, undefined, { fetchJson: async () => { throw new Error("down"); }, now: () => t });
  assert.strictEqual(stale.stale, true);
  await assert.rejects(tftMeta(db, 17, { fetchJson: async () => { throw new Error("down"); } }), (e) => e.status === 503);
});
