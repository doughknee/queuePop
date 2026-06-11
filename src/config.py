import json
import os
import sys
from rich.console import Console
from rich.theme import Theme

# Console output must never crash the app: with stdout redirected to a pipe or
# file, Windows defaults to cp1252, which can't encode the emoji we print — and
# a UnicodeEncodeError inside an async event handler silently kills it (e.g.
# the connected handler died before setting connected=True, leaving the UI
# stuck on "searching"). Force UTF-8 and replace anything unencodable.
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass

# Ensure we find config.json relative to this script, not the CWD
if getattr(sys, 'frozen', False):
    # If frozen (compiled), store config next to the executable
    BASE_DIR = os.path.dirname(sys.executable)
else:
    # If running from source, store config next to the script
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_FILE = os.path.join(BASE_DIR, "config.json")

# --- RICH THEME SETUP ---
custom_theme = Theme({
    "info": "cyan",
    "success": "bold green",
    "warning": "bold yellow",
    "danger": "bold red",
    "highlight": "bold magenta"
})
# Defer initialization until we are sure we have a valid output stream
console = None

def init_console():
    """Initializes the Rich console object. Must be called after AllocConsole."""
    global console
    console = Console(theme=custom_theme, force_terminal=True)

# Queue ID Translation Map
QUEUE_ID_MAP = {
    1090: "TFT Normal", 1100: "TFT Ranked", 1130: "TFT Hyper Roll",
    1160: "TFT Double Up", 420: "Ranked Solo/Duo", 440: "Ranked Flex",
    400: "Draft Pick", 430: "Blind Pick", 450: "ARAM", 1700: "Arena",
    1220: "Tocker's Trials", 2400: "ARAM Mayhem"
}

def default_config():
    """Returns a fresh default configuration dict."""
    return {
        "webhook_url": "",
        "user_id": "",
        "desktop_notifications": True,
        "allowed_queue_ids": [],
        # Queue ids shown in the PLAY dropdown (order = display order).
        "favorite_queue_ids": [],
        # Most recently started queue, for the PLAY dropdown's "play again".
        "last_queue_id": None,
        # Pin the last-played mode to the top of the PLAY dropdown.
        "show_last_queue": True,
        "companion": {
            "enabled": False,
            "port": 8420,
            "sound": "chime",
            "sound_file": "",
        },
        "champ_select": {
            "enabled": False,
            # Lock our pick the instant it's our turn. When False, hold the hover
            # and lock `lock_in_at_seconds` before the ~30s pick window ends.
            "instant_lock": True,
            "lock_in_at_seconds": 1,
            # Picks/bans are the per-role lists. Everything else (summoner spells,
            # rune page, skin) lives in a per-(role, champion) loadout so the same
            # champ can run different setups by role:
            #   loadouts: {championId: {spells:[id,id],
            #                           rune:"off"|"recommended"|pageId,
            #                           skin:"off"|skinId|[skinId, …]}}
            "roles": {
                "top": {"bans": [], "picks": [], "loadouts": {}},
                "jungle": {"bans": [], "picks": [], "loadouts": {}},
                "middle": {"bans": [], "picks": [], "loadouts": {}},
                "bottom": {"bans": [], "picks": [], "loadouts": {}},
                "utility": {"bans": [], "picks": [], "loadouts": {}},
                # ARAM has no assigned role; its picks list doubles as the
                # bench-swap + trade priority order. Bans unused (no ARAM bans).
                "aram": {"bans": [], "picks": [], "loadouts": {}},
            },
            # Auto-trade champions with teammates: request a trade for a higher-
            # priority pick, and accept incoming offers that are an upgrade.
            "trades": {"enabled": False},
            # ARAM automation: pick the best of the offered 2-3 champs at the
            # start, then keep grabbing upgrades off the reroll bench. `mode`
            # sets what "best" means (see champ_select.ARAM_MODES): the
            # hand-built roles.aram.picks list, highest mastery, lowest mastery
            # (learn new champs), or a per-session random shuffle. Non-list
            # modes disable the ARAM editor tab. `auto_mastery` is the legacy
            # pre-mode flag, kept for configs written by older builds.
            "aram": {"enabled": False, "mode": "highest", "auto_mastery": False},
        },
    }


def load_or_create_config():
    """
    Loads configuration from config.json. If it's missing or corrupt, writes a
    fresh default and returns it, the user configures via the app window rather
    than a blocking wizard.
    """
    # Ensure console is initialized if it hasn't been already (fallback)
    if console is None:
        init_console()

    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            console.print("[danger]Config file is corrupted. Recreating defaults...[/]")

    cfg = default_config()
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(cfg, f, indent=4)
    except Exception as e:
        console.print(f"[warning]Could not write default config: {e}[/]")
    return cfg
