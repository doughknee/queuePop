# QueuePop / three worlds

An interactive frontend concept for the future multi-game QueuePop. This is a separate prototype: production files in `src/`, the running app, and the approved `prototypes/deadlock/` remain unchanged.

## Preview

Run `start-preview.cmd`, then open http://127.0.0.1:4318/queuepop/.
The server serves the parent `prototypes/` directory so the approved Deadlock study can supply its existing artwork and styles. It binds only to localhost. No dependencies or build step are required to view the checked-in concept.

## Explore

- QueuePop home: three game entrances, shared masthead, and a shortcut to a saved champion plan.
- League: cinematic overview, Ahri/Lux/Yasuo champion selection, three purchase stages per champion, saved plans, filtered sample match history and dedicated reports.
- TFT: illustrated overview, three example formations, a 28-hex board with bench placement, moves, swaps, removal, reset, and independent remembered boards. Saved teams and dedicated sample match reports.
- Deadlock: approved pages in the shared masthead, without redesigning the game experience.
- Companion: local reminder preference and an explicit queue-ready visual preview.

All data is illustrative. Purchases and team formations are not current-patch recommendations. No Riot client, LCU, phone, Discord, notification, analytics, or production API is connected. Runtime assets are local. New preferences use the isolated `queuepop-worlds-v1` localStorage key.

## Files and integration boundary

`shell.css` and `shell.js` own the shared navigation. `app.js` owns the League, TFT, home, and companion concept. `styles.css` contains game-specific art direction and responsive layouts. See `DIRECTION.md` for visual decisions.

`deadlock.html`, `deadlock-app.js`, and `deadlock-casework.js` are generated adapters. Run `py build-deadlock-bridge.py` after intentionally changing the original Deadlock study. The adapter only changes asset paths and global navigation; it avoids a base element so nested hash routes remain in the combined preview after refresh. Deadlock's source files and assets are reused, not edited.

## Validation / 2026-10-12

- Rendered and visually reviewed home, League overview/champion/build, TFT overview/comps/planner/history, and mobile planning.
- All twelve new route types checked at 320px and 768px CSS widths: no horizontal document overflow, no broken loaded images, headings present. Desktop reviewed at 1440px; mobile at 390px.
- Exercised champion change, item stages, per-champion saving, match-result filtering, report-to-correct-champion navigation, companion preview/reset.
- Exercised TFT bench placement, move, saving, switching formation and returning, refresh persistence. Existing board controls support swaps/removal/reset.
- Verified Deadlock interior navigation retains the bridge URL and shared masthead on refresh; existing queue demo starts.
- JavaScript syntax and Git whitespace checks. Production test suite not run because production source and backend behavior were not changed.

Screenshot deliverables are saved in the task's outputs directory. Artwork provenance is in `assets/SOURCES.md`.
