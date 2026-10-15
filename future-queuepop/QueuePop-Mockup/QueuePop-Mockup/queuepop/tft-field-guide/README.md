# TFT Field Guide

The editable TFT companion prototype, now with a playable planning sandbox. HEXCRAFT branding has been removed from the active site.

## Preview

Open http://127.0.0.1:4173 while the local preview server is running. The server is bound to this computer only. Edit the source and refresh the preview to see changes.

To restart from this folder:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

## Source

- `index.html`: homepage, compositions page, navigation, and filters.
- `styles.css`: original HEXCRAFT visual design and responsive layouts.
- `app.js`: sample compositions, search, filtering, sorting, expandable guides, board previews, and guide links.
- `assets/`: 101 recovered local images plus the original HEXCRAFT arena SVG. The flagged Choncc cutout is no longer used on the site.
- `arena.js`, `arena-model.mjs`, `arena-data.js`, `arena-ui.css`: interactive board, shop, economy, tooltips, item armory, navigation and guides.
- `ASSET-SOURCES.md`: provenance of the mapped champion portraits, data and official arena backdrop.
- `DESIGN-BRIEF.md`: preserved design direction and known prototype boundaries.

Imported on October 13, 2026 from `C:/Users/doni/Downloads/hexcraft-source.zip`. The hero now uses one right-aligned Riot Avarosa backdrop under the interactive board and adapts to its content height. The approved lower homepage sections retain their original design. The self-contained HTML export is preserved beside this folder as `Hexcraft TFT Prototype.html`.

This is a local working prototype. It has not been published. No installation or ZIP extraction is needed to use the running preview.

Linear project synchronization is pending: the connected Linear app returned an authentication error during recovery. No Linear project or issue was created or updated.


## Interactive sandbox

Hover or keyboard-focus a champion to inspect abilities, traits, base stats and equipped items. Drag between hexes and bench slots, or select a unit then click its destination. Occupied slots swap. Buy from the five-card shop, reroll for 2 gold, buy 4 XP for 4 gold, lock the shop, equip/unequip items, sell units and reset. Three copies combine into a higher star level. D/F/E shortcuts work while focus is inside the sandbox. Touch users can tap to select and place units.

The model is a local, curated Set 13 demonstration. It is not a full TFT game: no combat, shared champion pool, level-based shop odds or round income. Shop selections are equally weighted over 12 champions. Selling refunds full copy cost. Stats are base champion reference values, not calculated combat stats. The guide explains these simplifications.

The Freljord/Classic toggle swaps Riot's Avarosa arena backdrop and the clean board treatment. Champion and item guides open from the new TFT navigation. The lower scouting report and comp list retain their sample content and layout.

Validation: model checks cover purchases, insufficient gold, bench capacity, board cap, swaps, reroll locking, XP, star combinations, equipment limits, selling and reset. Browser checks verify hover tooltips, mouse drag/drop, drag-to-sell, item equip, purchase/reroll/XP gold accounting, champion guide search, mobile layout and keyboard controls. Linear tracking remains unavailable because the connector requires reauthentication.

## Drag and backdrop refinement

Drag a shop champion onto an empty bench or board slot to purchase directly there. Full, occupied or invalid destinations reject the purchase without spending gold. Drag an owned champion over the shop to reveal a large sell target with its refund value. Click buying, click-to-place and the Sell button remain available. Desktop tooltips sit outside the sandbox; narrow-layout tooltips sit above or below the shop. The arena image appears once, aligned to the playable field.

The board, bench, gold, XP, shop and items survive refreshes within the same tab using validated session storage. Reset restores the default setup. Verification covers targeted purchases, rejected/cancelled drops, selling, session restoration, desktop/mobile tooltip clearance and horizontal overflow.


## Connected practice guides and saved boards

Three Set 13 teaching guides now share champion IDs and exact stage positions with the playground: Jinx Rebel Capstone, Zeri Firelight Backline, and Vex Visionary Practice. Each has an opener, transition, final board, positioning notes, item holders, alternatives and pivot advice. Play this board loads the selected stage; Undo load restores the preceding playground state. The old fictional rankings, win rates and Set XVIII labels were removed from the active site.

Save board stores a named snapshot in this browser's local storage. My boards loads it after reloads. Existing names are protected from accidental overwrite. Share produces a link and a portable board code; imports preview before replacing the current board and validate champions, slots, stars, equipment, currency and capacity. Localhost links only work on the same computer; the portable code can be imported into another running copy of this site. Clearing browser storage removes saved boards; keep a board code as a backup. No cloud account, live match data or public hosting is included.

New source: comp-data.js contains guide content and stage snapshots; board-files.mjs validates and encodes portable boards; board-controls.js implements saves, library, sharing and undo. app.js is now an ES module using the same champion data as arena.js.

Validation: Node model and guide-flow assertions passed for all nine guide stages, exact units/items, board capacities, Unicode round trips and malformed imports. Browser checks covered guide loading, move/swap, undo, named save, reload, saved restore, share-code copying, shared-link preview/load, malformed input, duplicate-name protection, search and difficulty filters, and the 320px guide/save layout. The main user's existing playground state was retained. Linear synchronization remains unavailable because its connector returns UNAUTHORIZED.
