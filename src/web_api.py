"""
Bridge object exposed to the web UI via pywebview's `js_api`.

The frontend calls these methods as `pywebview.api.<method>(...)` and receives
the (JSON-serializable) return values as resolved Promises. All config shaping
mirrors the normalization that the old Tkinter settings window performed, so a
config saved from the web UI is byte-identical to one saved from the legacy GUI.
"""

import json
import os
import sys

import config
import champ_select
import companion
import events
from notifications import send_discord_test
from _version import __version__


def _manifest_path():
    """Path to the bundled champion manifest (dev and frozen builds)."""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "webui", "assets", "champions", "manifest.json")


def _text_to_list(text):
    """Parse a comma-separated string into a clean list of names."""
    if isinstance(text, list):
        return [str(s).strip() for s in text if str(s).strip()]
    return [part.strip() for part in (text or "").split(",") if part.strip()]


def _normalize_champ_select(cs):
    cs = cs or {}
    roles_in = cs.get("roles", {}) or {}
    roles = {}
    for role in champ_select.ROLES:
        rc = roles_in.get(role, {}) or {}
        roles[role] = {
            "bans": _text_to_list(rc.get("bans")),
            "picks": _text_to_list(rc.get("picks")),
        }
    try:
        lock = int(cs.get("lock_in_at_seconds", champ_select.DEFAULT_LOCK_SECONDS))
    except (TypeError, ValueError):
        lock = champ_select.DEFAULT_LOCK_SECONDS
    return {
        "enabled": bool(cs.get("enabled", False)),
        "lock_in_at_seconds": max(0, lock),
        "roles": roles,
    }


ALARM_SOUNDS = {"chime", "ping", "arcade", "siren", "custom"}


def _normalize_companion(comp):
    comp = comp or {}
    try:
        port = int(comp.get("port", companion.DEFAULT_PORT))
    except (TypeError, ValueError):
        port = companion.DEFAULT_PORT
    # Keep it in the unprivileged, valid range.
    if not (1024 <= port <= 65535):
        port = companion.DEFAULT_PORT
    sound = comp.get("sound") or "chime"
    if sound not in ALARM_SOUNDS:
        sound = "chime"
    return {
        "enabled": bool(comp.get("enabled", False)),
        "port": port,
        "sound": sound,
        "sound_file": (comp.get("sound_file") or "").strip(),
    }


def _normalize_config(data):
    data = data or {}
    allowed_ids = data.get("allowed_queue_ids", []) or []
    # JS may hand us strings; coerce queue ids to ints.
    clean_ids = []
    for q in allowed_ids:
        try:
            clean_ids.append(int(q))
        except (TypeError, ValueError):
            continue
    return {
        "webhook_url": (data.get("webhook_url") or "").strip(),
        "user_id": (data.get("user_id") or "").strip(),
        "desktop_notifications": bool(data.get("desktop_notifications", True)),
        "allowed_queue_ids": sorted(set(clean_ids)),
        "companion": _normalize_companion(data.get("companion")),
        "champ_select": _normalize_champ_select(data.get("champ_select")),
    }


