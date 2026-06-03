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
import events
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
        "champ_select": _normalize_champ_select(data.get("champ_select")),
    }


class Api:
    """Methods on this object are callable from JS as pywebview.api.<name>()."""

    def __init__(self, lcu, window_controller=None):
        self.lcu = lcu
        # Optional hook so the UI can ask to hide the window to tray.
        self.window_controller = window_controller

    # --- Read-only state ------------------------------------------------

    def get_status(self):
        cfg = self.lcu.config or {}
        cs = cfg.get("champ_select", {}) or {}
        return {
            "connected": bool(getattr(self.lcu, "connected", False)),
            "paused": bool(self.lcu.paused),
            "webhook_configured": bool(cfg.get("webhook_url")),
            "user_id": cfg.get("user_id") or "",
            "desktop_notifications": bool(cfg.get("desktop_notifications", True)),
            "champ_select_enabled": bool(cs.get("enabled")),
            "allowed_queue_count": len(cfg.get("allowed_queue_ids", []) or []),
            "champions_loaded": len(getattr(self.lcu.champ_select, "id_to_name", {}) or {}),
            "version": __version__,
        }

    def get_config(self):
        return _normalize_config(self.lcu.config or {})

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
        id_to_name = getattr(self.lcu.champ_select, "id_to_name", {}) or {}
        champs = [{"id": cid, "name": name} for cid, name in id_to_name.items() if name]
        champs.sort(key=lambda c: c["name"])
        return champs

    def get_events(self, after_id=0):
        try:
            after_id = int(after_id)
        except (TypeError, ValueError):
            after_id = 0
        return {"latest": events.latest_id(), "events": events.get_since(after_id)}

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
        self.lcu.config = cfg
        events.push("Settings saved", "success")
        return {"ok": True, "config": cfg}

    def set_paused(self, paused):
        self.lcu.paused = bool(paused)
        events.push(
            "Monitoring paused" if self.lcu.paused else "Monitoring resumed",
            "warning" if self.lcu.paused else "success",
        )
        return self.lcu.paused

    def hide_window(self):
        if self.window_controller:
            self.window_controller.hide()
        return True
