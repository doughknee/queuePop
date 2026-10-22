/* Studio's Library, Highlights and player (#/studio, worlds.js; the Capture page is studio.js), styled by studio.css.
   Cinema deck-out (2026-10-21): every clip is one tile (poster frame, kind badge, length, star) on every page that shows clips;
   posters are grabbed once from the file and kept in IndexedDB, so no tile is a black box. window.recStrip(rec) is also what
   the League/TFT match pages use. Loaded by shell.js. */
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
  // A champion page's "Your top <champion> clips" (2026-10-21). Top = your picks first (clips you starred, or saved yourself with
  // the hotkey or in the player), then your best plays: score 35 or more on the smart-clip scale (kills, multikills, shutdowns,
  // steals, your team's objectives), so deaths, plain assists and enemy objectives stay in Studio. Best score first within each,
  // then newest; at most n. items: [{ r: recording summary, c: clip, i }]. Pure; app/test-recorder.js checks it.
  window.REC_TOP_SCORE = 35;
  window.recPickChampionClips = (items, name, n = 6) => {
    const want = String(name || '').toLowerCase(), pick = c => !!c.favorite || !!c.mine || (c.types || []).includes('manual');
    return items.filter(({ r, c }) => want && String(r.champion || '').toLowerCase() === want && c && c.file && (pick(c) || (c.score || 0) >= window.REC_TOP_SCORE))
      .sort((a, b) => (pick(b.c) ? 1 : 0) - (pick(a.c) ? 1 : 0) || (b.c.score || 0) - (a.c.score || 0) || (b.r.startedAt || 0) - (a.r.startedAt || 0))
      .slice(0, n);
  };
  // Highlights' filter and order (deck-out round 3). items: [{ r: recording summary, c: clip, i }]; f: { type: all | kill |
  // multikill | death | objective | assist | mine, champ, star, sort: best | star | new | long }. best (the default) is the
  // clip's score from app/clip-score.js, high first. Pure; app/test-recorder.js checks it.
  window.recFilterClips = (items, f = {}) => {
    const type = f.type || 'all', mine = c => !!c.mine || (c.types || []).includes('manual');
    const out = items.filter(({ r, c }) => (type === 'all' || (type === 'mine' ? mine(c) : (c.types || []).includes(type)))
      && (!f.champ || r.champion === f.champ) && (!f.star || !!c.favorite));
    const dur = x => (x.c.end || 0) - (x.c.start || 0), newest = (a, b) => (b.r.startedAt || 0) - (a.r.startedAt || 0) || (a.c.start || 0) - (b.c.start || 0);
    const fav = (a, b) => (b.c.favorite ? 1 : 0) - (a.c.favorite ? 1 : 0);
    const by = { new: newest, long: (a, b) => dur(b) - dur(a) || newest(a, b), star: (a, b) => fav(a, b) || newest(a, b) }[f.sort] || ((a, b) => (b.c.score || 0) - (a.c.score || 0) || fav(a, b) || newest(a, b));
    return [...out].sort(by);
  };
  // Library days (cinema deck-out): "Today", "Yesterday", a weekday this week, else the date; and the day's record. Pure;
  // app/test-recorder.js checks it. now is injectable for the test.
  window.recDayLabel = (ms, now = Date.now()) => {
    const day = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const diff = Math.round((day(now) - day(ms)) / 864e5);
    return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : new Date(ms).toLocaleDateString('en-US', diff < 7 ? { weekday: 'long' } : { weekday: 'short', month: 'short', day: 'numeric' });
  };
  window.recGroupDays = (list, now = Date.now()) => {
    const out = [];
    for (const r of list) { const label = window.recDayLabel(r.startedAt, now), last = out[out.length - 1]; if (last && last.label === label) last.games.push(r); else out.push({ label, games: [r] }); }
    return out.map(d => ({ ...d, wins: d.games.filter(r => r.result === 'win').length, losses: d.games.filter(r => r.result === 'loss').length }));
  };
  // The Library's games for its filter (deck-out 2): All or Starred (f.star), one champion or 'TFT' (f.champ), newest first as
  // listed. The key is what the champion picker lists. Pure; app/test-recorder.js checks it.
  window.recGameKey = r => r.game === 'tft' ? 'TFT' : r.champion || 'League';
  window.recLibraryPool = (list, f = {}) => (list || []).filter(r => (!f.star || r.favorite) && (!f.champ || window.recGameKey(r) === f.champ));
  // What kind a clip is, for its badge: your own first, then the biggest moment in it.
  window.recClipKind = c => (c.mine || (c.types || []).some(t => t === 'manual' || t === 'mine')) ? 'mine' : ['multikill', 'objective', 'kill', 'assist', 'death'].find(k => (c.types || []).includes(k)) || 'clip';
  window.recStrip = rec => `<div class="rec-strip" role="img" aria-label="${E(stripMarkers(rec).length)} moments">${stripMarkers(rec).map(m =>
    `<i class="rec-m rec-${m.type}" style="left:${m.left}%" title="${E(m.label)}"></i>`).join('')}</div>`;
  // An empty Library or Highlights (deck-out 3) says one true thing for the recorder's state and offers the one switch that
  // fixes it: s = { on: League or TFT records, video }. btn: 'on' (Record my games; 'on-video' also turns video on), 'video'
  // (Record video too) or 'capture' (just the settings link). Pure; app/test-recorder.js checks it.
  window.recEmptyState = (page, s = {}) => {
    const clips = 'a clip of every kill, multikill and objective';
    if (page === 'highlights') return !s.on ? { h: 'No clips yet', p: `Turn the recorder on with video and queuePop keeps ${clips} while you play.`, btn: 'on-video' }
      : !s.video ? { h: 'No clips yet', p: `Video is off, so games keep their timeline only. Turn it on and queuePop keeps ${clips} while you play.`, btn: 'video' }
      : { h: 'No clips yet', p: `queuePop keeps ${clips} while you play. You can also cut your own in the player, or save the last moments with the shortcut.`, btn: 'capture' };
    return !s.on ? { h: 'Your games will show up here', p: `Turn the recorder on and every League and TFT game you play lands here with its timeline. With video on, you also get ${clips}.`, btn: 'on' }
      : { h: 'Your next game shows up here', p: `The recorder is on. Play a League or TFT game and it lands here when the game ends, ${s.video ? `with ${clips}` : 'with its timeline (video is off)'}.`, btn: s.video ? 'capture' : 'video' };
  };
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return;

  const api = () => window.pywebview && window.pywebview.api;
  const when = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const clock = ms => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  // file path -> a URL the page can play (the page itself is file://, so local videos load directly)
  const fileUrl = f => encodeURI('file:///' + String(f).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  const clipName = c => c.name ? c.name : c.label ? c.label : c.mine ? 'Your clip' : [...new Set((c.types || []).map(t => KIND[t] || t))].join(' + ') || 'Clip';
  const KIND_NAME = { mine: 'Yours', multikill: 'Multikill', objective: 'Objective', kill: 'Kill', assist: 'Assist', death: 'Death', clip: 'Clip' };
  const len = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '0:00');
  const ICON = { // 20 px line icons, currentColor
    star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>', pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" stroke="none"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5m0-5-5 5"/>',
    full: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>', back: '<path d="M11 6 5 12l6 6M5 12h14"/>', folder: '<path d="M3.5 6.5h6l2 2h9v10h-17z"/>',
  };
  const ico = (k, cls = '') => `<svg class="sd-ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
  const star = (on, attrs, what, label) => `<button type="button" class="rec-star${on ? ' on' : ''}${label ? ' sd-btn' : ''}" ${attrs} aria-pressed="${!!on}" aria-label="${on ? 'Unstar' : 'Star'} ${E(what)}" title="${on ? 'Starred: kept when the folder is over its size cap' : 'Star it to keep it when the folder is over its size cap'}">${ico('star')}${label ? `<span>${on ? 'Starred' : 'Star'}</span>` : ''}</button>`;
  const resTag = r => r.game === 'tft' ? (r.placement ? `<span class="sd-res ${r.placement <= 4 ? 'win' : 'loss'}">${r.placement}${['th', 'st', 'nd', 'rd'][r.placement] || 'th'}</span>` : '')
    : r.result ? `<span class="sd-res ${r.result}">${r.result === 'win' ? 'Win' : 'Loss'}</span>` : '';
  let tab = 'all'; // Library's filter: all | favorites
  let lchamp = ''; // Library's champion filter ('TFT' for TFT games)
  let more = 30; // Library games shown; Show older games adds 30
  let hmore = 60; // Highlights tiles shown; Show more clips adds 60
  const hf = { type: 'all', champ: '', star: false, sort: 'best' }; // Highlights' filter (window.recFilterClips)
  const gameKey = window.recGameKey;
  // Studio's routes (2026-10-21): #/studio = Library, /highlights, /capture (studio.js), /game/<matchId>[/<clip>] = the player.
  const route = () => { const m = /^#\/studio(?:\/([^/?#]+))?(?:\/([^/?#]+))?(?:\/(\d+))?/.exec(location.hash) || []; return { page: m[1] || '', id: m[2], clip: m[3] }; };
  const gameHref = (id, clip) => `#/studio/game/${encodeURIComponent(id)}${clip != null ? '/' + clip : ''}`;

  // --- Posters: one frame per video, grabbed once by a single hidden <video> and kept in IndexedDB --------------------------
  // A poster already grabbed this session paints with the tile (no shimmer, no fade); prune() drops the ones whose file is gone.
  const posters = (() => {
    const mem = new Map(), done = new Map(); let db = null, chain = Promise.resolve();
    const open = () => db || (db = new Promise(res => { try { const q = indexedDB.open('qp-posters', 1); q.onupgradeneeded = () => q.result.createObjectStore('p'); q.onsuccess = () => res(q.result); q.onerror = () => res(null); } catch { res(null); } }));
    const read = async k => { const d = await open(); if (!d) return null; return new Promise(res => { try { const q = d.transaction('p').objectStore('p').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch { res(null); } }); };
    const write = async (k, v) => { const d = await open(); try { d && d.transaction('p', 'readwrite').objectStore('p').put(v, k); } catch {} };
    const grab = (src, at) => (chain = chain.then(() => new Promise(res => {
      const v = document.createElement('video'); let done = false;
      const fin = u => { if (done) return; done = true; clearTimeout(t); v.removeAttribute('src'); v.load(); res(u); };
      const t = setTimeout(() => fin(null), 8000);
      v.muted = true; v.preload = 'auto';
      v.onloadedmetadata = () => { v.currentTime = Math.max(0, Math.min(at, (v.duration || at) - 0.1)); };
      v.onseeked = () => { try { const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * v.videoHeight / v.videoWidth) || 270; c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); fin(c.toDataURL('image/jpeg', 0.72)); } catch { fin(null); } };
      v.onerror = () => fin(null);
      v.src = src;
    })));
    return {
      get(src, at) { const k = `${src}@${at}`; if (!mem.has(k)) mem.set(k, read(k).then(u => u || grab(src, at).then(g => (g && write(k, g), g))).then(u => (u && done.set(k, u), u))); return mem.get(k); },
      now: (src, at) => done.get(`${src}@${at}`),
      // Once a session: every poster of a local file that no recording points at any more (deleted games and clips).
      async prune(keep) { const d = await open(); if (!d) return; try { const q = d.transaction('p', 'readwrite').objectStore('p').openCursor();
        q.onsuccess = () => { const c = q.result; if (!c) return; const src = String(c.key).replace(/@[\d.]+$/, ''); if (src.startsWith('file:') && !keep.has(src)) c.delete(); c.continue(); }; } catch {} },
    };
  })();
  let pruned = false;
  const prunePosters = async () => { if (pruned) return; pruned = true;
    try { const list = (await api().list_recordings()) || [], keep = new Set();
      (await Promise.all(list.map(r => api().get_recording(r.matchId).catch(() => null)))).forEach(rec => rec && [rec.video && rec.video.file, ...(rec.clips || []).map(c => c.file)].forEach(f => f && keep.add(fileUrl(f))));
      if (list.length) posters.prune(keep); } catch {} };
  // Tiles fill their poster when they come into view (at once if this session already has it); the video loads on hover.
  function lazyVideos(root) {
    const items = [...root.querySelectorAll('[data-poster]')].filter(m => { const u = posters.now(m.dataset.poster, +m.dataset.at || 0.5), img = m.querySelector('.sd-poster');
      if (!u || !img) return true; img.src = u; img.hidden = false; img.classList.add('seen'); m.classList.add('has-poster'); return false; });
    const load = m => { const img = m.querySelector('.sd-poster'); posters.get(m.dataset.poster, +m.dataset.at || 0.5).then(u => { if (u && img) { img.src = u; img.hidden = false; m.classList.add('has-poster'); } else m.classList.add('no-poster'); }); };
    if (!('IntersectionObserver' in window)) { items.forEach(load); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { load(e.target); io.unobserve(e.target); } }), { rootMargin: '400px' });
    items.forEach(m => io.observe(m));
  }
  window.recLazyVideos = root => lazyVideos(root);
  const media = (src, at) => `<img class="sd-poster" alt="" hidden><video muted playsinline preload="none" data-sd-src="${src}#t=${at}"></video><i class="sd-prog" aria-hidden="true"></i>`;
  // One clip, the same tile on every page: Library's reel, Highlights, a champion page.
  function clipTile(r, c, i, o = {}) {
    const k = window.recClipKind(c), src = fileUrl(c.file);
    return `<li class="sd-tile${o.cls ? ' ' + o.cls : ''}" data-k="${k}"${o.attrs || ''}>
      <a class="sd-media" href="${gameHref(r.matchId, i)}" data-rec-hover data-poster="${src}" data-at="0.5" aria-label="${E(clipName(c))}: ${E(recFacts(r).title)}, ${E(when(r.startedAt))}">
        ${media(src, 0.5)}<span class="sd-kind k-${k}">${KIND_NAME[k]}</span><span class="sd-dur">${len((c.end || 0) - (c.start || 0))}</span>${c.published ? '<span class="sd-pubtag">Published</span>' : ''}${o.ribbon ? `<span class="sd-ribbon">${E(o.ribbon)}</span>` : ''}</a>
      ${star(c.favorite, `data-rec-cfav="${E(r.matchId)}" data-i="${i}"`, clipName(c))}
      <div class="sd-tcap"><b>${E(clipName(c))}</b><small>${o.meta != null ? o.meta : `${E(recFacts(r).title)} · ${E(when(r.startedAt))}`}</small></div></li>`;
  }
  const skeleton = page => `<div class="sd-skel" aria-hidden="true">${page === 'library' ? '<i class="sd-skel-stage"></i>' : ''}<div class="sd-skel-row">${'<i></i>'.repeat(page === 'library' ? 3 : 8)}</div></div>`;
  const pageHead = page => `<header class="sd-top"><div><p class="eyebrow">Studio</p><h1>${page === 'highlights' ? 'Highlights' : 'Library'}</h1></div><div class="sd-status-slot" id="sd-status"></div></header><div id="sd-note"></div><p class="sd-sr" id="sd-live" aria-live="polite"></p>`;
  // Deck-out 3: the window title names the page (worlds.js sets "Studio · QueuePop" for all of them).
  const titled = name => { document.title = `${name} · Studio · QueuePop`; };
  // A redraw swaps .sd-body, so keyboard focus would fall to <body>: it goes back to the control you used (a selector), or to
  // the nth match of one (the first game Show older added, the card that took a deleted one's place).
  const refocus = (box, f) => { if (!f) return; const [sel, n] = Array.isArray(f) ? f : [f, 0], all = box.querySelectorAll(sel), el = all[Math.min(n, all.length - 1)]; if (el) el.focus({ preventScroll: true }); };
  // The Library's games: All or Starred, one champion (or TFT) or every one; the stage and the counts read the whole list.
  const libPool = list => window.recLibraryPool(list, { star: tab === 'favorites', champ: lchamp });

  // o.status: read the recorder's status again (after turning it or video on). A redraw (a filter, a star, Show older) only
  // swaps the body, so the header and status stay put and tiles don't replay their entrance.
  async function render(host, o = {}) {
    let rt = route();
    // #/studio/champ/Ezreal (the search sheet's "Ezreal games" row) opens the Library filtered to that champion.
    if (rt.page === 'champ' && rt.id) { lchamp = decodeURIComponent(rt.id); tab = 'all'; more = 30; history.replaceState(null, '', '#/studio'); rt = route(); }
    if (rt.page === 'game' && rt.id) return renderPlayer(host, decodeURIComponent(rt.id), rt.clip == null ? null : +rt.clip);
    if (rt.page === 'capture') { titled('Capture'); return window.studioCapture ? studioCapture.render(host) : (host.innerHTML = '<p class="rec-empty">Loading Capture…</p>'); }
    const page = rt.page === 'highlights' ? 'highlights' : 'library', sel = `[data-sd-page="${page}"]`;
    titled(page === 'highlights' ? 'Highlights' : 'Library');
    // Its title and a skeleton at once; the list fills in when it answers, the recorder's status after that (the first engine
    // check can take seconds, so the list never waits for it).
    if (!host.querySelector(sel)) host.innerHTML = `<section class="rec-page sd-page" data-sd-page="${page}">${pageHead(page)}<div class="sd-body">${skeleton(page)}</div></section>`;
    if (!QP.store.config) { try { await QP.store.load(); } catch {} } // opened straight onto Studio: settings first, or "off" is a lie
    let list = [], failed = null;
    const here = () => location.hash.startsWith('#/studio') && route().page === rt.page; // you may have moved on while these load (review)
    try { list = (await api().list_recordings()) || []; } catch (err) { failed = String(err && err.message || err); console.warn('recordings:', failed); }
    // Highlights reads every game that has clips (130 games read in about 25 ms); the Library the games it shows.
    const pool = page === 'highlights' ? list.filter(r => r.clips) : libPool(list), want = page === 'highlights' ? pool : pool.slice(0, more);
    const full = await Promise.all(want.map(r => api().get_recording(r.matchId).catch(() => null)));
    // Champion names (splash art) and TFT unit icons (boards). The TFT data is 24 MB the first time, so the page waits at most
    // 0.6 s for them and draws again once they're in.
    const extras = Promise.all([list.some(r => r.game === 'tft') && window.tftStats ? tftStats.loadDragon().catch(() => {}) : 0, window.lgNames ? lgNames().catch(() => {}) : 0]);
    const late = await Promise.race([extras.then(() => false), new Promise(r => setTimeout(() => r(true), 600))]);
    const sec = host.querySelector(sel), box = sec && sec.querySelector('.sd-body');
    if (!here() || !box) return;
    if (late) extras.then(() => { if (here()) render(host); });
    const clips = [];
    full.forEach((rec, gi) => (rec && rec.clips || []).forEach((c, i) => c.file && clips.push({ r: want[gi], c, i })));
    const first = !sec.dataset.filled;
    box.classList.toggle('calm', !first); sec.dataset.filled = '1';
    box.innerHTML = failed ? `<div class="sd-empty"><h2>Couldn’t read your recordings</h2><p>${E(failed)}</p><button type="button" class="sd-btn" data-rec-retry>Try again</button></div>`
      : page === 'highlights' ? highlightsHtml(clips) : libraryHtml(list, pool, full);
    lazyVideos(box);
    startStage(box);
    refocus(box, o.focus);
    // Scrolling near Show older (or Show more clips) loads the next lot by itself; the button stays for the keyboard.
    const mb = box.querySelector('[data-rec-more],[data-hf-more]');
    if (mb && 'IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); if (mb.isConnected && !mb.disabled && here()) mb.click(); } }, { rootMargin: '600px' }); io.observe(mb); }
    // What a filter left, said once to a screen reader (the count on screen is redrawn, so it can't be the live region).
    const live = sec.querySelector('#sd-live');
    if (live && !first && !failed) live.textContent = page === 'highlights' ? (box.querySelector('.sd-count') || {}).textContent || '' : plural(pool.length, 'game');
    if (first || o.status) fillStatus(sec, page);
    if (!failed) setTimeout(prunePosters, 3000);
  }
  // The recorder's state, top right: one line that opens Capture; plus one note when something stops video from recording.
  async function fillStatus(host, page) {
    const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record));
    const video = !!(QP.store.config && (QP.store.config.recorder || {}).video);
    const [chip, eng] = await Promise.all([window.studioSummary ? studioSummary().catch(() => '') : '', api().recorder_status().then(s => (s || {}).engine).catch(() => null)]);
    const slot = host.querySelector('#sd-status'), note = host.querySelector('#sd-note'); if (!slot || !note) return;
    // The fix sits beside the status: turn the recorder on, or video on (Library only). A missing engine needs a sentence.
    const none = eng && !eng.engine, offered = !!host.querySelector('.sd-empty [data-rec-on],.sd-empty [data-rec-video]');
    // Highlights shows the recorder's state only when something needs fixing; the Library always does.
    slot.innerHTML = (page === 'highlights' && on && video && !none ? '' : chip) + (offered ? '' : !on ? '<button type="button" class="sd-btn primary" data-rec-on>Record my games</button>'
      : !video && !none && page === 'library' ? '<button type="button" class="sd-btn primary" data-rec-video title="Games keep their timeline only while video is off">Record video too</button>' : '');
    const ff = '<a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer">get ffmpeg ↗</a>';
    note.innerHTML = on && none ? `<p class="sd-note warn"><span>${video ? 'Video is on, but nothing can record it, so games keep their timeline only.' : 'Video needs a recorder.'} Start the QueuePop companion (the Overwolf app), or ${ff} and add it to PATH.</span></p>` : '';
  }

  // --- Library -------------------------------------------------------------------------------------------------------------
  // A champion's splash art (Data Dragon, the same art as its champion page), found by the name the recorder stored.
  const artFor = name => { const n = String(name || '').toLowerCase(), c = typeof lg !== 'undefined' && Object.values(lg.names || {}).find(x => x.name.toLowerCase() === n);
    return c && window.statsApi ? `url('${statsApi.DD}/cdn/img/champion/splash/${encodeURIComponent(c.alias)}_0.jpg')` : 'none'; };
  // A game's clips, best first (app/clip-score.js), a starred one on a tie; each keeps its index in the recording.
  const ranked = cs => (cs || []).map((c, i) => ({ c, i })).filter(x => x.c.file).sort((a, b) => (b.c.score || 0) - (a.c.score || 0) || (b.c.favorite ? 1 : 0) - (a.c.favorite ? 1 : 0));
  // What a game previews: its best clip, else a moment of the full video; null without video.
  function preview(rec) {
    const b = ranked(rec.clips)[0];
    if (b) return { src: fileUrl(b.c.file), at: 0.5 };
    if (rec.video && rec.video.file) return { src: fileUrl(rec.video.file), at: Math.min(60, Math.max(5, (rec.video.length || 120) / 3)) };
    return null;
  }
  const unitHtml = u => { const i = (window.tftStats && tftStats.info(u.key)) || {}; return `<span class="rec-unit s${u.stars}" title="${E(i.name || u.key)} ${'★'.repeat(u.stars || 1)}">${i.icon ? `<img src="${E(i.icon)}" alt="">` : E(String(i.name || u.key).slice(0, 3))}</span>`; };
  const boardHtml = rec => rec.game === 'tft' && rec.board && (rec.board.units || []).length ? `<span class="rec-board">${rec.board.units.map(unitHtml).join('')}</span>` : '';

  const recOn = () => { const c = QP.store.config || {}; return { on: !!((c.recorder || {}).enabled || (c.tft || {}).record), video: !!(c.recorder || {}).video }; };
  function emptyHtml(page, icon) {
    const x = window.recEmptyState(page, recOn()), cap = '<a class="sd-btn ghost" href="#/studio/capture">Capture settings</a>';
    const btn = x.btn === 'capture' ? '<a class="sd-btn" href="#/studio/capture">Capture settings</a>' : x.btn === 'video' ? `<button type="button" class="sd-btn primary" data-rec-video>Record video too</button>${cap}`
      : `<button type="button" class="sd-btn primary" data-rec-on${x.btn === 'on-video' ? '="video"' : ''}>Record my games</button>${cap}`;
    return `<div class="sd-empty"><span class="sd-empty-art" aria-hidden="true">${ico(icon)}</span><h2>${E(x.h)}</h2><p>${E(x.p)}</p><div class="sd-empty-acts">${btn}</div></div>`;
  }
  function libraryHtml(list, pool, full) {
    if (!list.length) return emptyHtml('library', 'play');
    const games = pool.slice(0, more).map((r, i) => ({ r, rec: full[i] || r })), favN = list.filter(r => r.favorite).length;
    const stage = tab === 'all' && !lchamp && games[0] ? stageHtml(games[0].r, games[0].rec) : '';
    const rest = stage ? games.slice(1) : games;
    const recs = new Map(rest.map(x => [x.r.matchId, x.rec]));
    // The Highlights link follows the champion filter (Highlights opens filtered to them).
    const hlChamp = lchamp && lchamp !== 'TFT' ? lchamp : '', clipN = list.reduce((n, r) => n + (!hlChamp || gameKey(r) === hlChamp ? r.clips || 0 : 0), 0), byName = list.reduce((m, r) => m.set(gameKey(r), (m.get(gameKey(r)) || 0) + 1), new Map());
    const names = [...byName.keys()].sort((a, b) => (a === 'TFT') - (b === 'TFT') || a.localeCompare(b));
    const bar = `<div class="sd-tools"><div class="sd-bar-r"><div class="sd-seg" role="group" aria-label="Show">${[['all', 'All games', list.length], ['favorites', 'Starred', favN]].map(([k, l, n]) => `<button type="button" data-rec-tab="${k}" aria-pressed="${tab === k}">${l}<small>${n}</small></button>`).join('')}</div>
      ${names.length > 1 ? `<label class="sd-pick"><span>Champion</span><select data-lib-champ><option value="">Every game</option>${names.map(n => `<option value="${E(n)}"${lchamp === n ? ' selected' : ''}>${E(n === 'TFT' ? 'TFT games' : n)} (${byName.get(n)})</option>`).join('')}</select></label>` : ''}</div>
      ${clipN ? `<a class="sd-barlink" href="#/studio/highlights" data-myclips-champ="${E(hlChamp)}">${clipN} ${E(hlChamp)}${hlChamp ? ' ' : ''}clip${clipN === 1 ? '' : 's'} in Highlights →</a>` : ''}</div>`;
    const days = window.recGroupDays(rest.map(x => x.r)).map(d => `<section class="sd-day"><header><h3>${E(d.label)}</h3><small>${plural(d.games.length, 'game')}${d.wins + d.losses ? ` · <b class="w">${d.wins} W</b> <b class="l">${d.losses} L</b>` : ''}</small></header>
      <ol class="sd-games">${d.games.map(r => cardHtml(r, recs.get(r.matchId))).join('')}</ol></section>`).join('');
    const none = rest.length ? '' : tab === 'favorites' && !lchamp ? '<div class="sd-empty small"><h2>Nothing starred yet</h2><p>Star a game and it stays, video and clips, when the folder goes over its size cap.</p></div>'
      : !stage ? `<div class="sd-empty small"><h2>No games match</h2><p>Nothing starred on ${E(lchamp === 'TFT' ? 'TFT' : lchamp)} yet.</p><button type="button" class="sd-btn" data-rec-tab="all">All ${E(lchamp === 'TFT' ? 'TFT' : lchamp)} games</button></div>` : '';
    const older = pool.length > more ? `<div class="sd-more"><button type="button" class="sd-btn" data-rec-more>Show older games <small>${pool.length - more} more</small></button></div>` : '';
    return `${stage}${bar}${none}${days}${older}`;
  }
  // The latest game on the big screen: its best clips play back to back, its clips as a reel underneath.
  function stageHtml(r, rec) {
    const f = recFacts(r), top = ranked(rec.clips), p = preview(rec), cs = (rec.clips || []).map((c, i) => ({ c, i })).filter(x => x.c.file);
    const queue = top.slice(0, 5).map(x => ({ src: fileUrl(x.c.file), i: x.i, name: clipName(x.c), k: window.recClipKind(x.c) }));
    const vid = queue.length ? `<video muted playsinline autoplay preload="auto" src="${queue[0].src}"></video>` : p ? `<video muted playsinline autoplay loop preload="auto" src="${p.src}#t=${p.at}"></video>` : '';
    const art = artFor(r.champion), board = !vid ? boardHtml(rec) : '';
    return `<section class="sd-stage ${r.result || ''}" data-sd-stage='${E(JSON.stringify(queue))}' style="--art:${art}">
      <a class="sd-stage-media${board ? ' board' : ''}" href="${gameHref(r.matchId)}" tabindex="-1" aria-hidden="true">${vid}${board}</a>
      <div class="sd-stage-copy">
        <p class="sd-stage-eyebrow">${resTag(r)}<span>Latest game · ${E(when(r.startedAt))}</span></p>
        <h2>${E(f.title)}</h2>
        ${f.facts ? `<p class="sd-stage-facts">${E(f.facts)}</p>` : ''}
        ${queue.length ? `<p class="sd-now"><i class="sd-live" aria-hidden="true"></i><span>Now playing</span><b data-sd-now>${E(queue[0].name)}</b></p>` : ''}
        <div class="sd-stage-acts"><a class="sd-btn primary big" href="${gameHref(r.matchId, queue.length ? queue[0].i : null)}" data-sd-watch>${ico('play')}<span>${queue.length ? 'Watch' : rec.video ? 'Watch the game' : 'Open timeline'}</span></a>
          ${star(r.favorite, `data-rec-fav="${E(r.matchId)}"`, f.title, true)}${rec.video ? `<button type="button" class="sd-btn ghost" data-rec-show="${E(r.matchId)}">${ico('folder')}<span>Show file</span></button>` : ''}</div>
      </div>
      ${rec.video && !queue.length ? `<span class="sd-len">${len(rec.video.length)}</span>` : ''}
      ${cs.length ? `<ol class="sd-reel" aria-label="Clips from this game">${cs.map(({ c, i }) => clipTile(r, c, i, { meta: `${mmss(c.start)} in`, attrs: ` data-reel="${i}"` })).join('')}</ol>` : ''}
    </section>`;
  }
  // The stage plays its queue: the next clip when one ends, the reel tile lit for what's playing.
  function startStage(host) {
    const st = host.querySelector('[data-sd-stage]'), v = st && st.querySelector('.sd-stage-media video'); if (!v) return;
    // Reduced motion: the art and the reel, no footage until you press Watch.
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { v.remove(); st.querySelector('.sd-now')?.remove(); return; }
    let q = []; try { q = JSON.parse(st.dataset.sdStage); } catch {}
    let n = 0;
    const light = () => { st.querySelectorAll('[data-reel]').forEach(li => li.classList.toggle('now', q[n] && +li.dataset.reel === q[n].i)); const b = st.querySelector('[data-sd-now]'); if (b && q[n]) b.textContent = q[n].name; const w = st.querySelector('[data-sd-watch]'); if (w && q[n]) w.href = gameHref(st.querySelector('[data-rec-fav]').dataset.recFav, q[n].i); };
    v.muted = true; v.play().catch(() => {}); light();
    v.addEventListener('playing', () => st.classList.add('live'));
    // Between clips the video fades to the splash art and back (no black frame while the next file opens).
    if (q.length > 1) v.addEventListener('ended', () => { st.classList.remove('live'); setTimeout(() => { if (!v.isConnected) return; n = (n + 1) % q.length; v.src = q[n].src; v.play().catch(() => {}); light(); }, 320); });
    else v.loop = true;
    // A file that's gone leaves the art up and stops claiming something is playing.
    v.addEventListener('error', () => { st.classList.remove('live'); st.querySelector('.sd-now')?.remove(); });
  }
  // A card's title fits one line: TFT games show the mode, the placement is the result tag.
  const cardTitle = r => r.game === 'tft' ? (r.queueId === 1160 ? 'Double Up' : 'TFT') : recFacts(r).title;
  function cardHtml(r, rec) {
    rec = rec || r;
    const f = recFacts(r), p = preview(rec), cs = (rec.clips || []).filter(c => c.file), board = boardHtml(rec), title = cardTitle(r);
    const thumb = p ? media(p.src, p.at) : board ? `<span class="sd-boardthumb">${board}</span>` : `<span class="sd-art" style="background-image:${artFor(r.champion)}"></span><span class="sd-ministrip">${window.recStrip(rec)}</span>`;
    return `<li class="sd-g ${r.result || ''}"><a class="sd-media${p ? '' : ' still'}" href="${gameHref(r.matchId)}"${p ? ` data-rec-hover data-poster="${p.src}" data-at="${p.at}"` : ''} aria-label="${E([title, r.game === 'tft' ? f.title.split(' · ')[1] || f.result : f.result, cs.length ? plural(cs.length, 'clip') : rec.video ? 'full video' : 'timeline only', when(r.startedAt)].filter(Boolean).join(', '))}">
        ${thumb}${cs.length ? `<span class="sd-kind k-clip">${plural(cs.length, 'clip')}</span>` : p || board ? '' : '<span class="sd-kind k-none">Timeline only</span>'}${rec.video ? `<span class="sd-dur">${len(rec.video.length)}</span>` : ''}</a>
      ${star(r.favorite, `data-rec-fav="${E(r.matchId)}"`, title)}
      <div class="sd-gbody"><a class="sd-ttl" href="${gameHref(r.matchId)}" tabindex="-1">${resTag(r)}<b>${E(title)}</b></a>
        <small title="${E([clock(r.startedAt), r.game === 'tft' ? '' : f.facts].filter(Boolean).join(' · '))}">${[clock(r.startedAt), r.game === 'tft' ? '' : f.facts].filter(Boolean).map(E).join(' · ')}</small>
        <button type="button" class="sd-gdel" data-rec-del="${E(r.matchId)}" aria-label="Delete the ${E(title)} recording from ${E(when(r.startedAt))}">Delete</button></div></li>`;
  }

  // --- Highlights ----------------------------------------------------------------------------------------------------------
  function highlightsHtml(clips) {
    if (!clips.length) return emptyHtml('highlights', 'star');
    const shown = window.recFilterClips(clips, hf), count = t => clips.filter(({ c }) => t === 'mine' ? window.recClipKind(c) === 'mine' : (c.types || []).includes(t)).length;
    const types = [['all', 'All', clips.length], ['kill', 'Kills'], ['multikill', 'Multikills'], ['objective', 'Objectives'], ['assist', 'Assists'], ['death', 'Deaths'], ['mine', 'Yours']].map(([k, l, n]) => [k, l, n ?? count(k)]).filter(([k, , n]) => k === 'all' || n);
    const champs = [...new Set(clips.map(({ r }) => r.champion).filter(Boolean))].sort();
    // Kinds on one row, then the count with the pickers beside it (deck-out 3: four rows of tools filled a 1024 window).
    const podium = hf.sort === 'best' && hf.type === 'all' && !hf.champ && !hf.star && shown.length >= 5;
    const countLine = `<p class="sd-count">${shown.length === clips.length ? plural(clips.length, 'clip') : `${shown.length} of ${plural(clips.length, 'clip')}`}${podium ? ', best first' : ''}</p>`;
    const bar = `<div class="sd-tools sd-hlbar"><div class="sd-chips" role="group" aria-label="Moments">${types.map(([k, l, n]) => `<button type="button" class="sd-chipf" aria-pressed="${hf.type === k}" data-hf="type" data-v="${k}">${k === 'all' ? '' : `<i class="sd-kdot k-${k}"></i>`}${l}<small>${n}</small></button>`).join('')}</div></div>
      <div class="sd-tools sd-hlsub">${countLine}<div class="sd-bar-r">${champs.length > 1 ? `<label class="sd-pick"><span>Champion</span><select data-hf-sel="champ"><option value="">All</option>${champs.map(n => `<option${hf.champ === n ? ' selected' : ''}>${E(n)}</option>`).join('')}</select></label>` : ''}
        <label class="sd-pick"><span>Order</span><select data-hf-sel="sort">${[['best', 'Best'], ['star', 'Starred first'], ['new', 'Newest'], ['long', 'Longest']].map(([k, l]) => `<option value="${k}"${hf.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="sd-tog"><input type="checkbox" data-hf-star${hf.star ? ' checked' : ''}><span>Starred</span></label></div></div>`;
    const grid = shown.length ? `<ol class="sd-tiles${podium ? ' podium' : ''}">${shown.slice(0, hmore).map(({ r, c, i }, n) => clipTile(r, c, i, podium && n === 0 ? { cls: 'big', ribbon: 'Your best play' } : {})).join('')}</ol>`
      : `<div class="sd-empty small"><h2>No clips match</h2><p>Clear a filter to see more.</p><button type="button" class="sd-btn" data-hf-clear>Clear filters</button></div>`;
    const moreBtn = shown.length > hmore ? `<div class="sd-more"><button type="button" class="sd-btn" data-hf-more>Show more clips <small>${shown.length - hmore} more</small></button></div>` : '';
    return `${bar}${grid}${moreBtn}`;
  }

  // A match page's "Your moments" (league-match.js, tft-view.js): its moments as a strip, its best four clips (in game order) as the tiles
  // as Studio, and Watch in Studio; '' when the recorder kept nothing worth showing (a TFT game without video is one mark).
  window.recMatchMoments = rec => {
    if (!rec) return '';
    const top = ranked(rec.clips).slice(0, 4).sort((a, b) => a.c.start - b.c.start), seen = (rec.events || []).some(e => e.type !== 'end');
    if (!seen && !rec.video && !top.length) return '';
    return `<section class="sd-mm" aria-label="Your moments"><header><span class="sd-shelf-kick">${ico('play')} Your moments</span>${rec.video || top.length ? `<a class="sd-btn" href="${gameHref(rec.matchId)}">Watch in Studio →</a>` : ''}</header>
      ${seen ? window.recStrip(rec) : ''}${top.length ? `<ol class="sd-tiles">${top.map(({ c, i }) => clipTile(rec, c, i, { meta: `${mmss(c.start)} in` })).join('')}</ol>` : ''}</section>`;
  };

  // Champion pages (league-champion.js) ask for your clips of that champion: the same tiles as Studio, each opening the player,
  // or '' when you have none (the page then shows nothing). Local files only; nothing is uploaded.
  window.recChampionClips = async function (name) {
    const a = api(); if (!a || !a.list_recordings || !name) return '';
    let list = []; try { list = (await a.list_recordings()) || []; } catch { return ''; }
    const mine = list.filter(r => r.clips && String(r.champion || '').toLowerCase() === String(name).toLowerCase());
    if (!mine.length) return '';
    // Every game on that champion (deck-out 3: it read the newest 40, so the count was short and older best plays never showed;
    // 300 games read in well under 100 ms).
    const full = await Promise.all(mine.map(r => a.get_recording(r.matchId).catch(() => null)));
    const items = []; full.forEach((rec, k) => (rec && rec.clips || []).forEach((c, i) => c.file && items.push({ r: mine[k], c, i })));
    const top = window.recPickChampionClips(items, name, 4);
    if (!top.length) return '';
    return `<section class="sd-shelf" aria-label="Your top ${E(name)} clips"><header><div><p class="sd-shelf-kick">${ico('play')} From your Studio</p><h2>Your top ${E(name)} clips</h2></div><small>Your starred and saved clips first, then your best plays.</small><a class="sd-btn" href="#/studio/highlights" data-myclips-champ="${E(name)}">${items.length > top.length ? `All ${items.length} in Studio` : 'Open Studio'} →</a></header>
      <ol class="sd-tiles">${top.map(({ r, c, i }) => clipTile(r, c, i, { meta: E([recFacts(r).result, when(r.startedAt)].filter(Boolean).join(' · ')) })).join('')}</ol></section>`;
  };
  // "All N in Studio" opens Highlights filtered to that champion.
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-myclips-champ]'); if (a) { hf.champ = a.dataset.myclipsChamp; hmore = 60; hf.type = 'all'; hf.star = false; } });

  // --- Player: #/studio/game/<matchId>[/<clip>] — the game's video on a theater stage, its moments on a timeline you can drag,
  // its clips and moments beside it, and your own clip cut from a start and an end mark. Keys in the side panel.
  const P = { rec: null, len: 0, off: 0, a: null, b: null, stopAt: null };
  const onGame = id => location.hash.startsWith(`#/studio/game/${encodeURIComponent(id)}`);
  async function renderPlayer(host, id, clipIdx) {
    // The frame at once (back link and a dark stage) so a click never leaves the last page up while the game loads.
    if (!host.querySelector(`.sd-player[data-id="${CSS.escape(id)}"]`)) host.innerHTML = `<section class="rec-page sd-page sd-player" data-id="${E(id)}"><nav class="sd-crumb"><a href="#/studio">${ico('back')}Library</a></nav><div class="sd-skel" aria-hidden="true"><i class="sd-skel-stage"></i></div></section>`;
    let rec = null; try { rec = await api().get_recording(id); } catch {}
    if (!onGame(id)) return;
    if (!rec) { host.innerHTML = `<section class="rec-page sd-page"><nav class="sd-crumb"><a href="#/studio">${ico('back')}Library</a></nav><div class="sd-empty"><h2>This recording is gone</h2><p>It was deleted, or its file moved out of the recordings folder.</p><a class="sd-btn" href="#/studio">Back to the Library</a></div></section>`; return; }
    if (window.lgNames) await lgNames().catch(() => {});
    // TFT unit icons come with 24 MB of data the first time: draw now with names, the board again when they're in.
    if (rec.game === 'tft' && window.tftStats) tftStats.loadDragon().then(() => { const b = onGame(id) && document.querySelector('.sd-vid.novid .rec-board'); if (b) b.outerHTML = boardHtml(rec); }).catch(() => {});
    if (!onGame(id)) return;
    const counts = (rec.events || []).reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {}), f = recFacts({ ...rec, counts });
    titled(cardTitle(rec));
    // Clips-only games (Studio > Capture > Keep: clips only) have no full video: the player plays its clips one after another.
    const clipsOnly = !rec.video && (rec.clips || []).length > 0;
    const evLen = Math.max(60, rec.length || 0, ...(rec.events || []).filter(e => Number.isFinite(e.t)).map(e => e.t));
    const moments = (rec.events || []).filter(e => Number.isFinite(e.t) && KIND[e.type]);
    // In a clips-only game a moment plays the clip it's in.
    const clipOf = e => (rec.clips || []).findIndex(c => (c.ids || []).includes(e.id));
    const moAttr = e => rec.video ? ` data-t="${e.t + ((rec.video && rec.video.offset) || 0)}"` : clipsOnly && clipOf(e) >= 0 ? ` data-rp-clip="${clipOf(e)}"` : ' disabled';
    Object.assign(P, { rec, clipsOnly, cur: clipIdx || 0, len: (rec.video && rec.video.length) || (rec.video || clipsOnly ? 0 : evLen), off: (rec.video && rec.video.offset) || 0, a: null, b: null, stopAt: null });
    const screen = rec.video || clipsOnly ? `<div class="sd-vid paused"><video id="rp-v" src="${fileUrl(rec.video ? rec.video.file : rec.clips[clipIdx || 0].file)}" preload="metadata" playsinline></video>
          <button type="button" class="sd-bigplay" data-rp="toggle" aria-label="Play">${ico('play')}</button></div>
        <div class="rp-tl" id="rp-tl" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0" aria-valuenow="0"><span class="rp-tip" id="rp-tip" hidden></span></div>${tools(!clipsOnly)}`
      : `<div class="sd-vid novid" style="--art:${artFor(rec.champion)}"><p><b>No video for this game</b><span>Nothing filmed this one, so here is ${rec.game === 'tft' ? 'your final board' : 'its timeline'}. ${recOn().video ? 'Video is on now, so your next games will have it.' : 'Turn video on and your next games will have it.'}</span>${recOn().video ? '' : '<button type="button" class="sd-btn primary" data-rec-video>Record video too</button>'}</p>${boardHtml(rec)}</div>
        ${moments.some(e => e.type !== 'end') ? '<div class="rp-tl static" id="rp-tl"></div>' : ''}`;
    // Clips and moments only when there are some: a TFT game without video is its board and nothing else.
    const side = [rec.video || clipsOnly ? `<section class="sd-panel"><header><h2>Clips</h2><small id="rp-ccount">${(rec.clips || []).length}</small>${clipsOnly ? '<small class="sd-ponly">Clips only, no full game</small>' : ''}</header><ol id="rp-clips" class="sd-clist"></ol></section>` : '',
      moments.some(e => e.type !== 'end') ? `<section class="sd-panel"><header><h2>Moments</h2><small>${moments.length}</small></header><ol class="sd-moments">${moments.map(e => `<li><button type="button"${moAttr(e)} class="sd-mo"><i class="sd-kdot k-${e.type}"></i><span>${mmss(e.t)}</span><b>${E(e.label)}</b></button></li>`).join('')}</ol></section>` : '',
      rec.video || clipsOnly ? `<dl class="rp-keys"><div><dt><kbd>Space</kbd></dt><dd>Play or pause</dd></div><div><dt><kbd>←</kbd><kbd>→</kbd></dt><dd>5 s back, forward</dd></div><div><dt><kbd>,</kbd><kbd>.</kbd></dt><dd>One frame</dd></div><div><dt><kbd>[</kbd><kbd>]</kbd></dt><dd>Previous, next clip</dd></div>${clipsOnly ? '' : '<div><dt><kbd>I</kbd><kbd>O</kbd><kbd>C</kbd></dt><dd>Start, end, save a clip</dd></div>'}<div><dt><kbd>M</kbd><kbd>F</kbd></dt><dd>Mute, star the game</dd></div></dl>` : ''].join('');
    host.innerHTML = `<section class="rec-page sd-page sd-player" data-id="${E(id)}">
      <header class="sd-phead"><div class="sd-ptitle"><a class="sd-pback" href="#/studio" title="Back to the Library" aria-label="Back to the Library">${ico('back')}</a><h1>${E(cardTitle(rec))}</h1>
          <p>${resTag({ ...rec })}<span>${[f.result && rec.game === 'tft' ? f.result : '', ...f.facts.split(' · '), when(rec.startedAt)].filter(Boolean).map(x => E(x).replace(/ /g, '&nbsp;')).join(' · ')}</span></p></div>
        <div class="sd-pacts">${star(rec.favorite, `data-rec-fav="${E(rec.matchId)}"`, f.title, true)}${rec.video ? `<button type="button" class="sd-btn ghost" data-rec-show="${E(rec.matchId)}">${ico('folder')}<span>Show file</span></button>` : ''}</div></header>
      <div class="sd-theater${side ? '' : ' solo'}"><div class="sd-screen" id="rp-screen">${screen}</div>${side ? `<aside class="sd-side">${side}</aside>` : ''}</div></section>`;
    drawClips(); drawTimeline();
    const v = document.getElementById('rp-v'); if (!v) return;
    const box = v.parentElement;
    v.addEventListener('loadedmetadata', () => { if (!P.len || Math.abs(P.len - v.duration) > 2 || clipsOnly) P.len = v.duration; drawTimeline(); setupSound(v); v.playbackRate = P.rate || 1; v.volume = P.vol ?? 1; v.muted = !!P.muted; tick(v); if (clipIdx != null && !clipsOnly) playClip(clipIdx); });
    v.addEventListener('play', () => { box.classList.remove('paused'); setPlayIcon(false); });
    v.addEventListener('pause', () => { box.classList.add('paused'); setPlayIcon(true); });
    v.addEventListener('timeupdate', () => { if (P.stopAt != null && v.currentTime >= P.stopAt) { v.pause(); P.stopAt = null; } tick(v); });
    v.addEventListener('ended', () => { if (P.clipsOnly && P.cur < P.rec.clips.length - 1) playClip(P.cur + 1); });
    v.addEventListener('click', () => rpAction('toggle'));
    v.addEventListener('dblclick', () => rpAction('full'));
    v.addEventListener('error', () => gone(box));
    // The timeline is the scrubber: press and drag to seek, hover to see the time and the moment under the pointer.
    const tl = document.getElementById('rp-tl'), tip = document.getElementById('rp-tip'); let drag = false;
    const at = e => { const r = tl.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (P.len || 0); };
    tl.addEventListener('pointerdown', e => { if (e.target.closest('[data-t]')) return; drag = true; tl.setPointerCapture(e.pointerId); seek(at(e)); });
    tl.addEventListener('pointermove', e => { const t = at(e); if (drag) seek(t); const m = e.target.closest('[data-t]'); tip.hidden = false; tip.style.left = pct(t); tip.textContent = m ? m.getAttribute('aria-label') : mmss(t); });
    tl.addEventListener('pointerup', () => { drag = false; });
    tl.addEventListener('pointerleave', () => { tip.hidden = true; });
    tl.addEventListener('keydown', e => { const to = { ArrowLeft: v.currentTime - 5, ArrowRight: v.currentTime + 5, PageDown: v.currentTime - 30, PageUp: v.currentTime + 30, Home: 0, End: P.len }[e.key];
      if (to != null) { e.preventDefault(); e.stopPropagation(); seek(to); } });
    if (clipsOnly && clipIdx != null) v.play().catch(() => {});
  }
  // The player's tools: play and time, clips, seek and frame step, speed, which sound you hear, volume, full screen; the cut
  // tools on their own line under it, with what is marked.
  const btn = (k, label, title, cls = '') => `<button type="button" class="rp-ib ${cls}" data-rp="${k}" title="${title}">${label}</button>`;
  const tools = full => `<div class="rp-bar">
      ${btn('toggle', ico('play'), 'Play or pause  Space', 'rp-play')}<span class="rp-time" id="rp-time">0:00 <small>/ 0:00</small></span>
      <div class="rp-grp">${btn('prev', '‹<span class="rp-wd"> Clip</span>', 'Previous clip  [')}${btn('next', '<span class="rp-wd">Clip </span>›', 'Next clip  ]')}</div>
      <div class="rp-grp rp-seek">${btn('back', '−5 s', 'Back 5 s  J')}${btn('fwd', '+5 s', 'Forward 5 s  L')}</div>
      <div class="rp-grp rp-frame">${btn('fprev', '‹ 1f', 'Back one frame  ,')}${btn('fnext', '1f ›', 'Forward one frame  .')}</div>
      <span class="rp-spacer"></span>
      <label class="sd-pick" title="Speed"><select data-rp-speed aria-label="Speed">${[0.25, 0.5, 1, 1.5, 2].map(x => `<option value="${x}"${x === (P.rate || 1) ? ' selected' : ''}>${x}×</option>`).join('')}</select></label>
      <label class="sd-pick" id="rp-sound" title="Which sound you hear" hidden><select data-rp-track aria-label="Sound"></select></label>
      <div class="rp-grp rp-vol">${btn('mute', ico(P.muted ? 'mute' : 'sound'), 'Mute  M', 'rp-mute')}<input type="range" min="0" max="1" step="0.05" value="${P.vol ?? 1}" data-rp-vol aria-label="Volume">${btn('full', ico('full'), 'Full screen  double-click the video', 'rp-fullb')}</div></div>
    ${full ? `<div class="rp-cut"><span class="rp-cutlbl">Cut a clip</span>${btn('a', 'Start <kbd>I</kbd>', 'Mark the start  I')}${btn('b', 'End <kbd>O</kbd>', 'Mark the end  O')}<span class="rp-sel" id="rp-selinfo">Mark a start and an end while it plays.</span><button type="button" class="sd-btn primary" data-rp="save" title="Save the clip  C">Save clip <kbd>C</kbd></button></div>` : ''}
    <p class="rp-msg" id="rp-msg" aria-live="polite"></p>`;
  const setPlayIcon = paused => { const b = document.querySelector('.rp-play'); if (b) b.innerHTML = ico(paused ? 'play' : 'pause'); };
  // Time readout, playhead, and which clip is under the playhead.
  function tick(v) {
    const t = document.getElementById('rp-time'); if (t) t.innerHTML = `${len(v.currentTime)} <small>/ ${len(P.len || v.duration)}</small>`;
    const h = document.getElementById('rp-ph'); if (h && P.len) h.style.left = pct(v.currentTime);
    // The slider says where you are in words; its marks are pointer-only (the Moments list is the keyboard way to them).
    const tl = document.getElementById('rp-tl'); if (tl) { tl.setAttribute('aria-valuenow', Math.round(v.currentTime)); tl.setAttribute('aria-valuemax', Math.round(P.len || v.duration || 0)); tl.setAttribute('aria-valuetext', `${len(v.currentTime)} of ${len(P.len || v.duration)}`); }
    const cs = P.rec.clips || [], cur = P.clipsOnly ? P.cur : cs.findIndex(c => v.currentTime >= c.start && v.currentTime <= c.end);
    document.querySelectorAll('#rp-clips .rp-c').forEach((li, i) => li.classList.toggle('now', i === cur));
  }
  // The recording's sound tracks, in file order: 1 everything, 2 the game, 4 your mic, 8 desktop sound (Studio > Capture > Sound).
  const TRACKS = [[1, 'Everything'], [2, 'Game only'], [4, 'Mic only'], [8, 'Desktop only']];
  function setupSound(v) {
    const at = v.audioTracks, box = document.getElementById('rp-sound'); if (!box || !at || at.length < 2) return;
    const bits = (P.rec.video && P.rec.video.tracks) || 7, names = TRACKS.filter(([b]) => bits & b).map(([, l]) => l);
    if (P.track != null && P.track < at.length) for (let i = 0; i < at.length; i++) at[i].enabled = i === P.track; // keep your pick across clips
    const sel = box.querySelector('select'), cur = [...at].findIndex(t => t.enabled);
    sel.innerHTML = [...at].map((t, i) => `<option value="${i}"${i === (cur < 0 ? 0 : cur) ? ' selected' : ''}>${E(names[i] || 'Track ' + (i + 1))}</option>`).join('');
    box.hidden = false;
  }
  const pct = t => `${Math.max(0, Math.min(100, (t / (P.len || 1)) * 100))}%`;
  function drawTimeline() {
    const tl = document.getElementById('rp-tl'); if (!tl || !P.len) return;
    const tip = document.getElementById('rp-tip');
    const sel = P.a != null ? `<i class="rp-range" style="left:${pct(P.a)};width:${pct((P.b ?? P.a) - P.a)}"></i>` : '';
    const ticks = Array.from({ length: Math.floor((P.len - 1) / 60) }, (_, m) => P.len > 600 && (m + 1) % 5 ? '' : `<i class="rp-tick" style="left:${pct((m + 1) * 60)}">${(m + 1) * 60 / P.len < 0.95 ? `<span>${m + 1}:00</span>` : ''}</i>`).join('');
    // A clips-only game's bar is the clip that's playing: it says which (deck-out 3: it was an empty bar).
    const cur = P.clipsOnly && (P.rec.clips || [])[P.cur];
    tl.innerHTML = (cur ? `<span class="rp-cur">${P.cur + 1} of ${P.rec.clips.length} · ${E(clipName(cur))}</span>` : '') + (P.clipsOnly ? '' : ticks + (P.rec.clips || []).map(c => `<i class="rp-clip" style="left:${pct(c.start)};width:${pct(c.end - c.start)}"></i>`).join('')) + sel
      + (P.clipsOnly ? '' : (P.rec.events || []).filter(e => Number.isFinite(e.t) && KIND[e.type]).map(e => `<button type="button" class="rec-m rec-${e.type}" style="left:${pct(e.t + P.off)}" data-t="${e.t + P.off}" aria-label="${E(mmss(e.t))} ${E(e.label)}" tabindex="-1"></button>`).join(''))
      + (P.rec.video || P.clipsOnly ? '<i class="rp-ph" id="rp-ph"></i>' : '');
    if (tip) tl.append(tip);
  }
  function drawClips() {
    const ol = document.getElementById('rp-clips'); if (!ol) return;
    const cs = P.rec.clips || [], n = document.getElementById('rp-ccount'); if (n) n.textContent = cs.length;
    ol.innerHTML = cs.length ? cs.map((c, i) => { const k = window.recClipKind(c), src = c.file ? fileUrl(c.file) : '';
      return `<li class="rp-c" data-k="${k}"><button type="button" class="rp-cplay" data-rp-clip="${i}"><span class="sd-cthumb"${src ? ` data-poster="${src}" data-at="0.5"` : ''}><img class="sd-poster" alt="" hidden><span class="sd-kind k-${k}">${KIND_NAME[k]}</span></span><span class="rp-ctext"><b>${E(clipName(c))}</b><small>${mmss(c.start)} · ${len(c.end - c.start)}${c.published ? ' · Published' : ''}</small></span></button>
      ${star(c.favorite, `data-rec-cfav="${E(P.rec.matchId)}" data-i="${i}"`, clipName(c))}
      <div class="rp-cacts"><button type="button" class="rec-del rec-open" data-rp-cren="${i}">Rename</button>${P.rec.game === 'tft' ? '' : c.published ? `<a class="rec-pub" href="#/league/champion/${champId(P.rec.champion) || ''}" title="${E(c.published.url)}">On the champion page</a><button type="button" class="rec-del" data-rp-cunpub="${i}">Unpublish</button>` : `<button type="button" class="rec-del rec-open" data-rp-cpub="${i}">Publish</button>`}<button type="button" class="rec-del rec-open" data-rp-cshow="${i}">Show file</button><button type="button" class="rec-del" data-rp-cdel="${i}">Delete</button></div></li>`; }).join('')
      : `<li class="sd-cnone">${P.rec.video ? 'No clips yet. Mark a start and an end under the video, then save one.' : 'Clips need video. Turn it on in Capture.'}</li>`;
    lazyVideos(ol);
    const v = document.getElementById('rp-v'); if (v) tick(v);
  }
  const seek = t => { const v = document.getElementById('rp-v'); if (v && Number.isFinite(t)) { P.stopAt = null; v.currentTime = Math.max(0, Math.min(P.len || t, t)); tick(v); } };
  function playClip(i) {
    const c = (P.rec.clips || [])[i], v = document.getElementById('rp-v'); if (!c || !v) return;
    if (P.clipsOnly) { P.cur = i; v.parentElement.classList.remove('broken'); v.parentElement.querySelector('.sd-gone')?.remove(); v.src = fileUrl(c.file); v.play().catch(() => {}); drawClips(); return; } // its own file
    v.currentTime = c.start; P.stopAt = c.end; v.play().catch(() => {});
  }
  const say = t => { const m = document.getElementById('rp-msg'); if (m) m.textContent = t; };
  // The file is gone (moved or deleted outside queuePop) or won't decode: the screen says so where you're looking, and the
  // timeline and moments stay.
  const gone = box => { if (box.querySelector('.sd-gone')) return; box.classList.add('broken'); if (!P.clipsOnly) box.parentElement.classList.add('dead');
    box.insertAdjacentHTML('beforeend', `<p class="sd-gone" role="alert"><b>${P.clipsOnly ? 'This clip’s file is gone' : 'This game’s video is gone'}</b><span>It was moved or deleted outside queuePop, or it can’t be played here. The timeline and moments are still here.</span><button type="button" class="sd-btn" data-rec-folder>Open the recordings folder</button></p>`); };
  const selInfo = () => { const s = document.getElementById('rp-selinfo'); if (s) s.innerHTML = P.a == null ? 'Mark a start and an end while it plays.' : P.b == null ? `From <b>${mmss(P.a)}</b>, now mark the end` : `<b>${mmss(P.a)} → ${mmss(P.b)}</b> · ${Math.round(P.b - P.a)} s`; document.querySelector('.rp-cut')?.classList.toggle('ready', P.a != null && P.b != null); };
  // The League champion id for the name the recorder stored (Publish needs it); 0 before the names have loaded.
  const champId = name => { const n = String(name || '').toLowerCase(); if (typeof lg === 'undefined' || !n) return 0;
    const k = Object.keys(lg.names || {}).find(k => lg.names[k].name.toLowerCase() === n); return k ? Number(k) : 0; };
  async function rpAction(k) {
    const v = document.getElementById('rp-v'); if (!v) return;
    if (P.clipsOnly && ['a', 'b', 'save'].includes(k)) { say('Clips-only games have no full video to cut from.'); return; }
    const cs = P.rec.clips || [];
    if (k === 'toggle') { v.paused ? v.play().catch(() => {}) : v.pause(); return; }
    if (k === 'mute') { P.muted = v.muted = !v.muted; const b = document.querySelector('.rp-mute'); if (b) b.innerHTML = ico(v.muted ? 'mute' : 'sound'); return; }
    if (k === 'full') { const s = document.getElementById('rp-screen'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else s && s.requestFullscreen().catch(() => {}); return; }
    if (k === 'fprev' || k === 'fnext') { v.pause(); const f = 1 / ((P.rec.video && P.rec.video.fps) || 60); P.stopAt = null; v.currentTime = Math.max(0, v.currentTime + (k === 'fnext' ? f : -f)); return; }
    if (k === 'prev' || k === 'next') {
      if (!cs.length) { say('This game has no clips.'); return; }
      let i;
      if (P.clipsOnly) i = Math.max(0, Math.min(cs.length - 1, (P.cur || 0) + (k === 'next' ? 1 : -1)));
      else { const t = v.currentTime, order = cs.map((c, j) => [c.start, j]).sort((a, b) => a[0] - b[0]);
        const hit = k === 'next' ? order.find(([st]) => st > t + 0.5) : [...order].reverse().find(([st]) => st < t - 1.5);
        if (!hit) { say(k === 'next' ? 'That was the last clip.' : 'That was the first clip.'); return; } i = hit[1]; }
      playClip(i); say(clipName(cs[i])); return;
    }
    if (k === 'back') seek(v.currentTime - 5);
    else if (k === 'fwd') seek(v.currentTime + 5);
    else if (k === 'a') { P.a = v.currentTime; if (P.b != null && P.b <= P.a) P.b = null; say(''); selInfo(); drawTimeline(); tick(v); }
    else if (k === 'b') { if (P.a == null) { say('Mark a start first.'); return; } if (v.currentTime <= P.a) { say('The end has to come after the start.'); return; } P.b = v.currentTime; say(''); selInfo(); drawTimeline(); tick(v); }
    else if (k === 'save') {
      if (P.a == null || P.b == null) { say('Mark a start and an end first.'); return; }
      say('Saving…'); const r = await api().make_clip(P.rec.matchId, P.a, P.b).catch(e => ({ ok: false, error: e && e.message }));
      if (!r || !r.ok) { say((r && r.error) || 'Couldn’t save it'); return; }
      P.rec.clips = [...(P.rec.clips || []), r.clip]; P.a = P.b = null; drawTimeline(); drawClips(); selInfo(); say('Saved, and starred.');
    }
  }
  document.addEventListener('keydown', e => {
    if (!document.getElementById('rp-v') || e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = { j: 'back', l: 'fwd', arrowleft: 'back', arrowright: 'fwd', k: 'toggle', ' ': 'toggle', m: 'mute', i: 'a', o: 'b', c: 'save', ',': 'fprev', '.': 'fnext', '[': 'prev', ']': 'next' }[e.key.toLowerCase()];
    if (k && !(k === 'toggle' && e.key === ' ' && e.target.closest('button'))) { e.preventDefault(); rpAction(k); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); document.querySelector('.sd-pacts [data-rec-fav]')?.click(); }
  });
  const what = b => (b.getAttribute('aria-label') || '').replace(/^(Un)?star /i, ''); // a star's name, kept when it redraws
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-rec-tab],[data-rec-more],[data-rec-retry],[data-rec-fav],[data-rec-cfav],[data-rp],[data-rp-clip],[data-rp-cdel],[data-rp-cshow],[data-rp-cren],[data-rp-cpub],[data-rp-cunpub],[data-hf-clear],[data-hf-more],.rp-tl [data-t],.sd-moments [data-t]');
    if (!t) return;
    if (t.dataset.recTab) { tab = t.dataset.recTab; more = 30; render(document.getElementById('main'), { focus: `.sd-seg [data-rec-tab="${tab}"]` }); return; }
    if (t.hasAttribute('data-rec-retry')) { t.disabled = true; render(document.getElementById('main')); return; }
    if (t.hasAttribute('data-rec-more') || t.hasAttribute('data-hf-more')) {
      // Focus lands on the first game (or clip) that came in, so Tab carries on from there.
      const lib = t.hasAttribute('data-rec-more'), sel = lib ? '.sd-games .sd-media' : '.sd-tiles .sd-media', n = document.querySelectorAll(sel).length, kb = document.activeElement === t;
      if (lib) more += 30; else hmore += 60;
      t.disabled = true; t.textContent = 'Loading…'; const y = window.scrollY; await render(document.getElementById('main'), { focus: kb && [sel, n] }); window.scrollTo(0, y); return;
    }
    if (t.hasAttribute('data-hf-clear')) { Object.assign(hf, { type: 'all', champ: '', star: false }); reHL('[data-hf="type"][data-v="all"]'); return; }
    if (t.dataset.recFav) {
      e.preventDefault();
      const id = t.dataset.recFav, on = t.getAttribute('aria-pressed') !== 'true', label = t.classList.contains('sd-btn');
      await api().set_recording_favorite(id, on).catch(() => null);
      if (P.rec && P.rec.matchId === id) P.rec.favorite = on;
      if (tab === 'favorites' && !location.hash.startsWith('#/studio/game/')) { render(document.getElementById('main'), { focus: '.sd-seg [data-rec-tab="favorites"]' }); return; }
      t.outerHTML = star(on, `data-rec-fav="${E(id)}"`, what(t), label); return;
    }
    if (t.dataset.recCfav) {
      e.preventDefault();
      const id = t.dataset.recCfav, i = +t.dataset.i, on = t.getAttribute('aria-pressed') !== 'true';
      await api().set_clip_favorite(id, i, on).catch(() => null);
      if (P.rec && P.rec.matchId === id && P.rec.clips[i]) P.rec.clips[i].favorite = on;
      t.outerHTML = star(on, `data-rec-cfav="${E(id)}" data-i="${i}"`, what(t)); return;
    }
    if (t.dataset.rp) { rpAction(t.dataset.rp); return; }
    if (t.dataset.rpClip != null) { playClip(+t.dataset.rpClip); return; }
    if (t.dataset.t != null) { seek(+t.dataset.t - 3); document.getElementById('rp-v')?.play().catch(() => {}); return; }
    if (t.dataset.rpCren != null) { // the clip's name becomes a text box: Enter or leaving it saves, Esc keeps the old name
      const i = +t.dataset.rpCren, b = t.closest('.rp-c').querySelector('.rp-cplay b'), c = P.rec.clips[i];
      const inp = Object.assign(document.createElement('input'), { className: 'rp-cname', value: c.name || '', placeholder: clipName({ ...c, name: '' }), maxLength: 60 });
      b.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const finish = async keep => { if (done) return; done = true; if (keep) { const r = await api().rename_clip(P.rec.matchId, i, inp.value).catch(() => null); if (r && r.ok) { if (r.name) c.name = r.name; else delete c.name; } } drawClips(); };
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
      inp.addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); });
      return;
    }
    if (t.dataset.rpCpub != null) { // two clicks: the first says what goes out
      const i = +t.dataset.rpCpub, c = P.rec.clips[i];
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Publish for everyone?'; say('Everyone on this champion’s page will see it, names on screen included. Only the game sound goes up, never your mic.'); setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'Publish'; } }, 6000); return; }
      if (typeof lgNames === 'function' && !champId(P.rec.champion)) await lgNames(lg.patch).catch(() => {});
      t.disabled = true; t.textContent = 'Publishing…'; say('Uploading and making the web copy. A long clip takes a minute.');
      const r = await api().publish_clip(P.rec.matchId, i, { champion: champId(P.rec.champion), label: clipName(c) }).catch(e => ({ ok: false, error: e && e.message }));
      if (!r || !r.ok) { say((r && r.error) || 'Couldn’t publish it'); drawClips(); return; }
      c.published = r.published; drawClips(); say(`Published. It’s on the ${P.rec.champion} page now.`); return;
    }
    if (t.dataset.rpCunpub != null) {
      const i = +t.dataset.rpCunpub;
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Take it down?'; setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'Unpublish'; } }, 4000); return; }
      t.disabled = true; const r = await api().unpublish_clip(P.rec.matchId, i).catch(e => ({ ok: false, error: e && e.message }));
      if (!r || !r.ok) { say((r && r.error) || 'Couldn’t take it down'); drawClips(); return; }
      delete P.rec.clips[i].published; drawClips(); say('Taken down. It’s off the champion page.'); return;
    }
    if (t.dataset.rpCshow != null) { await api().open_recording(P.rec.matchId, true, +t.dataset.rpCshow).catch(() => null); return; }
    if (t.dataset.rpCdel != null) {
      if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Delete for good?'; setTimeout(() => { if (t.isConnected) { delete t.dataset.sure; t.textContent = 'Delete'; } }, 4000); return; }
      const i = +t.dataset.rpCdel; await api().delete_clip(P.rec.matchId, i).catch(() => null); P.rec.clips.splice(i, 1); drawTimeline(); drawClips();
    }
  });
  // Highlights' filters apply at once.
  const reHL = focus => { hmore = 60; const m = document.getElementById('main'); if (m && location.hash.startsWith('#/studio/highlights')) render(m, { focus }); };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-hf]'); if (b) { hf[b.dataset.hf] = b.dataset.v; reHL(`[data-hf="${b.dataset.hf}"][data-v="${b.dataset.v}"]`); } });
  document.addEventListener('change', e => {
    if (!e.target.matches) return;
    if (e.target.matches('[data-hf-sel]')) { hf[e.target.dataset.hfSel] = e.target.value; reHL(`[data-hf-sel="${e.target.dataset.hfSel}"]`); }
    else if (e.target.matches('[data-hf-star]')) { hf.star = e.target.checked; reHL('[data-hf-star]'); }
    else if (e.target.matches('[data-lib-champ]')) { lchamp = e.target.value; more = 30; render(document.getElementById('main'), { focus: '[data-lib-champ]' }); }
  });
  // Speed, volume and which sound you hear apply at once and stay while you move between clips.
  document.addEventListener('change', e => {
    const v = document.getElementById('rp-v'); if (!v || !e.target.matches) return;
    if (e.target.matches('[data-rp-speed]')) { P.rate = Number(e.target.value) || 1; v.playbackRate = P.rate; }
    else if (e.target.matches('[data-rp-track]')) { const at = v.audioTracks, n = Number(e.target.value); P.track = n; if (at) for (let i = 0; i < at.length; i++) at[i].enabled = i === n; }
  });
  document.addEventListener('input', e => {
    const v = document.getElementById('rp-v'); if (!v || !e.target.matches || !e.target.matches('[data-rp-vol]')) return;
    P.vol = v.volume = Number(e.target.value); P.muted = v.muted = P.vol === 0; const b = document.querySelector('.rp-mute'); if (b) b.innerHTML = ico(v.muted ? 'mute' : 'sound');
  });
  // A tile plays its clip while the pointer is on it, with a thin progress line; the poster comes back when you leave.
  const atOf = v => Number(((v.dataset.sdSrc || v.src || '').match(/#t=([\d.]+)/) || [])[1] || 0.5);
  // Keyboard focus previews the same way.
  const hoverOn = e => {
    const a = e.target.closest && e.target.closest('[data-rec-hover]'), v = a && a.querySelector('video'); if (!v) return;
    if (!v.getAttribute('src') && v.dataset.sdSrc) {
      v.src = v.dataset.sdSrc;
      v.addEventListener('playing', () => a.classList.add('live'));
      v.addEventListener('timeupdate', () => { const p = a.querySelector('.sd-prog'); if (p && v.duration) p.style.width = `${(v.currentTime / v.duration) * 100}%`; });
    }
    if (v.paused) v.play().catch(() => {});
  };
  document.addEventListener('mouseover', hoverOn); document.addEventListener('focusin', hoverOn);
  // A featured clip (champion pages) plays in its tile, with sound and the video's own controls, until you click it again.
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-feat]'), v = a && a.querySelector('video'); if (!v || e.target === v) return;
    const on = a.classList.toggle('playing'); v.controls = on; v.muted = !on; if (on) { v.currentTime = 0; v.play().catch(() => {}); } else v.pause(); });
  const hoverOff = e => { const a = e.target.closest && e.target.closest('[data-rec-hover]'); if (a && !a.classList.contains('playing') && !a.contains(e.relatedTarget)) { const v = a.querySelector('video'); a.classList.remove('live'); if (v) { v.pause(); v.currentTime = atOf(v); } } };
  document.addEventListener('mouseout', hoverOff); document.addEventListener('focusout', hoverOff);

  document.addEventListener('click', async e => {
    const del = e.target.closest && e.target.closest('[data-rec-del]');
    // Deleting is for good, so the first click asks (inline, no dialog) and the second deletes.
    if (del && !del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete for good?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Delete'; } }, 4000); return; }
    if (del) { const n = [...document.querySelectorAll('.sd-games .sd-gdel')].indexOf(del); del.disabled = true; await api().delete_recording(del.dataset.recDel).catch(() => null); render(document.getElementById('main'), { focus: ['.sd-games .sd-media', Math.max(0, n)] }); }
    const folder = e.target.closest && e.target.closest('[data-rec-folder]');
    if (folder) { const r = await api().open_recordings_folder().catch(err => ({ ok: false, error: err && err.message })); if (r && r.ok === false) folder.textContent = r.error || 'Couldn’t open it'; return; }
    const vid = e.target.closest && e.target.closest('[data-rec-play],[data-rec-show]');
    if (vid) { const r = await api().open_recording(vid.dataset.recPlay || vid.dataset.recShow, !!vid.dataset.recShow).catch(err => ({ ok: false, error: err && err.message })); if (r && r.ok === false) vid.textContent = r.error || 'Couldn’t open it'; return; }
    const rv = e.target.closest && e.target.closest('[data-rec-video]');
    if (rv) { QP.store.set('recorder.video', true); render(document.getElementById('main'), { status: true, focus: '.sd-empty .sd-btn' }); return; }
    const on = e.target.closest && e.target.closest('[data-rec-on]');
    if (on) { QP.store.set('recorder.enabled', true); QP.store.set('tft.record', true); if (on.dataset.recOn === 'video') QP.store.set('recorder.video', true); render(document.getElementById('main'), { status: true, focus: '.sd-empty .sd-btn' }); }
  });

  // Studio in the sidebar (index.html) wears a small lime dot while the recorder is on.
  const mark = () => { const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record)), a = document.querySelector('#qp-sidebar [data-game="studio"] .sb-item');
    if (a) { a.classList.toggle('on', on); a.title = on ? 'Studio (recording your games)' : 'Studio'; } };
  if (window.QP && QP.bus) { QP.bus.on('config:loaded', mark); QP.bus.on('config:changed', ({ path }) => { if (String(path).startsWith('recorder')) mark(); }); }
  mark();
  window.recordingsView = { render };
})();
