// DONI-502: comp rule (top trait + carry), backfill from raw, /tft/meta builder.
const test = require("node:test");
const assert = require("node:assert");
const zlib = require("zlib");
const { open } = require("../src/db");
const { compOf, backfillComps, aggregate } = require("../src/jobs");
const { tftComps } = require("../src/server");
const { build, tftMeta } = require("../src/tft-meta");
const cd = require("../fixtures/cdragon-tft.json");

const T = (name, num_units, tier_current, tier_total = 4) => ({ name, num_units, tier_current, tier_total });
const U = (character_id, tier, rarity, items = 0) => ({ character_id, tier, rarity, itemNames: Array(items).fill("I") });

test("board -> carry: most items, then star, then cost, then name; order-independent", () => {
  const p = { traits: [T("Lunar", 3, 2)], units: [U("Varus", 2, 0), U("Ahri", 2, 4, 3), U("Amumu", 3, 3, 3)] };
  assert.strictEqual(compOf(p), "Amumu"); // tie on items -> higher star
  assert.strictEqual(compOf({ units: [U("A", 2, 1, 1), U("B", 2, 2, 1)] }), "B"); // tie on star -> higher cost
  assert.strictEqual(compOf({ units: [] }), "none");
  assert.strictEqual(compOf({ ...p, units: [...p.units].reverse() }), compOf(p));
});

test("comp = carry labelled with the trait most of its boards run (unique traits never label), per patch", () => {
  const db = open(":memory:");
  db.prepare("INSERT INTO matches (id, game, region, bracket, status, patch, fetched_at) VALUES ('M', 'tft', 'na1', 'DIAMOND', 'done', '16.20', 1)").run();
  const ins = db.prepare("INSERT INTO tft_participants (match_id, puuid, placement, comp, traits, units, augments) VALUES ('M', ?, ?, 'Azir', ?, '[]', '[]')");
  // Azir boards: Executioner on the 2 that went far, Flora Fatalis on all 3, a unique trait on all 3 -> one comp, labelled Flora
  ins.run("a", 1, '[["Exec",2],["Flora",1],["AzirUniqueTrait",1]]'); ins.run("b", 2, '[["Exec",1],["Flora",1],["AzirUniqueTrait",1]]'); ins.run("c", 7, '[["Flora",2],["AzirUniqueTrait",1]]');
  aggregate(db);
  assert.deepStrictEqual(tftComps(db).comps.map((c) => [c.id, c.games, c.avgPlacement]), [["Flora,Azir", 3, 3.3333]]);
});

test("backfill-comps re-keys boards from raw; rows without raw keep their key", () => {
  const db = open(":memory:");
  const raw = { info: { participants: [{ puuid: "a", traits: [T("Invoker", 4, 2)], units: [U("Ahri", 2, 4, 3)] }] } };
  db.prepare("INSERT INTO matches (id, game, region, status, raw) VALUES ('M', 'tft', 'na1', 'done', ?), ('N', 'tft', 'na1', 'done', NULL)").run(zlib.gzipSync(JSON.stringify(raw)));
  db.prepare("INSERT INTO tft_participants (match_id, puuid, comp) VALUES ('M', 'a', 'Invoker'), ('N', 'b', 'old')").run();
  db.prepare("INSERT INTO tft_participants (match_id, puuid, comp) VALUES ('N', 'c', 'Exec,Azir')").run();
  assert.deepStrictEqual(backfillComps(db), { matches: 1, boards: 1, stripped: 1 });
  assert.deepStrictEqual(db.prepare("SELECT comp FROM tft_participants ORDER BY match_id, puuid").all().map((r) => r.comp), ["Ahri", "old", "Azir"]);
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

test("composition clustering: a board joins the comp it overlaps most, whoever holds the items (DONI-577)", () => {
  const { cluster, CENTROID_MIN } = require("../src/tft-comps");
  const mk = (i, carry, units, traits) => ({ match_id: "M" + i, puuid: "p", carry, units, traits });
  const boards = [];
  for (let i = 0; i < CENTROID_MIN; i++) boards.push(mk("a" + i, "Azir", ["Azir", "Rammus", "Zyra", "Soraka"], [["Flora", 2]]));
  for (let i = 0; i < CENTROID_MIN; i++) boards.push(mk("e" + i, "Elder", ["Elder", "Krug", "Gnar", "Taric"], [["Riftbeast", 2]]));
  // Elder holds the items, but the board is an Azir board -> Azir's comp; one with nothing in common keeps its carry comp
  boards.push(mk("x", "Elder", ["Azir", "Rammus", "Zyra", "Elder"], [["Flora", 1]]));
  boards.push(mk("y", "Lux", ["Lux", "Varus"], [["Arcana", 2]]));
  const { assign, centroids } = cluster(boards);
  assert.deepStrictEqual(centroids.map((c) => c.id).sort(), ["Flora,Azir", "Riftbeast,Elder"]);
  assert.strictEqual(assign.get("Mx|p"), "Flora,Azir");
  assert.strictEqual(assign.get("My|p"), "Arcana,Lux");
  assert.strictEqual(assign.get("Ma0|p"), "Flora,Azir");
});
