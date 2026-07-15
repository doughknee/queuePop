# queuePop

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.14-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)

A lightweight, automated tool for **League of Legends** and **Teamfight Tactics** that instantly accepts queue ready checks. It runs silently in the system tray and integrates with Discord for remote notifications.

## 📸 Screenshots

![queuePop dashboard, monitoring, ranked overview, and live activity](site/public/shots/dashboard.png)

| Auto pick/ban & notifications | Champion priority list |
| :---: | :---: |
| ![Settings](site/public/shots/settings.png) | ![Champion select](site/public/shots/champ-select.png) |
| **Per-champion loadouts** | **One-click queue** |
| ![Loadout editor](site/public/shots/loadout.png) | ![Queue launcher](site/public/shots/queue.png) |
| **Rank & mastery at a glance** | **Every queue, including TFT** |
| ![Profile overview](site/public/shots/profile.png) | ![Full queue picker](docs/screenshots/queue-all.png) |

## 🚀 Features

*   **Auto-Accept Queues:** Instantly accepts the "Ready Check" popup.
*   **Auto Pick & Ban:** Automatically bans and picks champions based on your assigned role, with ordered backup picks if your first choice is banned or taken. Hovers your pick and auto-locks it just before the timer runs out.
*   **ARAM Bench Grab:** In ARAM, automatically swaps to your highest-priority champion the moment it appears on the reroll bench, and applies that champ's loadout (runes, summoner spells, skin).
*   **Per-Champion Loadouts:** Save runes, summoner spells, and a skin per champion; they're applied automatically once you're locked in.
*   **System Tray Integration:** Runs silently in the background; minimize to tray to keep your taskbar clean.
*   **Discord Notifications:** Get a ping on your phone (via Discord Webhook) when your queue pops!
*   **Game Mode Detection:** Smartly identifies if it's Ranked, ARAM, or TFT.
*   **Queue Filtering:** Configure exactly which game modes to accept (e.g., only "TFT Ranked").
*   **Zero-Interference:** Uses the LCU API directly, no screen scraping or mouse hijacking.

## 📥 Installation

### Option 1: Installer (Recommended)
1.  Go to the [Releases](../../releases) page.
2.  Download `queuePop-v<version>-setup.exe`.
3.  Run it. It installs for the current user (no admin prompt), adds a Start
    Menu entry, and can optionally create a desktop shortcut and start with
    Windows.

### Option 2: Portable
1.  Download `queuePop-v<version>-portable.zip` from [Releases](../../releases).
2.  Extract it anywhere and run `queuePop.exe`.

> **Auto-updates:** both flavours check for new releases on launch. When one is
> available you'll see an **Update** banner, one click downloads it and
> restarts into the new version (the installer build updates silently; the
> portable build swaps its own `.exe`). You can also check manually under
> **Settings → About & Updates**.

### Option 3: Run from Source
If you are a developer, you can run it directly with Python.

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3.  Run the application from the repository root:
    ```bash
    python src/main.py
    ```

## ⚙️ Configuration

On the first run, a setup wizard will appear in a console window.

1.  **Discord Webhook (Optional):** Paste a webhook URL to receive notifications.
2.  **Discord User ID (Optional):** Enter your ID (e.g., `123456789`) to get `@mentioned` when the queue pops.
3.  **Allowed Queues:** Select which modes to auto-accept (or leave blank for all).

### Auto Pick & Ban
Open **Settings** from the tray icon and switch to the **Champ Select** tab:

1.  Tick **Enable Auto Pick / Ban**.
2.  For each role, enter comma-separated champion names for **Ban(s)** and **Pick(s)**, e.g. `Ahri, Syndra, Lux`. Picks are tried in order, so list backups in case your first choice is banned or already taken by a teammate.
3.  Set the **lock-in** timer (default `1` second). Your pick is *hovered* immediately, so you can still change it manually, and force-locked once the phase has this many seconds left.

> Role-based pick & ban applies to queues with assigned roles (Draft Pick, Ranked Solo/Duo, Ranked Flex). Blind Pick has no roles and is left alone.

### ARAM
ARAM doesn't let you pick a champion outright — you're dealt one and share a
bench with your team. So instead of picking, queuePop **watches the bench and
instantly grabs the best champ available** the moment it shows up. Two ways to
choose "best", both under **Settings → Champ Select → ARAM**:

*   **Priority list** — tick **Grab a higher-priority champ off the bench** and
    build a ranked list on **Champ Select → ARAM** (e.g. `Ziggs, Lux, Ashe`);
    queuePop trades toward the highest-ranked one available.
*   **Highest mastery** — tick **Auto-pick my highest-mastery champ available**
    to skip sorting ~180 champs entirely; queuePop always reaches for the
    highest-mastery champ you own. This disables the ARAM editor tab (the list
    is no longer used).

Whatever champ you end up on gets its saved loadout (runes, spells, skin)
applied automatically. Works in every ARAM mode (ARAM, ARAM Mayhem, …).

### Modifying Settings
*   Open the app window and use the **Settings** tab — every change auto-saves.
*   **Right-click** the system tray icon and select **Exit** to close the app.
*   *(To start fresh, delete the `config.json` file and restart the app.)*

## 🖥️ Usage

1.  Launch `queuePop.exe`.
2.  The application will minimize to the system tray (look for the Thresh icon).
3.  **Right-click** the tray icon to:
    *   **Pause/Resume:** Temporarily stop auto-accepting.
    *   **Show/Hide Console:** View the activity log and debug info.
    *   **Exit:** Close the application.

## 🛠️ Building

To build the executable yourself using PyInstaller:

```bash
pip install pyinstaller
python -m PyInstaller scripts/queuePop.spec
```

The output will be in the `dist/` folder. For a full clean build, run:

```bash
python scripts/build_release.py
```

That fetches League assets, compiles the Tailwind CSS, runs PyInstaller, and
writes these artifacts to `releases/`:

| Artifact | What it is |
|---|---|
| `queuePop-v<version>-setup.exe` | Inno Setup installer (the installed flavour) |
| `queuePop-v<version>-portable.zip` | Zipped portable exe |
| `queuePop.exe` | Bare exe, the asset the portable auto-updater downloads |

The installer step needs [Inno Setup](https://jrsoftware.org/isdl.php) on your
PATH; if it's missing, the script warns and still produces the portable
artifacts. The installer script lives at `installer/queuePop.iss`.

## 🚢 Releasing

Releases are built and published by GitHub Actions
([`.github/workflows/release.yml`](.github/workflows/release.yml)) on
`windows-latest`:

1.  Bump `__version__` in [`src/_version.py`](src/_version.py).
2.  Commit, then tag and push:
    ```bash
    git tag v1.2.0
    git push origin main --tags
    ```
3.  The workflow verifies the tag matches `_version.py`, builds all three
    artifacts, and publishes a GitHub Release with auto-generated notes. Users
    on older versions get the in-app update prompt.

You can also trigger it manually from the **Actions** tab (it uses the version
in `_version.py` and creates the matching tag).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Note: This project is not endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing League of Legends.*
