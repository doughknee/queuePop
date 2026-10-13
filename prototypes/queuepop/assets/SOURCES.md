# Concept artwork and type

- QueuePop mark: existing original `brand/svg/mark-mono-light.svg`.
- Cinzel and Marcellus: existing `brand/fonts/` copies, SIL Open Font License; existing brand documentation records their provenance.
- Germania: referenced from the approved Deadlock study, with its license retained there.
- Champion icons: copied from the repository's already bundled `src/webui/assets/champions/`. Ahri 103, Lux 99, Yasuo 157, Garen 86, Leona 89, Ashe 22, Lulu 117, Jinx 222. These are Riot Games champion portraits.
- Champion splash artwork: Riot Data Dragon, `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/{Ahri,Lux,Yasuo,Garen,Jinx}_0.jpg`. Local WebP conversions preserve artwork. [Official Ahri page](https://www.leagueoflegends.com/en-us/champions/ahri/).
- Item icons: Riot Data Dragon, pinned visual fixture asset version `14.12.1`, `https://ddragon.leagueoflegends.com/cdn/14.12.1/img/item/{id}.png`. Version is an asset source, not a claim that the app reflects a live patch.
- TFT illustration: Riot Games [TFT's 5-Year Bash](https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/tfts-5-year-bash/) editorial artwork, `https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/5205cb3122ea2cbcfa6d0a9bd75db4e9de08441f-1920x1080.jpg`, resized to local WebP. Used as evergreen visual reference in this private concept, not presented as a current event.
- Deadlock artwork/styles: reused from the approved sibling study; see that study's asset provenance.

This concept is not an official Riot or Valve product. Match records, plan copy, and TFT formations are authored mock data.

## League spellbook / 2026-10-12

Fifteen ability icons were downloaded from the image links on Riot's official [Ahri](https://www.leagueoflegends.com/en-us/champions/ahri/), [Lux](https://www.leagueoflegends.com/en-us/champions/lux/), and [Yasuo](https://www.leagueoflegends.com/en-us/champions/yasuo/) pages. Their linked asset base at capture was `https://ddragon.leagueoflegends.com/cdn/16.20.1/img/`. This is image provenance, not a claim of live balance data. Local files are `{ahri,lux,yasuo}-{p,q,w,e,r}.png`.

- Ahri: `passive/Ahri_SoulEater2.png`; `spell/Ahri{Q,W,E,R}.png`.
- Lux: `passive/LuxIlluminatingFraulein.png`; `spell/LuxLightBinding.png`, `LuxPrismaticWave.png`, `LuxLightStrikeKugel.png`, `LuxR.png`.
- Yasuo: `passive/Yasuo_Passive.png`; `spell/YasuoQ1Wrapper.png`, `YasuoW.png`, `YasuoE.png`, `YasuoR.png`.

Ability names, broad descriptions, roles, and short lore paraphrases were checked against those official pages. Ability details link back to Riot. Guidance, match narratives, and the next-game focus choices are authored for this concept. The geometric crest and ornamental framing are original interface decoration, not official region emblems.

## Armory sanctuary / 2026-10-12

`armory-sanctuary.png` is original generated concept artwork made with the built-in image-generation tool: a quiet painted fantasy sanctuary with weathered stone, bronze inlays, mountain ruins and restrained magical light. It is not official Riot artwork or a literal location claim. The prompt requested a continuous background scene with no characters, items, text or interface, leaving space for functional controls. The exact prompt is saved in the task output `league-armory-art-notes.md`.

The spirit, light and wind ornaments in `armorySigil()` are original code-native UI graphics. They suggest the three champions' character without claiming to reproduce official regional emblems.

## Convergence pavilion / 2026-10-12

`convergence-pavilion.png` is original artwork generated with the built-in image-generation tool: a painted floating garden pavilion, warm lanterns, plum-wood strategy table, brass fittings and a violet cloudscape. It is inspired by a magical tabletop mood, not an official Riot arena or an exact game-location recreation. No characters, logos or UI were generated into the environment. Exact prompt and generation mode are recorded in the task output `tft-art-notes.md`.

The TFT home reuses the previously sourced five-year celebration illustration as evergreen visual reference. Comp and match portraits reuse the Riot splash artwork already listed above. The cube, formation, hex and journal glyphs in `convergenceMark()` are original code-native navigation graphics.

## TFT arena interaction study / 2026-10-12

The stone arena, hex pieces and small feathered tactician in `tft-world.js` / `tft-world.css` are original code-native UI illustration. The tactician is not an official Little Legend asset. Champion and component icons reuse the existing Riot sources above. The generated pavilion is retained as an earlier study but is no longer rendered in TFT.

Costs, trait assignments, team setups, augment selections and match events are explicitly authored sandbox fixtures, independent of a live TFT set. They demonstrate layout and interaction rather than balance recommendations.
