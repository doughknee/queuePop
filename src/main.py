import argparse
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
    """Absolute path to the web UI entry point, for dev and frozen builds."""
    if getattr(sys, 'frozen', False):
        base = sys._MEIPASS  # PyInstaller extraction dir
    else:
        base = os.path.dirname(os.path.abspath(__file__))  # src/
    return os.path.join(base, "webui", "index.html")

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
    mutex_name = "Global\\queuePop_Instance_Mutex"
    kernel32 = ctypes.WinDLL('kernel32')
    mutex = kernel32.CreateMutexW(None, False, mutex_name)
    last_error = kernel32.GetLastError()
    
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        # If the console is visible (e.g. dev mode), print a message. 
        # Otherwise, just exit silently to avoid popping up a confusing window.
        if cfg.console:
            cfg.console.print("[warning]queuePop is already running![/]")
        else:
            print("queuePop is already running!")
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

    window = webview.create_window(
        "queuePop",
        url=index_path,
        js_api=api,
        width=740,
        height=840,
        min_size=(620, 700),
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

    # Closing the window hides it to the tray instead of quitting; only the
    # tray "Exit" item (which flips this flag) actually tears the app down.
    app_state = {"quitting": False}

    def on_closing():
        if app_state["quitting"]:
            return True  # allow the window to be destroyed
        window.hide()
        return False     # cancel the close, keep running in the tray

    window.events.closing += on_closing

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

