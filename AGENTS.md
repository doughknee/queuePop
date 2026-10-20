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
  ported from `prototypes/queuepop/` (the design spec): `shell.*` the left sidebar (DONI-488: the only
  navigation; static markup in `index.html` `#qp-sidebar`, one group per game with its official logo from
  `assets/logos/` (sources in `SOURCES.md`), collapses to an icon rail, drag-resizes 200-400 px, both kept in
  localStorage `queuepop-sidebar-v1`. DONI-493: `#world-nav` is the current world's sticky page row, filled by
  `shell.js` from the sidebar's `.sb-pages` and themed in `league-world.css` / `tft-view.css`; empty on home/companion it is
  the window's 32 px drag strip. Deadlock keeps its own `.city-nav` row (`worlds.js` makes it drag the window and fills the
  sidebar from `DEADLOCK_PAGES`). Drag areas: `.sb-top`, `#world-nav`, `.city-nav`; their links are `no-drag`), `worlds.js`
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

## TFT world
- Stats-first (DONI-484): `src/webui/tft-view.js` renders `#/tft` (your card: rank + last-10 placements, filter strip
  patch/region/bracket, comps tier list from crawler `/tft/comps`, rows expand to `/tft/comp/{id}` units + augments),
  `#/tft/comp/{id}` (same as a page plus a read-only board) and `#/tft/history`; the search box above the content filters
  the list and jumps to comps. `#/tft/{comps,planner,champions,items}` still show the Field Guide iframe; its library and
  board save/load/share are inline panels (no dialogs). Styles at the end of `tft-view.css`.
- Data: `src/webui/js/tft-stats-api.js` (`window.tftStats`): crawler base from config `crawler_url` (default
  `http://10.205.0.81:47900`), per-URL memo; names/icons from Community Dragon `en_us.json` (24 MB, once per session),
  falling back to the key without its prefix. Tier banding: score = avg placement − 5 × min(pick rate, 0.10);
  S ≤ 3.5, A ≤ 4.0, B ≤ 4.5, else C; low-sample rows sort after full-sample ones and are greyed. `app/test-tft.js` checks it.
- Your games: bridge `get_tft_match_history(count)` (`app/account.js`) reads
  `/lol-match-history/v1/products/tft/{puuid}/matches`; the LCU copy usually has no augments.

## Asset packs
- `app/assets.js` (DONI-504) downloads the gitignored `src/webui/assets/{champions,spells,positions}` from Data Dragon / Community Dragon after the window opens (never awaited); skins (`skins/manifest.json` + per-champion tiles) lazily on the first `get_champion_skins`. Bridge: `get_asset_status`, `refresh_assets` (force re-download when the patch changed); shown in Settings > Updates & about. `ASSETS_LIVE=1 node app/test-assets.js` runs the real download into a temp dir.

## Settings
- `#/settings[#section]` (DONI-489) is the one app-level Settings page: `src/webui/settings.{js,css}` into `#settings-view`, reached from the
  sidebar gear; sections (account, league, alerts, companion, crawler, about) are cards with jump links in the page row
  (`settingsView.row()`, used by `shell.js`). It reads `QP.store.config` and writes `QP.store.set(...)` with the Python-era keys, plus
  `deadlock_account_id` and `crawler_url` (both now pass through `normalizeConfig` in `app/champ-config.js`, otherwise save_config drops them).
  The crawler card fetches `{crawler_url}/status` and posts `/admin/key` from the renderer. `#/league/settings` and `#/companion` redirect here;
  the old `#tab-alerts`/`#tab-about` markup stays hidden because `notifications.js`/`update.js` bind to its ids.

## Stats crawler
- `crawler/` is a standalone Node 24 service (own `package.json`, no deps, `node:sqlite`): one Riot personal key crawls
  ranked League/TFT matches per region, aggregates per-patch stats into `stats_*`, and serves them on port 47900
  (`/lol/tiers`, `/lol/champion/{id}`, `/tft/comps`, `/tft/comp/{id}`, `/patches`, `/status`). JSON shapes are in
  `crawler/README.md`. Check: `cd crawler && npm test` (runs on fixtures via the mock Riot server). Runs as a container
  on Unraid; never a second key. It never imports `app/` or `src/`.

