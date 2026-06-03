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
    fetch_fonts()
    print(f"Done. Assets written to {ASSETS}")


if __name__ == "__main__":
    main()
