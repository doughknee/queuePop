import argparse
import re
import sys
import os
import threading
import ctypes

# --- PyInstaller Hooks ---
# This section is to help PyInstaller find hidden imports.
try:
    from plyer.platforms.win import notification
except ImportError:
    pass  # This will fail on other platforms, which is fine.
# --- End PyInstaller Hooks ---

import config as cfg
from lcu import LCU
from tray import TrayIcon
from _version import __version__


def webui_index():
    """Absolute path to the web UI entry point, for dev and frozen builds.

    In a frozen build we hand WebView2 a per-version boot copy whose local JS/CSS
    URLs carry a ?v=<version> cache-buster. The WebView2 profile persists across a
    self-update, so without this the relaunched build can serve the *previous*
    version's cached app.js/styles.css — showing a stale UI until a second manual
    restart. Versioned URLs guarantee a fresh build always loads fresh assets."""
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS  # PyInstaller extraction dir
    else:
        base = os.path.dirname(os.path.abspath(__file__))  # src/
    webui = os.path.join(base, "webui")
    index = os.path.join(webui, "index.html")
    if getattr(sys, 'frozen', False):
        try:
            return _versioned_index(webui, index)
        except Exception:
            pass  # any trouble: fall back to the plain index
    return index


def _versioned_index(webui_dir, index_path):
    """Write a sibling boot copy of index.html with ?v=<version> appended to its
    local .js/.css references and return its path. Lives in the same dir so the
    relative asset URLs still resolve."""
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    def bust(m):
        attr, url = m.group(1), m.group(2)
        if url.startswith(("http:", "https:", "data:", "//")):
            return m.group(0)  # leave remote/inline refs alone
        sep = "&" if "?" in url else "?"
        return f'{attr}="{url}{sep}v={__version__}"'

    html = re.sub(r'(src|href)="([^"]+\.(?:js|css))"', bust, html)
    out = os.path.join(webui_dir, f"index.boot.{__version__}.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    return out

def get_console_window():
    """Returns the handle to the console window."""
    kernel32 = ctypes.WinDLL('kernel32')
    return kernel32.GetConsoleWindow()

def ensure_console_created():
    """Allocates a console window if one doesn't exist and enables VT processing."""
    kernel32 = ctypes.WinDLL('kernel32')
    hWnd = kernel32.GetConsoleWindow()
    
    if not hWnd:
        kernel32.AllocConsole()
        
        # Re-open standard streams to the new console
        sys.stdout = open("CONOUT$", "w", encoding="utf-8")
        sys.stderr = open("CONOUT$", "w", encoding="utf-8")
        sys.stdin = open("CONIN$", "r", encoding="utf-8")

        # Enable Virtual Terminal Processing for ANSI colors
        hOut = kernel32.GetStdHandle(-11)
        mode = ctypes.c_ulong()
        kernel32.GetConsoleMode(hOut, ctypes.byref(mode))
        mode.value |= 0x0004
        kernel32.SetConsoleMode(hOut, mode)
        
        # Initialize rich console once
        cfg.init_console()

def set_console_visibility(visible):
    """Shows or hides the console window."""
    user32 = ctypes.WinDLL('user32')
    kernel32 = ctypes.WinDLL('kernel32')
    hWnd = kernel32.GetConsoleWindow()
    
    if hWnd:
        if visible:
            user32.ShowWindow(hWnd, 5) # SW_SHOW
            user32.SetForegroundWindow(hWnd)
        else:
            user32.ShowWindow(hWnd, 0) # SW_HIDE

def is_console_visible():
    """Returns True if the console window is currently visible."""
    user32 = ctypes.WinDLL('user32')
    kernel32 = ctypes.WinDLL('kernel32')
    hWnd = kernel32.GetConsoleWindow()
    if hWnd:
        return user32.IsWindowVisible(hWnd)
    return False

def toggle_console():
    """Toggles the console window visibility."""
    visible = is_console_visible()
    set_console_visibility(not visible)

def main():
    """
    Main function to handle configuration and launch the tray icon.
    """
    parser = argparse.ArgumentParser(description=f"queuePop Tool {__version__}")
    parser.parse_args()

    # --- ALWAYS Ensure Console Exists ---
    # We need a console for background threads to log to, even if hidden.
    ensure_console_created()
    set_console_visibility(False)

    # --- Single Instance Check ---
    # Create a named mutex. If it already exists, another instance is running.
    # Retry for a few seconds before giving up: after a self-update the
    # installer/relauncher starts the new build while the old process is still
    # tearing down — without the grace window the new copy would bounce off the
    # dying instance's mutex and exit, leaving the stale old app (or nothing)
    # on screen until a manual restart.
    import time as _time
    mutex_name = "Global\\queuePop_Instance_Mutex"
    kernel32 = ctypes.WinDLL('kernel32')
    mutex = None
    for attempt in range(24):  # ~6s total
        mutex = kernel32.CreateMutexW(None, False, mutex_name)
        last_error = kernel32.GetLastError()
        if last_error != 183:  # not ERROR_ALREADY_EXISTS -> we own it
            break
        kernel32.CloseHandle(mutex)
        mutex = None
        _time.sleep(0.25)

    if mutex is None:
        # If the console is visible (e.g. dev mode), print a message.
        # Otherwise, just exit silently to avoid popping up a confusing window.
        if cfg.console:
            cfg.console.print("[warning]queuePop is already running![/]")
        else:
            print("queuePop is already running!")
        try:
            import updater
            updater._ulog("startup aborted: another instance held the mutex for 6s")
        except Exception:
            pass
        sys.exit(0)

    # --- Load Settings ---
    settings = cfg.load_or_create_config()

    # --- LCU Connector in a background thread ---
    try:
        lcu_connector = LCU(config=settings)
        lcu_thread = threading.Thread(target=lcu_connector.start, daemon=True)
        lcu_thread.start()
    except Exception as e:
        set_console_visibility(True)
        cfg.console.print(f"\n[danger]An unexpected error occurred during LCU setup: {e}[/]")
        cfg.console.print("[info]Please ensure the League of Legends client is running.[/]")
        input("Press Enter to exit...")
        sys.exit(1)

    # --- LAN phone companion server (optional, started at launch) ---
    if settings.get("companion", {}).get("enabled"):
        try:
            import companion
            companion.attach_lcu(lcu_connector)
            companion.start(settings)
        except Exception as e:
            cfg.console.print(f"[warning]Could not start phone companion: {e}[/]")

    # --- Web UI (pywebview) on the main thread ---
    import webview
    from web_api import Api

    api = Api(lcu_connector)
    index_path = webui_index()

    # Open at the size the window was last left at (saved by on_resized below);
    # 762x800 is the first-run default AND the floor (mirrored in web_api's
    # MIN_WINDOW_SIZE) — the champ-select trays need the width to lay out.
    win_cfg = settings.get("window") or {}
    try:
        win_w = max(762, int(win_cfg.get("width", 762)))
        win_h = max(800, int(win_cfg.get("height", 800)))
    except (TypeError, ValueError):
        win_w, win_h = 762, 800

    window = webview.create_window(
        "queuePop",
        url=index_path,
        js_api=api,
        width=win_w,
        height=win_h,
        min_size=(762, 800),
        background_color="#020617",
        # Drop the native OS chrome so the web UI can draw its own League-themed
        # title bar (min/maximize/close live in src/webui/window-chrome.js).
        # easy_drag=False so only the .pywebview-drag-region title bar drags the
        # window, otherwise every mousedown on the body would move it.
        frameless=True,
        easy_drag=False,
    )
    # Underscore attr on purpose, see Api.__init__: a public attribute holding
    # the window makes pywebview recurse the WebView2 COM graph and hang startup.
    api._window = window

    # Windows 11's DWM rounds every top-level window by default; the League
    # client uses square corners, so opt this window out via
    # DWMWA_WINDOW_CORNER_PREFERENCE (33) = DWMWCP_DONOTROUND (1). Harmless
    # no-op on Windows 10, where the attribute doesn't exist (call just fails).
    def square_corners():
        try:
            hwnd = int(window.native.Handle)  # WinForms host form
        except Exception:
            hwnd = ctypes.WinDLL("user32").FindWindowW(None, "queuePop")
        if hwnd:
            pref = ctypes.c_int(1)
            try:
                ctypes.WinDLL("dwmapi").DwmSetWindowAttribute(
                    ctypes.c_void_p(hwnd), 33, ctypes.byref(pref), ctypes.sizeof(pref)
                )
            except Exception:
                pass

    window.events.shown += square_corners

    # Closing the window hides it to the tray instead of quitting; only the
    # tray "Exit" item (which flips this flag) actually tears the app down.
    app_state = {"quitting": False}

    def on_closing():
        if app_state["quitting"]:
            return True  # allow the window to be destroyed
        window.hide()
        return False     # cancel the close, keep running in the tray

    window.events.closing += on_closing

    # Remember the window size across launches: debounce the resize stream and
    # write through the connector's config (the canonical in-memory copy).
    # Maximizing also fires resized — skip it so a maximized session doesn't
    # become the "normal" size on the next launch.
    resize_timer = [None]

    def on_resized(width, height):
        if api._maximized:
            return

        def save():
            import json
            cfg_now = lcu_connector.config or {}
            cfg_now["window"] = {"width": int(width), "height": int(height)}
            lcu_connector.config = cfg_now
            try:
                with open(cfg.CONFIG_FILE, "w") as f:
                    json.dump(cfg_now, f, indent=4)
            except Exception:
                pass

        if resize_timer[0]:
            resize_timer[0].cancel()
        resize_timer[0] = threading.Timer(1.0, save)
        resize_timer[0].daemon = True
        resize_timer[0].start()

    window.events.resized += on_resized

    def shutdown():
        app_state["quitting"] = True
        lcu_connector.stop()
        try:
            window.destroy()
        except Exception:
            pass

    # Let the self-updater quit the app cleanly (so the exe unlocks for the
    # swap/installer). Underscore attr, see Api.__init__ on why public ones hang.
    api._on_exit = shutdown

    # Background check against GitHub Releases; surfaces an "update available"
    # event + banner. Only useful for the packaged build.
    if getattr(sys, "frozen", False):
        try:
            import updater
            updater._ulog("started: creating window")  # closes the update story
            updater.start_background()
        except Exception as e:
            cfg.console.print(f"[warning]Update check unavailable: {e}[/]")

    # --- System Tray Icon, detached so the main thread runs the GUI loop ---
    tray_icon = TrayIcon(
        lcu_connector=lcu_connector,
        window=window,
        on_exit=shutdown,
        toggle_console_callback=toggle_console,
        is_visible_callback=is_console_visible,
    )
    tray_icon.run_detached()

    # Blocks until the window is destroyed (i.e. the user hits Exit).
    # debug=False so the WebView2 DevTools don't auto-open on launch. Flip to
    # True for development (enables right-click → Inspect).
    webview.start(debug=False)

    cfg.console.print("[yellow]Application has been shut down.[/]")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # If we crash at the top level, we try to print to whatever console we have
        # But we must be careful if console isn't init yet.
        if cfg.console:
            cfg.console.print(f"[bold red]FATAL ERROR: {e}[/]")
        else:
            print(f"FATAL ERROR: {e}")
            
        import traceback
        traceback.print_exc()
        input("Press Enter to close...")
        sys.exit(1)

