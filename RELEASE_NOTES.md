We deleted **83,000 lines** from queuePop and it does… exactly the same thing. That's the whole release, and we're weirdly proud of it.

Every project quietly hoards things it doesn't need — API docs frozen in 2018, finished experiments, two copies of the same logic wearing different hats. This release took out the trash, so every future fix and feature lands in a smaller, sharper codebase. If you notice *anything* behaving differently, that's a bug — tell us.

## 🔧 Under the hood

- **Pick-order swaps and role swaps now share one battle-tested brain** instead of two identical twins — same behavior in champ select, half the code to maintain, plus a new automated check that proves it (requests the best spot, falls down your priority line on a decline, cancels stale asks, never accepts a downgrade).
- **The phone companion listens on its live event stream only.** The dial-up-era fallback for browsers without server-sent events (last spotted in the wild circa 2012) is gone.
- **~79,000 lines of stale League client API docs are out.** They dated to client 8.24 and had already lied to us once — queuePop verifies endpoints against your live client instead, which is how it survives Riot's renames.
- **The marketing site went on a diet**: its heavyweight web framework is replaced by plain Vite + React with the same prerendered result — 44 packages where there were hundreds.
- Retired the counter-engine tuning experiments (their winning numbers are baked in), deduplicated 3.4 MB of screenshots, and swept out dead code.

Nothing new. Nothing fixed. Nothing broken. Sometimes the best feature is 83,000 fewer lines that could go wrong. o7
