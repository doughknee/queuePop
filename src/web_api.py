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


# LCU region code -> Riot platform id (na1, euw1, …). Some tracker sites key off
# the platform id rather than the short region slug.
_PLATFORM = {
    "NA": "na1", "NA1": "na1", "EUW": "euw1", "EUW1": "euw1",
    "EUNE": "eun1", "EUN1": "eun1", "KR": "kr", "BR": "br1", "BR1": "br1",
    "JP": "jp1", "JP1": "jp1", "OCE": "oc1", "OC1": "oc1",
    "LAN": "la1", "LA1": "la1", "LAS": "la2", "LA2": "la2",
    "TR": "tr1", "TR1": "tr1", "RU": "ru", "PH": "ph2", "PH2": "ph2",
    "SG": "sg2", "SG2": "sg2", "TH": "th2", "TH2": "th2", "TW": "tw2", "TW2": "tw2",
    "VN": "vn2", "VN2": "vn2", "ME": "me1", "ME1": "me1",
}


def _platform(region):
    r = (region or "").upper().strip()
    return _PLATFORM.get(r, r.lower())


def external_profile_links(name, tag, region, platform):
    """Region-aware links to the player's profile on the major LoL tracker sites,
    built from the Riot ID. Best-effort URL shapes — broken links degrade to the
    site's search, and formats are easy to tweak here in one place."""
    if not name:
        return []
    riot = quote(f"{name}-{tag}" if tag else name)
    r = region or ""
    p = platform or region or ""
    return [
        {"name": "OP.GG", "url": f"https://op.gg/summoners/{r}/{riot}"},
        {"name": "U.GG", "url": f"https://u.gg/lol/profile/{p}/{riot}/overview"},
        {"name": "League of Graphs", "url": f"https://www.leagueofgraphs.com/summoner/{r}/{riot}"},
        {"name": "Lolalytics", "url": f"https://lolalytics.com/summoner/{r}/{riot}/"},
        {"name": "DeepLoL", "url": f"https://www.deeplol.gg/summoner/{r}/{riot}"},
        {"name": "Porofessor", "url": f"https://porofessor.gg/live/{r}/{riot}"},
        {"name": "Mobalytics", "url": f"https://mobalytics.gg/lol/profile/{r}/{riot}/overview"},
        {"name": "Blitz", "url": f"https://blitz.gg/lol/profile/{r}/{riot}"},
    ]


def _assets_base():
    """Base dir of the bundled web UI assets (dev and frozen builds)."""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, "webui", "assets")


def _manifest_path():
    """Path to the bundled champion manifest (dev and frozen builds)."""
    return os.path.join(_assets_base(), "champions", "manifest.json")


def _skins_manifest_path():
    """Path to the bundled skins manifest (built by scripts/fetch_assets.py)."""
    return os.path.join(_assets_base(), "skins", "manifest.json")


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


def _clean_loadout(lo):
    """Normalize one per-champ loadout: {spells:[id,id], rune, skin}.
      rune: "off" | "recommended" | <pageId int>
      skin: "off" | <skinId int> (pick one) | [skinId, …] (random favorite)
    Returns None if the loadout has nothing set (so empties aren't stored)."""
    lo = lo or {}
    spells = _clean_spells(lo.get("spells"))

    rune = lo.get("rune", "off")
    if rune not in ("off", "recommended"):
        try:
            rune = int(rune)
        except (TypeError, ValueError):
            rune = "off"

    skin = lo.get("skin", "off")
    if isinstance(skin, list):
        # "Random favorite": a list of skin ids; drop junk + dupes, preserve order.
        ids = []
        for x in skin:
            try:
                x = int(x)
            except (TypeError, ValueError):
                continue
            if x > 0 and x not in ids:
                ids.append(x)
        skin = ids or "off"
    elif skin != "off":
        # "Pick a skin": a single skin id (0 / junk ⇒ unset).
        try:
            x = int(skin)
        except (TypeError, ValueError):
            x = 0
        skin = x if x > 0 else "off"

    if not spells and rune == "off" and skin == "off":
        return None
    return {"spells": spells, "rune": rune, "skin": skin}


def _clean_loadouts(val):
    """Coerce a role's loadouts map ({championId: loadout}) to a clean map,
    dropping junk keys and empty loadouts."""
    out = {}
    for cid, lo in (val or {}).items():
        try:
            cid = int(cid)
        except (TypeError, ValueError):
            continue
        clean = _clean_loadout(lo)
        if clean is not None:
            out[str(cid)] = clean
    return out


