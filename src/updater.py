"""
Self-updater for queuePop.

A running single-file .exe can't overwrite itself on Windows (the file is
locked), so updating is a two-act trick:

  * Portable build  -> download the new queuePop.exe next to the current one,
    spawn a tiny .bat that waits for THIS process to exit, swaps the file, and
    relaunches. Then we quit so the swap can happen.
  * Installed build -> download the Inno Setup installer and run it /SILENT.
    Inno's Restart Manager (keyed on our named mutex) closes the running app,
    replaces the files, and relaunches it.

Everything degrades quietly: no network, a private repo, a rate-limited API,
or a missing asset just means "no update available" rather than an error in the
user's face. All UI-facing strings flow through events.push() so they appear in
the activity feed and toast like everything else.
"""

import json
import os
import subprocess
import sys
import threading
import time
import urllib.request
import urllib.error
import tempfile
import zipfile

import events
from _version import __version__

# --- Where we look -----------------------------------------------------------
GITHUB_REPO = "brandon-relentnet/queuePop"
_LATEST_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
# GitHub requires a User-Agent on API requests; identify ourselves + version.
_UA = f"queuePop/{__version__} (+https://github.com/{GITHUB_REPO})"

# Don't hammer the API: cache the last result and only re-check this often.
_CHECK_INTERVAL = 6 * 60 * 60  # 6 hours

# Inno writes this uninstall key when the installer runs; its presence (with a
# matching InstallLocation) is how we tell an installed build from a portable one.
_UNINSTALL_KEY = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\queuePop_is1"

# Module-level cache shared between the background checker and the JS API.
_lock = threading.Lock()
_cache = {
    "checked": False,     # have we completed at least one check this run?
    "available": False,   # is there a newer version than us?
    "current": __version__,
    "latest": None,       # latest tag's version string (no leading 'v')
    "notes": "",          # release body (markdown)
    "url": "",            # human releases page / this release's html_url
    "assets": [],         # [{name, url, size}]
    "error": None,        # last error string, if a check failed
}
_last_check_ts = 0.0
_applying = False  # guard so a double-click doesn't kick off two updates


# --- Version parsing ---------------------------------------------------------

def _parse(version):
    """'v1.2.3' / '1.2.3-beta' -> (1, 2, 3). Best-effort: trailing pre-release
    junk is ignored, missing parts pad with zeros. Returns None if unparseable."""
    if not version:
        return None
    v = str(version).strip().lstrip("vV")
    # Drop a pre-release / build suffix (1.2.3-rc1, 1.2.3+meta) for comparison.
    for sep in ("-", "+"):
        if sep in v:
            v = v.split(sep, 1)[0]
    parts = v.split(".")
    nums = []
    for p in parts[:3]:
        try:
            nums.append(int(p))
        except ValueError:
            nums.append(0)
    while len(nums) < 3:
        nums.append(0)
    return tuple(nums)


def is_newer(remote, local):
    """True if `remote` is a strictly newer version than `local`."""
    r, l = _parse(remote), _parse(local)
    if r is None or l is None:
        return False
    return r > l


# --- Install-type detection --------------------------------------------------

def is_installed():
    """(installed?, install_dir). True when this exe was put here by the Inno
    installer, detected via the uninstall registry key. Portable builds (run
    from a download folder, a USB stick, etc.) return (False, None)."""
    if sys.platform != "win32":
        return (False, None)
    try:
        import winreg
    except ImportError:
        return (False, None)
    for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        try:
            with winreg.OpenKey(root, _UNINSTALL_KEY) as k:
                loc, _ = winreg.QueryValueEx(k, "InstallLocation")
                if loc:
                    return (True, loc)
                return (True, None)
        except OSError:
            continue
    return (False, None)


def _current_exe():
    """Absolute path to the running executable (only meaningful when frozen)."""
    return os.path.abspath(sys.executable)


# --- The GitHub check --------------------------------------------------------

