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
- **Not tested in a real League game**: the game-capture hook, game-only audio and the FPS cost are still unmeasured,
  the same as #225.

## Release gate: before any public build

Nothing on ow-electron ships publicly until all of these are done:

1. **Overwolf app registration.** Submit the app proposal, get it approved, and swap the personal dev key for
   production credentials. A packaged build without them doesn't load the packages.
2. **The promised desktop ad slot.** A 300x250 slot sits at the bottom of the sidebar. When the sidebar is collapsed,
   it falls back to a 400x300 slot on Home. It isn't built yet and stays off until release.
3. **Open questions for Overwolf DevRel:**
   - Are ads mandatory for an app that uses the recorder and/or GEP packages?
   - Is a 300x250 unit supported in a desktop (non-overlay) window, or only their standard sizes (400x300 and so on)?
   - Exclusivity: can queuePop also offer its own ad-free subscription, or must ad removal go through Overwolf's
     subscription system?
