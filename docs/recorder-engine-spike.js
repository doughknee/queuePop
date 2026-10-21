// ow-electron recorder spike. `--game`: League game capture + game audio (track 2) + mic (track 3), AMF, 30 s replay
// buffer, Ctrl+Shift+C saves the last 20 s, plus a 60 s plain recording. `--smoke`: same, primary display instead of the
// game, and auto-saves a clip at 25 s (no game needed). Logs JSON lines prefixed SPIKE.
const { app, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const GAME = process.argv.includes('--game');
const EXE = 'League of Legends.exe';
const OUT = path.join(__dirname, 'out');
const log = (k, v) => console.log('SPIKE ' + JSON.stringify({ t: Date.now(), k, v }));
app.setPath('userData', path.join(__dirname, 'userData'));
fs.mkdirSync(OUT, { recursive: true });

app.overwolf.packages.on('ready', async (_e, name) => {
  log('package-ready', name);
  if (name !== 'recorder') return;
  clearTimeout(guard);
  const rec = app.overwolf.packages.recorder;
  try {
    const info = await rec.queryInformation();
    log('encoders', info.video.encoders.map(e => e.type || e.name));
    log('default-encoder', info.video.defaultEncoder);
    log('adapters', info.video.adapters);
    log('monitors', info.monitors.map(m => ({ id: m.id, name: m.friendlyName, desk: m.attachedToDesktop })));
    const amf = info.video.encoders.some(e => (e.type || e.name) === 'h264_texture_amf');
    const b = await rec.createSettingsBuilder({ videoEncoder: amf ? 'h264_texture_amf' : undefined, includeDefaultAudioSources: false });
    if (GAME) b.addGameSource({ gameProcess: EXE, captureCursor: true }).addApplicationAudioCapture({ processName: EXE }, { tracks: 1 | 2 });
    else b.addScreenSource({ monitorId: info.monitors[0].id, captureCursor: true }).addAudioDefaultCapture('output', {}, { tracks: 1 | 2 });
    b.addAudioDefaultCapture('input', {}, { tracks: 1 | 4 });
    Object.assign(b.videoSettings, { fps: 60, baseWidth: 3440, baseHeight: 1440, outputWidth: 2580, outputHeight: 1080 });
    Object.assign(b.videoEncoderSettings, { bitrate: 20000, max_bitrate: 20000, keyint_sec: 1 });
    const settings = b.build();
    log('settings', { video: settings.videoSettings, enc: settings.videoEncoderSettings, sources: settings.sources.length });

    rec.on('stats', s => log('stats', s));
    rec.on('replay-captured', v => log('replay-captured', v));
    await rec.startReplays({ bufferSecond: 30, rootFolder: OUT, fileFormat: 'mp4', audioTrack: 1 | 2 | 4 }, settings);
    log('replays-started', await rec.getReplayState());
    const clip = async () => {
      const st = await rec.getReplayState();
      if (st !== 'active') return log('clip-skipped', st);
      const t0 = Date.now();
      await rec.captureReplay({ fileName: `clip-${t0}`, pastDuration: 20000, timeout: 0 }, v => log('clip-saved', { ms: Date.now() - t0, ...v }));
    };
    globalShortcut.register('Control+Shift+C', clip);
    if (!GAME) setTimeout(clip, 25000);
    // 60 s plain recording alongside the buffer (does ow allow both at once? that's part of the test)
    try {
      await rec.startRecording({ filePath: path.join(OUT, `rec-${Date.now()}`), fileFormat: 'mp4', audioTrack: 1 | 2 | 4 }, settings, r => log('recording-stopped', r));
      log('recording-started', true);
      setTimeout(() => rec.stopRecording(), 60000);
    } catch (err) { log('recording-error', String(err && (err.message || err.code || err))); }
    setTimeout(async () => { await rec.stopReplays().catch(e => log('stop-err', String(e))); setTimeout(() => app.quit(), 4000); }, GAME ? 15 * 60000 : 70000);
  } catch (err) { log('error', String(err && (err.stack || err.message || err))); app.quit(); }
});
app.whenReady().then(() => log('ready', process.versions.electron));
const guard = setTimeout(() => { log('timeout', 'no recorder after 60 s'); app.quit(); }, 60000);
