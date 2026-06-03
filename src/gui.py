import tkinter as tk
from tkinter import ttk, messagebox
import json
import os
import sys

# Import config to access QUEUE_ID_MAP and CONFIG_FILE
# Note: In a larger app, I'd separate constants, but circular import risk is low if we import inside func or careful structure.
# Here we will pass constants in or just import config module.
import config
import champ_select


def _list_to_text(values):
    """Render a list of champion names as a comma-separated string for the UI."""
    return ", ".join(values or [])


def _text_to_list(text):
    """Parse a comma-separated UI string back into a clean list of names."""
    return [part.strip() for part in (text or "").split(",") if part.strip()]


class SettingsApp:
    def __init__(self, root, current_config, on_save_callback):
        self.root = root
        self.root.title("queueBot Settings")
        self.root.geometry("480x660")
        self.root.resizable(False, False)

        self.config = self._normalize_config(current_config)
        self.on_save_callback = on_save_callback
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

        # Style
        self.style = ttk.Style()
        self.style.configure("TLabel", padding=5)
        self.style.configure("TButton", padding=5)
        self.style.configure("TCheckbutton", padding=2)

        # --- Main Container ---
        main_frame = ttk.Frame(root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # --- Tabs ---
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)

        general_tab = ttk.Frame(notebook, padding="10")
        champ_tab = ttk.Frame(notebook, padding="10")
        notebook.add(general_tab, text="General")
        notebook.add(champ_tab, text="Champ Select")

        self._build_general_tab(general_tab)
        self._build_champ_select_tab(champ_tab)

        # --- Footer ---
        footer_frame = ttk.Frame(main_frame)
        footer_frame.pack(fill=tk.X, pady=10)

        ttk.Button(footer_frame, text="Cancel", command=self.root.destroy).pack(side=tk.RIGHT, padx=5)
        ttk.Button(footer_frame, text="Apply", command=self.apply_settings).pack(side=tk.RIGHT, padx=5)
        ttk.Button(footer_frame, text="Save & Close", command=self.save_settings).pack(side=tk.RIGHT)

    def _build_general_tab(self, parent):
        # --- Discord Section ---
        discord_frame = ttk.LabelFrame(parent, text="Discord Integration", padding="10")
        discord_frame.pack(fill=tk.X, pady=5)

        ttk.Label(discord_frame, text="Webhook URL:").pack(anchor=tk.W)
        self.webhook_var = tk.StringVar(value=self.config.get("webhook_url", ""))
        ttk.Entry(discord_frame, textvariable=self.webhook_var).pack(fill=tk.X, pady=(0, 5))

        ttk.Label(discord_frame, text="User ID (for pings):").pack(anchor=tk.W)
        self.userid_var = tk.StringVar(value=self.config.get("user_id", ""))
        ttk.Entry(discord_frame, textvariable=self.userid_var).pack(fill=tk.X)

        # --- Notifications Section ---
        notif_frame = ttk.LabelFrame(parent, text="Desktop Notifications", padding="10")
        notif_frame.pack(fill=tk.X, pady=5)

        self.desktop_notif_var = tk.BooleanVar(value=self.config.get("desktop_notifications", True))
        ttk.Checkbutton(notif_frame, text="Enable Windows Notifications", variable=self.desktop_notif_var).pack(anchor=tk.W)

        # --- Queues Section ---
        queue_frame = ttk.LabelFrame(parent, text="Allowed Queues (Auto-Accept)", padding="10")
        queue_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        ttk.Label(queue_frame, text="Uncheck all to accept ANY queue.").pack(anchor=tk.W, pady=(0, 5))

        # Scrollable Canvas for Queues
        canvas = tk.Canvas(queue_frame, highlightthickness=0)
        scrollbar = ttk.Scrollbar(queue_frame, orient="vertical", command=canvas.yview)
        self.scrollable_frame = ttk.Frame(canvas)

        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )

        canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)

        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # Populate Queue Checkboxes
        self.queue_vars = {}
        allowed_ids = self.config.get("allowed_queue_ids", [])

        # If list is empty, it means ALL are allowed (logic in main app).
        for q_id, q_name in config.QUEUE_ID_MAP.items():
            is_checked = q_id in allowed_ids
            var = tk.BooleanVar(value=is_checked)
            self.queue_vars[q_id] = var
            ttk.Checkbutton(self.scrollable_frame, text=q_name, variable=var).pack(anchor=tk.W, fill=tk.X)

    def _build_champ_select_tab(self, parent):
        cs = self.config.get("champ_select", {})

        # --- Top controls ---
        top_frame = ttk.Frame(parent)
        top_frame.pack(fill=tk.X)

        self.champ_enabled_var = tk.BooleanVar(value=cs.get("enabled", False))
        ttk.Checkbutton(
            top_frame, text="Enable Auto Pick / Ban", variable=self.champ_enabled_var
        ).pack(anchor=tk.W)

        lock_row = ttk.Frame(top_frame)
        lock_row.pack(fill=tk.X, pady=(2, 0))
        ttk.Label(lock_row, text="Auto lock-in when phase has").pack(side=tk.LEFT)
        self.lock_seconds_var = tk.IntVar(value=cs.get("lock_in_at_seconds", 1))
        ttk.Spinbox(
            lock_row, from_=0, to=60, width=4, textvariable=self.lock_seconds_var
        ).pack(side=tk.LEFT, padx=4)
        ttk.Label(lock_row, text="second(s) left").pack(side=tk.LEFT)

        ttk.Label(
            parent,
            text=("Comma-separated champion names. Picks are tried in order, so\n"
                  "list backups in case your first choice is banned or taken.\n"
                  "Only applies to queues with assigned roles (Draft / Ranked)."),
            justify=tk.LEFT,
        ).pack(anchor=tk.W, pady=(8, 4))

        # --- Scrollable per-role editor ---
        editor = ttk.Frame(parent)
        editor.pack(fill=tk.BOTH, expand=True)

        canvas = tk.Canvas(editor, highlightthickness=0)
        scrollbar = ttk.Scrollbar(editor, orient="vertical", command=canvas.yview)
        inner = ttk.Frame(canvas)
        inner.bind("<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.create_window((0, 0), window=inner, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        # role -> {"bans": StringVar, "picks": StringVar}
        self.role_vars = {}
        roles_cfg = cs.get("roles", {})
        for role in champ_select.ROLES:
            role_cfg = roles_cfg.get(role, {})
            frame = ttk.LabelFrame(inner, text=champ_select.ROLE_LABELS.get(role, role.title()), padding="8")
            frame.pack(fill=tk.X, pady=4, padx=2)

            ttk.Label(frame, text="Ban(s):").grid(row=0, column=0, sticky=tk.W)
            ban_var = tk.StringVar(value=_list_to_text(role_cfg.get("bans")))
            ttk.Entry(frame, textvariable=ban_var, width=40).grid(row=0, column=1, sticky="ew", padx=4)

            ttk.Label(frame, text="Pick(s):").grid(row=1, column=0, sticky=tk.W)
            pick_var = tk.StringVar(value=_list_to_text(role_cfg.get("picks")))
            ttk.Entry(frame, textvariable=pick_var, width=40).grid(row=1, column=1, sticky="ew", padx=4)

            frame.columnconfigure(1, weight=1)
            self.role_vars[role] = {"bans": ban_var, "picks": pick_var}

    def _normalize_champ_select(self, cs):
        cs = cs or {}
        roles_in = cs.get("roles", {}) or {}
        roles = {}
        for role in champ_select.ROLES:
            rc = roles_in.get(role, {}) or {}
            roles[role] = {
                "bans": [s for s in (rc.get("bans") or []) if s],
                "picks": [s for s in (rc.get("picks") or []) if s],
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

    def _normalize_config(self, config_data):
        if config_data is None:
            config_data = {}

        allowed_ids = config_data.get("allowed_queue_ids", [])
        return {
            "webhook_url": (config_data.get("webhook_url") or "").strip(),
            "user_id": (config_data.get("user_id") or "").strip(),
            "desktop_notifications": bool(config_data.get("desktop_notifications", True)),
            "allowed_queue_ids": sorted(allowed_ids),
            "champ_select": self._normalize_champ_select(config_data.get("champ_select")),
        }

    def _build_config_from_ui(self):
        selected_ids = [
            q_id for q_id, var in self.queue_vars.items() if var.get()
        ]

        try:
            lock_seconds = int(self.lock_seconds_var.get())
        except (tk.TclError, ValueError):
            lock_seconds = champ_select.DEFAULT_LOCK_SECONDS

        champ_cfg = {
            "enabled": self.champ_enabled_var.get(),
            "lock_in_at_seconds": lock_seconds,
            "roles": {
                role: {
                    "bans": _text_to_list(vars_["bans"].get()),
                    "picks": _text_to_list(vars_["picks"].get()),
                }
                for role, vars_ in self.role_vars.items()
            },
        }

        return self._normalize_config({
            "webhook_url": self.webhook_var.get().strip(),
            "user_id": self.userid_var.get().strip(),
            "desktop_notifications": self.desktop_notif_var.get(),
            "allowed_queue_ids": selected_ids,
            "champ_select": champ_cfg,
        })

    def _is_dirty(self):
        return self._build_config_from_ui() != self.config

    def apply_settings(self):
        self.save_settings(close_after=False)

    def on_close(self):
        if not self._is_dirty():
            self.root.destroy()
            return

        choice = messagebox.askyesnocancel(
            "Save changes?",
            "Save changes before closing?"
        )
        if choice is True:
            self.save_settings(close_after=True)
        elif choice is False:
            self.root.destroy()

    def save_settings(self, close_after=True):
        new_config = self._build_config_from_ui()

        # Save to file
        try:
            with open(config.CONFIG_FILE, "w") as f:
                json.dump(new_config, f, indent=4)

            # Notify app
            if self.on_save_callback:
                self.on_save_callback(new_config)

            self.config = new_config
            messagebox.showinfo("Success", "Settings saved successfully!")

            if close_after:
                self.root.destroy()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to save settings: {e}")

def open_settings(current_config, on_save_callback=None):
    """
    Opens the settings window. Blocking call.
    """
    root = tk.Tk()
    # Center window
    window_width = 480
    window_height = 660
    screen_width = root.winfo_screenwidth()
    screen_height = root.winfo_screenheight()
    x = (screen_width // 2) - (window_width // 2)
    y = (screen_height // 2) - (window_height // 2)
    root.geometry(f"{window_width}x{window_height}+{x}+{y}")

    app = SettingsApp(root, current_config, on_save_callback)

    # Set icon if available (for the window title bar)
    try:
        if getattr(sys, 'frozen', False):
            base_path = sys._MEIPASS
        else:
            base_path = os.path.abspath(".")
        icon_path = os.path.join(base_path, "assets", "gnome-thresh.ico")
        root.iconbitmap(icon_path)
    except Exception:
        pass

    root.mainloop()
