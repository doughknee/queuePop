# Deadlock — The midnight bureau

A standalone, functional frontend design study inside the QueuePop repository. The production app, marketing site, other games, and backend are unchanged.

## Preview

From this directory, run `py -m http.server 4317 --bind 127.0.0.1`, then open http://127.0.0.1:4317/. No packages or build step are needed. `comparison.html` shows the supplied V2 screenshot beside the new browser capture.

## Art direction

The composition is a city seen through stepped Art Deco architectural framing. The full scene carries the atmosphere; the restrained bottom desk carries the useful information. A notched admission ticket opens the hero archive. Navigation, ornament, and controls use one architectural vocabulary. QueuePop stays visible in the quiet outer frame and companion controls.

- Ink green `#15201c`, aged bone `#e8dec0`, tarnished brass `#a5976e`, spectral sage `#a8c9aa`, paper `#e1d5b5`.
- Local Marcellus for scene and archive headings; Georgia for the Deadlock-inspired study wordmark; Arial for compact controls.
- Asymmetric, left-aligned arrival copy with the skyline open on the right. A single low desk replaces independent stat cards. On phones the scene crops intentionally and the desk becomes a readable list.
- No decorative continuous animation. Reduced-motion preferences disable transitions. Native modal dialogs support keyboard trapping, Escape, and focus restoration.

## Functional scope

- Six searchable hero dossiers, playstyle notes, and selection reflected in the city view.
- Two illustrative Warden build approaches, independently saved in local browser storage.
- Match-result filters over three clearly fictional sample records.
- Expandable introductory field guide.
- Simulated queue with start, elapsed time, cancel, ready check, and reset. The timer continues while its panel is closed.
- Phone and Discord preferences remembered locally. Neither sends notifications.

No Steam/game calls, pywebview bridge, matchmaking, real accounts, notification delivery, or live strategy data. Hero selection and queue state are intentionally session-only. Build flags and notification preferences use `queuepop-deadlock-city-v1` in localStorage and degrade to session-only storage when unavailable.

## Assets

`assets/city.webp` is an optimized copy of new art generated with the built-in imagegen tool. See `ART_PROMPT.md` for the prompt. `original-city.webp` is the prior concept artwork recovered from the user's V2 download; `before-v2.png` is the supplied screenshot. The QueuePop mark and Marcellus font are existing repository assets. `after-desktop.jpg` is a browser capture of the implemented frontend.

## Validation

JavaScript syntax and whitespace checks. Browser inspection at 1440, 1024, 768, 390, and 320 pixels; mobile archive rendering; horizontal-overflow checks; hero search and selection; build approach selection and save persistence after reload; match filtering; guide expansion; modal Escape/focus restoration; queue start/close/reopen/pop/reset/cancel; notification preference persistence. See the review report for the actual completed checks.
