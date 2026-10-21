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
  async function render(host) {
    if (!QP.store.config) { try { await QP.store.load(); } catch {} } // opened straight onto Recordings: settings first, or "off" is a lie
    const on = !!(QP.store.config && ((QP.store.config.recorder || {}).enabled || (QP.store.config.tft || {}).record));
    let list = [];
    const here = () => location.hash.startsWith('#/recordings'); // you may have moved on while these load (review)
    try { list = (await api().list_recordings()) || []; } catch (err) { console.warn('recordings:', err && err.message || err); }
    if (!here()) return;
    const head = `<header class="rec-head"><p class="eyebrow">Recorder (beta)</p><h1>Recordings</h1>
      <p>${on ? 'Every League and TFT game is recorded while queuePop runs: your kills, deaths, assists, multikills, objectives and the result, with their game time.' : 'The recorder is off. Turn it on in Settings to keep a timeline of every game.'}
      <a href="#/settings#recorder" data-rec-settings>Recorder settings ↗</a></p></header>`;
    // Off: the fix is one click away, right here (it applies at once, like every Settings control).
    if (!list.length) { host.innerHTML = `<section class="rec-page">${head}<div class="rec-empty">${on ? 'No recordings yet. Play a League or TFT game and it shows up here.' : 'Nothing recorded yet.'}${on ? '' : ' <button type="button" class="st-btn st-gold" data-rec-on>Turn the recorder on</button>'}</div></section>`; return; }
    const full = await Promise.all(list.slice(0, 30).map(r => api().get_recording(r.matchId).catch(() => null)));
    if (list.some(r => r.game === 'tft') && window.tftStats) await tftStats.loadDragon().catch(() => {}); // unit names and icons for the boards
    if (!here()) return;
    host.innerHTML = `<section class="rec-page">${head}<ol class="rec-list">${list.slice(0, 30).map((r, i) => {
      const rec = full[i] || r, f = recFacts(r), title = f.title, facts = f.facts;
      // TFT: the final board (from match history), units with their stars, instead of a timeline.
      const unit = u => { const i = (window.tftStats && tftStats.info(u.key)) || {}; return `<span class="rec-unit s${u.stars}" title="${E(i.name || u.key)} ${'★'.repeat(u.stars || 1)}">${i.icon ? `<img src="${E(i.icon)}" alt="">` : E(String(i.name || u.key).slice(0, 3))}</span>`; };
      const board = r.game === 'tft' && rec.board && (rec.board.units || []).length ? `<span class="rec-board">${rec.board.units.map(unit).join('')}<small>Level ${E(rec.board.level)}</small></span>` : '';
      const strip = stripMarkers(rec).length ? window.recStrip(rec) : board || `<span class="rec-nostrip">${r.game === 'tft' ? 'Board arrives a minute after the game' : 'No moments recorded'}</span>`;
      return `<li class="rec-row ${r.result || ''}"><div class="rec-meta"><b>${E(title)}</b><small>${E(when(r.startedAt))}${f.result ? ` · ${f.result}` : ''}${facts ? ` · ${E(facts)}` : ''}${r.video ? ` · video${r.clips ? `, ${r.clips} clips` : ''}` : ''}</small></div>
        ${strip}<span class="rec-act"><button type="button" class="rec-del" data-rec-del="${E(r.matchId)}" aria-label="Delete the ${E(title)} recording from ${E(when(r.startedAt))}">Delete</button></span></li>`; }).join('')}</ol>
      <p class="rec-legend">${Object.entries(KIND).map(([k, l]) => `<span><i class="rec-m rec-${k}"></i>${l}</span>`).join('')}</p></section>`;
  }
  document.addEventListener('click', async e => {
    const del = e.target.closest && e.target.closest('[data-rec-del]');
    // Deleting is for good, so the first click asks (inline, no dialog) and the second deletes.
    if (del && !del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete for good?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Delete'; } }, 4000); return; }
    if (del) { del.disabled = true; await api().delete_recording(del.dataset.recDel).catch(() => null); render(document.getElementById('main')); }
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
