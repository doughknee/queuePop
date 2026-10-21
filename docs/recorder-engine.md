# Recorder engine: spike results (2026-10-20)

The question: is ffmpeg the right base for a recorder that beats Outplayed, or should queuePop sit on an OBS-class engine?

Short answer: **use the ow-electron recorder package.** It already runs OBS underneath, and it ran on this PC with the dev key we already have. Out of the box it does the three things the ffmpeg path doesn't do at all: audio, a replay buffer, and game-window capture. Compete on stats-aware highlights, not on the capture engine.

Test PC:
- AMD Ryzen 5 7600X (6 cores, 12 threads)
- Radeon RX 7900 XTX, driver 32.0.31041.1004, HAGS on
- two 3440×1440 AW3423DWF monitors

Software: ow-electron 42.11.4, recorder package 0.32.59, ffmpeg 9.0.1 (gyan full build).

## What was measured

Both engines captured the **primary desktop** for 60 s at **2580×1080, 60 fps**, encoding H.264 on the 7900 XTX's AMF encoder. No game was running. CPU is the engine's own processes: the `TotalProcessorTime` delta over 40 s, where 100 % is one logical core.

| | ow-electron recorder (proof) | current ffmpeg path (`captureArgs` 1080p60, h264_amf) |
|---|---|---|
| What ran | 30 s replay buffer **and** a 60 s recording at the same time | one 60 s recording |
| CPU | **16.3 % of one core** (`ow-electron-obs` + `obs-ffmpeg-mux`); the recorder's own `cpuUsage` stat says ~1 % of total | **89.6 % of one core** (`ffmpeg`) |
| Frames | 3596 / 3600; `outputSkippedFrames` 0, `renderSkippedFrames` 2 | 3593 / 3600 |
| Audio | 3 AAC tracks: mix, desktop, mic | none |
| Clip on demand | `captureReplay` writes a 20 s clip to disk in **1.1–1.2 s** (21.9 s long, keyframe-aligned) | not possible; clips are cut after the game |
| Memory | ~200 MB (recorder process) | not measured |

Most of the ffmpeg cost comes from `hwdownload` + CPU `scale` + `format=nv12`. Every 3440×1440 frame comes off the GPU, gets scaled on the CPU and goes back up to AMF. OBS keeps the frame on the GPU the whole way: its texture AMF encoder (`h264_texture_amf`) takes GPU textures directly.

**In-game FPS cost: not measured yet.** The user postponed the League Practice Tool runs (baseline, ffmpeg, ow-electron, measured with PresentMon). They are the follow-up issue, planned under "In-game FPS test" below. Expect the CPU gap to matter more in-game: League is CPU-bound on a 7600X, and ffmpeg takes most of a core.

## What the ow-electron recorder offers

Source: `@overwolf/ow-electron-packages-types` 1.1.13, `types.d.ts`. Items marked "verified" were checked in the proof run.

### Capture sources

- `addGameSource({gameProcess})` is OBS game capture. It hooks the game's swapchain, works in fullscreen, and has a `captureOverlays` option.
- `addScreenSource({monitorId, type})` captures a monitor. `type` is `Auto`, `DXGI`, `BitBlt` or `WGC`.
- `addWindowSource` (`Auto`, `BitBlt` or `WGC`), `addBrowserWindowSource`, and image and colour sources.
- Sources take any process name or PID; they aren't limited to GEP-supported games.
- Games that run elevated need the High Elevation Helper (error -996).

### Audio

- `addApplicationAudioCapture({processName})` captures the game's audio alone (per-process loopback).
- `addAudioDefaultCapture('input'|'output')` and `addAudioCapture({id})` add the default or a specific device.
- Each device has a `tracks` bitmask (6 tracks). The output's `audioTrack` setting picks which tracks land in the file.
- `updateAudioDevice()` changes volume while recording.
- Verified: 3 separate AAC tracks in one mp4. Which of streams 2 and 3 holds the mic still needs a listen.

### Replay buffer

