"""
Downloads champion + role icons from Riot's Data Dragon (and Community Dragon
for position icons) and stores them under src/webui/assets/ so they can be
bundled into the app by PyInstaller. This keeps the running app fully offline:
the webview loads these as local files, never hitting the network.

Run standalone to refresh assets:
    python scripts/fetch_assets.py

build_release.py calls this automatically before packaging.
"""

import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "src", "webui", "assets")
CHAMP_DIR = os.path.join(ASSETS, "champions")
POS_DIR = os.path.join(ASSETS, "positions")
FONT_DIR = os.path.join(ASSETS, "fonts")
SKIN_DIR = os.path.join(ASSETS, "skins")
SPELL_DIR = os.path.join(ASSETS, "spells")

# Google Fonts CSS for the Hextech-style faces, vendored locally for offline use.
FONTS_CSS_URL = ("https://fonts.googleapis.com/css2?"
                 "family=Cinzel:wght@500;700&family=Marcellus&display=swap")
# A modern browser UA makes Google Fonts serve compact woff2 files.
BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

DDRAGON = "https://ddragon.leagueoflegends.com"
# Community Dragon serves the champ-select position icons as small SVGs.
CDRAGON_POS = ("https://raw.communitydragon.org/latest/plugins/"
               "rcp-fe-lol-champ-select/global/default/svg/position-{role}.svg")
# Community Dragon asset CDN base + the full skin catalog (id → {name, rarity,
# isBase, tilePath, …}). Used for the per-champ skin manifest + tile images.
CDRAGON_BASE = ("https://raw.communitydragon.org/latest/plugins/"
                "rcp-be-lol-game-data/global/default")
CDRAGON_SKINS = CDRAGON_BASE + "/v1/skins.json"
ROLES = ["top", "jungle", "middle", "bottom", "utility"]

TIMEOUT = 30


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "queueBot-asset-fetch"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def _get_json(url):
    return json.loads(_get(url).decode("utf-8"))


def latest_version():
    versions = _get_json(f"{DDRAGON}/api/versions.json")
    return versions[0]


