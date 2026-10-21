// In-process game recorder on Overwolf's recorder package (OBS underneath), when queuePop runs on ow-electron
// (`npm run start:ow`, docs/ow-electron-host.md). Same code as the QueuePop companion's recorder.js (deadlock repo), which
// recorder-video.js reaches over loopback when this one isn't ready. start → game capture of the game process + its own
// audio (track 2) + mic (track 3) + the mix (track 1), a full recording and an always-on 30 s replay buffer;
// clip → the last N s + the next M s from that buffer; stop. Files: <matchId>.mp4 and <matchId>-clip<epoch>.mp4, fragmented mp4.
const path = require('path');
const fs = require('fs');

const ENCODERS = ['h264_texture_amf', 'obs_nvenc_h264_tex', 'obs_qsv11_v2', 'obs_x264']; // best first; texture = stays on the GPU
const BUFFER_S = 30;
const TRACKS = 1 | 2 | 4; // mix, game, mic

// Output size for a preset height on this monitor: same aspect, even width (3440x1440 → 2580x1080), never upscaled. Pure.
function outputSize(base, height) {
  const h = Math.min(height, base.height);
  return { width: Math.round(base.width * h / base.height / 2) * 2, height: h };
}

function createRecorder(log) {
  let api = null, encoder = null, session = null, error = null; // session: { matchId, folder, startEpoch, activeClip }

  async function attach(rec) {
    api = rec;
    try {
      const info = await rec.queryInformation();
      const have = new Set(info.video.encoders.map(e => e.type || e.name));
      encoder = ENCODERS.find(e => have.has(e)) || info.video.defaultEncoder;
      log('recorder: ready, encoder ' + encoder);
    } catch (e) { error = String(e && e.message || e); log('recorder: queryInformation failed ' + error); }
  }

  const status = () => ({ ready: !!(api && encoder), encoder, recording: session ? session.matchId : null, error });

  // display: true captures the primary monitor instead of the game (a test without a game running).
  async function start({ matchId, processName, folder, height = 1080, fps = 60, display = false }) {
    if (!api || !encoder) throw new Error('recorder not ready');
    if (session) return { ok: true, already: true, encoder, startEpoch: session.startEpoch };
    if (!/^[\w-]{1,64}$/.test(matchId || '') || !/^[\w .()-]{1,64}\.exe$/i.test(processName || '') || !path.isAbsolute(folder || '')) throw new Error('bad start request');
    fs.mkdirSync(folder, { recursive: true });
    const d = require('electron').screen.getPrimaryDisplay();
    const base = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
    const out = outputSize(base, Number(height) || 1080);
    fps = Number(fps) === 30 ? 30 : 60;
    const b = await api.createSettingsBuilder({ videoEncoder: encoder, includeDefaultAudioSources: false });
    if (display) b.addScreenSource({ monitorId: (await api.queryInformation()).monitors[0].id, captureCursor: true }).addAudioDefaultCapture('output', {}, { tracks: 1 | 2 });
    else b.addGameSource({ gameProcess: processName, captureCursor: true }).addApplicationAudioCapture({ processName }, { tracks: 1 | 2 });
    b.addAudioDefaultCapture('input', {}, { tracks: 1 | 4 });
    // Set explicitly: left alone it records at half the monitor (1720x720 on a 3440x1440 ultrawide).
    Object.assign(b.videoSettings, { fps, baseWidth: base.width, baseHeight: base.height, outputWidth: out.width, outputHeight: out.height });
    const kbps = Math.round(out.width * out.height * fps * 0.12 / 1000); // ~20 Mbps at 2580x1080 60
    Object.assign(b.videoEncoderSettings, { bitrate: kbps, max_bitrate: kbps, keyint_sec: 1 });
    const settings = b.build();
    session = { matchId, folder, startEpoch: Date.now(), activeClip: null };
    try {
      await api.startReplays({ bufferSecond: BUFFER_S, rootFolder: folder, fileFormat: 'fragmented_mp4', audioTrack: TRACKS }, settings);
      await api.startRecording({ filePath: path.join(folder, matchId), fileFormat: 'fragmented_mp4', audioTrack: TRACKS }, settings);
    } catch (e) { session = null; await api.stopReplays().catch(() => {}); throw e; }
    log(`recorder: recording ${processName} ${out.width}x${out.height}@${fps} ${encoder} → ${folder}`);
    return { ok: true, encoder, width: out.width, height: out.height, fps, startEpoch: session.startEpoch };
  }

  // The last pastSeconds plus the next afterSeconds. A request while a clip is still running stretches that clip instead,
  // and both requests get the same file back (the host merges them, like overlapping windows cut after a game).
  async function clip({ pastSeconds, afterSeconds }) {
    if (!session) throw new Error('not recording');
    const past = Math.max(1, Math.min(BUFFER_S - 1, Number(pastSeconds) || 10)), after = Math.max(0, Math.min(60, Number(afterSeconds) || 0));
    const s = session, ac0 = s.activeClip;
    if (ac0) {
      ac0.until = Math.max(ac0.until, Date.now() + after * 1000);
      if (ac0.handle && ac0.until > Date.now()) ac0.handle.stopAfter(Math.max(0, ac0.until - Date.now()));
      return ac0.done;
    }
    // Claimed before any await: two events in one poll make one clip, not two.
    const ac = s.activeClip = { until: Date.now() + after * 1000, handle: null };
    ac.done = (async () => {
      if (await api.getReplayState() !== 'active') throw new Error('replay buffer not running yet (game not hooked)');
      return new Promise((resolve, reject) => {
        api.captureReplay({ fileName: `${s.matchId}-clip${Date.now()}`, pastDuration: past * 1000, ...(after ? {} : { timeout: 0 }) }, (v) => {
          if (s.activeClip === ac) s.activeClip = null;
          if (!v || v.hasError || !v.filePath) return reject(new Error((v && v.error) || 'clip failed'));
          resolve({ ok: true, file: v.filePath, startTimeEpoch: v.startTimeEpoch, duration: v.duration });
        }).then((h) => { ac.handle = h; if (after) h.stopAfter(Math.max(0, ac.until - Date.now())); }, reject); // ac.until may have grown already
      });
    })();
    ac.done.catch(() => { if (s.activeClip === ac) s.activeClip = null; });
    return ac.done;
  }

  async function stop() {
    if (!session) return { ok: true, idle: true };
    const s = session;
    if (s.activeClip) await Promise.race([s.activeClip.done.catch(() => {}), new Promise(r => setTimeout(r, 70000))]); // let a running clip finish
    session = null;
    const result = await new Promise((resolve) => {
      const t = setTimeout(() => resolve({ error: 'stop timed out' }), 15000);
      api.stopRecording((r) => { clearTimeout(t); resolve(r || {}); }).catch((e) => { clearTimeout(t); resolve({ error: String(e && e.message || e) }); });
    });
    await api.stopReplays().catch((e) => log('recorder: stopReplays ' + e));
    log('recorder: stopped ' + (result.filePath || '') + (result.error ? ' ' + result.error : ''));
    return { ok: !result.hasError && !!result.filePath, file: result.filePath, duration: result.duration, startTimeEpoch: result.startTimeEpoch || s.startEpoch, error: result.error || '' };
  }

  return { attach, status, start, clip, stop };
}

module.exports = { createRecorder, outputSize };

if (require.main === module) { // node ow-recorder.js: checks the pure piece
  const assert = require('assert');
  assert.deepStrictEqual(outputSize({ width: 3440, height: 1440 }, 1080), { width: 2580, height: 1080 });
  assert.deepStrictEqual(outputSize({ width: 1920, height: 1080 }, 720), { width: 1280, height: 720 });
  assert.deepStrictEqual(outputSize({ width: 1280, height: 720 }, 1080), { width: 1280, height: 720 });
  console.log('ow-recorder.js ok');
}
