// DONI-504: champion key -> file mapping on a fixture Data Dragon list, then the real downloader against an empty temp dir.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { create, championList, skinCatalog } = require("./assets");

const fixture = { MonkeyKing: { id: "MonkeyKing", key: "62", name: "Wukong" }, Aatrox: { id: "Aatrox", key: "266", name: "Aatrox" } };
assert.deepStrictEqual(championList(fixture), [{ id: 266, name: "Aatrox", alias: "Aatrox" }, { id: 62, name: "Wukong", alias: "MonkeyKing" }]);
const sk = skinCatalog({ 62000: { id: 62000, name: "Wukong", isBase: true, rarity: "kNoRarity", tilePath: "/lol-game-data/assets/ASSETS/Characters/MonkeyKing/Skins/Base/Tile.jpg" } });
assert.strictEqual(sk.skins[62][0].rarity, ""); assert.ok(sk.tiles[62000].endsWith("/assets/characters/monkeyking/skins/base/tile.jpg"));

if (process.env.ASSETS_LIVE) { // network: run explicitly, not part of npm test
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qp-assets-"));
  const a = create(console.log, dir);
  a.check().then(async (r) => {
    assert.ok(r.champions.have > 150 && r.champions.have === r.champions.want, JSON.stringify(r));
    assert.ok(fs.existsSync(path.join(dir, "champions", "62.png")) && fs.existsSync(path.join(dir, "champions", "manifest.json")));
    assert.ok(fs.existsSync(path.join(dir, "spells", "4.png")) && fs.existsSync(path.join(dir, "positions", "top.svg")));
    await a.ensureSkins(62);
    assert.ok(fs.existsSync(path.join(dir, "skins", "manifest.json")) && fs.existsSync(path.join(dir, "skins", "tiles", "62000.jpg")));
    console.log("live ok", dir, r.champions, r.spells, r.positions);
  }).catch((e) => { console.error(e); process.exit(1); });
} else console.log("assets ok");
