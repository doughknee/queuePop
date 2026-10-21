/* Recordings (DONI-523 phase 1): every game the recorder kept, newest first, each with its event strip (markers placed by
   game time, coloured by kind from the theme's data palette). Route #/recordings (worlds.js), reached from the sidebar's
   bottom block next to Settings. window.recStrip(rec) is also what the League/TFT match pages use. Loaded by shell.js. */
(function () {
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const KIND = { kill: 'Kill', death: 'Death', assist: 'Assist', multikill: 'Multikill', objective: 'Objective', end: 'End' };
  const mmss = t => (t == null ? '' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
  // Events → markers on a 0..100 % strip. Pure; app/test-recorder.js checks it. Length = last event time (or the game's).
  function stripMarkers(rec) {
    const ev = (rec && rec.events || []).filter(e => Number.isFinite(e.t));
    const len = Math.max(60, rec && rec.length || 0, ...ev.map(e => e.t));
    return ev.map(e => ({ left: Math.round((e.t / len) * 1000) / 10, type: e.type, label: `${mmss(e.t)} ${e.label}`, t: e.t, clip: e.clip || null }));
  }
  window.recStripMarkers = stripMarkers;
  // One recording's title and facts line. Pure; app/test-recorder.js checks it.
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function recFacts(r) {
    const c = r.counts || {}, ord = n => `${n}${['th', 'st', 'nd', 'rd'][n] || 'th'}`; // TFT places are 1-8
    if (r.game === 'tft') return { title: `${r.queueId === 1160 ? 'Double Up' : 'TFT'}${r.placement ? ` · ${ord(r.placement)} place` : ''}`, result: r.result ? (r.result === 'win' ? 'Top 4' : 'Bottom 4') : '', facts: '' };
    const facts = [`${c.kill || 0} / ${c.death || 0} / ${c.assist || 0}`];
    if (c.multikill) facts.push(plural(c.multikill, 'multikill'));
    if (c.objective) facts.push(plural(c.objective, 'objective'));
    return { title: r.champion || 'League', result: r.result ? (r.result === 'win' ? 'Win' : 'Loss') : '', facts: facts.join(' · ') };
  }
  window.recFacts = recFacts;
  window.recStrip = rec => `<div class="rec-strip" role="img" aria-label="${E(stripMarkers(rec).length)} moments">${stripMarkers(rec).map(m =>
    `<i class="rec-m rec-${m.type}" style="left:${m.left}%" title="${E(m.label)}"></i>`).join('')}</div>`;
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return;

  const api = () => window.pywebview && window.pywebview.api;
  const when = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  // file path -> a URL the page can play (the page itself is file://, so local videos load directly)
  const fileUrl = f => encodeURI('file:///' + String(f).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  const clipName = c => c.mine ? 'Your clip' : [...new Set((c.types || []).map(t => KIND[t] || t))].join(' + ') || 'Clip';
  const star = (on, attrs, what) => `<button type="button" class="rec-star${on ? ' on' : ''}" ${attrs} aria-pressed="${!!on}" aria-label="${on ? 'Unfavourite' : 'Favourite'} ${E(what)}" title="${on ? 'Favourite: kept when the folder is over its size cap' : 'Favourite: keep it when the folder is over its size cap'}">${on ? '★' : '☆'}</button>`;
  let tab = 'all'; // all | favorites | highlights
  async function render(host) {
    const pm = /^#\/recordings\/([^/?#]+)(?:\/(\d+))?/.exec(location.hash);
    if (pm) return renderPlayer(host, decodeURIComponent(pm[1]), pm[2] == null ? null : +pm[2]);
    if (!QP.store.config) { try { await QP.store.load(); } catch {} } // opened straight onto Recordings: settings first, or "off" is a lie
    const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record));
    const video = !!(QP.store.config && (QP.store.config.recorder || {}).video);
    let list = [];
    const here = () => location.hash.startsWith('#/recordings'); // you may have moved on while these load (review)
    try { list = (await api().list_recordings()) || []; } catch (err) { console.warn('recordings:', err && err.message || err); }
    // Video needs ffmpeg on PATH (recorder-video.js probe); without it the switch would do nothing, so say why instead.
    let ff = null; try { ff = ((await api().recorder_status()) || {}).ffmpeg; } catch {}
    const noFf = ff && !ff.found, ffHelp = `<a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer">Get ffmpeg ↗</a>`;
    const vidLine = !on ? '' : noFf ? `<span>${video ? 'Video is on, but ffmpeg isn’t installed, so games keep their timeline only.' : 'Video needs ffmpeg, which isn’t installed.'} ${ffHelp}, add it to PATH, then restart queuePop.</span>`
      : !video ? `<span>Video is off, so a game keeps its timeline only. <button type="button" class="st-btn st-gold" data-rec-video>Record video too</button></span>` : '';
    if (!here()) return;
    const head = `<header class="rec-head"><p class="eyebrow">Recorder (beta)</p><h1>Recordings</h1>
      <p>${on ? 'Every League and TFT game is recorded while queuePop runs: your kills, deaths, assists, multikills, objectives and the result, with their game time.' : 'The recorder is off. Turn it on in Settings to keep a timeline of every game.'}
      <a href="#/settings#recorder" data-rec-settings>Recorder settings ↗</a></p>
      <p class="rec-files"><button type="button" class="st-btn" data-rec-folder>Open the recordings folder</button>${vidLine}</p></header>`;
    // Off: the fix is one click away, right here (it applies at once, like every Settings control).
    if (!list.length) { host.innerHTML = `<section class="rec-page">${head}<div class="rec-empty">${on ? 'No recordings yet. Play a League or TFT game and it shows up here.' : 'Nothing recorded yet.'}${on ? '' : ' <button type="button" class="st-btn st-gold" data-rec-on>Turn the recorder on</button>'}</div></section>`; return; }
    const full = await Promise.all(list.slice(0, 30).map(r => api().get_recording(r.matchId).catch(() => null)));
    if (list.some(r => r.game === 'tft') && window.tftStats) await tftStats.loadDragon().catch(() => {}); // unit names and icons for the boards
    if (!here()) return;
    const clips = [];
    full.forEach((rec, gi) => (rec && rec.clips || []).forEach((c, i) => clips.push({ r: list[gi], c, i })));
    clips.sort((a, b) => (b.c.favorite ? 1 : 0) - (a.c.favorite ? 1 : 0) || b.r.startedAt - a.r.startedAt);
    const favN = list.slice(0, 30).filter(r => r.favorite).length;
    const tabs = `<nav class="rec-tabs" aria-label="Show">${[['all', `All games · ${Math.min(30, list.length)}`], ['favorites', `Favourites · ${favN}`], ['highlights', `Highlights · ${clips.length}`]].map(([k, l]) => `<button type="button" data-rec-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</nav>`;
    if (tab === 'highlights') {
      host.innerHTML = `<section class="rec-page">${head}${tabs}${clips.length ? `<div class="rec-hls">${clips.map(({ r, c, i }) => `<div class="rec-hl"><a href="#/recordings/${encodeURIComponent(r.matchId)}/${i}" data-rec-hover><video muted preload="metadata" src="${fileUrl(c.file)}#t=0.5"></video><span><b>${E(clipName(c))}</b><small>${E(recFacts(r).title)} · ${E(when(r.startedAt))} · ${Math.round(c.end - c.start)} s</small></span></a>${star(c.favorite, `data-rec-cfav="${E(r.matchId)}" data-i="${i}"`, clipName(c))}</div>`).join('')}</div>` : `<div class="rec-empty">No clips yet. With video on, queuePop cuts your kills, deaths and objectives into clips after each game, and you can cut your own in the player.</div>`}</section>`;
      return;
    }
    const rows = list.slice(0, 30).map((r, i) => [r, i]).filter(([r]) => tab !== 'favorites' || r.favorite);
    host.innerHTML = `<section class="rec-page">${head}${tabs}${!rows.length ? '<div class="rec-empty">No favourites yet. Star a game to keep it, video and clips, when the folder is over its size cap.</div>' : ''}<ol class="rec-list">${rows.map(([r, i]) => {
      const rec = full[i] || r, f = recFacts(r), title = f.title, facts = f.facts;
      // TFT: the final board (from match history), units with their stars, instead of a timeline.
      const unit = u => { const i = (window.tftStats && tftStats.info(u.key)) || {}; return `<span class="rec-unit s${u.stars}" title="${E(i.name || u.key)} ${'★'.repeat(u.stars || 1)}">${i.icon ? `<img src="${E(i.icon)}" alt="">` : E(String(i.name || u.key).slice(0, 3))}</span>`; };
      const board = r.game === 'tft' && rec.board && (rec.board.units || []).length ? `<span class="rec-board">${rec.board.units.map(unit).join('')}<small>Level ${E(rec.board.level)}</small></span>` : '';
      const strip = stripMarkers(rec).length ? window.recStrip(rec) : board || `<span class="rec-nostrip">${r.game === 'tft' ? 'Board arrives a minute after the game' : 'No moments recorded'}</span>`;
      return `<li class="rec-row ${r.result || ''}">${star(r.favorite, `data-rec-fav="${E(r.matchId)}"`, title)}<div class="rec-meta"><a class="rec-title" href="#/recordings/${encodeURIComponent(r.matchId)}"><b>${E(title)}</b></a><small>${E(when(r.startedAt))}${f.result ? ` · ${f.result}` : ''}${facts ? ` · ${E(facts)}` : ''}${r.video ? ` · video${r.clips ? `, ${r.clips} clips` : ''}` : ''}</small></div>
        ${strip}<span class="rec-act">${r.video ? `<a class="rec-del rec-open" href="#/recordings/${encodeURIComponent(r.matchId)}">Watch</a><button type="button" class="rec-del rec-open" data-rec-show="${E(r.matchId)}">Show file</button>` : ''}<button type="button" class="rec-del" data-rec-del="${E(r.matchId)}" aria-label="Delete the ${E(title)} recording from ${E(when(r.startedAt))}">Delete</button></span></li>`; }).join('')}</ol>
      <p class="rec-legend">${Object.entries(KIND).map(([k, l]) => `<span><i class="rec-m rec-${k}"></i>${l}</span>`).join('')}</p></section>`;
  }
  // --- Player: #/recordings/<matchId>[/<clip>] — the game's video, its moments on the timeline (click to jump), clips to
  // play, star or delete, and your own clip cut from a start and an end mark. Keys: J/L ±5 s, I/O marks, C saves, F stars.
  const P = { rec: null, len: 0, off: 0, a: null, b: null, stopAt: null };
  async function renderPlayer(host, id, clipIdx) {
    let rec = null; try { rec = await api().get_recording(id); } catch {}
    if (!location.hash.startsWith('#/recordings/')) return;
    if (!rec) { host.innerHTML = `<section class="rec-page"><a class="rec-back" href="#/recordings">← Recordings</a><div class="rec-empty">This recording is gone.</div></section>`; return; }
    const counts = (rec.events || []).reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {}), f = recFacts({ ...rec, counts });
    Object.assign(P, { rec, len: (rec.video && rec.video.length) || 0, off: (rec.video && rec.video.offset) || 0, a: null, b: null, stopAt: null });
    host.innerHTML = `<section class="rec-page rec-player"><a class="rec-back" href="#/recordings">← Recordings</a>
      <header class="rp-head">${star(rec.favorite, `data-rec-fav="${E(rec.matchId)}"`, f.title)}<h1>${E(f.title)}</h1><small>${E(when(rec.startedAt))}${f.result ? ` · ${f.result}` : ''}${f.facts ? ` · ${E(f.facts)}` : ''}</small></header>
      ${rec.video ? `<div class="rp-stage"><video id="rp-v" src="${fileUrl(rec.video.file)}" controls preload="metadata"></video>
        <div class="rp-tl" id="rp-tl" title="Click to jump"></div>
        <div class="rp-bar"><button type="button" class="st-btn" data-rp="back">−5 s <kbd>J</kbd></button><button type="button" class="st-btn" data-rp="fwd">+5 s <kbd>L</kbd></button>
          <span class="rp-sep"></span><button type="button" class="st-btn" data-rp="a">Start here <kbd>I</kbd></button><button type="button" class="st-btn" data-rp="b">End here <kbd>O</kbd></button>
          <button type="button" class="st-btn st-gold" data-rp="save">Save clip <kbd>C</kbd></button><span class="rp-msg" id="rp-msg" aria-live="polite"></span></div></div>`
        : `<div class="rec-empty">This game has no video (Record video was off), so here is its timeline.</div>${stripMarkers(rec).length ? window.recStrip(rec) : ''}`}
      <section class="rp-clips"><h2>Clips</h2><ol id="rp-clips"></ol></section></section>`;
    drawClips();
    const v = document.getElementById('rp-v'); if (!v) return;
    v.addEventListener('loadedmetadata', () => { if (!P.len || Math.abs(P.len - v.duration) > 2) P.len = v.duration; drawTimeline(); if (clipIdx != null) playClip(clipIdx); });
    v.addEventListener('timeupdate', () => { if (P.stopAt != null && v.currentTime >= P.stopAt) { v.pause(); P.stopAt = null; } const h = document.getElementById('rp-ph'); if (h && P.len) h.style.left = pct(v.currentTime); });
    v.addEventListener('error', () => say('The video file is missing or can’t be played.'));
    document.getElementById('rp-tl').addEventListener('click', e => { if (e.target.closest('[data-t]')) return; const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * P.len); });
    drawTimeline();
  }
  const pct = t => `${Math.max(0, Math.min(100, (t / (P.len || 1)) * 100))}%`;
  function drawTimeline() {
    const tl = document.getElementById('rp-tl'); if (!tl) return;
    const sel = P.a != null ? `<i class="rp-sel" style="left:${pct(P.a)};width:${pct((P.b ?? P.a) - P.a)}"></i>` : '';
    tl.innerHTML = (P.rec.clips || []).map(c => `<i class="rp-clip" style="left:${pct(c.start)};width:${pct(c.end - c.start)}"></i>`).join('') + sel
      + (P.rec.events || []).filter(e => Number.isFinite(e.t) && KIND[e.type]).map(e => `<button type="button" class="rec-m rec-${e.type}" style="left:${pct(e.t + P.off)}" data-t="${e.t + P.off}" title="${E(mmss(e.t))} ${E(e.label)}" aria-label="${E(mmss(e.t))} ${E(e.label)}"></button>`).join('')
      + '<i class="rp-ph" id="rp-ph"></i>';
  }
  function drawClips() {
    const ol = document.getElementById('rp-clips'); if (!ol) return;
    const cs = P.rec.clips || [];
    ol.innerHTML = cs.length ? cs.map((c, i) => `<li class="rp-c">${star(c.favorite, `data-rec-cfav="${E(P.rec.matchId)}" data-i="${i}"`, clipName(c))}<button type="button" class="rp-cplay" data-rp-clip="${i}"><b>${E(clipName(c))}</b><small>${mmss(c.start)} – ${mmss(c.end)} · ${Math.round(c.end - c.start)} s</small></button>
      <button type="button" class="rec-del rec-open" data-rp-cshow="${i}">Show file</button><button type="button" class="rec-del" data-rp-cdel="${i}">Delete</button></li>`).join('')
      : `<li class="rec-nostrip">${P.rec.video ? 'No clips yet. Mark a start and an end, then save one.' : 'Clips need video.'}</li>`;
  }
  const seek = t => { const v = document.getElementById('rp-v'); if (v && Number.isFinite(t)) { P.stopAt = null; v.currentTime = Math.max(0, Math.min(P.len || t, t)); } };
  function playClip(i) { const c = (P.rec.clips || [])[i], v = document.getElementById('rp-v'); if (!c || !v) return; v.currentTime = c.start; P.stopAt = c.end; v.play().catch(() => {}); }
  const say = t => { const m = document.getElementById('rp-msg'); if (m) m.textContent = t; };
  async function rpAction(k) {
    const v = document.getElementById('rp-v'); if (!v) return;
    if (k === 'back') seek(v.currentTime - 5);
    else if (k === 'fwd') seek(v.currentTime + 5);
    else if (k === 'a') { P.a = v.currentTime; if (P.b != null && P.b <= P.a) P.b = null; say(`Start at ${mmss(P.a)}. Now mark the end.`); drawTimeline(); }
    else if (k === 'b') { if (P.a == null) { say('Mark a start first.'); return; } if (v.currentTime <= P.a) { say('The end has to come after the start.'); return; } P.b = v.currentTime; say(`${Math.round(P.b - P.a)} s selected. Save it with C.`); drawTimeline(); }
    else if (k === 'save') {
      if (P.a == null || P.b == null) { say('Mark a start and an end first.'); return; }
      say('Saving…'); const r = await api().make_clip(P.rec.matchId, P.a, P.b).catch(e => ({ ok: false, error: e && e.message }));
      if (!r || !r.ok) { say((r && r.error) || 'Couldn’t save it'); return; }
      P.rec.clips = [...(P.rec.clips || []), r.clip]; P.a = P.b = null; drawTimeline(); drawClips(); say('Saved, and starred.');
    }
  }
  document.addEventListener('keydown', e => {
    if (!document.getElementById('rp-v') || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = { j: 'back', l: 'fwd', i: 'a', o: 'b', c: 'save' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); rpAction(k); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); document.querySelector('.rp-head [data-rec-fav]')?.click(); }
  });
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-rec-tab],[data-rec-fav],[data-rec-cfav],[data-rp],[data-rp-clip],[data-rp-cdel],[data-rp-cshow],.rp-tl [data-t]');
    if (!t) return;
    if (t.dataset.recTab) { tab = t.dataset.recTab; render(document.getElementById('main')); return; }
    if (t.dataset.recFav) {
      const id = t.dataset.recFav, on = t.getAttribute('aria-pressed') !== 'true';
      await api().set_recording_favorite(id, on).catch(() => null);
      if (P.rec && P.rec.matchId === id) P.rec.favorite = on;
      if (tab === 'favorites' && !location.hash.startsWith('#/recordings/')) { render(document.getElementById('main')); return; }
      t.outerHTML = star(on, `data-rec-fav="${E(id)}"`, ''); return;
    }
    if (t.dataset.recCfav) {
      const id = t.dataset.recCfav, i = +t.dataset.i, on = t.getAttribute('aria-pressed') !== 'true';
      await api().set_clip_favorite(id, i, on).catch(() => null);
      if (P.rec && P.rec.matchId === id && P.rec.clips[i]) P.rec.clips[i].favorite = on;
      t.outerHTML = star(on, `data-rec-cfav="${E(id)}" data-i="${i}"`, ''); return;
    }
    if (t.dataset.rp) { rpAction(t.dataset.rp); return; }
    if (t.dataset.rpClip != null) { playClip(+t.dataset.rpClip); return; }
    if (t.dataset.t != null) { seek(+t.dataset.t - 3); document.getElementById('rp-v')?.play().catch(() => {}); return; }
    if (t.dataset.rpCshow != null) { await api().open_recording(P.rec.matchId, true, +t.dataset.rpCshow).catch(() => null); return; }
    if (t.dataset.rpCdel != null) {
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Delete for good?'; setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'Delete'; } }, 4000); return; }
      const i = +t.dataset.rpCdel; await api().delete_clip(P.rec.matchId, i).catch(() => null); P.rec.clips.splice(i, 1); drawTimeline(); drawClips();
    }
  });
  // Highlights: a card plays its clip while the pointer is on it.
  document.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('[data-rec-hover]'), v = a && a.querySelector('video'); if (v && v.paused) v.play().catch(() => {}); });
  document.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest('[data-rec-hover]'); if (a && !a.contains(e.relatedTarget)) { const v = a.querySelector('video'); if (v) { v.pause(); v.currentTime = 0.5; } } });

  document.addEventListener('click', async e => {
    const del = e.target.closest && e.target.closest('[data-rec-del]');
    // Deleting is for good, so the first click asks (inline, no dialog) and the second deletes.
    if (del && !del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete for good?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Delete'; } }, 4000); return; }
    if (del) { del.disabled = true; await api().delete_recording(del.dataset.recDel).catch(() => null); render(document.getElementById('main')); }
    const folder = e.target.closest && e.target.closest('[data-rec-folder]');
    if (folder) { const r = await api().open_recordings_folder().catch(err => ({ ok: false, error: err && err.message })); if (r && r.ok === false) folder.textContent = r.error || 'Couldn’t open it'; return; }
    const vid = e.target.closest && e.target.closest('[data-rec-play],[data-rec-show]');
    if (vid) { const r = await api().open_recording(vid.dataset.recPlay || vid.dataset.recShow, !!vid.dataset.recShow).catch(err => ({ ok: false, error: err && err.message })); if (r && r.ok === false) vid.textContent = r.error || 'Couldn’t open it'; return; }
    const rv = e.target.closest && e.target.closest('[data-rec-video]');
    if (rv) { QP.store.set('recorder.video', true); render(document.getElementById('main')); return; }
    const on = e.target.closest && e.target.closest('[data-rec-on]');
    if (on) { QP.store.set('recorder.enabled', true); QP.store.set('tft.record', true); render(document.getElementById('main')); }
    const s = e.target.closest && e.target.closest('[data-rec-settings]');
    if (s) setTimeout(() => window.qpSearch && qpSearch.focusSetting('recorder.enabled'), 120);
  });

  // Sidebar: Recordings next to Settings at the bottom.
  const gear = document.querySelector('#qp-sidebar .sb-gear');
  if (gear && !document.querySelector('#qp-sidebar .sb-rec')) {
    const a = Object.assign(document.createElement('a'), { className: 'sb-gear sb-rec', href: '#/recordings', title: 'Recordings' });
    a.setAttribute('aria-label', 'Recordings');
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>';
    gear.before(a);
  }
  // The sidebar icon wears a small lime dot while the recorder is on.
  const mark = () => { const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record)), a = document.querySelector('#qp-sidebar .sb-rec');
    if (a) { a.classList.toggle('on', on); a.title = on ? 'Recordings (recorder on)' : 'Recordings'; } };
  if (window.QP && QP.bus) { QP.bus.on('config:loaded', mark); QP.bus.on('config:changed', ({ path }) => { if (String(path).startsWith('recorder')) mark(); }); }
  mark();
  window.recordingsView = { render };
})();