- `startReplays({bufferSecond, rootFolder, fileFormat})` starts the always-on buffer.
- `captureReplay({fileName, pastDuration, timeout})` saves a clip from it:
  - `timeout: 0` saves an instant "last N seconds" clip.
  - A `timeout` above 0 keeps recording past the trigger, e.g. 10 s before and 5 s after a kill.
- Events: `replay-captured` and `stats`.
- `captureReplay` fails with -995 while the state is still `starting` (the first ~1 s).
- Verified: the replay buffer and a full recording run at the same time.

### Encoders

`queryInformation().video.encoders` found these on this PC:
- `h264_texture_amf`, `h265_texture_amf`, `av1_texture_amf`
- `obs_x264`, `ffmpeg_svt_av1`, `ffmpeg_aom_av1`

The default it picked was `h264_texture_amf`. Machines with other GPUs get NVENC (`obs_nvenc_*_tex`) or QSV (`obs_qsv11_*`). AMF rate control options are CBR, CQP, VBR, QVBR and HQVBR.

### Output

- Formats: `fragmented_mp4` (the default, crash-safe), `mp4`, `mkv`, `mov`, `flv`, `mpegts`, `hls`, `hybrid_mp4`.
- Recordings can be split by time or size.
- Gotcha: on this ultrawide, the base resolution defaults to **1720×720** (half the monitor). Set `videoSettings.baseWidth`, `baseHeight`, `outputWidth` and `outputHeight` yourself.
- Gotcha: `max_bitrate` defaults to a value below `bitrate`.

### Setup

1. Add `"recorder"` to `"overwolf": {"packages": [...]}` in package.json.
2. Wait for `app.overwolf.packages.on('ready')` with `name === 'recorder'`.
3. Use `app.overwolf.packages.recorder`.

The OBS host is a separate process (`ow-electron-obs.exe`).

Gotcha: it **fails to spawn from a deep path** (ENOENT, MAX_PATH). From the long temp scratch folder, the first run hung for 70 s and then threw "connection error". From `C:\owrec-spike` it worked. Installed apps under `%LOCALAPPDATA%\Programs` have short enough paths.

### Status

- Overwolf's docs label the package beta.
- Two recorder doc pages currently 404, so the d.ts is the reliable reference.
- Windows only.

### Licensing and money

- Overwolf's framework table lists a 70/30 ad revenue split and 85/15 for subscriptions on ow-electron.
- Payout is net 60, with a $200 minimum (monetization terms at legal.overwolf.com).
- We already promised Overwolf ads on the desktop window.
- The OBS code runs in Overwolf's own process, so queuePop does not link GPL code.
- Not stated anywhere: whether ads are mandatory when an app uses the recorder, and how the terms' exclusivity clause applies to ow-electron. Ask Overwolf DevRel before release.

### The proof

The proof script is [`recorder-engine-spike.js`](recorder-engine-spike.js). To run it:
1. Copy it as `main.js` into a short folder, next to a package.json with `"overwolf": {"packages": ["recorder"]}`.
2. Run it with the deadlock app's binaries: `dotenv -e <deadlock>/.env -- ow-electron . --smoke` (or `--game`).

`--game` captures `League of Legends.exe` with:
- the game's own audio on track 2 and the mic on track 3
- a 30 s replay buffer; **Ctrl+Shift+C saves the last 20 s**
- a 60 s recording alongside the buffer

`--smoke` does the same with the primary monitor and desktop audio, and saves a clip by itself at 25 s.

## The four engines

