/* Recordings (DONI-523 phase 1): every game the recorder kept, newest first, each with its event strip (markers placed by
   game time, coloured by kind from the theme's data palette). Studio's Library, Highlights and player (#/studio, worlds.js;
   the Capture page is studio.js). window.recStrip(rec) is also what the League/TFT match pages use. Loaded by shell.js. */
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
  window.recStrip = rec => `<div class="rec-strip" role="img" aria-label="${E(stripMarkers(rec).length)} moments">${stripMarkers(rec).map(m =>
    `<i class="rec-m rec-${m.type}" style="left:${m.left}%" title="${E(m.label)}"></i>`).join('')}</div>`;
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return;

  const api = () => window.pywebview && window.pywebview.api;
  const when = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  // file path -> a URL the page can play (the page itself is file://, so local videos load directly)
  const fileUrl = f => encodeURI('file:///' + String(f).replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');
  const clipName = c => c.name ? c.name : c.label ? c.label : c.mine ? 'Your clip' : [...new Set((c.types || []).map(t => KIND[t] || t))].join(' + ') || 'Clip';
  const star = (on, attrs, what) => `<button type="button" class="rec-star${on ? ' on' : ''}" ${attrs} aria-pressed="${!!on}" aria-label="${on ? 'Unfavourite' : 'Favourite'} ${E(what)}" title="${on ? 'Favourite: kept when the folder is over its size cap' : 'Favourite: keep it when the folder is over its size cap'}">${on ? '★' : '☆'}</button>`;
  let tab = 'all'; // Library's filter: all | favorites
  const hf = { type: 'all', champ: '', star: false, sort: 'best' }; // Highlights' filter (window.recFilterClips)
  // Studio's routes (2026-10-21): #/studio = Library, /highlights, /capture (studio.js), /game/<matchId>[/<clip>] = the player.
  const route = () => { const m = /^#\/studio(?:\/([^/?#]+))?(?:\/([^/?#]+))?(?:\/(\d+))?/.exec(location.hash) || []; return { page: m[1] || '', id: m[2], clip: m[3] }; };
  const gameHref = (id, clip) => `#/studio/game/${encodeURIComponent(id)}${clip != null ? '/' + clip : ''}`;
  async function render(host) {
    const rt = route();
    if (rt.page === 'game' && rt.id) return renderPlayer(host, decodeURIComponent(rt.id), rt.clip == null ? null : +rt.clip);
    if (rt.page === 'capture') return window.studioCapture ? studioCapture.render(host) : (host.innerHTML = '<p class="rec-empty">Loading Capture…</p>');
    const page = rt.page === 'highlights' ? 'highlights' : 'library';
    // Its title at once; the list, engine and storage fill in when they answer (the first engine check can take seconds).
    if (!host.querySelector(`[data-sd-page="${page}"]`)) host.innerHTML = `<section class="rec-page" data-sd-page="${page}"><header class="rec-head"><p class="eyebrow">Studio</p><h1>${page === 'highlights' ? 'Highlights' : 'Library'}</h1></header><p class="rec-wait">Loading…</p></section>`;
    if (!QP.store.config) { try { await QP.store.load(); } catch {} } // opened straight onto Recordings: settings first, or "off" is a lie
    const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record));
    const video = !!(QP.store.config && (QP.store.config.recorder || {}).video);
    let list = [];
    const here = () => location.hash.startsWith('#/studio') && route().page === rt.page; // you may have moved on while these load (review)
    try { list = (await api().list_recordings()) || []; } catch (err) { console.warn('recordings:', err && err.message || err); }
    // Video needs the QueuePop companion (Overwolf) or ffmpeg on PATH (recorder-video.js engine); say which records, or why nothing can.
    let eng = null; try { eng = ((await api().recorder_status()) || {}).engine; } catch {}
    const none = eng && !eng.engine, ffHelp = `<a href="https://ffmpeg.org/download.html" target="_blank" rel="noopener noreferrer">get ffmpeg ↗</a>`;
    const vidLine = !on ? '' : none ? `<span>${video ? 'Video is on, but nothing can record it, so games keep their timeline only.' : 'Video needs a recorder.'} Start the QueuePop companion (the Overwolf app), or ${ffHelp} and add it to PATH.</span>`
      : !video ? `<span>Video is off, so a game keeps its timeline only. <button type="button" class="st-btn st-gold" data-rec-video>Record video too</button></span>`
      : ''; // what records it is the summary strip's Engine cell
    const summary = window.studioSummary ? await studioSummary().catch(() => '') : '';
    if (!here()) return;
    const head = `<header class="rec-head sd-lhead"><div><p class="eyebrow">Studio</p><h1>${page === 'highlights' ? 'Highlights' : 'Library'}</h1></div>
      <nav class="sd-hacts" aria-label="Studio"><a class="st-btn" href="#/studio/capture">Capture settings</a><button type="button" class="st-btn" data-rec-folder>Open folder</button></nav></header>
      ${summary}${vidLine || !on ? `<p class="rec-files">${!on ? 'The recorder is off. Turn it on to keep every League and TFT game. <button type="button" class="st-btn st-gold" data-rec-on>Turn the recorder on</button>' : vidLine}</p>` : ''}`;
    if (!list.length) { host.innerHTML = `<section class="rec-page" data-sd-page="${page}">${head}<div class="rec-empty">${on ? 'No recordings yet. Play a League or TFT game and it shows up here.' : 'Nothing recorded yet.'}</div></section>`; return; }
    const full = await Promise.all(list.slice(0, 30).map(r => api().get_recording(r.matchId).catch(() => null)));
    if (list.some(r => r.game === 'tft') && window.tftStats) await tftStats.loadDragon().catch(() => {}); // unit names and icons for the boards
    if (window.lgNames) await lgNames().catch(() => {}); // champion names -> splash art for games without video
    if (!here()) return;
    const clips = [];
    full.forEach((rec, gi) => (rec && rec.clips || []).forEach((c, i) => clips.push({ r: list[gi], c, i })));
    if (page === 'highlights') {
      const shown = window.recFilterClips(clips, hf), has = t => clips.some(({ c }) => t === 'mine' ? (c.mine || (c.types || []).includes('manual')) : (c.types || []).includes(t));
      const types = [['all', 'All'], ['kill', 'Kills'], ['multikill', 'Multikills'], ['death', 'Deaths'], ['objective', 'Objectives'], ['assist', 'Assists'], ['mine', 'Your clips']].filter(([k]) => k === 'all' || has(k));
      const champs = [...new Set(clips.map(({ r }) => r.champion).filter(Boolean))].sort();
      const bar = clips.length ? `<div class="sd-hlbar"><div class="sd-seg" role="radiogroup" aria-label="Moments">${types.map(([k, l]) => `<button type="button" role="radio" aria-checked="${hf.type === k}" data-hf="type" data-v="${k}">${l}</button>`).join('')}</div>
        ${champs.length > 1 ? `<label class="rp-pick">Champion <select data-hf-sel="champ"><option value="">All</option>${champs.map(n => `<option${hf.champ === n ? ' selected' : ''}>${E(n)}</option>`).join('')}</select></label>` : ''}
        <label class="sd-tog"><input type="checkbox" data-hf-star${hf.star ? ' checked' : ''}><span>Starred only</span></label>
        <label class="rp-pick">Order <select data-hf-sel="sort">${[['best', 'Best'], ['star', 'Starred first'], ['new', 'Newest'], ['long', 'Longest']].map(([k, l]) => `<option value="${k}"${hf.sort === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <span class="sd-hlcount">${shown.length === clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'}` : `${shown.length} of ${clips.length} clips`}</span></div>` : '';
      host.innerHTML = `<section class="rec-page" data-sd-page="${page}">${head}${bar}${!clips.length ? '' : !shown.length ? '<div class="rec-empty">No clips match. Clear a filter to see more.</div>' : ''}${shown.length ? `<div class="rec-hls">${shown.map(({ r, c, i }) => `<div class="rec-hl"><a href="${gameHref(r.matchId, i)}" data-rec-hover><video muted preload="none" data-sd-src="${fileUrl(c.file)}#t=0.5"></video><span><b>${E(clipName(c))}</b><small>${E(recFacts(r).title)} · ${E(when(r.startedAt))} · ${Math.round(c.end - c.start)} s${c.published ? ' · Published' : ''}</small></span></a>${star(c.favorite, `data-rec-cfav="${E(r.matchId)}" data-i="${i}"`, clipName(c))}</div>`).join('')}</div>` : clips.length ? '' : `<div class="rec-empty">No clips yet. With video on, queuePop keeps a clip of your kills, deaths and objectives, and you can cut your own in the player.</div>`}</section>`;
      lazyVideos(host);
      return;
    }
    // Library (deck-out 2026-10-21): your latest game up top, playing its best clip, with its clips as a filmstrip;
    // every other game as a card with a video preview (loaded when it scrolls into view, played while you point at it).
    const games = list.slice(0, 30).map((r, i) => ({ r, rec: full[i] || r })).filter(({ r }) => tab !== 'favorites' || r.favorite);
    const favN = list.slice(0, 30).filter(r => r.favorite).length;
    const tabs = `<nav class="rec-tabs" aria-label="Show">${[['all', `All games · ${Math.min(30, list.length)}`], ['favorites', `Favourites · ${favN}`]].map(([k, l]) => `<button type="button" data-rec-tab="${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}<a href="#/studio/highlights">Highlights · ${clips.length}</a></nav>`;
    const hero = tab === 'all' && games[0] ? heroHtml(games[0].r, games[0].rec) : '';
    const rest = tab === 'all' ? games.slice(1) : games;
    host.innerHTML = `<section class="rec-page" data-sd-page="${page}">${head}${hero}${tabs}
      ${!games.length ? '<div class="rec-empty">No favourites yet. Star a game to keep it, video and clips, when the folder is over its size cap.</div>' : ''}
      <ol class="sd-games">${rest.map(({ r, rec }) => cardHtml(r, rec)).join('')}</ol></section>`;
    lazyVideos(host);
    const hv = host.querySelector('.sd-hero-media video');
    if (hv) { hv.muted = true; hv.play().catch(() => {}); } // muted autoplay; the property, not just the attribute
  }
  // --- Library pieces ---------------------------------------------------------------------------------------------------
  const len = s => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  // A champion's splash art (Data Dragon, the same art as its champion page), found by the name the recorder stored.
  const artFor = name => { const n = String(name || '').toLowerCase(), c = typeof lg !== 'undefined' && Object.values(lg.names || {}).find(x => x.name.toLowerCase() === n);
    return c && window.statsApi ? `url('${statsApi.DD}/cdn/img/champion/splash/${encodeURIComponent(c.alias)}_0.jpg')` : ''; };
  // A game's best clip: the highest score (app/clip-score.js), a starred one on a tie, else the first.
  const bestClip = cs => [...(cs || [])].sort((a, b) => (b.score || 0) - (a.score || 0) || (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0))[0];
  // What a game previews: its best clip, else a moment of the full video; null without video.
  function preview(rec) {
    const c = bestClip(rec.clips);
    if (c && c.file) return { src: fileUrl(c.file), at: 0.5, clip: true };
    if (rec.video && rec.video.file) return { src: fileUrl(rec.video.file), at: Math.min(60, Math.max(5, (rec.video.length || 120) / 3)) };
    return null;
  }
  const unitHtml = u => { const i = (window.tftStats && tftStats.info(u.key)) || {}; return `<span class="rec-unit s${u.stars}" title="${E(i.name || u.key)} ${'★'.repeat(u.stars || 1)}">${i.icon ? `<img src="${E(i.icon)}" alt="">` : E(String(i.name || u.key).slice(0, 3))}</span>`; };
  const boardHtml = rec => rec.game === 'tft' && rec.board && (rec.board.units || []).length ? `<span class="rec-board">${rec.board.units.map(unitHtml).join('')}</span>` : '';
  function heroHtml(r, rec) {
    const f = recFacts(r), p = preview(rec), cs = rec.clips || [], art = artFor(r.champion);
    const media = p ? `<video muted loop autoplay playsinline preload="auto" src="${p.src}#t=${p.at}"></video>` : `<span class="sd-art" style="background-image:${art || 'none'}"></span>${boardHtml(rec)}`;
    const film = cs.length ? `<ol class="sd-film">${cs.map((c, i) => `<li><a href="${gameHref(r.matchId, i)}" data-rec-hover><video muted preload="none" data-sd-src="${fileUrl(c.file)}#t=0.5"></video><span><b>${E(clipName(c))}</b><small>${mmss(c.start)} · ${Math.round(c.end - c.start)} s${c.favorite ? ' · ★' : ''}</small></span></a></li>`).join('')}</ol>` : stripMarkers(rec).length ? `<div class="sd-film-strip">${window.recStrip(rec)}</div>` : '';
    return `<section class="sd-hero ${r.result || ''}" data-sd-hero>
      <a class="sd-hero-media" href="${gameHref(r.matchId)}" aria-label="Watch ${E(f.title)}">${media}${rec.video ? `<span class="sd-len">${len(rec.video.length)}</span>` : cs.length ? '<span class="sd-len">clips only</span>' : ''}</a>
      <div class="sd-hero-meta"><p class="eyebrow">Latest game · ${E(when(r.startedAt))}</p><h2>${E(f.title)}</h2>
        <p>${[f.result, f.facts].filter(Boolean).map(E).join(' · ')}</p>
        ${cs.length ? `<p class="sd-hero-best">Best moment: <a href="${gameHref(r.matchId, cs.indexOf(bestClip(cs)))}">${E(clipName(bestClip(cs)))}</a></p>` : ''}
        <div class="sd-hero-acts">${p ? `<a class="st-btn st-gold" href="${gameHref(r.matchId)}">Watch</a>` : ''}${star(r.favorite, `data-rec-fav="${E(r.matchId)}"`, f.title)}${rec.video ? `<button type="button" class="rec-del rec-open" data-rec-show="${E(r.matchId)}">Show file</button>` : ''}</div>
        ${cs.length ? `<small class="sd-hero-n">${cs.length} clip${cs.length > 1 ? 's' : ''}</small>` : ''}</div>
      ${film}</section>`;
  }
  // A card's title fits one line: TFT games lead with the placement ("4th place") and put the mode in the details.
  const ord = n => `${n}${['th', 'st', 'nd', 'rd'][n] || 'th'}`;
  const cardFacts = r => { const f = recFacts(r); return r.game === 'tft' && r.placement ? { ...f, title: `${ord(r.placement)} place`, facts: r.queueId === 1160 ? 'Double Up' : 'TFT' } : f; };
  function cardHtml(r, rec) {
    const f = cardFacts(r), p = preview(rec), cs = rec.clips || [], art = artFor(r.champion), board = boardHtml(rec);
    return `<li class="sd-g ${r.result || ''}"><a class="sd-thumb" href="${gameHref(r.matchId)}"${p ? ' data-rec-hover' : ''} aria-label="${E(f.title)} from ${E(when(r.startedAt))}">
        ${p ? `<video muted preload="none" data-sd-src="${p.src}#t=${p.at}"></video>` : board ? `<span class="sd-boardthumb">${board}</span>` : `<span class="sd-art" style="background-image:${art || 'none'}"></span><span class="sd-novid">Timeline only</span>`}
        ${rec.video ? `<span class="sd-len">${len(rec.video.length)}</span>` : ''}${cs.length ? `<span class="sd-clipn">${cs.length} clip${cs.length > 1 ? 's' : ''}</span>` : ''}</a>
      <div class="sd-gmeta">${star(r.favorite, `data-rec-fav="${E(r.matchId)}"`, f.title)}<a class="rec-title" href="${gameHref(r.matchId)}"><b>${E(f.title)}</b></a>
        <button type="button" class="rec-del sd-gdel" data-rec-del="${E(r.matchId)}" aria-label="Delete the ${E(f.title)} recording from ${E(when(r.startedAt))}">Delete</button></div>
      <small class="sd-gfacts">${[when(r.startedAt), f.result, f.facts].filter(Boolean).map(E).join(' · ')}</small></li>`;
  }
  // Champion pages (league-champion.js) ask for your clips of that champion: a filmstrip that opens each in Studio's player,
  // or '' when you have none (the page then shows nothing). Local files only; nothing is uploaded.
  window.recChampionClips = async function (name) {
    const a = api(); if (!a || !a.list_recordings || !name) return '';
    let list = []; try { list = (await a.list_recordings()) || []; } catch { return ''; }
    const mine = list.filter(r => r.clips && String(r.champion || '').toLowerCase() === String(name).toLowerCase());
    if (!mine.length) return '';
    const full = await Promise.all(mine.slice(0, 40).map(r => a.get_recording(r.matchId).catch(() => null)));
    const items = []; full.forEach((rec, k) => (rec && rec.clips || []).forEach((c, i) => items.push({ r: mine[k], c, i })));
    const top = window.recPickChampionClips(items, name, 6);
    if (!top.length) return '';
    const total = items.length;
    return `<section class="lg-myclips" aria-label="Your top ${E(name)} clips"><header><h2>Your top ${E(name)} clips</h2><small>Your starred and saved clips first, then your best plays.</small><a href="#/studio/highlights" data-myclips-champ="${E(name)}">${total > top.length ? `All ${total} in Studio ↗` : 'Open Studio ↗'}</a></header>
      <ol class="sd-film">${top.map(({ r, c, i }) => `<li><a href="${gameHref(r.matchId, i)}" data-rec-hover><video muted preload="none" data-sd-src="${fileUrl(c.file)}#t=0.5"></video><span><b>${E(clipName(c))}</b><small>${E(when(r.startedAt))} · ${Math.round((c.end || 0) - (c.start || 0))} s${c.favorite ? ' · ★' : ''}</small></span></a></li>`).join('')}</ol></section>`;
  };
  window.recLazyVideos = root => lazyVideos(root);
  // "All N in Studio" opens Highlights filtered to that champion.
  document.addEventListener('click', e => { const a = e.target.closest && e.target.closest('[data-myclips-champ]'); if (a) { hf.champ = a.dataset.myclipsChamp; hf.type = 'all'; hf.star = false; } });
  // Previews load when they come into view (a Library of 30 games opens 30 files otherwise).
  function lazyVideos(root) {
    const vids = [...root.querySelectorAll('video[data-sd-src]')];
    const load = v => { v.preload = 'metadata'; v.src = v.dataset.sdSrc; }; // metadata: enough for the #t= frame to show
    if (!('IntersectionObserver' in window)) { vids.forEach(load); return; }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { load(e.target); io.unobserve(e.target); } }), { rootMargin: '300px' });
    vids.forEach(v => io.observe(v));
  }
  // --- Player: #/studio/game/<matchId>[/<clip>] — the game's video, its moments on the timeline (click to jump), clips to
  // play, star or delete, and your own clip cut from a start and an end mark. Keys: J/L ±5 s, I/O marks, C saves, F stars.
  const P = { rec: null, len: 0, off: 0, a: null, b: null, stopAt: null };
  async function renderPlayer(host, id, clipIdx) {
    let rec = null; try { rec = await api().get_recording(id); } catch {}
    if (!location.hash.startsWith('#/studio/game/')) return;
    if (!rec) { host.innerHTML = `<section class="rec-page"><a class="rec-back" href="#/studio">← Library</a><div class="rec-empty">This recording is gone.</div></section>`; return; }
    const counts = (rec.events || []).reduce((m, e) => ((m[e.type] = (m[e.type] || 0) + 1), m), {}), f = recFacts({ ...rec, counts });
    // Clips-only games (Studio > Capture > Keep: clips only) have no full video: the player plays one clip file at a time.
    const clipsOnly = !rec.video && (rec.clips || []).length > 0;
    Object.assign(P, { rec, clipsOnly, cur: clipIdx || 0, len: (rec.video && rec.video.length) || 0, off: (rec.video && rec.video.offset) || 0, a: null, b: null, stopAt: null });
    host.innerHTML = `<section class="rec-page rec-player"><a class="rec-back" href="#/studio">← Library</a>
      <header class="rp-head">${star(rec.favorite, `data-rec-fav="${E(rec.matchId)}"`, f.title)}<h1>${E(f.title)}</h1><small>${E(when(rec.startedAt))}${f.result ? ` · ${f.result}` : ''}${f.facts ? ` · ${E(f.facts)}` : ''}</small></header>
      ${rec.video ? `<div class="rp-stage"><video id="rp-v" src="${fileUrl(rec.video.file)}" controls preload="metadata"></video>
        <div class="rp-tl" id="rp-tl" title="Click to jump"></div>
        ${tools(true)}</div>`
        : clipsOnly ? `<div class="rp-stage"><video id="rp-v" src="${fileUrl(rec.clips[clipIdx || 0].file)}" controls preload="metadata"></video>${tools(false)}<p class="rp-note">Clips only: this game kept its clips, not the whole game.</p></div>`
        : `<div class="rec-empty">This game has no video (Record video was off), so here is its timeline.</div>${stripMarkers(rec).length ? window.recStrip(rec) : ''}`}
      <section class="rp-clips"><h2>Clips</h2><ol id="rp-clips"></ol></section></section>`;
    drawClips();
    const v = document.getElementById('rp-v'); if (!v) return;
    v.addEventListener('loadedmetadata', () => { if (!P.len || Math.abs(P.len - v.duration) > 2) P.len = v.duration; drawTimeline(); setupSound(v); v.playbackRate = P.rate || 1; if (clipIdx != null && !clipsOnly) playClip(clipIdx); });
    v.addEventListener('play', () => { const b = document.querySelector('[data-rp="toggle"]'); if (b) b.textContent = 'Pause'; });
    v.addEventListener('pause', () => { const b = document.querySelector('[data-rp="toggle"]'); if (b) b.textContent = 'Play'; });
    v.addEventListener('timeupdate', () => { if (P.stopAt != null && v.currentTime >= P.stopAt) { v.pause(); P.stopAt = null; } const h = document.getElementById('rp-ph'); if (h && P.len) h.style.left = pct(v.currentTime); });
    v.addEventListener('error', () => say('The video file is missing or can’t be played.'));
    if (clipsOnly) { if (clipIdx != null) v.play().catch(() => {}); return; }
    document.getElementById('rp-tl').addEventListener('click', e => { if (e.target.closest('[data-t]')) return; const r = e.currentTarget.getBoundingClientRect(); seek(((e.clientX - r.left) / r.width) * P.len); });
    drawTimeline();
  }
  // The player's tools (deck-out round 2): clips, seek and frame step, speed, which sound you hear, and the cut tools.
  const tools = full => `<div class="rp-bar">
      <div class="rp-grp"><button type="button" class="rp-ib" data-rp="prev" title="Previous clip  [">‹ Clip</button><button type="button" class="rp-ib" data-rp="next" title="Next clip  ]">Clip ›</button></div>
      <div class="rp-grp"><button type="button" class="rp-ib" data-rp="back" title="Back 5 s  J">−5 s</button><button type="button" class="rp-ib" data-rp="toggle" title="Play or pause  K">Play</button><button type="button" class="rp-ib" data-rp="fwd" title="Forward 5 s  L">+5 s</button>
        <button type="button" class="rp-ib" data-rp="fprev" title="Back one frame  ,">‹ Frame</button><button type="button" class="rp-ib" data-rp="fnext" title="Forward one frame  .">Frame ›</button></div>
      <label class="rp-pick">Speed <select data-rp-speed>${[0.25, 0.5, 1, 1.5, 2].map(x => `<option value="${x}"${x === 1 ? ' selected' : ''}>${x}×</option>`).join('')}</select></label>
      <label class="rp-pick" id="rp-sound" hidden>Sound <select data-rp-track></select></label>
      ${full ? `<div class="rp-grp rp-cut"><button type="button" class="rp-ib" data-rp="a" title="Mark the start  I">Start</button><button type="button" class="rp-ib" data-rp="b" title="Mark the end  O">End</button><button type="button" class="st-btn st-gold" data-rp="save" title="Save the clip  C">Save clip</button></div>` : ''}
      <span class="rp-msg" id="rp-msg" aria-live="polite"></span></div>
    <p class="rp-keys">J K L back, play, forward · , . one frame · [ ] previous and next clip${full ? ' · I O C cut a clip' : ''} · F star</p>`;
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
      <button type="button" class="rec-del rec-open" data-rp-cren="${i}">Rename</button><button type="button" class="rec-del rec-open" data-rp-cshow="${i}">Show file</button>${P.rec.game === 'tft' ? '' : c.published ? `<a class="rec-pub" href="#/league/champion/${champId(P.rec.champion) || ''}" title="${E(c.published.url)}">On the champion page</a><button type="button" class="rec-del" data-rp-cunpub="${i}">Unpublish</button>` : `<button type="button" class="rec-del rec-open" data-rp-cpub="${i}">Publish</button>`}<button type="button" class="rec-del" data-rp-cdel="${i}">Delete</button></li>`).join('')
      : `<li class="rec-nostrip">${P.rec.video ? 'No clips yet. Mark a start and an end, then save one.' : 'Clips need video.'}</li>`;
    ol.querySelectorAll('.rp-c').forEach((li, i) => li.classList.toggle('now', P.clipsOnly && P.cur === i));
  }
  const seek = t => { const v = document.getElementById('rp-v'); if (v && Number.isFinite(t)) { P.stopAt = null; v.currentTime = Math.max(0, Math.min(P.len || t, t)); } };
  function playClip(i) {
    const c = (P.rec.clips || [])[i], v = document.getElementById('rp-v'); if (!c || !v) return;
    if (P.clipsOnly) { P.cur = i; v.src = fileUrl(c.file); v.play().catch(() => {}); drawClips(); return; } // its own file
    v.currentTime = c.start; P.stopAt = c.end; v.play().catch(() => {});
  }
  const say = t => { const m = document.getElementById('rp-msg'); if (m) m.textContent = t; };
  // The League champion id for the name the recorder stored (Publish needs it); 0 before the names have loaded.
  const champId = name => { const n = String(name || '').toLowerCase(); if (typeof lg === 'undefined' || !n) return 0;
    const k = Object.keys(lg.names || {}).find(k => lg.names[k].name.toLowerCase() === n); return k ? Number(k) : 0; };
  async function rpAction(k) {
    const v = document.getElementById('rp-v'); if (!v) return;
    if (P.clipsOnly && ['a', 'b', 'save'].includes(k)) { say('Clips-only games have no full video to cut from.'); return; }
    const cs = P.rec.clips || [];
    if (k === 'toggle') { v.paused ? v.play().catch(() => {}) : v.pause(); return; }
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
    const k = { j: 'back', l: 'fwd', k: 'toggle', i: 'a', o: 'b', c: 'save', ',': 'fprev', '.': 'fnext', '[': 'prev', ']': 'next' }[e.key.toLowerCase()];
    if (k) { e.preventDefault(); rpAction(k); }
    else if (e.key.toLowerCase() === 'f') { e.preventDefault(); document.querySelector('.rp-head [data-rec-fav]')?.click(); }
  });
  document.addEventListener('click', async e => {
    const t = e.target.closest && e.target.closest('[data-rec-tab],[data-rec-fav],[data-rec-cfav],[data-rp],[data-rp-clip],[data-rp-cdel],[data-rp-cshow],[data-rp-cren],[data-rp-cpub],[data-rp-cunpub],.rp-tl [data-t]');
    if (!t) return;
    if (t.dataset.recTab) { tab = t.dataset.recTab; render(document.getElementById('main')); return; }
    if (t.dataset.recFav) {
      const id = t.dataset.recFav, on = t.getAttribute('aria-pressed') !== 'true';
      await api().set_recording_favorite(id, on).catch(() => null);
      if (P.rec && P.rec.matchId === id) P.rec.favorite = on;
      if (tab === 'favorites' && !location.hash.startsWith('#/studio/game/')) { render(document.getElementById('main')); return; }
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
    if (t.dataset.rpCren != null) { // the clip's name becomes a text box: Enter or leaving it saves, Esc keeps the old name
      const i = +t.dataset.rpCren, b = t.closest('.rp-c').querySelector('.rp-cplay b'), c = P.rec.clips[i];
      const inp = Object.assign(document.createElement('input'), { className: 'rp-cname', value: c.name || '', placeholder: clipName({ ...c, name: '' }), maxLength: 60 });
      b.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const finish = async keep => { if (done) return; done = true; if (keep) { const r = await api().rename_clip(P.rec.matchId, i, inp.value).catch(() => null); if (r && r.ok) { if (r.name) c.name = r.name; else delete c.name; } } drawClips(); };
      inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
      inp.addEventListener('click', ev => ev.stopPropagation());
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
  const reHL = () => { const m = document.getElementById('main'); if (m && location.hash.startsWith('#/studio/highlights')) render(m); };
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-hf]'); if (b) { hf[b.dataset.hf] = b.dataset.v; reHL(); } });
  document.addEventListener('change', e => {
    if (!e.target.matches) return;
    if (e.target.matches('[data-hf-sel]')) { hf[e.target.dataset.hfSel] = e.target.value; reHL(); }
    else if (e.target.matches('[data-hf-star]')) { hf.star = e.target.checked; reHL(); }
  });
  // Speed and which sound you hear apply at once and stay while you move between clips.
  document.addEventListener('change', e => {
    const v = document.getElementById('rp-v'); if (!v || !e.target.matches) return;
    if (e.target.matches('[data-rp-speed]')) { P.rate = Number(e.target.value) || 1; v.playbackRate = P.rate; }
    else if (e.target.matches('[data-rp-track]')) { const at = v.audioTracks, n = Number(e.target.value); P.track = n; if (at) for (let i = 0; i < at.length; i++) at[i].enabled = i === n; }
  });
  // Highlights: a card plays its clip while the pointer is on it.
  const atOf = v => Number(((v.dataset.sdSrc || v.src || '').match(/#t=([\d.]+)/) || [])[1] || 0.5);
  document.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('[data-rec-hover]'), v = a && a.querySelector('video'); if (v && !v.getAttribute('src') && v.dataset.sdSrc) v.src = v.dataset.sdSrc; if (v && v.paused) v.play().catch(() => {}); });
  document.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest('[data-rec-hover]'); if (a && !a.contains(e.relatedTarget)) { const v = a.querySelector('video'); if (v) { v.pause(); v.currentTime = atOf(v); } } });

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
  });

  // Studio in the sidebar (index.html) wears a small lime dot while the recorder is on.
  const mark = () => { const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record)), a = document.querySelector('#qp-sidebar [data-game="studio"] .sb-item');
    if (a) { a.classList.toggle('on', on); a.title = on ? 'Studio (recording your games)' : 'Studio'; } };
  if (window.QP && QP.bus) { QP.bus.on('config:loaded', mark); QP.bus.on('config:changed', ({ path }) => { if (String(path).startsWith('recorder')) mark(); }); }
  mark();
  window.recordingsView = { render };
})();

