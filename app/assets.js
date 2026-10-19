// DONI-504: downloads the gitignored icon packs under src/webui/assets/ (champions, positions, spells; skins lazily)
// from Data Dragon / Community Dragon, replacing the Python-era scripts/fetch_assets.py. Node https + fs only.
const fs = require("fs");
const path = require("path");
const https = require("https");

const DD = "https://ddragon.leagueoflegends.com";
const CD = "https://raw.communitydragon.org/latest/plugins";
const CD_GAME = CD + "/rcp-be-lol-game-data/global/default";
const ROLES = ["top", "jungle", "middle", "bottom", "utility"];
const LIMIT = 12;

function get(url, tries = 3) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "queuePop-asset-fetch" }, timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${res.statusCode} ${url}`)); }
      const bufs = []; res.on("data", (b) => bufs.push(b)); res.on("end", () => resolve(Buffer.concat(bufs)));
    }).on("error", reject).on("timeout", function () { this.destroy(new Error("timeout " + url)); });
  }).catch((e) => (tries > 1 && !/^404/.test(e.message) ? get(url, tries - 1) : Promise.reject(e)));
}
const getJson = async (url) => JSON.parse((await get(url)).toString("utf8"));

// Runs fn over items with at most LIMIT in flight; returns how many succeeded.
async function pool(items, fn) {
  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: Math.min(LIMIT, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; try { await fn(it); ok++; } catch (e) { pool.lastError = e.message; } }
  }));
  return ok;
}

// Data Dragon champion.json "data" -> [{id: numeric key (our file name), name, alias: Data Dragon image id}]
function championList(data) {
  return Object.values(data).map((c) => ({ id: parseInt(c.key, 10), name: c.name, alias: c.id }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
// CDragon skins.json -> {championId: [{id, name, rarity, isBase}]} plus {skinId: tile url}
function skinCatalog(data) {
  const skins = {}, tiles = {};
  for (const [key, s] of Object.entries(data)) {
    const sid = parseInt(s.id ?? key, 10), cid = Math.floor(sid / 1000);
    if (!(cid > 0)) continue;
    const r = s.rarity || "";
    if (s.tilePath) tiles[sid] = CD_GAME + (s.tilePath.toLowerCase().split("/lol-game-data/assets")[1] || s.tilePath.toLowerCase());
    (skins[cid] ||= []).push({ id: sid, name: s.name || `Skin ${sid}`, rarity: r === "kNoRarity" ? "" : r.startsWith("k") ? r.slice(1) : r, isBase: !!s.isBase });
  }
  for (const v of Object.values(skins)) v.sort((a, b) => a.id - b.id);
  return { skins, tiles };
}

function create(log = () => {}, dir = path.join(__dirname, "..", "src", "webui", "assets")) {
  const P = (...p) => path.join(dir, ...p);
  const have = (sub, ext) => { try { return new Set(fs.readdirSync(P(sub)).filter((f) => f.endsWith(ext)).map((f) => f.slice(0, -ext.length))); } catch { return new Set(); } };
  const st = { champions: { have: 0, want: 0 }, spells: { have: 0, want: 0 }, positions: { have: 0, want: ROLES.length },
    skins: { have: 0, want: 0 }, busy: false, lastError: "" };
  let version = "", skinData = null, running = null;

  const write = (file, buf) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, buf); };
  const fail = (e) => { st.lastError = e.message || String(e); log("assets:", st.lastError); };

  async function run(force) {
    version = (await getJson(DD + "/api/versions.json"))[0];
    const manifest = P("champions", "manifest.json");
    let old = ""; try { old = JSON.parse(fs.readFileSync(manifest, "utf8")).version; } catch {}
    force = force && old !== version; // a plain refresh only fills gaps; a new patch re-downloads everything

    const champs = championList((await getJson(`${DD}/cdn/${version}/data/en_US/champion.json`)).data);
    const hc = force ? new Set() : have("champions", ".png");
    st.champions = { have: champs.filter((c) => hc.has(String(c.id))).length, want: champs.length };
    await pool(champs.filter((c) => !hc.has(String(c.id))), async (c) => {
      write(P("champions", `${c.id}.png`), await get(`${DD}/cdn/${version}/img/champion/${c.alias}.png`)); st.champions.have++;
    });
    if (st.champions.have === champs.length) write(manifest, JSON.stringify({ version, champions: champs }, null, 2));

    const sp = Object.values((await getJson(`${DD}/cdn/${version}/data/en_US/summoner.json`)).data)
      .map((s) => ({ id: parseInt(s.key, 10), img: s.image && s.image.full })).filter((s) => s.id && s.img);
    const hs = force ? new Set() : have("spells", ".png");
    st.spells = { have: sp.filter((s) => hs.has(String(s.id))).length, want: sp.length };
    await pool(sp.filter((s) => !hs.has(String(s.id))), async (s) => {
      write(P("spells", `${s.id}.png`), await get(`${DD}/cdn/${version}/img/spell/${s.img}`)); st.spells.have++;
    });

    const hp = have("positions", ".svg");
    st.positions.have = ROLES.filter((r) => hp.has(r)).length;
    await pool(ROLES.filter((r) => !hp.has(r)), async (r) => {
      write(P("positions", `${r}.svg`), await get(`${CD}/rcp-fe-lol-champ-select/global/default/svg/position-${r}.svg`)); st.positions.have++;
    });
    skinStatus();
  }

  // Skin manifest + per-champion tiles: only fetched when a champion's skins are first asked for.
  function skinStatus() {
    try { skinData = skinData || JSON.parse(fs.readFileSync(P("skins", "manifest.json"), "utf8")); } catch { return; }
    const all = Object.values(skinData.skins).flat(), ht = have("skins/tiles", ".jpg");
    st.skins = { have: all.filter((s) => ht.has(String(s.id))).length, want: all.length };
  }
  let catalog = null;
  async function ensureSkins(cid) {
    try {
      if (!fs.existsSync(P("skins", "manifest.json"))) {
        catalog = skinCatalog(await getJson(CD_GAME + "/v1/skins.json"));
        write(P("skins", "manifest.json"), JSON.stringify({ skins: catalog.skins }));
        skinData = { skins: catalog.skins };
      }
      if (!catalog) catalog = skinCatalog(await getJson(CD_GAME + "/v1/skins.json"));
      const ht = have("skins/tiles", ".jpg"), todo = (catalog.skins[cid] || []).filter((s) => !ht.has(String(s.id)) && catalog.tiles[s.id]);
      await pool(todo, async (s) => { write(P("skins", "tiles", `${s.id}.jpg`), await get(catalog.tiles[s.id])); });
      skinStatus();
    } catch (e) { fail(e); }
  }

  async function check(force = false) {
    if (running) return running;
    st.busy = true; st.lastError = ""; pool.lastError = "";
    running = run(force).catch(fail).then(() => {
      if (pool.lastError && !st.lastError) st.lastError = pool.lastError;
      st.busy = false; running = null;
      log(`assets: champions ${st.champions.have}/${st.champions.want}, spells ${st.spells.have}/${st.spells.want}, positions ${st.positions.have}/${st.positions.want}`);
      return { ok: !st.lastError, ...st };
    });
    return running;
  }

  return {
    check, ensureSkins, status: () => ({ ...st, version }),
    // Bridge methods; get_champion_skins is wrapped so the first request for a champion downloads its tiles (not awaited).
    methods: (impl) => { const orig = impl.get_champion_skins; return {
      get_asset_status: () => ({ ...st, version }),
      refresh_assets: () => check(true),
      get_champion_skins: async (cid) => {
        if (!fs.existsSync(P("skins", "manifest.json"))) await ensureSkins(0); // champ-select caches the catalog on first read
        const r = orig ? orig(cid) : [];
        ensureSkins(parseInt(cid, 10)); // tiles arrive in the background; the picker hides broken images until then
        return r;
      },
    }; },
  };
}

module.exports = { create, championList, skinCatalog };
