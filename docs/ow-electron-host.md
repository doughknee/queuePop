# queuePop on ow-electron

Status: personal build only (2026-10-21). queuePop's host can run on Overwolf's Electron fork, which brings the
Overwolf recorder (and GEP) in-process. The separate QueuePop companion app is no longer needed to record.
Plain Electron still works. Nothing public ships on ow-electron until the release gate below is cleared.

## What changed

- `app/package.json` has `@overwolf/ow-electron` 42.11.4 (the companion's version), `@overwolf/ow-electron-builder`
  and `dotenv-cli` next to `electron` 44.7.2, plus `"overwolf": {"packages": ["recorder", "gep"]}`.
  Plain Electron ignores that field.
- Scripts:
  - `npm start`: plain Electron 44, as before.
  - `npm run start:ow`: ow-electron, with `OW_DEV_KEY` loaded from `app/.env` by dotenv. `.env` is gitignored. Copy it
    from the companion repo (`deadlock/.env`) and never commit it.
  - `npm run dist` builds the plain build. `npm run dist:ow` builds with ow-electron-builder, which hasn't been tried yet.
- `app/ow-recorder.js` is the companion's `recorder.js`, copied unchanged. It covers game capture, game audio (track 2),
  mic (track 3), the mix (track 1), a 30 s replay buffer, and start/clip/stop.
- `app/host.js` attaches it when `app.overwolf.packages` reports `recorder` ready.
- `app/recorder-video.js` puts the in-process recorder behind the same calls as the companion's loopback API
  (`inProcess()`), so the code path is the same. The engine order is:
  1. in-process, when its recorder is ready
  2. the companion on 127.0.0.1:47821, when it says ready
  3. ffmpeg on PATH

  Once a game starts on an engine, it stays on that engine. The recording JSON shape, the live clips (10 s before and
  5 s after, from the replay buffer) and the offset rules are the same as in #225.
- Settings > Recording now reads "Recording with Overwolf (built in, AMD AMF)" when the in-process recorder is in use.
- The companion (`deadlock` repo) is unchanged and still works. A plain Electron host keeps using it.

### Switching back

Run `npm start` instead of `npm run start:ow`. That's all. To remove ow-electron entirely, revert this PR. The
companion and ffmpeg engines never depended on it.

## Things to know

- **Package folder path length.** In dev, ow-electron puts its packages at `<parent of userData>\ow-electron`. The OBS
  host behind the recorder fails on long paths: under a scratch `--user-data-dir` deep in `%TEMP%`, it kept crashing
  (`read ENOTCONN`, then `queryInformation failed connection error`). With `C:\qpow\<name>` it was ready in about 8 s.
  The real userData (`%APPDATA%\queuepop`) is short enough.
- **A hidden extra window.** ow-electron opens a hidden `owepm://index.html` window. queuePop doesn't use
  `getAllWindows()`. Any code or tool that looks for "the index.html window" has to match `file:` URLs.
- **No dev key, or plain Electron.** `app.overwolf` is missing or the recorder never reports ready. Recording falls
  back to the companion, then ffmpeg. Both cases were checked.

## Electron and Chromium version gap

|              | Electron | Chromium      | Node    |
|--------------|----------|---------------|---------|
| electron     | 44.7.2   | 152.0.7977.149 | 24.21.0 |
| ow-electron  | 42.11.4  | 148.0.7778.280 | 24.19.0 |

The gap is two Electron majors and four Chromium versions. I diffed the two `electron.d.ts` files: queuePop's main
process uses none of the APIs added since 42 (`setZoomMode`, `setBackgroundBlur`, `windowStatePersistence`, `badge`,
...). The webui uses nothing newer than Chromium 148. Ahead of each upgrade, check that Overwolf's fork has caught up,
or pin both.

## Verified (2026-10-21, ow-electron 42.11.4, dev key, this machine)

- Startup to page load was 0.33 to 0.58 s on ow-electron and 0.43 to 0.45 s on Electron 44 (`startup:` log lines).
  There's no visible difference.
- The League client connects ("LCU connected").
- These pages render: Home, League tier list, champions, champion (Ahri), history, TFT, Deadlock, Settings and Recordings.
- The window's minimise, maximise and restore buttons work. ✕ hides the window to the tray, the tray icon registers,
  and the desktop notification test returns ok.
- The in-process recorder reports ready on `h264_texture_amf`. A 14 s screen recording (`display: true`) came out as a
  2580x1080 h264 mp4 with three AAC tracks, and a 7.9 s clip from the replay buffer came out of the same run.
- `npm test` is green. It covers a stub game on the in-process engine (the companion is never called) and the Settings line.
- With `--test-ad`, Overwolf's "TEST AD 300X250" serves in the sidebar box (`queuepop_300x250_sb`), and the sidebar
  locks at 316 px. It took a fix: `owadview` needs `display:flex`. With `display:block`, which #226 shipped, Electron's
  webview kept its inner frame at the default 300x150, so the SDK never filled the box.
- **Not tested in a real League game**: the game-capture hook, game-only audio and the FPS cost are still unmeasured,
  the same as #225.

## Release gate: before any public build

Nothing on ow-electron ships publicly until all of these are done. docs/ads.md has the full ads list.

1. **Overwolf app registration.** Submit the app proposal, get it approved, and swap the personal dev key for
   production credentials. A packaged build without them doesn't load the packages. Overwolf also has to enable the
   app uid for ads (test it with `--test-ad` first).
2. **The promised desktop ad slot.** One 300x250 `<owadview>` at the bottom of the sidebar, built in #226. On
   ow-electron it switches on by itself (`get_status().overwolf`) unless `config.ads.premium` is set. That means this
   personal build already shows the box, with its placeholder, and the sidebar is fixed at 316 px. Before release:
   - a consent screen for the EU and other strict regions
   - `config.ads.premium` replaced by Overwolf's subscription check
3. **Overwolf's ad rules** (checked in their docs on 2026-10-21). docs/ads.md has the placement rules we follow. Two
   rules decide whether we can ship at all:
   - **Ads come with approval.** "Overwolf will only approve apps that integrate and use Overwolf ads." A monetized
     app may show only Overwolf ads, so no third-party ad iframes.
   - **Supported containers only.** Set them with CSS min-width/min-height, using one size from this list:
     - 400x300 (video + banner)
     - 300x250 (banner only)
     - 400x600, 160x600, 728x90, 970x90 or 400x60

     An unsupported size can stop every ad from serving.

   Rules for the window and the container:
   - The ad sits in a window with real content and looks like part of it, never on a login, error or empty screen.
   - It stays put when you switch views. To pause it, set `display:none`; to move it, shut it down and create a new one.
   - At most one video ad per page.
   - The window can't be resized below the container. Overwolf recommends a 1300x840 default.

   Setup and testing:
   - Every container needs a unique `cid` of up to 20 characters.
   - The app uid must be enabled on Overwolf's backend before ads serve. `--test-ad` shows test ads before that.
   - Players in the EU and other strict regions must give CMP consent.

   Riot's in-game rules:
   - An overlay with ads needs the player's explicit opt-in and must never appear by itself.
   - A large overlay needs a dimmed background and a hotkey to get back to the game.
   - No floating ads.
   - No subscription or upgrade pitches inside an in-game overlay.

   The plan from that session: a 300x250 box at the bottom of the sidebar (`queuepop_300x250_sb`). When the sidebar is
   collapsed, that box shuts down and a 400x300 box (`queuepop_400x300_home`) opens on Home. #226 shipped only the
   sidebar box. While the ad shows, the sidebar can't collapse, so the 400x300 fallback isn't built.
4. **Open questions for Overwolf DevRel:**
   - Are ads mandatory for an app that uses the recorder and/or GEP packages?
   - Is 300x250 supported in a desktop window? docs/ads.md reads Overwolf's docs as yes, banner-only. Confirm it
     counts as meeting any ad requirement that comes with the recorder or GEP.
   - Exclusivity: can queuePop also offer its own ad-free subscription, or must ad removal go through Overwolf's
     subscription system?