def _normalize_champ_select(cs):
    cs = cs or {}
    roles_in = cs.get("roles", {}) or {}
    roles = {}
    for role in champ_select.EDITOR_ROLES:
        rc = roles_in.get(role, {}) or {}
        roles[role] = {
            "bans": _text_to_list(rc.get("bans")),
            "picks": _text_to_list(rc.get("picks")),
            "loadouts": _clean_loadouts(rc.get("loadouts")),
        }
    try:
        lock = int(cs.get("lock_in_at_seconds", champ_select.DEFAULT_LOCK_SECONDS))
    except (TypeError, ValueError):
        lock = champ_select.DEFAULT_LOCK_SECONDS
    return {
        "enabled": bool(cs.get("enabled", False)),
        "instant_lock": bool(cs.get("instant_lock", True)),
        "lock_in_at_seconds": max(0, lock),
        "roles": roles,
        "trades": {"enabled": bool((cs.get("trades", {}) or {}).get("enabled", False))},
        "aram": {"enabled": bool((cs.get("aram", {}) or {}).get("enabled", False))},
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
        # Lazily-loaded bundled skins catalog: {championId(str): [{id,name,…}]}.
        self._skins_catalog = None

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
            for r in champ_select.EDITOR_ROLES
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

    def get_match_history(self, count=10):
        """Recent matches for the local player: [{championId, win, kills, deaths,
        assists, queueId, ts}], newest first. Best-effort — empty when the client
        is closed or match history isn't reachable."""
        try:
            count = max(1, min(int(count), 20))
        except (TypeError, ValueError):
            count = 10

        async def _fetch(conn):
            # Our puuid lets us pick our participant out of each game.
            puuid = None
            try:
                sr = await conn.request("get", "/lol-summoner/v1/current-summoner")
                if sr.status == 200:
                    puuid = (await sr.json()).get("puuid")
            except Exception:
                pass
            r = await conn.request(
                "get",
                "/lol-match-history/v1/products/lol/current-summoner/matches"
                f"?begIndex=0&endIndex={count - 1}",
            )
            if r.status != 200:
                return []
            data = await r.json()
            games = (
                ((data.get("games") or {}).get("games") or [])
                if isinstance(data, dict)
                else []
            )
            out = []
            for g in games:
                parts = g.get("participants") or []
                idents = g.get("participantIdentities") or []
                pid = None
                if puuid:
                    for it in idents:
                        if (it.get("player") or {}).get("puuid") == puuid:
                            pid = it.get("participantId")
                            break
                part = None
                if pid is not None:
                    part = next(
                        (p for p in parts if p.get("participantId") == pid), None
                    )
                if part is None and len(parts) == 1:
                    part = parts[0]  # endpoint sometimes returns only our participant
                if part is None:
                    continue
                st = part.get("stats") or {}
                out.append({
                    "championId": part.get("championId"),
                    "win": bool(st.get("win")),
                    "kills": st.get("kills", 0),
                    "deaths": st.get("deaths", 0),
                    "assists": st.get("assists", 0),
                    "queueId": g.get("queueId"),
                    "ts": (g.get("gameCreation") or 0) / 1000.0,
                })
            return out

        return self._lcu.call(_fetch, timeout=8.0) or []

    def get_champ_select(self):
        """Live, read-only champ-select snapshot for the dashboard takeover:
        both teams (role, hovered intent, locked champ, spells, skin), bans,
        pending trades, and the ARAM bench. Returns {active: False} when the
        client isn't connected or we're not in champ select. Champ icons are
        rendered client-side from the bundled assets, so this stays lightweight.
        """

        async def _fetch(conn):
            r = await conn.request("get", "/lol-champ-select/v1/session")
            if r.status != 200:
                return {"active": False}
            session = await r.json()

            cs = self._lcu.champ_select
            if not getattr(cs, "id_to_name", None):
                await cs.load_champion_data(conn)
            id_to_name = getattr(cs, "id_to_name", {}) or {}

            def nm(cid):
                cid = cid or 0
                return id_to_name.get(cid, "") if cid > 0 else ""

            local_cell = session.get("localPlayerCellId")

            def player(p):
                cid = p.get("championId") or 0
                intent = p.get("championPickIntent") or 0
                return {
                    "cellId": p.get("cellId"),
                    "championId": cid,
                    "name": nm(cid),
                    "position": (p.get("assignedPosition") or "").lower(),
                    "intent": intent,
                    "intentName": nm(intent),
                    "spell1Id": p.get("spell1Id") or 0,
                    "spell2Id": p.get("spell2Id") or 0,
                    "skinId": p.get("selectedSkinId") or 0,
                    "isLocal": p.get("cellId") == local_cell,
                }

            my_team = [player(p) for p in (session.get("myTeam") or [])]
            their_team = [player(p) for p in (session.get("theirTeam") or [])]

            # Bans: prefer the session's own tally, fall back to completed ban
            # actions if the client didn't populate it.
            bans = session.get("bans") or {}
            my_bans = list(bans.get("myTeamBans") or [])
            their_bans = list(bans.get("theirTeamBans") or [])
            if not my_bans and not their_bans:
                my_cells = {p["cellId"] for p in my_team}
                for rnd in session.get("actions", []) or []:
                    for a in rnd:
                        if a.get("type") == "ban" and a.get("completed"):
                            bid = a.get("championId") or 0
                            if bid <= 0:
                                continue
                            (my_bans if a.get("actorCellId") in my_cells
                             else their_bans).append(bid)
            ban_view = {
                "my": [{"championId": b, "name": nm(b)} for b in my_bans if b > 0],
                "their": [{"championId": b, "name": nm(b)} for b in their_bans if b > 0],
            }

            # Trades are with our own team; resolve each cell's champ for display.
            cell_champ = {p["cellId"]: p["championId"] for p in my_team}
            trades = []
            for t in session.get("trades") or []:
                state = t.get("state") or ""
                if state in ("", "INVALID"):
                    continue
                cell = t.get("cellId")
                cid = cell_champ.get(cell, 0)
                trades.append({
                    "id": t.get("id"), "cellId": cell, "state": state,
                    "championId": cid, "name": nm(cid),
                })

            # Bench (ARAM): handle both the new object list and the old id list.
            bench_ids = []
            for b in session.get("benchChampions") or []:
                bid = b.get("championId") if isinstance(b, dict) else b
                if bid:
                    bench_ids.append(bid)
            if not bench_ids:
                bench_ids = list(session.get("benchChampionIds") or [])

            timer = session.get("timer", {}) or {}
            timer_left = None
            if not timer.get("isInfinite"):
                ms = timer.get("adjustedTimeLeftInPhase")
                if isinstance(ms, (int, float)) and ms >= 0:
                    timer_left = round(ms / 1000.0, 1)

            return {
                "active": True,
                "phase": timer.get("phase"),
                "timer_left": timer_left,
                "localCellId": local_cell,
                "myTeam": my_team,
                "theirTeam": their_team,
                "bans": ban_view,
                "trades": trades,
                "bench": {
                    "enabled": bool(session.get("benchEnabled")),
                    "champions": [{"championId": b, "name": nm(b)} for b in bench_ids],
                },
            }

        return self._lcu.call(_fetch, timeout=6.0) or {"active": False}

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

    def get_champion_skins(self, champion_id):
        """Skins for a champion [{id, name, rarity, isBase}] from the bundled
        manifest, for the skin-favorites picker. Empty if the manifest is
        missing (run scripts/fetch_assets.py to generate it)."""
        try:
            champion_id = int(champion_id)
        except (TypeError, ValueError):
            return []
        if self._skins_catalog is None:
            try:
                with open(_skins_manifest_path(), "r", encoding="utf-8") as f:
                    self._skins_catalog = json.load(f).get("skins", {}) or {}
            except Exception:
                self._skins_catalog = {}
        return list(self._skins_catalog.get(str(champion_id), []))

    def get_rune_pages(self):
        """The user's own selectable rune pages [{id, name, primaryStyleId,
        subStyleId}] from the live client, for the per-champ rune picker. Excludes
        queueBot's managed recommended page. Empty when the client isn't up."""

        async def _fetch(conn):
            r = await conn.request("get", "/lol-perks/v1/pages")
            if r.status != 200:
                return []
            out = []
            for p in await r.json():
                if p.get("isValid") is False:
                    continue
                if p.get("name") == champ_select.RUNE_PAGE_NAME:
                    continue  # our auto-managed page, not a user page
                # User pages are editable/deletable; skip auto-generated ones.
                if not (p.get("isEditable", True) or p.get("isDeletable", True)):
                    continue
                out.append({
                    "id": p.get("id"),
                    "name": p.get("name") or f"Page {p.get('id')}",
                    "primaryStyleId": p.get("primaryStyleId"),
                    "subStyleId": p.get("subStyleId"),
                })
            return out

        return self._lcu.call(_fetch, timeout=6.0) or []

    def get_rune_info(self):
        """Rune-page status for the Recommended Runes settings panel:
        {pages:[{id,name}], managed:{id,name}|None, at_cap:bool}. `pages` lists
        the user's own (claimable) pages; `managed` is queueBot's dedicated page
        if it exists; `at_cap` is true when no slot is free to create one."""

        async def _fetch(conn):
            r = await conn.request("get", "/lol-perks/v1/pages")
            if r.status != 200:
                return {"pages": [], "managed": None, "at_cap": False}
            managed, pages = None, []
            for p in await r.json():
                entry = {"id": p.get("id"), "name": p.get("name") or f"Page {p.get('id')}"}
                if p.get("name") == champ_select.RUNE_PAGE_NAME:
                    managed = entry
                elif p.get("isEditable", True) or p.get("isDeletable", True):
                    pages.append(entry)
            at_cap = False
            try:
                inv = await conn.request("get", "/lol-perks/v1/inventory")
                if inv.status == 200:
                    d = await inv.json()
                    owned, mx = d.get("ownedPageCount"), d.get("maxPages")
                    if isinstance(owned, int) and isinstance(mx, int):
                        at_cap = owned >= mx
            except Exception:
                pass
            return {"pages": pages, "managed": managed, "at_cap": at_cap}

        return self._lcu.call(_fetch, timeout=6.0) or {
            "pages": [], "managed": None, "at_cap": False
        }

    def claim_rune_page(self, page_id):
        """Hand an existing rune page over to queueBot: rename it to the managed
        name (keeping its current runes) so the recommended-runes feature edits
        it from now on instead of touching the user's other pages."""

        async def _claim(conn):
            try:
                pid = int(page_id)
            except (TypeError, ValueError):
                return {"ok": False, "error": "Invalid page"}
            r = await conn.request("get", f"/lol-perks/v1/pages/{pid}")
            if r.status != 200:
                return {"ok": False, "error": f"Page not found ({r.status})"}
            pg = await r.json()
            body = {
                "name": champ_select.RUNE_PAGE_NAME,
                "primaryStyleId": pg.get("primaryStyleId"),
                "subStyleId": pg.get("subStyleId"),
                "selectedPerkIds": pg.get("selectedPerkIds") or [],
                "current": bool(pg.get("current")),
            }
            put = await conn.request("put", f"/lol-perks/v1/pages/{pid}", data=body)
            if put.status >= 400:
                return {"ok": False, "error": f"Couldn't rename page ({put.status})"}
            return {"ok": True}

        res = self._lcu.call(_claim, timeout=6.0)
        if res and res.get("ok"):
            events.push("queueBot now manages that rune page", "success", kind="runes")
        return res or {"ok": False, "error": "Client not connected"}

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

        # Hot-apply to the running connector — no restart required. Saved quietly
        # (no activity-feed event): the UI auto-saves on every change and shows a
        # toast, so pushing an event here would flood the feed.
        self._lcu.config = cfg
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
            events.push(f"Queue started: {name}", "success", kind="queue")
        return res

    def cancel_queue(self):
        """Stop searching for a match."""
        async def _cancel(conn):
            r = await conn.request("delete", "/lol-lobby/v2/lobby/matchmaking/search")
            return {"ok": r.status in (200, 204)}

        res = self._lcu.call(_cancel, timeout=6.0)
        if res and res.get("ok"):
            events.push("Matchmaking canceled", "warning", kind="queue")
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
                    "/lol-champion-mastery/v1/local-player/champion-mastery/top?limit=5",
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
                    )[:5]
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
        raw_region = data.get("region") or ""
        region = _opgg_region(raw_region)
        platform = _platform(raw_region)
        links = external_profile_links(name, tag, region, platform)
        opgg = next((l["url"] for l in links if l["name"] == "OP.GG"), "")
        return {
            "connected": True,
            "name": name,
            "tag": tag,
            "level": data.get("level"),
            "icon": self._icon_cache.get(data.get("icon_id")),
            "region": region,
            "platform": platform,
            "opgg": opgg,
            "links": links,
            "ranked": data.get("ranked") or {},
            "mastery": data.get("mastery") or [],
        }
