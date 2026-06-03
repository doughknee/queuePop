import argparse
import sys
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
    parser = argparse.ArgumentParser(description=f"queueBot Tool {__version__}")
    parser.add_argument("--update", action="store_true", help="Force update of settings")
    args = parser.parse_args()

    # --- ALWAYS Ensure Console Exists ---
    # We need a console for background threads to log to, even if hidden.
    ensure_console_created()
    set_console_visibility(False)

    # --- Single Instance Check ---
    # Create a named mutex. If it already exists, another instance is running.
    mutex_name = "Global\\queueBot_Instance_Mutex"
    kernel32 = ctypes.WinDLL('kernel32')
    mutex = kernel32.CreateMutexW(None, False, mutex_name)
    last_error = kernel32.GetLastError()
    
    if last_error == 183:  # ERROR_ALREADY_EXISTS
        # If the console is visible (e.g. dev mode), print a message. 
        # Otherwise, just exit silently to avoid popping up a confusing window.
        if cfg.console:
            cfg.console.print("[warning]queueBot is already running![/]")
        else:
            print("queueBot is already running!")
        sys.exit(0)

    # --- Configuration ---
    if args.update:
        cfg.open_settings_ui(cfg.load_or_create_config())
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

    # --- System Tray Icon in the main thread ---
    tray_icon = TrayIcon(
        lcu_connector=lcu_connector, 
        toggle_console_callback=toggle_console,
        is_visible_callback=is_console_visible
    )
    tray_icon.run()

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

