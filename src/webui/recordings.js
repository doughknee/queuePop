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
  window.recStrip = rec => `<div class="rec-strip" role="img" aria-label="${E(stripMarkers(rec).length)} moments">${stripMarkers(rec).map(m =>
    `<i class="rec-m rec-${m.type}" style="left:${m.left}%" title="${E(m.label)}"></i>`).join('')}</div>`;
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return;

  const api = () => window.pywebview && window.pywebview.api;
  const when = ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  async function render(host) {
    const on = !!(QP.store.config && QP.store.config.recorder && QP.store.config.recorder.enabled);
    let list = [];
    try { list = (await api().list_recordings()) || []; } catch (err) { console.warn('recordings:', err && err.message || err); }
    const head = `<header class="rec-head"><p class="eyebrow">Recorder (beta)</p><h1>Recordings</h1>
      <p>${on ? 'Every League and TFT game is recorded while queuePop runs: your kills, deaths, assists, multikills, objectives and the result, with their game time.' : 'The recorder is off. Turn it on in Settings to keep a timeline of every game.'}
      <a href="#/settings#recorder" data-rec-settings>Recorder settings ↗</a></p></header>`;
    if (!list.length) { host.innerHTML = `<section class="rec-page">${head}<p class="rec-empty">${on ? 'No recordings yet. Play a game and it shows up here.' : 'Nothing recorded yet.'}</p></section>`; return; }
    const full = await Promise.all(list.slice(0, 30).map(r => api().get_recording(r.matchId).catch(() => null)));
    host.innerHTML = `<section class="rec-page">${head}<ol class="rec-list">${list.slice(0, 30).map((r, i) => {
      const rec = full[i] || r, c = r.counts || {};
      const title = r.game === 'tft' ? `TFT${r.placement ? ` · ${r.placement}${['th', 'st', 'nd', 'rd'][r.placement] || 'th'} place` : ''}` : r.champion || 'League';
      const facts = r.game === 'tft' ? '' : `${c.kill || 0} / ${c.death || 0} / ${c.assist || 0}${c.multikill ? ` · ${c.multikill} multikill${c.multikill > 1 ? 's' : ''}` : ''}${c.objective ? ` · ${c.objective} objectives` : ''}`;
      return `<li class="rec-row ${r.result || ''}"><div class="rec-meta"><b>${E(title)}</b><small>${E(when(r.startedAt))}${r.result ? ` · ${r.game === 'tft' ? (r.result === 'win' ? 'Top 4' : 'Bottom 4') : r.result === 'win' ? 'Win' : 'Loss'}` : ''}${facts ? ` · ${E(facts)}` : ''}${r.video ? ` · video${r.clips ? `, ${r.clips} clips` : ''}` : ''}</small></div>
        ${window.recStrip(rec)}<span class="rec-act"><button type="button" class="st-btn" data-rec-del="${E(r.matchId)}">Delete</button></span></li>`; }).join('')}</ol>
      <p class="rec-legend">${Object.entries(KIND).map(([k, l]) => `<span><i class="rec-m rec-${k}"></i>${l}</span>`).join('')}</p></section>`;
  }
  document.addEventListener('click', async e => {
    const del = e.target.closest && e.target.closest('[data-rec-del]');
    // Deleting is for good, so the first click asks (inline, no dialog) and the second deletes.
    if (del && !del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Delete for good?'; setTimeout(() => { if (del.isConnected) { delete del.dataset.sure; del.textContent = 'Delete'; } }, 4000); return; }
    if (del) { del.disabled = true; await api().delete_recording(del.dataset.recDel).catch(() => null); render(document.getElementById('main')); }
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
  window.recordingsView = { render };
})();