def _http_get(url, accept="application/vnd.github+json", timeout=12):
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": accept})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _do_check():
    """Hit the API and refresh the module cache. Returns the cache snapshot."""
    global _last_check_ts
    error = None
    try:
        raw = _http_get(_LATEST_URL)
        data = json.loads(raw.decode("utf-8"))
        tag = data.get("tag_name") or data.get("name") or ""
        latest = str(tag).lstrip("vV")
        assets = [
            {
                "name": a.get("name", ""),
                "url": a.get("browser_download_url", ""),
                "size": a.get("size", 0),
            }
            for a in (data.get("assets") or [])
            if a.get("browser_download_url")
        ]
        with _lock:
            _cache.update({
                "checked": True,
                "available": is_newer(latest, __version__),
                "current": __version__,
                "latest": latest,
                "notes": data.get("body") or "",
                "url": data.get("html_url")
                or f"https://github.com/{GITHUB_REPO}/releases/latest",
                "assets": assets,
                "error": None,
            })
    except urllib.error.HTTPError as e:
        # 404 = no published release yet (or private repo); treat as "nothing".
        error = f"HTTP {e.code}"
        with _lock:
            _cache.update({"checked": True, "available": False, "error": error})
    except Exception as e:
        error = str(e)
        with _lock:
            _cache.update({"checked": True, "error": error})
    finally:
        _last_check_ts = time.time()
    return status()


def status():
    """Thread-safe snapshot of the current update state for the UI."""
    with _lock:
        return dict(_cache)


def check(force=False):
    """Return the latest update status, re-querying GitHub if the cache is stale
    (or `force`). Safe to call from the UI thread, network is bounded by the
    request timeout."""
    if force or (time.time() - _last_check_ts) > _CHECK_INTERVAL or not _cache["checked"]:
        return _do_check()
    return status()


def start_background():
    """Kick off the first check shortly after launch, then re-check periodically.
    Runs on a daemon thread so it never blocks shutdown."""
    def _loop():
        time.sleep(4)  # let the client connect + UI settle first
        while True:
            snap = _do_check()
            if snap.get("available"):
                events.push(
                    f"Update available: v{snap['latest']} "
                    f"(you have v{snap['current']})",
                    "info",
                    kind="update",
                )
            time.sleep(_CHECK_INTERVAL)

    threading.Thread(target=_loop, daemon=True, name="updater").start()


# --- Applying an update ------------------------------------------------------

def _pick_asset(assets, installed):
    """Choose the right release asset for how this copy was installed.
    Installed -> the Inno setup .exe. Portable -> the bare queuePop.exe, falling
    back to the portable .zip (which we extract)."""
    def find(pred):
        return next((a for a in assets if pred(a["name"].lower())), None)

    if installed:
        return find(lambda n: n.endswith("setup.exe"))
    # Portable: prefer the bare exe; else the portable zip.
    return (
        find(lambda n: n == "queuepop.exe")
        or find(lambda n: n.endswith("portable.zip"))
        or find(lambda n: n.endswith(".zip"))
    )


def _download(url, dest):
    """Stream a release asset to `dest` (follows GitHub's redirect to the CDN)."""
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=60) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(64 * 1024)
            if not chunk:
                break
            f.write(chunk)


def _extract_exe_from_zip(zip_path, out_dir):
    """Pull the first .exe out of a portable zip; returns its path."""
    with zipfile.ZipFile(zip_path) as z:
        exe_member = next(
            (n for n in z.namelist() if n.lower().endswith(".exe")), None
        )
        if not exe_member:
            raise RuntimeError("No .exe inside the portable archive")
        z.extract(exe_member, out_dir)
        return os.path.join(out_dir, exe_member)


# The relauncher: waits for our PID to die, swaps the exe, restarts it, then
# deletes itself. CMD's `move /Y` is atomic enough on the same volume.
_RELAUNCH_BAT = """@echo off
setlocal
set "PID=%~1"
set "NEW=%~2"
set "CUR=%~3"
:waitloop
tasklist /FI "PID eq %PID%" 2>nul | find "%PID%" >nul
if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitloop
)
move /Y "%NEW%" "%CUR%" >nul
start "" "%CUR%"
del "%~f0"
"""


