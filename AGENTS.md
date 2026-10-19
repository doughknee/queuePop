# Repository Guidelines

## Project Structure & Module Organization
- `src/` — runtime code. Entry/bootstrap `src/main.py` (tray + webview + LCU loop);
  `src/lcu.py` LCU client + event subscription; `src/champ_select.py` auto
  pick/ban + ARAM bench; `src/web_api.py` pywebview `js_api` bridge;
  `src/tray.py` tray icon/menu; `src/notifications.py` Discord +
  desktop alerts; `src/companion.py` LAN companion server (phone); `src/config.py`
  config + Rich console; `src/events.py` event constants; `src/updater.py`
  auto-update (installed vs portable); `src/_version.py` version string.
- `src/webui/` — the web UI (HTML/CSS/JS). `index.html` is the three-worlds shell
  ported from `prototypes/queuepop/` (the design spec): `shell.*` masthead, `worlds.js`
  (the mockup's `app.js`: hash router, home, companion) + `worlds.css` (its `styles.css`),
  `league-*.css/js` and `playbooks.*` for the League world, `tft-view.*` + `tft-field-guide/`
  and `deadlock-view.js` + `deadlock/assets/` for the static TFT/Deadlock arrival pages.
  The working League pages (`js/pages/*`, hextech markup) live in `#host-pages` and mount
  on `#/league/{play,champ,live,dashboard,account,settings}` and `#/companion`; the glue
  (routes, real summoner/mastery/latest match) is the "Host bridge" block at the end of
  `worlds.js`, layout/token overrides in `host.css`. No modals or popup menus: the loadout,
  set-up and QR panels open inline. Mockup artwork sits flat in `src/webui/assets/`;
  downloaded League assets land in its subfolders (gitignored; see scripts below).
- `assets/queuepop.ico` — app icon, bundled into the exe by `scripts/queuePop.spec`
  and referenced at runtime via the `resource_path("assets/queuepop.ico")` pattern.
- `brand/` — brand kit master (marks, lockups, fonts, `play-button.svg`,
  `brand-guidelines.html`). Reference material; not consumed by any build — the
  app and site each carry their own derived copies.
- `scripts/` — all build/dev tooling, invoked from the repo root so their
  relative paths resolve: `build_release.py` (release orchestrator),
  `queuePop.spec` (PyInstaller), `tailwind.config.js`, `run.cmd` / `stop.cmd`
  (launch/kill the app), and `fetch_assets.py` (download champion/role icons).
  For LCU endpoint reference, query the live client's `/help` — don't trust
  static docs (Riot renames routes between patches).
- `docs/` — `screenshots/` (README-only images; the rest live in `site/public/shots/`).
- `installer/queuePop.iss` — Inno Setup script for the installed build.
- `site/` — marketing site (Vite + React, prerendered to static HTML); self-contained.
- Build artifacts (`build/`, `dist/`, `releases/`) are generated and gitignored.

## Build, Test, and Development Commands
- Install deps: `pip install -r requirements.txt`.
- Run from source: `py src/main.py` (use the `py` launcher — bare `python`
  resolves to the broken Windows Store stub here). Or `scripts\run.cmd` / `make run`.
- Rebuild Tailwind CSS after markup changes: `make css`.
- Build the release: `py scripts/build_release.py` — fetches assets, compiles CSS,
  runs PyInstaller, and writes `releases/queuePop-v<version>-setup.exe`,
  `releases/queuePop-v<version>-portable.zip`, and a bare `releases/queuePop.exe`.
  PyInstaller alone: `py -m PyInstaller scripts/queuePop.spec`.

## Coding Style & Naming Conventions
- Target Python 3.14 on Windows; PEP 8, 4-space indents, snake_case
  modules/functions, PascalCase classes, UPPER_SNAKE constants.
- Keep side effects near entry points (`src/main.py`); prefer pure, reusable
  helpers so PyInstaller bundling stays predictable.
- Preserve Rich console logging (`config.console`) and the `resource_path`
  pattern for bundled assets.
- pywebview `js_api`: keep `Window`/`LCU` references private (e.g. `self._window`,
  `self._lcu`) — exposing them as public attributes makes pywebview recurse the
  WebView2 COM graph and hang startup.

## Testing Guidelines
- There is no automated test suite. Validate changes by running the app against a
  live client and exercising the affected flow (queue pop accepted, Discord ping
  received, champ select pick/ban, etc.). When adding LCU interactions, note the
  manual reproduction steps in the PR.

## Commit & Pull Request Guidelines
- Match the existing history: `Feat: short summary`, `Fix: short summary`,
  `Refactor: short summary` — imperative, present tense.
- PRs should include a short changelog, validation steps, and screenshots for
  GUI/tray changes.
- Cutting a release: bump `__version__` in `src/_version.py`, commit, then tag
  (`git tag v1.2.0 && git push origin main --tags`). GitHub Actions
  (`.github/workflows/release.yml`) verifies the tag, builds all artifacts, and
  publishes the release.

## Security & Configuration Tips
- Never commit `config.json` or real Discord webhooks — both are gitignored; use
  dummy values in any shared examples and redact logs.
- Update `scripts/queuePop.spec` (and `installer/queuePop.iss` if needed) when
  adding new bundled assets so PyInstaller and the installer pick them up.

## Electron host
- `app/` is the Electron host (plain `electron`, CommonJS, no bundler). It loads `src/webui/index.html`
  unchanged and emulates `window.pywebview.api` over IPC (`preload.js` gets the method names from main).
- Run: `cd app && npm install && npm start`. Check: `npm test` (lockfile, notifications, champ select,
  overlay). Package: `npm run dist` (NSIS + zip, named `queuePop-electron-*` so it can't pass for the Python build).
- What implements the bridge: `main.js` (LCU connection, ready-check auto-accept, status/events, window);
  `lcu.js` (lockfile + LCU client); `champ-select*.js` (auto pick/ban, runes, ARAM bench, trades, config);
  `host.js` wires `tray.js`, `notifications.js` (Discord + desktop), `companion.js` (phone), `updater.js`,
  `account.js`; `config.js` shares `src/config.json` with the Python app; `overlay.js` probes and launches the
  Deadlock overlay app. `methods.js` lists every bridge method with its stub value; the few still unported
  log `stub: <name>` once.
- Deadlock: the host's Deadlock tab (`src/webui/deadlock-view.js`) reads public data from deadlock-api and
  probes the separate Overwolf overlay app on `http://127.0.0.1:47821/health`; config key
  `deadlock_overlay_exe` (default empty) enables its "Launch overlay" button. The host never contains game
  hooks, and the overlay app never contains League code.
- Deadlock landing ("The city", DONI-482) is stats-first: player card, hero tier list (rank/patch/window filters,
  rows expand to top items + worst matchups), links; search (heroes, items, players) at the top of the content area,
  not the nav row. `window.DEADLOCK_PAGES` ([{hash, label}]) is the page list for the shell sidebar. Styles in
  `src/webui/deadlock/city.css` (linked into the shadow root). Account id: config key `deadlock_account_id` via bridge
  `get_deadlock_account` / `set_deadlock_account` (`app/deadlock-api.js`), localStorage fallback. All calls go from the
  renderer to `https://api.deadlock-api.com/v1`: `/analytics/hero-stats` (tier list; `min/max_average_badge` = rank
  tier*10..tier*10+6, `min/max_unix_timestamp` from patch title dates), `/analytics/item-stats`,
  `/analytics/hero-counter-stats`, `/players/{id}/match-history`, `/players/mmr`, `/players/steam`,
  `/players/steam-search`, `/matches/{id}/metadata` (items bought), `/assets/ranks`, `/patches`. Tier = win-rate
  percentile; `app/test-deadlock.js` checks the row builder (`window.deadlockTierRows`).

## Home
- Before opening a PR, run every check under `tests/` (`for t in tests/test_*.py; do py "$t"; done`),
  not only the one you added. A worker merged a change that broke a sibling test once (2026-10-01).
- The Release workflow triggers on `src/_version.py` changing on main and creates the tag itself;
  rewrite `RELEASE_NOTES.md` (player-facing, shown in-app) in the same commit.
