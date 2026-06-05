# Repository Guidelines

## Project Structure & Module Organization
- `src/` — runtime code. Entry/bootstrap `src/main.py` (tray + webview + LCU loop);
  `src/lcu.py` LCU client + event subscription; `src/champ_select.py` auto
  pick/ban + ARAM bench; `src/web_api.py` pywebview `js_api` bridge; `src/gui.py`
  settings window; `src/tray.py` tray icon/menu; `src/notifications.py` Discord +
  desktop alerts; `src/companion.py` LAN companion server (phone); `src/config.py`
  config + Rich console; `src/events.py` event constants; `src/updater.py`
  auto-update (installed vs portable); `src/_version.py` version string.
- `src/webui/` — the web UI (HTML/CSS/JS) rendered by pywebview. Downloaded
  League assets land under `src/webui/assets/` (gitignored; see scripts below).
- `assets/queuepop.ico` — app icon, bundled into the exe by `scripts/queuePop.spec`
  and referenced at runtime via the `resource_path("assets/queuepop.ico")` pattern.
- `brand/` — brand kit master (marks, lockups, fonts, `play-button.svg`,
  `brand-guidelines.html`). Reference material; not consumed by any build — the
  app and site each carry their own derived copies.
- `scripts/` — all build/dev tooling, invoked from the repo root so their
  relative paths resolve: `build_release.py` (release orchestrator),
  `queuePop.spec` (PyInstaller), `tailwind.config.js`, `run.cmd` / `stop.cmd`
  (launch/kill the app), `fetch_assets.py` (download champion/role icons), and
  `lcu_docs_gen.py` + `lcuapi.txt` (regenerate the `docs/lcu/` API reference).
- `docs/` — `screenshots/` (README images) and `lcu/` (vendored LCU API reference).
- `installer/queuePop.iss` — Inno Setup script for the installed build.
- `site/` — marketing site (Vite + TanStack Start); self-contained.
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