def apply(on_exit=None):
    """Download the appropriate asset and hand off to the swap/installer step,
    then trigger the app to quit (via `on_exit`) so the file can be replaced.

    Returns {ok, error?}. On success the process is expected to exit moments
    later; the relauncher/installer brings the new version back up. Runs the
    network work inline, so call this from a worker thread (see web_api)."""
    global _applying
    with _lock:
        if _applying:
            return {"ok": False, "error": "An update is already in progress"}
        _applying = True
    try:
        if not getattr(sys, "frozen", False):
            return {"ok": False, "error": "Updates only apply to the packaged app"}

        snap = check()
        if not snap.get("available"):
            return {"ok": False, "error": "No update available"}

        installed, _ = is_installed()
        asset = _pick_asset(snap.get("assets") or [], installed)
        if not asset:
            return {"ok": False, "error": "No matching download in the release"}

        events.push(f"Downloading v{snap['latest']}…", "info", kind="update")
        tmp = tempfile.mkdtemp(prefix="queuePop-upd-")
        local = os.path.join(tmp, asset["name"])
        _download(asset["url"], local)

        if installed:
            return _apply_installed(local, on_exit)
        return _apply_portable(local, tmp, on_exit)
    except Exception as e:
        events.push(f"Update failed: {e}", "danger", kind="update")
        return {"ok": False, "error": str(e)}
    finally:
        with _lock:
            _applying = False


def _apply_installed(setup_path, on_exit):
    """Run the Inno installer silently. AppMutex in the script lets Inno's
    Restart Manager close us, replace files, and relaunch, but we also exit
    ourselves so nothing is left holding the old exe."""
    # /SILENT shows a small progress bar (friendlier than a frozen window);
    # CLOSE/RESTARTAPPLICATIONS drives the Restart Manager handoff.
    subprocess.Popen(
        [
            setup_path,
            "/SILENT",
            "/SUPPRESSMSGBOXES",
            "/NORESTART",
            "/CLOSEAPPLICATIONS",
            "/RESTARTAPPLICATIONS",
        ],
        close_fds=True,
    )
    events.push("Installing update…", "info", kind="update")
    _quit_soon(on_exit)
    return {"ok": True}


def _apply_portable(downloaded, tmp_dir, on_exit):
    """Stage the new exe beside the current one and spawn the relauncher .bat."""
    new_exe = downloaded
    if downloaded.lower().endswith(".zip"):
        new_exe = _extract_exe_from_zip(downloaded, tmp_dir)

    cur = _current_exe()
    staged = os.path.join(os.path.dirname(cur), "queuePop.new.exe")
    # Replace any leftover from a previous attempt, then stage the download.
    try:
        if os.path.exists(staged):
            os.remove(staged)
    except OSError:
        pass
    if os.path.dirname(new_exe) == os.path.dirname(staged):
        os.replace(new_exe, staged)
    else:
        import shutil
        shutil.copy2(new_exe, staged)

    bat_path = os.path.join(tmp_dir, "queuePop-update.bat")
    with open(bat_path, "w", encoding="ascii") as f:
        f.write(_RELAUNCH_BAT)

    # Detached so it outlives us; CREATE_NO_WINDOW keeps the console hidden.
    creationflags = 0x00000008 | 0x08000000  # DETACHED_PROCESS | CREATE_NO_WINDOW
    subprocess.Popen(
        ["cmd", "/c", bat_path, str(os.getpid()), staged, cur],
        creationflags=creationflags,
        close_fds=True,
    )
    events.push("Update staged, restarting…", "info", kind="update")
    _quit_soon(on_exit)
    return {"ok": True}


def _quit_soon(on_exit):
    """Give the HTTP response a beat to reach the UI, then tear the app down on a
    background thread so the file unlocks for the swap/installer."""
    def _stop():
        time.sleep(1.0)
        if callable(on_exit):
            try:
                on_exit()  # stop the LCU loop + destroy the window
            except Exception:
                pass
        # on_exit only closes the window; this is a tray app, so the process can
        # keep running (and the .exe stays locked) after it. The installer/swap
        # can't replace a locked file, so force the process to actually exit.
        time.sleep(0.5)
        os._exit(0)

    threading.Thread(target=_stop, daemon=True, name="updater-quit").start()
