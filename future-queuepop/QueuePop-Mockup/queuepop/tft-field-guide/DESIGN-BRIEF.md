# HEXCRAFT design continuity

## Purpose

Build a polished Teamfight Tactics companion in the space of TFTAcademy and MetaTFT. Work directly with editable project files and a browser preview, without requiring the user to download and unpack each iteration.

## User direction

- Preserve HEXCRAFT branding and a strong, recognizably TFT identity.
- Make the site feel native to TFT through game artwork, champion and item imagery, hexagonal positioning boards, and precise visual hierarchy.
- Include a homepage, compositions list, and expandable composition guides.
- Use real game assets where permitted; preserve attribution and verify provenance before adding or publishing assets.
- Aim for a polished, intentional interface. Avoid an overwhelmingly AI-generated appearance or generic dashboard treatment.
- Retain visual impact. Earlier simplification lost too much TFT charm.
- Iterate interactively on the running project.

## Recovered implementation

Dark navy surfaces, restrained gold trim, condensed display headings, HEXCRAFT crest, Choncc hero artwork, framed champion portraits, featured composition board, searchable and filterable composition rows, expandable field notes, item priorities, and board level tabs.

The homepage and composition browser are implemented. Tier Lists, Champions, and Team Builder currently show roadmap notices. Account functionality is not implemented.

## Data boundaries

The source explicitly describes its builds and rankings as fictionalized examples. Set 18 / Enchanted Wilds / patch 18.4b are inherited presentation copy, not verified current game information. Performance percentages and recommended lineups are sample values, not live advice.

Artwork was recovered from the original ZIP. It is credited to Riot Games in the site footer. Asset-level provenance and permitted public use have not been independently verified during this local recovery.

The board is a visual demonstration: each comp supplies six portrait IDs, repeated to populate additional slots; Level 9 is capped at eight occupied hexes in the original code. The homepage's 24-comp figure is sample copy while the browser contains six sample compositions. Carry names are not reliably mapped to the recovered portrait IDs. These boundaries need resolving before presenting this as a real gameplay companion.

## Conversation evidence

Reference: Theme App Like TFT, conversation `6acd85ee-5070-83e8-aafb-1b48860c243c`.

The accessible prior user turns asked for a visual mockup, said an iteration lost TFT charm and needed more TFT visual impact, then said a later version looked overwhelmingly AI-generated. The user approved proceeding and subsequently could not open the deliverable, prompting the move to Work/Cowork.

The chat reader returned assistant messages only as content-reference placeholders and exposed no earlier cursor or attachments. The complete original assistant design discussion was therefore not recoverable through that reader. This brief preserves the current user's complete continuation requirements, the available prior user feedback, and the actual recovered source; it does not invent missing decisions.

## Recovery validation

The local homepage returned HTTP 200 and the JavaScript syntax check passed. Browser inspection confirmed the original artwork and layout render. Search for Kog returned the matching composition; the Reroll filter returned two compositions; reset restored the list; the Aphelios guide expanded with field notes, board, and items.

## Latest visual direction (October 13)

The user flagged the mascot hero artwork as taken from TFTAcademy and asked for a more TFT-coded hero. Removed the mascot cutout, giant sigil, floating slogan and portrait stack from the active page. Replaced them with `assets/hexcraft-arena.svg`, an original vector arena composition authored here, with local game portrait assets, a stage indicator, a four-by-seven hex board, a bench and a shop. The game state is illustrative. No new third-party artwork was downloaded.

The user specifically approved the lower scouting report and composition list. Preserve those sections when refining the hero. Their markup and rendering logic were left unchanged by this pass.


## Interactive playground and navigation direction

The user approved the original arena composition and requested playable interactions: champion ability/item hover details, drag-and-drop with glow, shop purchases and rerolls. They suggested an actual thematic arena background while retaining the option of the clean look. They also explicitly dropped HEXCRAFT branding in favor of useful TFT-themed navigation; that supersedes the initial branding-preservation direction above.

Implemented a curated, local Set 13 planning sandbox using actual mapped champion portraits and descriptive ability summaries. The header now offers Overview, Team Comps, Champions, Items, comp search and Playground. The Freljord/Classic switch preserves both visual treatments. The champion and item guides are functional dialogs, and the homepage's champion and builder cards open the new features. The lower scouting report and composition list remain unchanged except for removal of HEXCRAFT footer branding.

Combat, live match integration, exact TFT economy simulation and a complete current roster are outside this pass. Source and asset provenance are recorded in ASSET-SOURCES.md.
