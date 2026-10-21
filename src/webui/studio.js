/* Studio (2026-10-21): the recorder's own world. This file is its Capture page (#/studio/capture) and the summary strip the
   Library shows; the Library, Highlights and the player are recordings.js. Every option is src/webui/js/recorder-options.js
   (window.recOptions); controls write config.recorder through QP.store at once (debounced save, the host re-binds the hotkey).
   What this PC has (encoders, mics, monitor) and the storage used come from the host's recorder_info. Loaded by shell.js. */
(function () {
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return;
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const api = () => window.pywebview && window.pywebview.api;
  const opts = () => new Promise(res => { if (window.recOptions) return res(window.recOptions); const s = Object.assign(document.createElement('script'), { src: 'js/recorder-options.js' }); s.onload = () => res(window.recOptions); document.head.append(s); });
  const ENC = { h264_texture_amf: 'AMD (H.264)', h265_texture_amf: 'AMD (HEVC)', av1_texture_amf: 'AMD (AV1)', obs_nvenc_h264_tex: 'NVIDIA (H.264)',
    obs_nvenc_hevc_tex: 'NVIDIA (HEVC)', obs_nvenc_av1_tex: 'NVIDIA (AV1)', obs_qsv11_v2: 'Intel Quick Sync (H.264)', obs_x264: 'CPU (x264, slower)',
    ffmpeg_svt_av1: 'CPU (SVT-AV1, slow)', ffmpeg_aom_av1: 'CPU (AOM AV1, very slow)', h264_amf: 'AMD (H.264)', h264_nvenc: 'NVIDIA (H.264)', h264_qsv: 'Intel Quick Sync', libx264: 'CPU (x264)' };
  const encName = e => ENC[e] || e || 'none';
  const gb = b => (b / 1024 ** 3 >= 10 ? Math.round(b / 1024 ** 3) : Math.round(b / 1024 ** 3 * 10) / 10);
  let info = null, infoAt = 0;
  async function getInfo(force) {
    if (!force && info && Date.now() - infoAt < 5000) return info;
    try { info = (await api().recorder_info()) || {}; infoAt = Date.now(); } catch { info = info || {}; }
    return info;
  }
  const cfgRaw = () => (QP.store.config && QP.store.config.recorder) || {};

  // One line for the Library header: what records the next game, at what quality, with what sound, the hotkey, the storage.
  window.studioSummary = async function () {
    const O = await opts(), i = await getInfo(), r = O.normalize(cfgRaw()), eng = i.engine || {};
    const engine = eng.engine === 'overwolf' ? `Overwolf · ${encName(r.encoder !== 'auto' ? r.encoder : eng.encoder)}` : eng.engine === 'ffmpeg' ? `ffmpeg · ${encName(eng.encoder)} · no sound` : 'No engine';
    const q = `${O.QUALITY[r.quality] ? O.QUALITY[r.quality].label : 'Custom'} · ${r.height}p${r.fps} · ${r.mbps} Mbps`;
    const sound = ['game', 'mic', 'desktop'].filter(k => r.audio[k].on).map(k => ({ game: 'game', mic: 'mic', desktop: 'desktop' })[k]).join(' + ') || 'no sound';
    const hk = !r.hotkey.on ? 'off' : i.hotkey === r.hotkey.keys ? r.hotkey.keys : `${r.hotkey.keys} (taken)`;
    const st = i.storage || { used: 0 };
    const cell = (k, v, warn) => `<div class="sd-cell${warn ? ' warn' : ''}"><small>${k}</small><b>${E(v)}</b></div>`;
    return `<div class="sd-strip">${cell('Engine', engine, eng.engine !== 'overwolf')}${cell('Quality', q)}${cell('Sound', sound)}${cell('Save last ' + r.hotkey.seconds + ' s', hk, r.hotkey.on && i.hotkey !== r.hotkey.keys)}${cell('Storage', `${gb(st.used)} of ${r.cap_gb} GB`, st.used > r.cap_gb * 1024 ** 3 * 0.9)}</div>`;
  };

  // --- Capture -----------------------------------------------------------------------------------------------------------
  const set = (path, v) => { QP.store.set('recorder.' + path, v); };
  function seg(path, cur, items) { return `<div class="sd-seg" role="radiogroup">${items.map(([v, l]) => `<button type="button" role="radio" aria-checked="${String(v) === String(cur)}" data-sd-set="${path}" data-v="${E(v)}">${E(l)}</button>`).join('')}</div>`; }
  const toggle = (path, on, label) => `<label class="sd-tog"><input type="checkbox" data-sd-bool="${path}"${on ? ' checked' : ''}><span>${E(label)}</span></label>`;
  const slider = (path, v, min, max, step, unit, label) => `<label class="sd-slide"><span>${E(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-sd-num="${path}" data-unit="${unit}"><output>${v}${unit}</output></label>`;
  const card = (id, title, note, body) => `<section class="sd-card" id="sd-${id}"><header><h2>${E(title)}</h2>${note ? `<p>${note}</p>` : ''}</header>${body}</section>`;

  async function render(host) {
    if (!host.querySelector('.sd-page')) host.innerHTML = '<section class="rec-page sd-page"><header class="rec-head"><p class="eyebrow">Studio</p><h1>Capture</h1></header><p class="rec-wait">Loading…</p></section>';
    const O = await opts();
    if (!QP.store.config) { try { await QP.store.load(); } catch {} }
    const i = await getInfo(true);
    if (!location.hash.startsWith('#/studio/capture')) return;
    const raw = cfgRaw(), r = O.normalize(raw), dev = i.device || {}, eng = i.engine || {}, ow = eng.engine === 'overwolf';
    const tft = !!(QP.store.config.tft || {}).record;
    const fitsH = h => !dev.monitor || h <= dev.monitor.height;
    const top = `<div class="sd-sum"><b>${E(O.QUALITY[r.quality] ? O.QUALITY[r.quality].label : 'Custom')}</b><span>${r.height}p · ${r.fps} fps · ${r.mbps} Mbps · ${O.trackCount(O.tracks(r))} audio track${O.trackCount(O.tracks(r)) > 1 ? 's' : ''}</span>
      <span class="sd-big">${r.mode === 'clips' ? 'clips only' : `about ${O.gbPerHour(r)} GB an hour`}</span><span>about ${O.gamesInCap(r)} games fit in ${r.cap_gb} GB</span></div>`;
    const engineNote = ow ? `Recording with Overwolf on ${E(encName(eng.encoder))}.` : eng.engine === 'ffmpeg' ? 'Recording with ffmpeg: the whole screen, no sound, clips cut after the game. Run queuePop on Overwolf for game capture, sound and live clips.' : 'Nothing can record video right now: run queuePop on Overwolf, or install ffmpeg.';

    const recording = card('record', 'What gets recorded', engineNote,
      `<div class="sd-row">${toggle('enabled', r.enabled, 'League games')}${`<label class="sd-tog"><input type="checkbox" data-sd-tft${tft ? ' checked' : ''}><span>TFT games</span></label>`}${toggle('video', r.video, 'Video (off: timelines only)')}</div>
       <div class="sd-row"><span class="sd-lbl">Keep</span>${seg('mode', r.mode, [['full', 'The whole game + clips'], ['clips', 'Clips only']])}<small class="sd-hint">${r.mode === 'clips' ? 'No full video, so a game takes megabytes instead of gigabytes. You can only watch the clips.' : 'The full game to scrub through, plus a clip of each moment.'}</small></div>`);

    const qCards = Object.entries(O.QUALITY).map(([k, q]) => `<button type="button" class="sd-q" role="radio" aria-checked="${r.quality === k}" data-sd-set="quality" data-v="${k}"><b>${q.label}</b><span>${q.height}p · ${q.fps} fps · ${q.mbps} Mbps</span><small>${q.note}</small><em>${O.gbPerHour(O.normalize({ ...raw, quality: k }))} GB / hour</em></button>`).join('')
      + `<button type="button" class="sd-q" role="radio" aria-checked="${r.quality === 'custom'}" data-sd-set="quality" data-v="custom"><b>Custom</b><span>${r.quality === 'custom' ? `${r.height}p · ${r.fps} fps · ${r.mbps} Mbps` : 'Pick each one'}</span><small>Resolution, frame rate and bitrate yourself.</small><em>${r.quality === 'custom' ? O.gbPerHour(r) + ' GB / hour' : '&nbsp;'}</em></button>`;
    const custom = r.quality !== 'custom' ? '' : `<div class="sd-row"><span class="sd-lbl">Resolution</span>${seg('height', r.height, O.HEIGHTS.filter(fitsH).map(h => [h, h + 'p']))}</div>
      <div class="sd-row"><span class="sd-lbl">Frame rate</span>${seg('fps', r.fps, O.FPS.map(f => [f, f + ' fps']))}</div>
      <div class="sd-row">${slider('mbps', r.mbps, 2, 80, 1, ' Mbps', 'Bitrate')}<small class="sd-hint">8 Mbps is plenty for 1080p60; posting clips at 1440p wants 16 or more.</small></div>`;
    const encs = (dev.encoders || []).filter(e => ENC[e]);
    const encoder = ow && encs.length ? `<div class="sd-row"><span class="sd-lbl">Encoder</span><select class="st-in" data-sd-str="encoder"><option value="auto"${r.encoder === 'auto' ? ' selected' : ''}>Best on this PC (${E(encName(dev.encoder))})</option>${encs.map(e => `<option value="${E(e)}"${r.encoder === e ? ' selected' : ''}>${E(encName(e))}</option>`).join('')}</select><small class="sd-hint">The graphics card keeps your FPS. HEVC files may not play in the player here.</small></div>` : '';
    const quality = card('quality', 'Quality', `Your screen is ${dev.monitor ? `${dev.monitor.width}×${dev.monitor.height}` : 'unknown'}; recordings keep its shape and are never upscaled.`,
      `<div class="sd-qs" role="radiogroup">${qCards}</div>${custom}${encoder}`);

    const src = (k, label, hint) => `<div class="sd-src${r.audio[k].on ? '' : ' off'}">${toggle(`audio.${k}.on`, r.audio[k].on, label)}${slider(`audio.${k}.volume`, r.audio[k].volume, 0, 200, 5, '%', 'Volume')}<small class="sd-hint">${hint}</small></div>`;
    const mics = (dev.inputs || []).filter(d => d.id !== 'default' && !/^default$/i.test(d.name));
    const micPick = ow && mics.length ? `<label class="sd-slide"><span>Microphone</span><select class="st-in" data-sd-str="audio.mic.device"><option value="default"${r.audio.mic.device === 'default' ? ' selected' : ''}>Windows default</option>${mics.map(d => `<option value="${E(d.id)}"${r.audio.mic.device === d.id ? ' selected' : ''}>${E(d.name)}</option>`).join('')}</select></label>` : '';
    const audio = card('audio', 'Sound', ow ? 'Each source is its own track in the file, so editors can mute or balance them later. The mix of everything always records.' : 'Sound needs the Overwolf engine; ffmpeg records video only.',
      `${src('game', 'Game', 'Only the game, nothing else on your PC.')}
       <div class="sd-src${r.audio.mic.on ? '' : ' off'}">${toggle('audio.mic.on', r.audio.mic.on, 'Microphone')}${slider('audio.mic.volume', r.audio.mic.volume, 0, 200, 5, '%', 'Volume')}${micPick}</div>
       ${src('desktop', 'Desktop sound', 'Everything else you hear: Discord, music. Off by default.')}`);

    const kinds = O.KINDS.map(k => { const c = r.clips[k]; return `<div class="sd-clip${c.on ? '' : ' off'}">${toggle(`clips.${k}.on`, c.on, O.KIND_LABEL[k])}
        <label class="sd-n"><input type="number" min="0" max="${r.buffer_s - 1}" value="${c.before}" data-sd-num="clips.${k}.before"> s before</label>
        <label class="sd-n"><input type="number" min="0" max="30" value="${c.after}" data-sd-num="clips.${k}.after"> s after</label>
        <span class="sd-bar" aria-hidden="true"><i style="width:${c.before / (r.buffer_s + 30) * 100}%"></i><b></b><i class="aft" style="width:${c.after / (r.buffer_s + 30) * 100}%"></i></span></div>`; }).join('');
    const clips = card('clips', 'Clips', ow ? 'Saved during the game from the replay buffer, so a clip can reach back as far as the buffer holds. Moments close together become one clip.' : 'With ffmpeg, clips are cut from the full video after the game.',
      `<div class="sd-row">${slider('buffer_s', r.buffer_s, 10, 120, 5, ' s', 'Replay buffer')}<small class="sd-hint">Longer reaches further back. Memory use grows with it.</small></div><div class="sd-clips">${kinds}</div>`);

    const hkState = !r.hotkey.on ? '' : !ow ? '<small class="sd-hint warn">Needs the Overwolf engine.</small>' : i.hotkey === r.hotkey.keys ? '<small class="sd-hint ok">Ready, works in game.</small>' : '<small class="sd-hint warn">Another app already uses this shortcut. Pick another.</small>';
    const hotkey = card('hotkey', 'Save the last moments', 'A shortcut that saves what just happened, any time in a game, as a starred clip.',
      `<div class="sd-row">${toggle('hotkey.on', r.hotkey.on, 'Shortcut on')}<button type="button" class="st-btn sd-key" data-sd-key>${E(r.hotkey.keys)}</button><small class="sd-hint">Click, then press the keys.</small>${hkState}</div>
       <div class="sd-row">${slider('hotkey.seconds', r.hotkey.seconds, 5, r.buffer_s, 5, ' s', 'Saves the last')}</div>`);

    const st = i.storage || { used: 0, files: 0 }, capB = r.cap_gb * 1024 ** 3, pct = Math.min(100, st.used / capB * 100);
    const storage = card('storage', 'Storage', 'When the folder goes over the cap, the oldest videos go first. Starred games and clips are never deleted.',
      `<div class="sd-use"><span style="width:${pct}%"></span></div><p class="sd-usetext">${gb(st.used)} GB of ${r.cap_gb} GB used · ${st.files} file${st.files === 1 ? '' : 's'}</p>
       <div class="sd-row"><span class="sd-lbl">Folder</span><code class="sd-path">${E(i.folder || '')}</code><button type="button" class="st-btn" data-sd-folder>Change</button>${r.folder ? '<button type="button" class="st-btn" data-sd-folder-reset>Use queuePop’s folder</button>' : ''}<button type="button" class="st-btn" data-rec-folder>Open</button></div>
       <div class="sd-row">${slider('cap_gb', r.cap_gb, 5, 500, 5, ' GB', 'Size cap')}</div>`);

    host.innerHTML = `<section class="rec-page sd-page"><header class="rec-head"><p class="eyebrow">Studio</p><h1>Capture</h1></header>${top}
      <div class="sd-grid">${recording}${quality}${audio}${clips}${hotkey}${storage}</div></section>`;
  }

  // One control changed: save it, then redraw (a slider only updates its number while it moves).
  const redraw = () => { const h = document.getElementById('main'); if (location.hash.startsWith('#/studio/capture') && h) render(h); };
  document.addEventListener('input', e => {
    const n = e.target.closest && e.target.closest('input[type=range][data-sd-num]');
    if (n) n.nextElementSibling.textContent = n.value + (n.dataset.unit || '');
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.sdBool) { set(t.dataset.sdBool, t.checked); redraw(); }
    else if (t.dataset.sdNum) { set(t.dataset.sdNum, Number(t.value)); redraw(); }
    else if (t.dataset.sdStr) { set(t.dataset.sdStr, t.value); redraw(); }
    else if (t.hasAttribute && t.hasAttribute('data-sd-tft')) { QP.store.set('tft.record', t.checked); redraw(); }
  });
  document.addEventListener('click', async e => {
    const b = e.target.closest && e.target.closest('[data-sd-set],[data-sd-key],[data-sd-folder],[data-sd-folder-reset]');
    if (!b) return;
    if (b.dataset.sdSet) {
      const v = b.dataset.v, path = b.dataset.sdSet, O = window.recOptions;
      if (path === 'quality' && v === 'custom' && O) { const r = O.normalize(cfgRaw()); set('height', r.height); set('fps', r.fps); set('mbps', r.mbps); } // custom starts from what you had
      set(path, /^\d+$/.test(v) ? Number(v) : v); redraw();
    } else if (b.hasAttribute('data-sd-key')) {
      b.textContent = 'Press the keys…'; b.classList.add('listening');
      const onKey = ev => {
        if (['Control', 'Shift', 'Alt', 'Meta'].includes(ev.key)) return;
        ev.preventDefault(); ev.stopPropagation(); document.removeEventListener('keydown', onKey, true);
        if (ev.key === 'Escape') { redraw(); return; }
        const key = /^F\d{1,2}$/.test(ev.key) ? ev.key : ev.key.length === 1 ? ev.key.toUpperCase() : '';
        const acc = [ev.ctrlKey && 'Ctrl', ev.altKey && 'Alt', ev.shiftKey && 'Shift'].filter(Boolean).concat(key).join('+');
        if (window.recOptions && recOptions.KEYS.test(acc)) { set('hotkey.keys', acc); setTimeout(() => getInfo(true).then(redraw), 900); } // the host re-binds on save
        else { b.textContent = 'Use Ctrl, Alt or Shift with a letter, number or F-key'; setTimeout(redraw, 1800); }
      };
      document.addEventListener('keydown', onKey, true);
    } else if (b.hasAttribute('data-sd-folder')) {
      const r = await api().choose_recordings_folder().catch(() => null);
      if (r && r.ok) { set('folder', r.folder); setTimeout(() => getInfo(true).then(redraw), 700); }
    } else if (b.hasAttribute('data-sd-folder-reset')) { set('folder', ''); setTimeout(() => getInfo(true).then(redraw), 700); }
  });
  window.studioCapture = { render };

  // A game just saved clips (the recorder's "Saved N clips" / "Saved the last N s" / "Recorded …" lines): a card that opens
  // it in Studio, and the Library refreshes if it's open. Only for events after launch, not the activity backfill.
  const since = Date.now() / 1000;
  let toastTimer = null;
  if (window.QP && QP.bus) QP.bus.on('activity:event', async ev => {
    if (!ev || ev.kind !== 'recorder' || ev.ts < since) return;
    let id = null; try { id = (((await api().list_recordings()) || [])[0] || {}).matchId; } catch {}
    const main = document.getElementById('main');
    if (main && /^#\/studio\/?(highlights)?$/.test(location.hash) && window.recordingsView) recordingsView.render(main);
    let t = document.getElementById('sd-toast');
    if (!t) { t = Object.assign(document.createElement('div'), { id: 'sd-toast', className: 'sd-toast' }); t.setAttribute('role', 'status'); document.body.append(t); }
    t.innerHTML = `<span class="sd-toast-dot" aria-hidden="true"></span><b>${E(ev.message)}</b>${id ? `<a class="st-btn st-gold" href="#/studio/game/${encodeURIComponent(id)}">Watch</a>` : ''}<button type="button" aria-label="Close">✕</button>`;
    t.hidden = false;
    t.querySelector('button').onclick = () => { t.hidden = true; };
    t.querySelector('a') && (t.querySelector('a').onclick = () => { t.hidden = true; });
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 15000);
  });
})();
