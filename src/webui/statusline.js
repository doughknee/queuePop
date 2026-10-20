/* One status line for the whole app (DONI-541): the most important thing that is wrong right now, under the page row, with a
   retry and a link to the fix. Riot key rejected > stats crawler offline (both only where stats show: League, TFT, home) >
   League client closed (League and TFT) > a new version is out (home and Settings). ✕ hides that one problem until it changes.
   Loaded by shell.js. The old bottom-left update banner is retired in favour of this line (shell.css). */
(function () {
  // Facts → problems, most important first. Pure; app/test-status.js checks it.
  // f = { game, client: true|false|undefined, crawler: 'ok'|'down'|undefined, stale: a page is showing its last good copy, key: {valid, reason}|undefined, update: {available, latest}|undefined }
  function statusIssues(f) {
    const stats = ['league', 'tft', 'home'].includes(f.game), play = ['league', 'tft'].includes(f.game), out = [];
    if (f.away) out.push({ id: 'away', level: 'info', text: 'You’re stepping away: auto-accept and auto pick and ban are on, locking in with 3 s left.', fix: 'I’m back', act: 'back' }); // DONI-424
    if (stats && f.crawler === 'ok' && f.key && f.key.valid === false) out.push({ id: 'key', level: 'bad', text: `The stats crawler’s Riot key was rejected${f.key.reason ? ` (${f.key.reason})` : ''}, so stats stopped updating.`, fix: 'Replace the key', href: '#/settings#crawler', focus: 'st-cr-key' });
    // Down after a page had loaded: it keeps its numbers (stats-api serves the last good copy), so say so quietly.
    if (stats && f.stale && f.crawler !== 'ok') out.push({ id: 'crawler', level: 'warn', text: 'The stats crawler stopped answering. Showing what was already loaded; retrying.', fix: 'Check its address', href: '#/settings#crawler', focus: 'crawler_url', retry: true });
    else if (stats && f.crawler === 'down') out.push({ id: 'crawler', level: 'bad', text: 'The stats crawler isn’t answering, so League and TFT stats can’t load.', fix: 'Check its address', href: '#/settings#crawler', focus: 'crawler_url', retry: true });
    if (play && f.client === false) out.push({ id: 'client', level: 'warn', text: 'The League client isn’t running: no auto-accept, no live data.', fix: 'Open League', act: 'launch', retry: true });
    if ((f.game === 'home' || f.game === 'settings') && f.update && f.update.available && f.update.latest) out.push({ id: 'update:' + f.update.latest, level: 'info', text: `queuePop v${f.update.latest} is out.`, fix: 'Get it', act: 'update' });
    return out;
  }
  window.statusIssues = statusIssues;
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return; // app/test-status.js

  const E = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const api = () => window.pywebview && window.pywebview.api;
  const facts = { client: undefined, crawler: undefined, key: undefined, update: undefined, away: false };
  const hidden = new Set(); // ✕ for this session; an id that changes (a newer version) shows again
  let crawlerAt = 0, updateAt = 0, busy = false;

  const line = document.createElement('div');
  line.id = 'qp-status'; line.className = 'qp-status'; line.hidden = true;
  line.setAttribute('role', 'status'); line.setAttribute('aria-live', 'polite');
  document.getElementById('world-nav').after(line);

  const game = () => location.hash.replace(/^#\/?/, '').split(/[\/#]/)[0] || 'home';
  function draw() {
    const list = statusIssues({ game: game(), ...facts }).filter(i => !hidden.has(i.id)), top = list[0];
    line.hidden = !top;
    if (!top) { line.innerHTML = ''; return; }
    line.dataset.level = top.level;
    line.innerHTML = `<span class="sl-dot" aria-hidden="true"></span><span class="sl-text">${E(top.text)}</span>`
      + (top.href ? `<a class="sl-fix" href="${top.href}" data-focus="${E(top.focus || '')}">${E(top.fix)} ↗</a>` : `<button type="button" class="sl-fix" data-act="${top.act}">${E(top.fix)}</button>`)
      + (top.retry ? `<button type="button" class="sl-retry" data-act="retry"${busy ? ' disabled' : ''}>${busy ? 'Checking…' : 'Retry'}</button>` : '')
      + (list.length > 1 ? `<span class="sl-more">+${list.length - 1} more</span>` : '')
      + `<button type="button" class="sl-x" data-act="hide" data-id="${E(top.id)}" aria-label="Hide this message" title="Hide">✕</button>`;
  }
  // Liveness from the crawler's /health (~40 ms; track D, 2026-10-20). /status is its admin view and slow, so it's read
  // at most every 5 minutes, only for the Riot key. Offline only after two misses in a row (one on Retry).
  let misses = 0, keyAt = 0;
  async function checkCrawler(force) {
    if (!['league', 'tft', 'home'].includes(game()) || (!force && Date.now() - crawlerAt < 60000)) return;
    // Not before the config has loaded: it would probe the default address instead of yours (W, 2026-10-20).
    if (!(window.QP && QP.store && QP.store.config)) return;
    crawlerAt = Date.now();
    const c = QP.store.config;
    const base = String(c.crawler_url || 'http://10.205.0.81:47900').replace(/\/+$/, '');
    const get = (path, ms) => fetch(base + path, { signal: AbortSignal.timeout(ms), cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
    try {
      await get('/health', 6000).catch(() => get('/patches', 8000)); // an older crawler without /health
      facts.crawler = 'ok'; misses = 0;
    } catch (err) {
      misses++;
      console.warn('status line: crawler', base, misses, err && err.message || err);
      if (force || misses >= 2) { facts.crawler = 'down'; facts.key = undefined; }
      else setTimeout(() => refresh(true), 15000);
      return;
    }
    if (force || Date.now() - keyAt > 300000) {
      keyAt = Date.now();
      try { const d = await get('/status', 15000); facts.key = d && d.key; } catch { /* key unknown; liveness already known */ }
    }
  }
  async function checkUpdate() {
    if (Date.now() - updateAt < 600000 || !api()) return;
    updateAt = Date.now();
    try { facts.update = await api().get_update_status(); } catch (err) { console.warn('status line: update', err && err.message || err); }
  }
  async function refresh(force) { await Promise.all([checkCrawler(force), checkUpdate()]); draw(); }

  line.addEventListener('click', async e => {
    const b = e.target.closest('[data-act], a[data-focus]'); if (!b) return;
    if (b.tagName === 'A') { if (b.dataset.focus) setTimeout(() => window.qpSearch && qpSearch.focusSetting(b.dataset.focus), 120); return; }
    const act = b.dataset.act;
    if (act === 'hide') { hidden.add(b.dataset.id); draw(); }
    else if (act === 'retry') { busy = true; draw(); await refresh(true); busy = false; draw(); }
    else if (act === 'launch') {
      const r = await Promise.resolve(api() && api().launch_league()).catch(err => ({ ok: false, error: err.message }));
      if (r && r.ok === false) window.showToast ? showToast(r.error || 'Couldn’t open League', false) : console.warn(r);
      else window.showToast && showToast('Opening League…');
    }
    else if (act === 'back') { await Promise.resolve(api() && api().set_stepping_away(false)).catch(() => {}); facts.away = false; hidden.delete('away'); draw(); }
    else if (act === 'update') { const u = facts.update || {}; api() && api().open_external(u.url || 'https://github.com/doughknee/queuePop/releases/latest'); }
  });
  if (window.QP && QP.bus) {
    QP.bus.on('status', st => {
      const up = !!(st && st.connected), away = !!(st && st.stepping_away && st.stepping_away.on);
      if (up !== facts.client || away !== facts.away) { facts.client = up; facts.away = away; if (away) hidden.delete('away'); draw(); }
    });
    QP.bus.on('config:changed', ({ path }) => { if (path === 'crawler_url') { misses = 0; keyAt = 0; refresh(true); } });
    QP.bus.on('config:loaded', () => { crawlerAt = 0; refresh(false); });
  }
  addEventListener('qp:crawler-stale', e => { facts.stale = !!e.detail; if (facts.stale) refresh(true); else draw(); });
  addEventListener('hashchange', () => refresh(false));
  addEventListener('popstate', () => draw());
  setInterval(() => refresh(false), 60000);
  refresh(false);
  window.qpStatus = { refresh, facts };
})();
