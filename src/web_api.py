"""
Bridge object exposed to the web UI via pywebview's `js_api`.

The frontend calls these methods as `pywebview.api.<method>(...)` and receives
the (JSON-serializable) return values as resolved Promises. All config shaping
mirrors the normalization that the old Tkinter settings window performed, so a
config saved from the web UI is byte-identical to one saved from the legacy GUI.
"""

import base64
import json
import os
import subprocess
import sys
from urllib.parse import quote

import config
import champ_select
import companion
import events
from notifications import send_discord_test
from _version import __version__


# Sections in the PLAY dropdown, in display order. The "favorites" section is
# rendered separately (pinned, reserved) and isn't listed here.
QUEUE_GROUPS = [
    {"key": "rift", "label": "Summoner's Rift"},
    {"key": "aram", "label": "ARAM"},
    {"key": "featured", "label": "Featured"},
    {"key": "tft", "label": "Teamfight Tactics"},
]

# Queues offered in the PLAY quick-queue picker, grouped by `group` (one of the
# QUEUE_GROUPS keys). Every entry creates a lobby + starts matchmaking through
# the same /lol-lobby endpoints, TFT included. `ranked` just drives a badge.
QUICK_QUEUES = [
    # Summoner's Rift
    {"id": 400, "name": "Draft Pick", "group": "rift"},
    {"id": 430, "name": "Blind Pick", "group": "rift"},
    {"id": 490, "name": "Quickplay", "group": "rift"},
    {"id": 420, "name": "Ranked Solo/Duo", "group": "rift", "ranked": True},
    {"id": 440, "name": "Ranked Flex", "group": "rift", "ranked": True},
    # ARAM
    {"id": 450, "name": "ARAM", "group": "aram"},
    # Featured / rotating
    {"id": 1700, "name": "Arena", "group": "featured"},
    # Teamfight Tactics
    {"id": 1090, "name": "TFT Normal", "group": "tft"},
    {"id": 1100, "name": "TFT Ranked", "group": "tft", "ranked": True},
    {"id": 1130, "name": "TFT Hyper Roll", "group": "tft"},
    {"id": 1160, "name": "TFT Double Up", "group": "tft"},
    {"id": 1220, "name": "Tocker's Trials", "group": "tft"},
]

# LCU region code -> op.gg region slug. The client reports either short codes
# (NA, EUW) or platform ids (NA1, EUW1); cover both.
_OPGG_REGION = {
    "NA": "na", "NA1": "na", "EUW": "euw", "EUW1": "euw",
    "EUNE": "eune", "EUN1": "eune", "KR": "kr", "BR": "br", "BR1": "br",
    "JP": "jp", "JP1": "jp", "OCE": "oce", "OC1": "oce",
    "LAN": "lan", "LA1": "lan", "LAS": "las", "LA2": "las",
    "TR": "tr", "TR1": "tr", "RU": "ru", "PH": "ph", "PH2": "ph",
    "SG": "sg", "SG2": "sg", "TH": "th", "TH2": "th", "TW": "tw", "TW2": "tw",
    "VN": "vn", "VN2": "vn", "ME": "me", "ME1": "me",
}


def _opgg_region(region):
    r = (region or "").upper().strip()
    return _OPGG_REGION.get(r, r.lower())


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


def _clean_spells(val):
    """Coerce a role's summoner-spell list to at most two valid, distinct LCU
    spell ids. Junk/unknown ids are dropped; order is preserved (slot 1, slot 2)."""
    out = []
    for s in (val or [])[:2]:
        try:
            s = int(s)
        except (TypeError, ValueError):
            continue
        if s in champ_select.SPELL_IDS and s not in out:
            out.append(s)
    return out


def _normalize_champ_select(cs):
    cs = cs or {}
    roles_in = cs.get("roles", {}) or {}
    roles = {}
    for role in champ_select.ROLES:
        rc = roles_in.get(role, {}) or {}
        roles[role] = {
            "bans": _text_to_list(rc.get("bans")),
            "picks": _text_to_list(rc.get("picks")),
            "spells": _clean_spells(rc.get("spells")),
        }
    try:
        lock = int(cs.get("lock_in_at_seconds", champ_select.DEFAULT_LOCK_SECONDS))
    except (TypeError, ValueError):
        lock = champ_select.DEFAULT_LOCK_SECONDS
    return {
        "enabled": bool(cs.get("enabled", False)),
        "lock_in_at_seconds": max(0, lock),
        "auto_runes": bool(cs.get("auto_runes", False)),
        "roles": roles,
    }


