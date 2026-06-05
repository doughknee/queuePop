import sys
import os
from pystray import Icon, Menu, MenuItem as item
from PIL import Image

import config


def resource_path(relative_path):
    """ Get absolute path to resource, works for dev and for PyInstaller """
    try:
        # PyInstaller creates a temp folder and stores path in _MEIPASS
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)


class TrayIcon:
    def __init__(self, lcu_connector, window=None, on_exit=None,
                 toggle_console_callback=None, is_visible_callback=None):
        self.lcu_connector = lcu_connector
        self.window = window               # pywebview Window (the UI)
        self.on_exit = on_exit             # callback to tear the whole app down
        self.toggle_console_callback = toggle_console_callback
        self.is_visible_callback = is_visible_callback
        self.icon = None

    def _create_menu(self):
        """Creates the menu items for the tray icon."""
        menu_items = [
            item('Open queuePop', self.open_window, default=True),
            Menu.SEPARATOR,
            item('Pause/Resume', self.toggle_pause),
        ]

        if self.toggle_console_callback:
            if self.is_visible_callback:
                console_text = "Hide Console" if self.is_visible_callback() else "Show Console"
            else:
                console_text = "Show/Hide Console"
            menu_items.append(item(console_text, self.on_toggle_console))

        menu_items.append(Menu.SEPARATOR)
        menu_items.append(item('Exit', self.exit_app))

        return Menu(*menu_items)

    def open_window(self, icon, menu_item):
        """Shows (and focuses) the main webview window."""
        if self.window is not None:
            try:
                self.window.show()
            except Exception as e:
                config.console.log(f"[warning]Could not show window: {e}[/]")

    def on_toggle_console(self, icon, menu_item):
        """Toggles the console window visibility."""
        if self.toggle_console_callback:
            self.toggle_console_callback()
            # Refresh the menu so the label flips Show <-> Hide.
            self.icon.menu = self._create_menu()

    def toggle_pause(self, icon, menu_item):
        """Toggles the paused state of the LCU connector."""
        self.lcu_connector.paused = not self.lcu_connector.paused
        status = "Paused" if self.lcu_connector.paused else "Resumed"
        icon.notify(f"Monitoring has been {status}.")

    def exit_app(self, icon, menu_item):
        """Stops everything and quits the application."""
        icon.stop()
        if self.on_exit:
            self.on_exit()

    def _build_icon(self):
        icon_path = resource_path("assets/queuepop.ico")
        image = Image.open(icon_path)
        self.icon = Icon(
            "queuePop",
            icon=image,
            title="queuePop",
            menu=self._create_menu(),
        )
        return self.icon

    def run(self):
        """Creates and runs the tray icon (blocking)."""
        self._build_icon().run()

    def run_detached(self):
        """Creates and runs the tray icon in its own thread (non-blocking).

        Used so the main thread is free for the pywebview GUI loop.
        """
        self._build_icon().run_detached()