class Api:
    """Methods on this object are callable from JS as pywebview.api.<name>()."""

    def __init__(self, lcu, window_controller=None):
        # NOTE: both are stored with a leading underscore on purpose. pywebview
        # introspects this js_api object at startup (webview.util.get_functions)
        # and recurses into every PUBLIC non-callable attribute to expose its
        # methods to JS. A public `window_controller` makes it walk the entire
        # WinForms/WebView2 COM object graph — hanging the window for ~20s with
        # "maximum recursion depth exceeded" errors. The leading `_` makes
        # get_functions skip them (it ignores names starting with `_`).
        self._lcu = lcu
        # Optional hook so the UI can ask to hide the window to tray.
        self._window = window_controller

    # --- Read-only state ------------------------------------------------

    def get_status(self):
        cfg = self._lcu.config or {}
        cs = cfg.get("champ_select", {}) or {}
        return {
            "connected": bool(getattr(self._lcu, "connected", False)),
            "paused": bool(self._lcu.paused),
            "webhook_configured": bool(cfg.get("webhook_url")),
            "user_id": cfg.get("user_id") or "",
            "desktop_notifications": bool(cfg.get("desktop_notifications", True)),
            "champ_select_enabled": bool(cs.get("enabled")),
            "allowed_queue_count": len(cfg.get("allowed_queue_ids", []) or []),
            "champions_loaded": len(getattr(self._lcu.champ_select, "id_to_name", {}) or {}),
            "companion_enabled": bool((cfg.get("companion", {}) or {}).get("enabled")),
            "companion_running": companion.is_running(),
            "companion_clients": companion.client_count(),
            "version": __version__,
        }

    def get_config(self):
        return _normalize_config(self._lcu.config or {})

    def get_queue_map(self):
        return [{"id": qid, "name": name} for qid, name in config.QUEUE_ID_MAP.items()]

    def get_roles(self):
        return [
            {"key": r, "label": champ_select.ROLE_LABELS.get(r, r.title())}
            for r in champ_select.ROLES
        ]

    def get_champion_catalog(self):
        """Bundled champion catalog [{id, name, alias}] read from the manifest.

        Read via Python (not a JS fetch) because WebView2 blocks fetch() of
        local files under file://. Falls back to the live client if the bundled
        assets are missing.
        """
        try:
            with open(_manifest_path(), "r", encoding="utf-8") as f:
                champs = json.load(f).get("champions", [])
                if champs:
                    return champs
        except Exception:
            pass
        return self.get_champions()

    def get_champions(self):
        """Fallback champion catalog [{id, name}] from the live client.

        The UI normally loads the bundled manifest.json instead; this only
        matters if those assets are missing.
        """
        id_to_name = getattr(self._lcu.champ_select, "id_to_name", {}) or {}
        champs = [{"id": cid, "name": name} for cid, name in id_to_name.items() if name]
        champs.sort(key=lambda c: c["name"])
        return champs

    def get_events(self, after_id=0):
        try:
            after_id = int(after_id)
        except (TypeError, ValueError):
            after_id = 0
        return {"latest": events.latest_id(), "events": events.get_since(after_id)}

    def get_companion_info(self):
        """Connection details for the LAN phone companion so the UI can show a
        URL + QR code. `running` reflects the live server thread; `enabled`/`port`
        come from the saved config."""
        cfg = self._lcu.config or {}
        comp = _normalize_companion(cfg.get("companion"))
        port = companion.bound_port() or comp["port"]
        ip = companion.get_lan_ip()
        url = f"http://{ip}:{port}"
        return {
            "enabled": comp["enabled"],
            "port": port,
            "lan_ip": ip,
            "url": url,
            "running": companion.is_running(),
            "qr": companion.qr_data_uri(url),
        }

    # --- Mutations ------------------------------------------------------

    def save_config(self, new_config):
        cfg = _normalize_config(new_config)
        try:
            with open(config.CONFIG_FILE, "w") as f:
                json.dump(cfg, f, indent=4)
        except Exception as e:
            events.push(f"Failed to save settings: {e}", "danger")
            return {"ok": False, "error": str(e)}

        # Hot-apply to the running connector — no restart required.
        self._lcu.config = cfg
        events.push("Settings saved", "success")
        return {"ok": True, "config": cfg}

    def set_paused(self, paused):
        self._lcu.paused = bool(paused)
        events.push(
            "Monitoring paused" if self._lcu.paused else "Monitoring resumed",
            "warning" if self._lcu.paused else "success",
        )
        return self._lcu.paused

    def test_discord(self, webhook_url=None, user_id=None):
        """Send a test message to the given webhook (so users can test what
        they've typed before saving), falling back to the saved config.
        Returns {ok, error?} so the UI can show inline ✓/✗."""
        cfg = self._lcu.config or {}
        webhook_url = (webhook_url or cfg.get("webhook_url") or "").strip()
        user_id = (user_id or cfg.get("user_id") or "").strip()
        ok, err = send_discord_test(webhook_url, user_id)
        if ok:
            events.push("Discord test message sent", "success")
        else:
            events.push(f"Discord test failed: {err}", "warning")
        return {"ok": ok, "error": err}

    def test_companion(self):
        """Fire a synthetic queue-pop so a connected phone alarms — lets users
        confirm their companion setup without waiting for a real queue."""
        events.push("Test phone alert", "danger", kind="queue_pop")
        return {"ok": True, "running": companion.is_running()}

    def pick_sound_file(self):
        """Open a native file picker for a custom alarm sound. Returns
        {ok, path?, name?}."""
        if not self._window:
            return {"ok": False}
        try:
            import webview
            result = self._window.create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=("Audio Files (*.mp3;*.ogg;*.wav;*.m4a)", "All files (*.*)"),
            )
            if result:
                path = result[0]
                return {"ok": True, "path": path, "name": os.path.basename(path)}
        except Exception as e:
            events.push(f"Could not open file picker: {e}", "warning")
        return {"ok": False}

    def open_external(self, url):
        """Open a URL in the user's default browser (not inside the WebView)."""
        try:
            import webbrowser
            webbrowser.open(str(url))
            return True
        except Exception:
            return False

    def hide_window(self):
        if self._window:
            self._window.hide()
        return True
