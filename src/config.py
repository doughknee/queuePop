import json
import os
import sys
from rich.console import Console
from rich.theme import Theme
from rich.panel import Panel
from rich.prompt import Prompt

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
    1220: "Tocker's Trials"
}

def default_config():
    """Returns a fresh default configuration dict."""
    return {
        "webhook_url": "",
        "user_id": "",
        "desktop_notifications": True,
        "allowed_queue_ids": [],
        # Queue ids pinned to the top of the PLAY dropdown (order = display order).
        "favorite_queue_ids": [],
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
            #                           skin:"off"|"random"|"best"|skinId}}
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
            # Auto-grab a higher-priority champ off the ARAM reroll bench (uses
            # roles.aram.picks as the priority order).
            "aram": {"enabled": False},
        },
    }


def load_or_create_config():
    """
    Loads configuration from config.json. If it's missing or corrupt, writes a
    fresh default and returns it — the user configures via the app window rather
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

def open_settings_ui(current_config=None, on_save_callback=None):
    """
    Launches the GUI for configuration.
    """
    import gui
    
    if current_config is None:
        current_config = default_config()

    # This callback updates the in-memory config if needed, though usually the caller reloads it
    # or the app restarts. For now, we return the new config if we can, but since the GUI is blocking
    # and writes to file, we can just reload from file after it closes.
    
    gui.open_settings(current_config, on_save_callback=on_save_callback)
    
    # Reload to confirm what was saved
    if os.path.exists(CONFIG_FILE):
         with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    return current_config
