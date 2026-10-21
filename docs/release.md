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

## Ship

- [ ] `npm test` green, plus a click-through of every page on the packaged build.
- [ ] Release notes, and the version bumped off `2.0.0-alpha`.
