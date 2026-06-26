"""
Runtime champion-asset refresh.

The shipped app bundles a champion catalog + portraits captured at build time
(scripts/fetch_assets.py). When Riot releases a new champion, that bundled set
is stale until the next release. This module re-downloads the catalog + icons
from Data Dragon *at runtime* so a new champion can show up without shipping a
build.

The bundled assets can't be written to: the one-file PyInstaller build extracts
them to a temp dir (sys._MEIPASS) that's wiped on exit. So the refresh writes to
a persistent override dir next to config.json (config.BASE_DIR), and the web UI
loads portraits from there via an absolute file:// URL once a refresh exists.

Data Dragon lags a champion's live launch by hours-to-days, so this is the
*backfill* path: it fetches the canonical name + portrait once Riot publishes
them. The live-client merge in web_api.get_champion_catalog is what surfaces a
brand-new champion the moment the player's client is patched.
"""

import json
import os
import shutil
import threading
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import config
import events

DDRAGON = "https://ddragon.leagueoflegends.com"
TIMEOUT = 30

# One refresh at a time: the About-page button can be mashed, and a background
# download shouldn't be started twice.
_lock = threading.Lock()


# --- Paths -------------------------------------------------------------------
def override_dir():
    """Writable dir for refreshed assets, next to config.json (which persists
    across runs and updates)."""
    return os.path.join(config.BASE_DIR, "assets_override")


def champions_dir():
    return os.path.join(override_dir(), "champions")


def override_manifest_path():
    return os.path.join(champions_dir(), "manifest.json")


def _champ_base_url():
    """Absolute file:// URL the web UI uses as the champion-portrait base when
    the override is active. pathname2url percent-encodes spaces in the path
    (e.g. a user folder like "Brandon Harris")."""
    return "file:" + urllib.request.pathname2url(os.path.abspath(champions_dir()))


def _version_tuple(v):
    """Parse a Data Dragon version ("14.12.1") into a comparable int tuple."""
    parts = []
    for p in (v or "").split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def _manifest_version(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f).get("version", "")


def resolve(bundled_manifest_path):
    """Pick the active champion-catalog source. Returns
    (manifest_path, champ_base_url|None).

    Prefers the refreshed override only when its Data Dragon version is at least
    as new as the bundled one, so a newer app release's bundled assets are never
    shadowed by a stale manual refresh. champ_base_url is None when the bundled
    (relative-path) assets win.
    """
    ov = override_manifest_path()
    if not os.path.exists(ov):
        return bundled_manifest_path, None
    try:
        ov_v = _version_tuple(_manifest_version(ov))
        b_v = _version_tuple(_manifest_version(bundled_manifest_path))
        use_override = ov_v >= b_v
    except Exception:
        use_override = True  # override exists but bundled unreadable → use it
    if use_override:
        return ov, _champ_base_url()
    return bundled_manifest_path, None


def sync_into_bundle(bundle_manifest_path, bundle_champions_dir):
    """Mirror the refreshed override portraits into the session's bundled asset
    dir so the web UI loads them via its normal *relative* path.

    WebView2 won't render an <img> from an absolute file:// URL outside the
    page's own directory, so we can't point the UI straight at the override.
    Instead we copy the portraits into the bundled champions dir — PyInstaller's
    _MEIPASS temp extraction, which is writable per-session and wiped on exit,
    so this re-runs every launch. Only mirrors when the override is the active
    source (its patch >= the bundled one, per resolve). Returns the count copied.
    """
    _, active = resolve(bundle_manifest_path)
    if not active:
        return 0  # bundled wins, or no override → nothing to mirror
    src = champions_dir()
    if not os.path.isdir(src):
        return 0
    try:
        os.makedirs(bundle_champions_dir, exist_ok=True)
    except Exception:
        return 0
    copied = 0
    for fn in os.listdir(src):
        if not fn.endswith(".png"):
            continue
        try:
            dest = os.path.join(bundle_champions_dir, fn)
            tmp = dest + ".tmp"
            shutil.copyfile(os.path.join(src, fn), tmp)
            os.replace(tmp, dest)  # atomic: never leave a half-copied icon
            copied += 1
        except Exception:
            pass
    return copied


# --- Refresh -----------------------------------------------------------------
def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "queuePop-asset-refresh"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read()


def _get_json(url):
    return json.loads(_get(url).decode("utf-8"))


def refresh(force=False):
    """Download the latest champion catalog + portraits from Data Dragon into
    the override dir. Skips icons already present (unless force=True), so the
    first run seeds the full set and later runs only fetch newcomers. Returns
    {ok, version, total, added, error}; pushes progress to the activity feed.
    """
    if not _lock.acquire(blocking=False):
        return {"ok": False, "error": "A refresh is already running."}
    try:
        events.push("Refreshing champion data from Data Dragon…", "info", kind="assets")
        cdir = champions_dir()
        os.makedirs(cdir, exist_ok=True)

        try:
            version = _get_json(f"{DDRAGON}/api/versions.json")[0]
            data = _get_json(f"{DDRAGON}/cdn/{version}/data/en_US/champion.json")["data"]
        except Exception as e:
            events.push(f"Champion data refresh failed: {e}", "danger", kind="assets")
            return {"ok": False, "error": str(e)}

        champions = [
            {"id": int(c["key"]), "name": c["name"], "alias": c["id"]}
            for c in data.values()
        ]

        def download(champ):
            dest = os.path.join(cdir, f"{champ['id']}.png")
            if os.path.exists(dest) and not force:
                return False  # already have it; not newly added
            url = f"{DDRAGON}/cdn/{version}/img/champion/{champ['alias']}.png"
            try:
                raw = _get(url)
                tmp = dest + ".tmp"
                with open(tmp, "wb") as f:
                    f.write(raw)
                os.replace(tmp, dest)  # atomic: never leave a half-written icon
                return True
            except Exception:
                return False

        added = 0
        with ThreadPoolExecutor(max_workers=12) as pool:
            for fut in as_completed([pool.submit(download, c) for c in champions]):
                if fut.result():
                    added += 1

        # Write the manifest last (and atomically): its presence is what flips
        # the UI onto the override dir, so the icons must already be there.
        champions.sort(key=lambda c: c["name"])
        manifest = {"version": version, "champions": champions}
        tmp = override_manifest_path() + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2)
        os.replace(tmp, override_manifest_path())

        events.push(
            f"Champion data updated to patch {version}"
            + (f" (+{added} new)" if added else " (already current)"),
            "success", kind="assets",
        )
        return {"ok": True, "version": version, "total": len(champions), "added": added}
    finally:
        _lock.release()
