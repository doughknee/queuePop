# Public release checklist (ow-electron build)

Today queuePop is a personal build: ow-electron with Brandon's dev key, the Overwolf recorder in process, and ads off
(placeholder box only). Every box below has to be ticked before anyone else gets a build. Details are in
docs/ow-electron-host.md (host and recorder) and docs/ads.md (ads and the supporter tier).

## Overwolf

- [ ] Send Overwolf DevRel the open questions and get written answers:
  - Are ads required for an app that uses the recorder or GEP?
  - Is 300×250 fine as the only container?
  - Does the exclusivity clause allow our own ad-free subscription, or must it go through Overwolf?
- [ ] Submit the app proposal and get queuePop approved as an Overwolf app.
- [ ] Production credentials in the packaged build. Never ship the personal dev key (`app/.env`).
- [ ] Overwolf enables the app uid for ads. Check the sidebar box with `--test-ad`.
- [ ] `npm run dist:ow` (ow-electron-builder) produces an installer that loads the packages on a clean PC.
  - 2026-10-21 (DONI-695): the build itself works. ow-electron-builder Overwolf-signs `package.json` and the asar through
    `console-be.overwolf.com` and refuses to build without `OW_CLI_EMAIL`, `OW_CLI_API_KEY` and `OW_BUILD_KEY`
    (Developer Console). `dist:ow` reads them from `app/.env` (gitignored, never bundled). A trial build without them:
    `npx ow-electron-builder --win nsis zip --publish=never -c.overwolf.requireSigning=false`; it installs and runs on
    ow-electron with the ad placeholder, but the recorder and GEP don't load, so recording falls back to ffmpeg.
  - Checked in the trial build: no `.env`, `config.json` or dev key inside; an installed build keeps `config.json` in its
    userData (`app/config.js`), since the installer replaces the install folder on every update.
  - Decide before the first QA submission, because Overwolf wants the name and author unchanged in every version:
    `build.productName` is still "queuePop (Electron)", and the app reports `src/_version.py` (1.4.7), not package.json
    (2.0.0-alpha.1). Both go with DONI-445 (Electron becomes queuePop 2.0.0).

## Ads and money

- [ ] Consent screen (CMP) for players in the EU and other strict regions, wired before any ad request.
- [ ] `config.ads.premium` replaced by Overwolf's subscription check. The supporter tier sells the ad-free, collapsible sidebar.
- [ ] A "Go ad-free" path in the app, outside any in-game overlay.
- [ ] `config.ads.live` turned on, or live made the default in the release build, only after the three boxes above.

## Recorder

- [ ] A real League game recorded on the Overwolf engine: game window capture, game-only audio, mic track, and live clips
  that line up with the kills on the player's timeline.
- [ ] The in-game FPS cost measured (League Practice Tool + PresentMon: no recorder, ffmpeg, Overwolf) and within budget.
- [ ] The ffmpeg fallback still records when the packages don't load.

## League compliance (Overwolf's League page, checked 2026-10-21, DONI-697)

- [x] Ranked champ select anonymity ("Ally #"): no surface shows another player's name in champ select (live view,
  suggestions float, phone companion, alerts read your own cell only), so there is nothing to anonymise.
- [x] No Brawl or League Classic data: the crawler collects 420, 440, 450, 400 and 480/490 only (`crawler/src/jobs.js` MODES).
- [x] No power-spike notices, no "do X now" calls from in-game state, no ultimate / summoner-spell / ability timers. The game
  plan (`app/game-plan.js`) is pre-game build, skills, matchup and objective stats, sent during champ select.
- [x] Store edition (DONI-704, `app/edition.js`): the Overwolf build (`dist:ow` stamps `edition: "store"`) never auto-accepts,
  never locks in (picks and bans are hovered), takes nothing from the ARAM bench, sends no trades, has no stepping away and no lock from
  the phone. Riot: products "should not remove game decisions, but may highlight decisions that are important"; an approved Overwolf
  League app (Team Advisor) lost auto-accept. The personal build keeps everything.
- [ ] Riot's own approval (DONI-693). The application asks separately whether an opt-in auto-accept would ever be allowed. Keep any new
  champ select or in-game feature inside the rules above, and in the store edition's highlight-don't-decide line.

## Ship

- [ ] `npm test` green, plus a click-through of every page on the packaged build.
- [ ] Release notes, and the version bumped off `2.0.0-alpha`.