ALARM_SOUNDS = {"chime", "ping", "arcade", "siren", "custom"}

# Floor for the custom frameless resize grips; mirrors main.py's min_size so the
# JS chrome and the Python safety-net clamp agree.
MIN_WINDOW_SIZE = (620, 700)


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


def _clean_queue_ids(ids, keep_order=False):
    """Coerce a list of (possibly stringy) queue ids to ints, dropping junk.
    `keep_order` preserves insertion order and de-dupes (favorites); otherwise
    the ids are sorted into a set (allowed_queue_ids)."""
    clean = []
    for q in ids or []:
        try:
            q = int(q)
        except (TypeError, ValueError):
            continue
        if keep_order:
            if q not in clean:
                clean.append(q)
        else:
            clean.append(q)
    return clean if keep_order else sorted(set(clean))


def _normalize_config(data):
    data = data or {}
    return {
        "webhook_url": (data.get("webhook_url") or "").strip(),
        "user_id": (data.get("user_id") or "").strip(),
        "desktop_notifications": bool(data.get("desktop_notifications", True)),
        "allowed_queue_ids": _clean_queue_ids(data.get("allowed_queue_ids")),
        # Order matters here — it's the display order of pinned queues.
        "favorite_queue_ids": _clean_queue_ids(
            data.get("favorite_queue_ids"), keep_order=True
        ),
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
        # Tracks the frameless title bar's maximize/restore toggle (the window
        # backend has no "is maximized" query, so we own the bit).
        self._maximized = False
        # profileIconId -> data: URI, so the summoner badge doesn't re-proxy the
        # same image from the LCU on every poll.
        self._icon_cache = {}

    # --- Read-only state ------------------------------------------------

    def get_status(self):
        cfg = self._lcu.config or {}
        cs = cfg.get("champ_select", {}) or {}
        return {
            "connected": bool(getattr(self._lcu, "connected", False)),
            "gameflow_phase": getattr(self._lcu, "gameflow_phase", None),
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

    def get_summoner_spells(self):
        """Summoner spells [{id, name}] for the per-role spell pickers."""
        return [dict(s) for s in champ_select.SUMMONER_SPELLS]

    def get_champion_mastery(self):
        """Full champion-mastery list for the live player, used to sort and
        annotate the champ-select grid: [{championId, level, points,
        lastPlayTime}]. Empty list when the client isn't connected."""

        async def _fetch(conn):
            r = await conn.request(
                "get", "/lol-champion-mastery/v1/local-player/champion-mastery"
            )
            if r.status != 200:
                return []
            data = await r.json()
            if isinstance(data, dict):
                data = data.get("championMasteryList") or []
            out = []
            for m in data:
                cid = m.get("championId")
                if not cid:
                    continue
                out.append(
                    {
                        "championId": cid,
                        "level": m.get("championLevel"),
                        "points": m.get("championPoints", 0),
                        "lastPlayTime": m.get("lastPlayTime", 0),
                    }
                )
            return out

        return self._lcu.call(_fetch, timeout=8.0) or []

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
        # The Settings form doesn't carry favorites; don't let saving it wipe
        # the pinned-queue list (managed separately via set_favorites()).
        if "favorite_queue_ids" not in (new_config or {}):
            cfg["favorite_queue_ids"] = _clean_queue_ids(
                (self._lcu.config or {}).get("favorite_queue_ids"), keep_order=True
            )
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

    # --- Frameless window chrome (custom League-themed title bar) --------
    # The window is created frameless (see main.py), so the web UI draws its own
    # title bar and drives these from src/webui/window-chrome.js.

    def minimize_window(self):
        if self._window:
            try:
                self._window.minimize()
            except Exception:
                pass
        return True

    def toggle_maximize_window(self):
        """Toggle between maximized and normal. Returns True if now maximized."""
        if not self._window:
            return False
        self._maximized = not self._maximized
        try:
            if self._maximized:
                self._window.maximize()
            else:
                self._window.restore()
        except Exception:
            # Roll the bit back if the backend call failed so the icon stays honest.
            self._maximized = not self._maximized
        return self._maximized

    def resize_window(self, width, height, edge="se"):
        """Resize a frameless window from a dragged edge/corner, keeping the
        opposite side pinned. `edge` is any mix of n/s/e/w (e.g. 'se', 'nw')."""
        if not self._window:
            return False
        try:
            from webview.window import FixPoint

            min_w, min_h = MIN_WINDOW_SIZE
            w = max(min_w, int(width))
            h = max(min_h, int(height))
            e = (edge or "se").lower()
            # Pin the edge opposite the one under the cursor.
            fix = (FixPoint.EAST if "w" in e else FixPoint.WEST) | (
                FixPoint.SOUTH if "n" in e else FixPoint.NORTH
            )
            self._window.resize(w, h, fix)
        except Exception:
            return False
        return True

    # --- Live client controls (PLAY / summoner) -------------------------
    # These talk to the running League client on demand via the LCU. Each
    # degrades gracefully (returns "not connected" / empty) when the client
    # isn't up, so the UI can stay quiet rather than error.

    def launch_league(self):
        """Start the League client through the Riot Client. Used by PLAY when no
        client is running. Returns {ok, error?}."""
        try:
            program_data = os.environ.get("ProgramData", r"C:\ProgramData")
            installs = os.path.join(program_data, "Riot Games", "RiotClientInstalls.json")
            rc = None
            if os.path.isfile(installs):
                with open(installs, "r", encoding="utf-8") as f:
                    data = json.load(f)
                rc = data.get("rc_live") or data.get("rc_default")
            if not rc or not os.path.isfile(rc):
                return {"ok": False, "error": "Riot Client not found"}
            subprocess.Popen(
                [rc, "--launch-product=league_of_legends", "--launch-patchline=live"]
            )
            events.push("Launching League client…", "info")
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    def get_quick_queues(self):
        """Everything the PLAY dropdown needs in one call: the grouped queue
        list, the section order/labels, and the user's pinned favorites."""
        cfg = self._lcu.config or {}
        return {
            "queues": [dict(q) for q in QUICK_QUEUES],
            "groups": [dict(g) for g in QUEUE_GROUPS],
            "favorites": _clean_queue_ids(
                cfg.get("favorite_queue_ids"), keep_order=True
            ),
        }

    def set_favorites(self, ids):
        """Persist the pinned-queue list (order preserved). Saved quietly — no
        activity-feed noise — since users may toggle stars rapidly."""
        valid = {q["id"] for q in QUICK_QUEUES}
        favorites = [q for q in _clean_queue_ids(ids, keep_order=True) if q in valid]
        cfg = dict(self._lcu.config or {})
        cfg["favorite_queue_ids"] = favorites
        cfg = _normalize_config(cfg)
        try:
            with open(config.CONFIG_FILE, "w") as f:
                json.dump(cfg, f, indent=4)
        except Exception as e:
            return {"ok": False, "error": str(e)}
        self._lcu.config = cfg
        return {"ok": True, "favorites": favorites}

    def start_queue(self, queue_id):
        """Create (or replace) a lobby for queue_id and start matchmaking."""
        try:
            qid = int(queue_id)
        except (TypeError, ValueError):
            return {"ok": False, "error": "Invalid queue"}

        async def _start(conn):
            r = await conn.request("post", "/lol-lobby/v2/lobby", data={"queueId": qid})
            if r.status not in (200, 201, 204):
                return {"ok": False, "error": f"Lobby error ({r.status})"}
            s = await conn.request("post", "/lol-lobby/v2/lobby/matchmaking/search")
            if s.status not in (200, 204):
                return {"ok": False, "error": f"Search error ({s.status})"}
            return {"ok": True}

        res = self._lcu.call(_start, timeout=8.0)
        if not res:
            return {"ok": False, "error": "Client not connected"}
        if res.get("ok"):
            name = config.QUEUE_ID_MAP.get(qid, f"queue {qid}")
            events.push(f"Queue started: {name}", "success")
        return res

    def cancel_queue(self):
        """Stop searching for a match."""
        async def _cancel(conn):
            r = await conn.request("delete", "/lol-lobby/v2/lobby/matchmaking/search")
            return {"ok": r.status in (200, 204)}

        res = self._lcu.call(_cancel, timeout=6.0)
        if res and res.get("ok"):
            events.push("Matchmaking canceled", "warning")
        return res or {"ok": False, "error": "Client not connected"}

    def get_summoner(self):
        """Current summoner for the header badge: name, level, profile-icon (as a
        data URI proxied from the LCU), and an op.gg link. {connected: False}
        when no client is up."""

        async def _fetch(conn):
            r = await conn.request("get", "/lol-summoner/v1/current-summoner")
            if r.status != 200:
                return None
            s = await r.json()
            out = {
                "name": s.get("gameName") or s.get("displayName") or "",
                "tag": s.get("tagLine") or "",
                "level": s.get("summonerLevel"),
                "icon_id": s.get("profileIconId"),
                "region": "",
            }
            try:
                rr = await conn.request("get", "/riotclient/region-locale")
                if rr.status == 200:
                    out["region"] = (await rr.json()).get("region", "") or ""
            except Exception:
                pass

            # Ranked (Solo + Flex) for the badge + dashboard profile. Best-effort.
            out["ranked"] = {}
            try:
                rk = await conn.request("get", "/lol-ranked/v1/current-ranked-stats")
                if rk.status == 200:
                    qm = (await rk.json()).get("queueMap", {}) or {}

                    def _entry(key):
                        e = qm.get(key) or {}
                        tier = (e.get("tier") or "").strip()
                        if not tier or tier.upper() in ("NONE", "UNRANKED"):
                            return None
                        return {
                            "tier": tier,
                            "division": e.get("division") or "",
                            "lp": e.get("leaguePoints", 0),
                            "wins": e.get("wins", 0),
                            "losses": e.get("losses", 0),
                        }

                    out["ranked"] = {
                        "solo": _entry("RANKED_SOLO_5x5"),
                        "flex": _entry("RANKED_FLEX_SR"),
                        "tft": _entry("RANKED_TFT"),
                        "double_up": _entry("RANKED_TFT_DOUBLE_UP"),
                    }
            except Exception:
                pass

            # Top-3 champion mastery for the dashboard profile. Best-effort.
            out["mastery"] = []
            try:
                mr = await conn.request(
                    "get",
                    "/lol-champion-mastery/v1/local-player/champion-mastery/top?limit=3",
                )
                if mr.status != 200:
                    mr = await conn.request(
                        "get", "/lol-champion-mastery/v1/local-player/champion-mastery"
                    )
                if mr.status == 200:
                    md = await mr.json()
                    if isinstance(md, dict):
                        md = md.get("championMasteryList") or []
                    md = sorted(
                        md, key=lambda m: m.get("championPoints", 0), reverse=True
                    )[:3]
                    out["mastery"] = [
                        {
                            "championId": m.get("championId"),
                            "level": m.get("championLevel"),
                            "points": m.get("championPoints", 0),
                        }
                        for m in md
                        if m.get("championId")
                    ]
            except Exception:
                pass

            # Proxy the profile icon (cache by id — it rarely changes).
            icon_id = out["icon_id"]
            if icon_id is not None and icon_id not in self._icon_cache:
                try:
                    ir = await conn.request(
                        "get", f"/lol-game-data/assets/v1/profile-icons/{icon_id}.jpg"
                    )
                    if ir.status == 200:
                        raw = await ir.read()
                        self._icon_cache[icon_id] = (
                            "data:image/jpeg;base64,"
                            + base64.b64encode(raw).decode("ascii")
                        )
                except Exception:
                    pass
            return out

        data = self._lcu.call(_fetch, timeout=8.0)
        if not data:
            return {"connected": False}

        name = data.get("name") or ""
        tag = data.get("tag") or ""
        region = _opgg_region(data.get("region") or "")
        opgg = ""
        if name and region:
            riot_id = quote(f"{name}-{tag}") if tag else quote(name)
            opgg = f"https://www.op.gg/summoners/{region}/{riot_id}"
        return {
            "connected": True,
            "name": name,
            "tag": tag,
            "level": data.get("level"),
            "icon": self._icon_cache.get(data.get("icon_id")),
            "opgg": opgg,
            "ranked": data.get("ranked") or {},
            "mastery": data.get("mastery") or [],
        }
