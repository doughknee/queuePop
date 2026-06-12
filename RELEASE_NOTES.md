A focused follow-up to the 1.4.0 redesign: your champ select plan gets the draft math built in, the pick/ban trays learned to fit any window beautifully, and the app finally remembers how big you like it.

## 🧮 Your plan, with the math done for you

How many picks is *enough*? We did the worst-case arithmetic: as last pick, 10 bans and 9 picks can be gone before your turn — so **20 distinct picks guarantees one survives**, and a 21st could never matter. Bans: only your four teammates' declared picks can block a target, so **a 5th ban always lands clean**. The planner now puts a counter on each list (hover it for the math), turns gold once you're practically covered — about 4 picks, or any fallback mode — and caps the lists at 20 and 5, because anything past that is dead weight. Try to add more and queuePop politely tells you why it won't. ARAM is exempt; its priority list isn't a draft.

## 🖼️ Trays that fit like they were drawn there

The picks and bans now lay themselves out as two tidy blocks that share the same row count and **fill the page edge to edge at any window size**. Slots scale gently to use the space, stay pixel-crisp at rest, and glide while you resize instead of jumping. No more stray gaps, overlapping sections, or lonely half-rows.

## 🪟 A window that remembers

Resize queuePop once and it opens at exactly that size, every launch. (Maximizing doesn't count — it remembers the real size underneath.) The minimum window is now 762×800, the smallest size where every page lays out properly.

## 🔧 For the curious

The list caps are enforced in the UI and again in config normalization, so oversized hand-edited configs trim themselves on load. The tray layout is solved deterministically from the container and header widths — fewest rows that fit, slot size scaled to fill, integer-quantized for crisp art — and the resize glide is a registered CSS `@property` transition, no per-frame JavaScript. The remembered window size is an additive `window` config key: old configs upgrade in place and downgrade safely.
