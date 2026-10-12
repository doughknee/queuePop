# Review — October 12, 2026

## Completed

- Read the existing QueuePop repository and its instructions; confirmed the working checkout was clean before creating `codex/deadlock-city-concept`.
- Inspected the supplied V2 screenshot and recovered its original city asset from the user's Downloads folder.
- Built only `prototypes/deadlock/`; no app, marketing site, game integration, or release changes.
- Created new atmospheric city artwork with built-in imagegen and kept the prompt in `ART_PROMPT.md`. The WebP is approximately 309 KB; fonts and brand assets are local.
- Replaced the sidebar/card composition with full-scene artwork, stepped architectural lines, a notched ticket action, and a quieter three-part desk.
- Implemented hero search/details/selection, two individually saved sample build approaches, sample match filters, guide accordions, simulated queue controls, and persisted demo notification preferences.

## Browser checks performed

- Rendered and visually inspected at 1440×1000, 1024×900, 768×1024, 390×844, and 320×740.
- Verified document width does not exceed viewport width at each tested size.
- Fixed narrow-screen headline/ticket wrapping, the edge-clipped location caption, and background scrolling while a modal is open.
- Searched for Ivy, opened the dossier, selected Ivy, and verified the main screen updated.
- Changed build approach, saved the durable plan, reloaded, selected it again, and verified its saved state.
- Filtered match history to defeats and verified only the sample Ivy defeat remained.
- Expanded a second field-guide section; Escape closed the dialog and focus returned to its original launcher.
- Started a queue, closed/reopened the companion, simulated a pop, reset it, and separately tested cancellation.
- Toggled the Discord demo preference and verified it survived reload.
- Inspected the mobile hero archive and the finished comparison page.
- Browser console showed no captured warnings or errors; JavaScript syntax check passed.

## Boundaries and handoff

This is a functional frontend mockup, not a deployed QueuePop release or real Deadlock integration. Match records are fictional; the hero roster and build notes are illustrative. No live notifications are sent.

The preview is served only on `127.0.0.1:4317`. Restart with `start-preview.cmd` from this folder if the server has stopped. Open `comparison.html` for the before/after view.

Linear project lookup was blocked by an `UNAUTHORIZED` response requiring reauthentication. No issue or status update was claimed or fabricated; board reconciliation remains pending reconnection.