## League stats (DONI-483)
- The League world leads with crawler stats: `src/webui/league-stats.{js,css}` renders `#/league` (The Rift: search, your
  card, tier list, links), `#/league/tiers`, `#/league/champion/{id}[/{role}]` (strip, role tabs, build sheet, matchups) and
  `#/league/history` (bridge `get_match_history`, rows expand). Routes are the League block in `worlds.js`.
- `src/webui/js/stats-api.js`: renderer-side fetch of the crawler (base = config `crawler_url`, default
  `http://10.205.0.81:47900`) and Data Dragon (version from `/patches` → newest matching DDragon build), memoised in memory
  for 10 minutes. `window.leagueTierRows` is the tier banding, tested by `app/test-league.js`: win rate shrunk toward the
  list average by 100 games, score = 0.75 × win-rate percentile + 0.25 × pick-rate percentile, top 10% S, 20% A, 40% B,
  20% C, 10% D. lowSample rows are banded, greyed, and sorted below the rest in tier order.
- Tier list (DONI-506): Lolalytics' columns rank · tier (S+ … D-) · champion · lane % · win · Δ · pick · ban · PBI · games ·
  best on champion (win, games, avg rank; players with 20+ games, crawler `best`); lane tabs, min lane % / min pick % (client
  filters, hide rows), min games (crawler `min_games`: greys and un-tiers rows), patch/region (from `/lol/tiers` `regions`)/rank.
  Rule in `leagueTierRows` (stats-api.js) and crawler/README.md. Styles at the end of `league-world.css` (`.lg-table.lg-tiers2`,
  a container query keeps it unscrolled down to ~790 px). Crawler side: `crawler/src/agg-players.js`.
- Champion page (DONI-507) lives in `src/webui/league-champion.{js,css}`, Lolalytics' section order: strip (win, delta, game
  avg, pick, ban, tier, rank, games) · role tabs · skills (priority + order grid, 6/10/15 toggle) · spells, runes, stat mods ·
  starting, early, core build, items 4·5·6 (`window.leagueSlotAlternatives`, tested in `app/test-league.js`) · objectives ·
  counters (delta 1/2) · synergies · best players (DONI-506's `/lol/champion/{id}/players`, "coming soon" when absent).
  Crawler side: `crawler/src/timeline.js` (purchase/skill parse) + `crawler/src/agg-champion.js` (tables, aggregate, the extra
  `/lol/champion/{id}` fields). Timeline blocks come from the TIMELINE_SAMPLE share of games and fill forward from deploy.
- Scanability (DONI-516): `lgHeat` (league-stats.js) tints win rate, Δ, PBI and counter/synergy/objective numbers from ivory toward
  spell light / lifted defeat by distance from the list average (or 0), 1 = the column's 90th-percentile distance over full-sample
  rows, times a sample weight (20 games 0.15, 2,000 full); a `.lg-legend` line sits under each table. Density compact/comfortable is
  `<html data-lg-density>` (localStorage `queuepop-league-density-v1`; select its buttons as `button[data-lg-density]`). Table
  `thead`s are sticky at `top:56px` (League page row height). Styles at the end of `league-world.css`.

## Text size
- Settings > Display (DONI-516): config `ui_scale` (0.9/1/1.1/1.25/1.5, default 1.1, kept by `normalizeConfig`). `app/main.js`
  applies it on every load and via bridge `set_ui_scale` (`webContents.setZoomFactor`); Ctrl+= / Ctrl+- / Ctrl+0 are caught in
  `before-input-event` and call the renderer's `qpStepScale` (settings.js), which saves and applies. `shell.css` caps the sidebar at
  30vw and lets `#world-nav` scroll sideways so 150% does not widen the page.

## Home
- Before opening a PR, run every check under `tests/` (`for t in tests/test_*.py; do py "$t"; done`),
  not only the one you added. A worker merged a change that broke a sibling test once (2026-10-01).
- The Release workflow triggers on `src/_version.py` changing on main and creates the tag itself;
  rewrite `RELEASE_NOTES.md` (player-facing, shown in-app) in the same commit.
