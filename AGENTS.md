# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains runtime code: `src/main.py` entry/tray bootstrap, `src/lcu.py` for LCU events, `src/config.py` config + Rich console, `src/notifications.py` dispatchers, `src/tray.py` tray UI, `src/gui.py` settings window, `src/_version.py` version string.
- Assets live in `assets/gnome-thresh.ico`; build artifacts go to `build/` and `dist/` via PyInstaller; zipped releases land in `releases/`.
- Test and helper scripts live in `tests/` (e.g., `tests/test-msg.py`, `tests/test_vars.ps1`).

## Build, Test, and Development Commands
- Install deps in a venv: `python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt`.
- Run from source: `python src/main.py` (creates/reads `config.json` next to the binary or in `src/` when running unfrozen).
- Build the tray executable: `python -m PyInstaller queuePop.spec`; full clean + zip: `python build_release.py` (outputs `queuePop.exe` under `dist/` and `releases/queuePop-v<version>.zip`).
- For manual webhook smoke test, set `WEBHOOK_URL` in `tests/test-msg.py` then run `python tests/test-msg.py`. PowerShell helper: `pwsh tests/test_vars.ps1`.

## Coding Style & Naming Conventions
- Target Python 3.14 on Windows; follow PEP 8 with 4-space indents and snake_case modules/functions, PascalCase classes, and UPPER_SNAKE constants.
- Keep side effects near entry points (`src/main.py`); new helpers should be pure where possible and reusable for PyInstaller.
- Preserve Rich console logging (`config.console`) and the `resource_path` pattern for assets to stay PyInstaller-friendly.

## Testing Guidelines
- There is no automated suite yet; add new tests under `tests/` prefixed with `test_` and prefer pytest-style functions for async helpers.
- When adding LCU interactions, mock network calls and include a short reproduction note in the PR description if manual validation is required.

## Commit & Pull Request Guidelines
- Follow the existing history format: `Feat: short summary`, `Fix: short summary`, `Refactor: short summary` using imperative, present-tense summaries.
- PRs should include a short changelog, validation steps (e.g., queue pop accepted, Discord ping received), screenshots for GUI/tray changes, and links to any tracked issues.
- Bump `src/_version.py` and regenerate artifacts via `python build_release.py` when cutting a release; attach the produced zip under `releases/`.

## Security & Configuration Tips
- Do not commit `config.json` or real Discord webhooks; use dummy values in shared files and redact logs.
- Keep the tray icon at `assets/gnome-thresh.ico`; update `queuePop.spec` if new assets are added so PyInstaller bundles them.
