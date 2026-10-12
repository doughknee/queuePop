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


## Refinement pass

- Added six locally stored Valve portraits through the community Deadlock API. Attribution and original URLs are in `assets/heroes/`.
- Rebuilt the hero archive as a persistent directory and illustrated dossier, with arched portrait framing and file-style section navigation.
- Separated inspecting a hero from selecting one. Explicit selection updates the home portrait and survives reload; verified using Ivy, then restored Warden for the preview.
- Added custom line navigation symbols and a functional desktop field-guide sigil; removed the sigil on mobile to protect text space.
- Made confirmation messages visible inside modal dialogs; verified build-save and simulated queue-pop feedback.
- Checked desktop, tablet, 390-pixel phone, and 320-pixel narrow phone layouts. Fixed archive-tab horizontal overflow at 320 pixels; verified dialog scroll width equals client width there and at 768 pixels.
- Tested empty search, switching heroes, archive section navigation, match filtering, Escape/focus restoration, queue start/pop/reset, and all comparison images loading. JavaScript syntax and browser error checks passed.
- Browser zoom was already 120%. Desktop screenshot dimensions were adjusted to retain a 1440 CSS-pixel layout without changing that preference; all temporary viewport overrides were cleared.
- Preserved the first-pass screenshot; updated comparison.html with the current homepage and dossier captures.
- Linear was checked again and still requires reconnection. No remote publishing or deployment occurred.

## Build and match-report pass

- Rebuilt builds as an illustrated ledger: three Warden/Ivy plans, three purchase stages per plan, twelve local item icons, selectable purpose notes, independent saved flags, and linked hero dossiers.
- Rebuilt match history as three fictional after-action reports: hero/result filters, selected encounter details, three useful stats, a sample soul-lead chart, timed narrative moments, expandable next-match guidance, and links to each report's sample loadout.
- Browser-verified changing all stages, inspecting different items, all three plans, saving Ivy's plan, and the saved state surviving reload. Existing Warden saved states remained intact.
- Verified all three reports change their content, defeat + Warden produces an honest empty state, clearing restores all records, and Ivy's report/dossier open the Ivy plan. The report link opens its closing stage.
- Visually inspected desktop, tablet (768 CSS pixels), 390-pixel phone and 320-pixel narrow phone treatments. Both archive sections have equal dialog client/scroll widths at 768, 390, and 320 pixels. Phone timelines become a vertical sequence.
- Verified Escape closes the native dialog and restores focus to its launcher. No captured browser warnings/errors; syntax checks pass for all three scripts.
- Updated comparison page with browser captures of builds and history. Static icon provenance is recorded; the preview remains frontend-only with fictional match data and illustrative builds.
- Linear connection remains blocked by the previously verified authentication requirement. No remote publication or issue update was performed.


## Dedicated-page and curved-framing pass

- Removed the dialog markup and all modal open/close behavior. Every section, including the guide and companion, now has a dedicated full-page route, shared persistent navigation, one visible main landmark, and its own browser title.
- Replaced angular frames with broad curved paper edges, uneven lower edges, portrait cameos, soft loadout/item controls, oval seals, and curved rules. Updated the city entrance to share this shape vocabulary.
- Verified browser Back, Forward, and refresh retain the correct section. Tested the skip link without changing the page address. Confirmed there are no dialog elements.
- Visually reviewed desktop at 1440 CSS pixels, tablet at 768, and phones at 390 and 320. Fixed a decorative orbit extending beyond the phone page; document scroll width now equals client width in tested narrow layouts.
- Exercised hero-to-build links, loadout changes, purchase stages and item notes, match filters and empty state, guide navigation, and the full-page companion start/leave/return/pop/reset flow. Queue state stays available across in-app navigation. Browser captured no warnings/errors.
- Preserved earlier modal captures and updated comparison.html to show the popup versus dedicated-page design, with the original V2 reference retained.
- Existing local-only scope remains: no production app, backend, other game, deployment, or remote publication changes. Linear reconciliation remains pending the previously reported connector reauthentication.


## Atmosphere and wear pass

- Added a lamplit night-service sign, overhead wires, deeper city shading, and city-backed portrait cameos.
- Added authored local SVG grain, edge stains/foxing, fold lines, surface scratches, and a faint civic seal. Distress is in backgrounds and margins; interactive labels remain intact. All purely decorative markup is aria-hidden and does not capture pointer events.
- Kept all texture static. No audio, continuous animation, new service calls, packages, or backend behavior.
- Strengthened small informative text and keyboard focus on parchment. Verified keyboard Tab reaches a visible purple outline on the item controls. Increased-contrast mode removes main paper texturing.
- Visually inspected the hero, build, history, city, and guide treatments. Verified 1440 desktop, 768 tablet, 390 phone, and 320 narrow layouts. Corrected the rotated seal's aspect ratio so it cannot create horizontal scrolling. Tested layouts have equal document client/scroll widths.
- Verified item-stage changes, item explanation selection, and match-result filtering remain functional. Captured browser warnings/errors were empty. JavaScript syntax and whitespace checks passed.
- Saved the latest screenshots and updated comparison.html with an immediate clean-page versus weathered-page comparison. Earlier V2 and popup references remain available.


## Individual dossier pass

- Added six distinct portrait/ink treatments, pinned glass, decorative subject marks, handwritten marginal notes, and field-observation labels. Reused all existing static artwork.
- Added numbered previous/next navigation, chosen-hero checkmarks, individual hash links, browser titles, and phone directory-return behavior. Browsing remains separate from explicit selection.
- Browser-verified direct-link refresh, Back/Forward, all six next steps including wraparound, retained pager focus, search and empty states, and saved selection across reload. Restored Warden as the selected hero afterward.
- Visually inspected desktop 1440, tablet 768, phone 390, and narrow phone 320. No horizontal overflow at these sizes. Phone selection scrolls to the dossier; return focuses the search. Browser warning/error capture was empty.
- Updated comparison with before/after and Warden, Infernus, and Ivy examples. Saved a phone preview. Existing build, report, and earlier V2 references remain available.
- Local frontend study only; no backend, deployment, or remote publication changes.
