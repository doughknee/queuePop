# Deadlock — The midnight bureau

A standalone, functional frontend design study inside the QueuePop repository. The production app, marketing site, other games, and backend are unchanged.

## Preview

From this directory, run `py -m http.server 4317 --bind 127.0.0.1`, then open http://127.0.0.1:4317/. No packages or build step are needed. `comparison.html` compares the previous clean pages with the new weathered treatment and retains earlier references.

## Art direction

The composition is a city seen through curved Art Deco architectural framing. The full scene carries the atmosphere; the restrained bottom desk carries the useful information. A curved admission ticket leads to the dedicated hero page. Navigation, ornament, and controls use one architectural vocabulary. QueuePop stays visible in the quiet outer frame and companion controls.

- Ink green `#15201c`, aged bone `#e8dec0`, tarnished brass `#a5976e`, spectral sage `#a8c9aa`, paper `#e1d5b5`.
- Local Marcellus for scene and archive headings; Georgia for the Deadlock-inspired study wordmark; Arial for compact controls.
- Asymmetric, left-aligned arrival copy with the skyline open on the right. A single low desk replaces independent stat cards. On phones the scene crops intentionally and the desk becomes a readable list.
- No decorative continuous animation. Reduced-motion preferences disable transitions. Dedicated hash-routed pages support direct links, refresh, browser Back/Forward, and a persistent navigation. Page changes focus the main heading; the skip link preserves the current route.

## Functional scope

- Six searchable hero dossiers, playstyle notes, and selection reflected in the city view.
- Three illustrated Warden/Ivy loadouts with purchase stages, selectable item explanations, and independent local saves.
- Hero/result filters and three fictional after-action reports, including a soul-lead chart, encounter timeline, expandable takeaway, and linked loadout.
- Expandable introductory field guide.
- Simulated queue with start, elapsed time, cancel, ready check, and reset. The timer continues while its panel is closed.
- Phone and Discord preferences remembered locally. Neither sends notifications.

No Steam/game calls, pywebview bridge, matchmaking, real accounts, notification delivery, or live strategy data. Queue state is intentionally session-only. Hero selection, build flags, and notification preferences use `queuepop-deadlock-city-v1` in localStorage and degrade to session-only storage when unavailable.

## Assets

`assets/city.webp` is an optimized copy of new art generated with the built-in imagegen tool. See `ART_PROMPT.md` for the prompt. `original-city.webp` is the prior concept artwork recovered from the user's V2 download; `before-v2.png` is the supplied screenshot. The QueuePop mark and Marcellus font are existing repository assets. `after-desktop.jpg` is a browser capture of the implemented frontend.

## Validation

JavaScript syntax and whitespace checks. Browser inspection at 1440, 1024, 768, 390, and 320 pixels; mobile archive rendering; horizontal-overflow checks; hero search and selection; build approach selection and save persistence after reload; match filtering; guide expansion; modal Escape/focus restoration; queue start/close/reopen/pop/reset/cancel; notification preference persistence. See the review report for the actual completed checks.


## Second design pass

The archive now has a persistent section navigation and a split hero directory/dossier. Six locally stored Valve hero portraits replace placeholder glyphs; selection is remembered on this device and updates the city desk. The celestial seal opens the field guide on desktop, while the phone layout keeps its simpler text entry. Shared SVG line icons replace platform-dependent navigation glyphs. Feedback is rendered inside the native dialog so confirmation stays visible above its backdrop.

Portrait provenance is documented in `assets/heroes/README.md`. The API is used only to obtain the static artwork during development; the app still makes no runtime service calls. `assets/first-pass.jpg` preserves the first redesign for comparison.

## Builds and match reports

The build ledger uses an arched hero portrait, three loadout files, a diamond-marked purchase rail, and locally stored item art. The match archive uses selectable encounter files and an editorial report with three restrained stats, a fictional momentum chart, three key moments, and a next-match note. The two sections link directly to the relevant loadout; Ivy's dossier opens her support plan. The other four dossiers explain that only Warden and Ivy have sample builds.

Fixtures live in archive-data.js, archive rendering in casework.js, and their responsive styles in casework.css. These loadouts illustrate interaction design; no patch-specific prices, numerical item effects, or current build ranking is claimed. Asset provenance is in assets/items/README.md and sources.json.

## Dedicated-page pass

The archive overlay is removed entirely. Heroes, builds, match history, field guide, and companion are full-page views under `#/heroes`, `#/builds`, `#/history`, `#/guides`, and `#/companion`. `#/` is the city. Hash routing keeps direct links working on the simple static preview server. Page changes update the browser title and active navigation. The demo queue remains in memory while moving among pages.

Each archive page has its own city-backed heading, full-width paper surface, and normal document scrolling. `pages.css` adds curved architecture, uneven paper edges, cameo portraits, oval seals, and asymmetrical controls. The companion retains its existing frontend-only behavior. The previous modal screenshots are preserved for comparison; current captures use `assets/pages-*.jpg`.

## Atmosphere and wear

`atmosphere.css` adds static material wear: local paper grain, edge foxing, fold marks, scratched metal/glass, and faded civic seals. The city heading includes overhead wires and a lamplit night-service sign; portrait backgrounds now show the same city. Decorative details are hidden from assistive technology and do not intercept pointer input. Phone layouts omit the sign and reduce the edge treatment. Small informational labels and keyboard focus use stronger contrast; the increased-contrast preference removes the main paper texture.

The four small SVG texture/ornament files (`paper-grain.svg`, `paper-weather.svg`, `surface-wear.svg`, `city-seal.svg`) were authored for this prototype. No new external assets, dependencies, service calls, animation, or functionality changes were added. Current screenshots use `assets/weathered-*.jpg`; earlier captures remain available.