def fetch_champions(version):
    os.makedirs(CHAMP_DIR, exist_ok=True)
    data = _get_json(f"{DDRAGON}/cdn/{version}/data/en_US/champion.json")["data"]

    champions = []
    for _, champ in data.items():
        cid = int(champ["key"])           # numeric championId (matches LCU)
        alias = champ["id"]               # e.g. "MonkeyKing"
        name = champ["name"]              # e.g. "Wukong"
        champions.append({"id": cid, "name": name, "alias": alias})

    def download(champ):
        dest = os.path.join(CHAMP_DIR, f"{champ['id']}.png")
        url = f"{DDRAGON}/cdn/{version}/img/champion/{champ['alias']}.png"
        try:
            data = _get(url)
            with open(dest, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            print(f"  ! {champ['name']} ({champ['alias']}): {e}")
            return False

    ok = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(download, c): c for c in champions}
        for fut in as_completed(futures):
            if fut.result():
                ok += 1
    print(f"  champions: {ok}/{len(champions)} icons downloaded")

    champions.sort(key=lambda c: c["name"])
    manifest = {"version": version, "champions": champions}
    with open(os.path.join(CHAMP_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    return len(champions)


def fetch_positions():
    os.makedirs(POS_DIR, exist_ok=True)
    ok = 0
    for role in ROLES:
        try:
            data = _get(CDRAGON_POS.format(role=role))
            with open(os.path.join(POS_DIR, f"{role}.svg"), "wb") as f:
                f.write(data)
            ok += 1
        except Exception as e:
            print(f"  ! position {role}: {e}")
    print(f"  positions: {ok}/{len(ROLES)} icons downloaded")


def _cdragon_url(asset_path):
    """Map a game-data asset path (e.g. /lol-game-data/assets/v1/champion-tiles/
    103/103000.jpg) to its Community Dragon CDN URL. CDragon serves lowercase."""
    p = (asset_path or "").lower()
    marker = "/lol-game-data/assets"
    if marker in p:
        p = p.split(marker, 1)[1]
    return CDRAGON_BASE + p


def fetch_skins():
    """Build assets/skins/manifest.json: {championId: [{id, name, rarity, isBase,
    tile}]} from Community Dragon's skin catalog, and download each skin's TILE
    image into assets/skins/tiles/<skinId>.jpg so the loadout picker works fully
    offline (no CDN dependency)."""
    os.makedirs(SKIN_DIR, exist_ok=True)
    tiles_dir = os.path.join(SKIN_DIR, "tiles")
    os.makedirs(tiles_dir, exist_ok=True)
    try:
        data = _get_json(CDRAGON_SKINS)
    except Exception as e:
        print(f"  ! skins: could not fetch catalog: {e}")
        return 0

    by_champ = {}
    tile_urls = {}  # skinId -> CDN tile url
    for key, skin in data.items():
        try:
            sid = int(skin.get("id", key))
        except (TypeError, ValueError):
            continue
        champ_id = sid // 1000  # skinId = championId * 1000 + skinNum
        if champ_id <= 0:
            continue
        # "kEpic" → "Epic"; the common "kNoRarity" sentinel becomes "" (hidden).
        rarity = (skin.get("rarity") or "")
        rarity = "" if rarity in ("kNoRarity", "") else rarity[1:] if rarity.startswith("k") else rarity
        tile_path = skin.get("tilePath") or ""
        if tile_path:
            tile_urls[sid] = _cdragon_url(tile_path)
        by_champ.setdefault(champ_id, []).append({
            "id": sid,
            "name": skin.get("name") or f"Skin {sid}",
            "rarity": rarity,
            "isBase": bool(skin.get("isBase")),
        })
    for skins in by_champ.values():
        skins.sort(key=lambda s: s["id"])

    manifest = {"skins": {str(c): v for c, v in by_champ.items()}}
    with open(os.path.join(SKIN_DIR, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, separators=(",", ":"))

    # Download the tiles (skip any we already have so re-runs are fast).
    def download(item):
        sid, url = item
        dest = os.path.join(tiles_dir, f"{sid}.jpg")
        if os.path.exists(dest):
            return True
        try:
            with open(dest, "wb") as f:
                f.write(_get(url))
            return True
        except Exception:
            return False

    ok = 0
    with ThreadPoolExecutor(max_workers=16) as pool:
        for fut in as_completed([pool.submit(download, it) for it in tile_urls.items()]):
            if fut.result():
                ok += 1
    total = sum(len(v) for v in by_champ.values())
    print(f"  skins: {total} skins across {len(by_champ)} champions; "
          f"{ok}/{len(tile_urls)} tiles downloaded")
    return total


def fetch_spells(version):
    """Download summoner-spell icons into assets/spells/<spellId>.png (keyed by
    the numeric LCU spell id) so the live view can show spell icons offline."""
    os.makedirs(SPELL_DIR, exist_ok=True)
    try:
        data = _get_json(f"{DDRAGON}/cdn/{version}/data/en_US/summoner.json")["data"]
    except Exception as e:
        print(f"  ! spells: could not fetch summoner data: {e}")
        return 0

    spells = []
    for _, sp in data.items():
        try:
            sid = int(sp["key"])  # numeric id (matches LCU spell1Id/spell2Id)
        except (TypeError, ValueError, KeyError):
            continue
        img = (sp.get("image") or {}).get("full")
        if img:
            spells.append((sid, img))

    def download(item):
        sid, img = item
        try:
            raw = _get(f"{DDRAGON}/cdn/{version}/img/spell/{img}")
            with open(os.path.join(SPELL_DIR, f"{sid}.png"), "wb") as f:
                f.write(raw)
            return True
        except Exception:
            return False

    ok = 0
    with ThreadPoolExecutor(max_workers=12) as pool:
        for fut in as_completed([pool.submit(download, s) for s in spells]):
            if fut.result():
                ok += 1
    print(f"  spells: {ok}/{len(spells)} icons downloaded")
    return ok


def fetch_fonts():
    """Downloads the woff2 font files + writes a local fonts.css (offline)."""
    import re

    os.makedirs(FONT_DIR, exist_ok=True)
    req = urllib.request.Request(FONTS_CSS_URL, headers={"User-Agent": BROWSER_UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        css = resp.read().decode("utf-8")

    blocks = ["@font-face" + b for b in css.split("@font-face")[1:]]
    out = []
    n = 0
    for block in blocks:
        fam = re.search(r"font-family:\s*'([^']+)'", block)
        weight = re.search(r"font-weight:\s*(\d+)", block)
        style = re.search(r"font-style:\s*(\w+)", block)
        url = re.search(r"url\((https://[^)]+\.woff2)\)", block)
        urange = re.search(r"unicode-range:\s*([^;]+);", block)
        if not (fam and url):
            continue
        n += 1
        fname = f"{fam.group(1).replace(' ', '')}-{weight.group(1) if weight else '400'}-{n}.woff2"
        with open(os.path.join(FONT_DIR, fname), "wb") as f:
            f.write(_get(url.group(1)))
        out.append(
            "@font-face{"
            f"font-family:'{fam.group(1)}';"
            f"font-style:{style.group(1) if style else 'normal'};"
            f"font-weight:{weight.group(1) if weight else '400'};"
            "font-display:swap;"
            f"src:url('{fname}') format('woff2');"
            + (f"unicode-range:{urange.group(1).strip()};" if urange else "")
            + "}"
        )
    with open(os.path.join(FONT_DIR, "fonts.css"), "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"  fonts: {n} woff2 files + fonts.css written")


def main():
    print("Fetching League assets from Data Dragon…")
    try:
        version = latest_version()
    except Exception as e:
        print(f"Could not reach Data Dragon: {e}")
        sys.exit(1)
    print(f"  latest patch: {version}")
    fetch_champions(version)
    fetch_positions()
    fetch_spells(version)
    fetch_skins()
    fetch_fonts()
    print(f"Done. Assets written to {ASSETS}")


if __name__ == "__main__":
    main()
