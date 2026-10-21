# Ads and the ad-free tier (decided 2026-10-21)

queuePop shows **one** Overwolf ad: a 300×250 box at the bottom of the sidebar. Supporters (the paid tier) get no ad and keep the
collapsible sidebar. Nothing serves until queuePop runs on ow-electron with its app uid enabled by Overwolf (see the release gate).

## The decision

- **Where:** the sidebar, under the games list and above your name card. It's on every page, never moves when you switch pages,
  and never covers what you're reading, which is what Overwolf's rules ask for. Mocks compared it with a 400×300 box on Home;
  the sidebar won as the least intrusive spot.
- **Size:** the 300×250 container. Overwolf serves banners only in it (no video), so it earns less than a 400×300 would. We accept
  that for an ad that sits out of the way.
- **The sidebar while the ad is on:** fixed at 316 px wide (300 for the box, 8 px padding each side), no collapse and no width
  drag, and the nav is tightened so the games and the current game's pages fit above the ad without scrolling at the
  default window (1280×860).
- **Supporters:** no ad, and the sidebar works as it does today (collapse to the icon rail, drag the width). Collapsing is the perk,
  not a way to dodge the ad.
- **Never:** ads in the in-game overlay or the champ select float, on top of video or match pages, in pop-ups, with sound, or more
  than one at a time.

## How it works in the app

- `src/webui/ads.js` decides the mode on launch and whenever config or status changes:
  - **ad**: the app runs on ow-electron (`get_status().overwolf`) and you're not a supporter (`config.ads.premium` is false).
  - **off**: plain Electron (the dogfood build today), or a supporter.
  - **preview**: `localStorage['queuepop-ads-preview'] = '1'` shows the box with a placeholder in plain Electron, for layout work.
- In **ad** mode the box holds `<owadview cid="queuepop_300x250_sb">` (Overwolf's tag, based on Electron's `<webview>`, so the
  window has `webviewTag: true`). Behind it sits a flat placeholder at exactly the box's size, seen only when no ad loads, as
  Overwolf recommends. The box has no other children.
- `html.ads-on` fixes `--sb-w` at 316 px and hides the collapse button and the resize grip; shell.js ignores collapse and width
  changes while it's set.
- `config.ads.premium` is a stand-in. Before release it must come from Overwolf's subscription check, never from a setting
  the user can flip.

## Overwolf's rules we follow (dev.overwolf.com, checked 2026-10-21)

- Only Overwolf ads in an Overwolf app; no third-party ad iframes.
- The container is at least the ad's size, has no child elements but the SDK's, and stays fully visible. To pause it, hide it
  with `display:none`; to move it, shut it down and open a new one.
- It sits in a window with real content, clearly part of the app, and stays put across view switches. Never on login, error,
  empty or "thank you" screens.
- At most one video ad per page (ours shows none: 300×250 is banner-only). Each container gets a unique `cid` of up to 20 characters.
- The window can't be resized below the container. Overwolf recommends a 1300×840 default; ours is 1280×860 with a 1280×760
  minimum.
- `--test-ad` on the command line shows test ads before Overwolf enables the app uid.
- Riot games: in-game overlays with ads need the player's opt-in, must never appear on their own, and may not carry upgrade or
  subscription pitches. queuePop puts no ads in-game, so none of this applies today.

## Release gate (before any public build)

1. queuePop runs on ow-electron (see docs/ow-electron-host.md) with production credentials, never the personal dev key.
2. Overwolf registers the app and enables its uid for ads; check with `--test-ad` first.
3. A consent screen for players in the EU and other strict regions, per Overwolf's CMP implementation guidelines.
4. `config.ads.premium` replaced by Overwolf's subscription check, and a "Go ad-free" path that sells the tier.
5. Answers from Overwolf DevRel on:
   - Are ads required for an app that uses the recorder or GEP?
   - Does the exclusivity clause allow our own ad-free subscription, or must it go through Overwolf?