| | ow-electron recorder | obs-studio-node (Streamlabs) | custom WGC + AMF/NVENC addon | keep ffmpeg |
|---|---|---|---|---|
| Quality | OBS: game hook, GPU textures end to end, HEVC/AV1, HDR | same OBS core | as good as we make it | image is fine, but goes through CPU scaling; `ddagrab` captures the whole monitor, with no window or game capture |
| FPS / CPU cost | measured 16 % of a core (buffer + recording) | expected ≈ ow-electron (same core) | could be the lowest (zero-copy) | measured **90 % of a core**, recording only |
| Audio | game alone, mic and desktop on separate tracks (verified) | same | write it ourselves (WASAPI process loopback) | none today. This ffmpeg build has no WASAPI input, only dshow, so game-only audio isn't reachable without another tool |
| Replay buffer | built in; 1.1 s to save (verified) | OBS replay buffer output | write it (ring of encoded packets + mux) | possible with a segment ring (`-f segment -segment_wrap`); clips still cut on keyframes; more glue |
| Encoders | AMF / NVENC / QSV / x264 / AV1, listed at runtime | same | each vendor SDK by hand | NVENC/AMF/QSV, but via `hwdownload` |
| Effort to ship | **days**: a new backend behind `createVideo`'s `start`/`stop` | weeks: native module build per Electron ABI, ship OBS binaries, handle our own updates | **months**: capture, audio, A/V sync, muxing, per-vendor quirks, a game hook for fullscreen | low per feature, but each feature above is new glue |
| Licensing | Overwolf terms (70/30 ads); no GPL in our process | **GPL-2.0**: linking it makes queuePop's Electron app GPL | ours | ffmpeg (LGPL/GPL) comes from the user's PATH; we don't ship it |
| Dependency risk | beta package; Overwolf's release schedule; ow-electron trails upstream Electron (42 vs our 44) | Streamlabs maintains it for Streamlabs Desktop; thin docs | none, all ours | the user must install ffmpeg |

## What ow-electron would mean for the existing Electron app

queuePop's host is plain Electron **44.7.2**: `app/` runs the main process and `src/webui` is the renderer. ow-electron is a fork currently at **42.11.4**. There are two ways in.

### Option 1: the recorder lives in the companion ow-electron app (recommended first)

`C:\Users\doni\Documents\.code\deadlock` is already an ow-electron app. Its Overwolf handshake works, and it serves a loopback `/health` port (47821).

The change:
- Add `"recorder"` to the companion's packages.
- Expose start, stop and clip over that loopback port.
- queuePop's host stays on Electron 44 and gets a second `createVideo` backend that calls the companion.
- The event timeline, `clipWindows` merging and the size cap stay as they are.

Costs: users run two processes, and recording only works while the companion is running.

### Option 2: move the whole host to ow-electron

The change:
- `main.js` switches to `ow-electron`, and `electron-builder` to `ow-electron-builder`.
- Electron drops from 44 to 42. Check the main process for APIs added after 42. The `src/webui` renderer is plain web code and shouldn't care.

Gains: GEP game events for League, TFT and Deadlock in the same process, and one install.

Costs:
- queuePop's Electron version follows Overwolf's schedule.
- Overwolf's ads and terms apply to queuePop itself.
- The main app goes through Overwolf's app review.

### Which first

Option 1 proves the recorder in real games with almost no risk to the host. Option 2 is the end state, if Overwolf's terms are acceptable for queuePop as a whole.

## In-game FPS test (still owed)

Setup:
- League Practice Tool, the same spot each run (fountain to mid lane, camera locked), 60 s per run.
- PresentMon console: `PresentMon-x64.exe --process_name "League of Legends.exe" --timed 60 --output_file run.csv`.
- Report average FPS and 1 % lows.

Runs:
1. baseline, no recorder
2. ffmpeg (`captureArgs` 1080p60 h264_amf)
3. the ow-electron proof with `--game`

The user approved downloading the portable PresentMon exe. The runs wait until they can hand over the PC.

## Recommendation

Build queuePop's recorder on the **ow-electron recorder package**. Start with it as a backend in the existing ow-electron companion app (option 1). Spend the effort on what Outplayed doesn't have: clips chosen and labelled from queuePop's own stats timeline, such as gold swings, objective fights and deaths with context, not just kill events.

- Keep the ffmpeg path only as the fallback for users without the companion.
- Don't build our own capture engine.
- Don't use obs-studio-node (GPL).

Before committing to it:
- Run the in-game FPS test above.
- Get Overwolf's answer on ads and exclusivity when an app uses the recorder.
