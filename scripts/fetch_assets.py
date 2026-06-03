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
    print(f"Done. Assets written to {ASSETS}")


if __name__ == "__main__":
    main()
