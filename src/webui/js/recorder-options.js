/* Studio's recorder options (2026-10-21): every setting the recorder takes, its defaults and limits, the quality presets and
   the size estimate. One file for both sides: the host requires it (champ-config.js normalizes config.recorder with it,
   recorder-video.js / ow-recorder.js read it) and the Studio pages load it as window.recOptions. Pure; app/test-studio.js. */
(function (root) {
  // Quality presets. mbps is the video bitrate; audio adds about 0.16 Mbps per track.
  const QUALITY = {
    saver: { label: 'Saver', height: 720, fps: 30, mbps: 4, note: 'Small files, fine for reviewing your games.' },
    balanced: { label: 'Balanced', height: 1080, fps: 60, mbps: 8, note: 'Sharp 1080p at 60 fps. The default.' },
    high: { label: 'High', height: 1440, fps: 60, mbps: 16, note: 'For clips you post. About twice the space.' },
  };
  const HEIGHTS = [720, 900, 1080, 1440, 2160];
  const FPS = [30, 60];
  // Moments the recorder can clip, in the order Studio lists them.
  const KINDS = ['kill', 'multikill', 'death', 'objective', 'assist'];
  const KIND_LABEL = { kill: 'Kills', multikill: 'Multikills', death: 'Deaths', objective: 'Objectives', assist: 'Assists' };
  const CLIPS = { kill: { on: true, before: 10, after: 5 }, multikill: { on: true, before: 15, after: 6 }, death: { on: true, before: 10, after: 3 },
    objective: { on: true, before: 10, after: 6 }, assist: { on: false, before: 8, after: 4 } };

  const num = (v, lo, hi, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d; };
  const bool = (v, d) => (v === undefined || v === null ? d : !!v);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  // Electron accelerator: modifiers then one key, joined by '+' (Ctrl+Shift+C, Alt+F9).
  const KEYS = /^(?:(?:Ctrl|Alt|Shift|Super)\+){1,3}(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4]))$/;

  // config.recorder (any age) -> the full shape. Old configs had preset 720p30 | 1080p30 | 1080p60 and nothing else.
  function normalize(r) {
    r = obj(r);
    let quality = Object.prototype.hasOwnProperty.call(QUALITY, r.quality) || r.quality === 'custom' ? r.quality : null;
    let height = r.height, fps = r.fps, mbps = r.mbps;
    if (!quality) { // migrate the old preset
      if (r.preset === '720p30') quality = 'saver';
      else if (r.preset === '1080p30') { quality = 'custom'; height = 1080; fps = 30; mbps = 6; }
      else quality = 'balanced';
    }
    const base = QUALITY[quality] || QUALITY.balanced;
    const buffer_s = num(r.buffer_s, 10, 120, 30);
    const a = obj(r.audio), src = (k, d) => { const s = obj(a[k]); return { on: bool(s.on, d.on), volume: num(s.volume, 0, 200, 100) }; };
    const mic = src('mic', { on: true });
    const clips = {};
    for (const k of KINDS) {
      const c = obj(obj(r.clips)[k]), d = CLIPS[k];
      clips[k] = { on: bool(c.on, d.on), before: num(c.before, 0, buffer_s - 1, Math.min(d.before, buffer_s - 1)), after: num(c.after, 0, 30, d.after) };
    }
    const h = obj(r.hotkey);
    const cap = Number(r.cap_gb);
    return {
      enabled: bool(r.enabled, false), video: bool(r.video, false),
      folder: String(r.folder || '').trim(), cap_gb: Number.isFinite(cap) && r.cap_gb !== '' ? Math.min(2000, Math.max(1, Math.round(cap))) : 50,
      quality,
      height: quality === 'custom' ? (HEIGHTS.includes(Number(height)) ? Number(height) : 1080) : base.height,
      fps: quality === 'custom' ? (FPS.includes(Number(fps)) ? Number(fps) : 60) : base.fps,
      mbps: quality === 'custom' ? num(mbps, 2, 80, 8) : base.mbps,
      encoder: typeof r.encoder === 'string' && /^[\w.-]{1,40}$/.test(r.encoder) ? r.encoder : 'auto',
      mode: r.mode === 'clips' ? 'clips' : 'full', // full = the whole game plus clips; clips = clips only (no full video)
      buffer_s,
      audio: { game: src('game', { on: true }), mic: { ...mic, device: typeof obj(a.mic).device === 'string' && obj(a.mic).device.length < 300 ? obj(a.mic).device : 'default' }, desktop: src('desktop', { on: false }) },
      clips,
      hotkey: { on: bool(h.on, true), keys: KEYS.test(h.keys || '') ? h.keys : 'Alt+F8', seconds: num(h.seconds, 5, buffer_s, Math.min(30, buffer_s)) },
    }; // which games record stays where it was: recorder.enabled (League) and tft.record
  }

  // Audio tracks in the file: 1 = everything mixed, 2 = the game, 4 = your mic, 8 = all desktop sound (Discord, music).
  const TRACK = { mix: 1, game: 2, mic: 4, desktop: 8 };
  function tracks(r) {
    const a = r.audio || {};
    return TRACK.mix | (a.game && a.game.on ? TRACK.game : 0) | (a.mic && a.mic.on ? TRACK.mic : 0) | (a.desktop && a.desktop.on ? TRACK.desktop : 0);
  }
  const trackCount = t => [1, 2, 4, 8].filter(b => t & b).length;
  // GB for one hour of full recording at these settings (video bitrate plus 160 kbps per audio track).
  function gbPerHour(r) { return Math.round(((r.mbps + 0.16 * trackCount(tracks(r))) * 3600 / 8 / 1000) * 10) / 10; }
  // Seconds of a clip for a moment type; null when that type isn't clipped.
  function span(r, kind) { const c = (r.clips || {})[kind]; return c && c.on ? [c.before, c.after] : null; }
  // About how many full games of `minutes` fit in the cap, rounded down; clips-only mode is a rough 8 clips of 15 s a game.
  function gamesInCap(r, minutes = 32) {
    const perGame = r.mode === 'clips' ? gbPerHour(r) * (8 * 15) / 3600 : gbPerHour(r) * minutes / 60;
    return perGame > 0 ? Math.floor(r.cap_gb / perGame) : 0;
  }

  const api = { QUALITY, HEIGHTS, FPS, KINDS, KIND_LABEL, CLIPS, TRACK, normalize, tracks, trackCount, gbPerHour, span, gamesInCap, KEYS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.recOptions = api;
})(typeof window !== 'undefined' ? window : globalThis);
