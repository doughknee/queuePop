/* The sidebar (index.html #qp-sidebar) is the host's only navigation. This
   highlights the current game and page, collapses it to an icon rail and
   resizes it by its right edge; width and collapse persist in localStorage. */
(function () {
  const root = document.documentElement, bar = document.querySelector('#qp-sidebar'), nav = document.querySelector('#world-nav');
  if (!bar) return; // app/test-home.js loads this file for homePages without a DOM
  const toggle = bar.querySelector('.sb-toggle'), grip = bar.querySelector('.sb-resize');
  bar.querySelector('.sb-brand span').innerHTML = 'Queue<b>Pop</b>'; // DONI-527: QUEUE white, POP lime
  // DONI-527: the current game's pages render in one block below the games list, so switching games moves nothing above it.
  const block = document.createElement('div'); block.className = 'sb-block';
  bar.querySelector('.sb-scroll').append(block);
  const KEY = 'queuepop-sidebar-v1';
  const s = { w: 248, collapsed: false };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  function apply() {
    s.w = Math.min(400, Math.max(200, Number(s.w) || 248));
    root.style.setProperty('--sb-open-w', s.w + 'px');
    root.classList.toggle('sb-collapsed', !!s.collapsed);
    toggle.setAttribute('aria-expanded', String(!s.collapsed));
    toggle.setAttribute('aria-label', s.collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.title = toggle.getAttribute('aria-label');
  }
  apply();
  toggle.addEventListener('click', () => { s.collapsed = !s.collapsed; apply(); save(); });
  window.qpSidebarWidth = w => { s.w = w; apply(); save(); }; // keys.js: the grip by keyboard
  grip.addEventListener('pointerdown', e => { grip.setPointerCapture(e.pointerId); root.classList.add('sb-dragging'); });
  grip.addEventListener('pointermove', e => { if (grip.hasPointerCapture(e.pointerId)) { s.w = e.clientX; apply(); } });
  grip.addEventListener('lostpointercapture', () => { root.classList.remove('sb-dragging'); save(); });

  // DONI-539: the app reopens where you left it. Every route you land on is remembered (and per world, plus the last League
  // champion, for home's "pick up where you left off"); a launch with no address restores the last one before worlds.js renders.
  const LAST = 'queuepop-last-v1';
  let last = {}; try { last = JSON.parse(localStorage.getItem(LAST) || '{}') || {}; } catch {}
  if (!location.hash && typeof last.route === 'string' && /^#\/[\w\/#%,.+-]*$/.test(last.route)) history.replaceState(null, '', last.route);
  window.qpLast = () => last;
  const remember = () => { const next = qpLastNext(last, location.hash); if (next !== last) { last = next; try { localStorage.setItem(LAST, JSON.stringify(last)); } catch {} } };

  // '#/', '#/deadlock/' and '' all normalise to their unslashed form; the longest matching link is the page.
  const norm = h => h.replace(/\/+$/, '') || '#';
  let synced = null;
  window.syncSidebar = function () {
    synced = location.hash;
    const hash = norm(location.hash), game = hash.replace(/^#\/?/, '').split(/[\/#]/)[0] || 'home';
    let best = null;
    for (const a of bar.querySelectorAll('.sb-pages a')) {
      const href = norm(a.getAttribute('href'));
      a.removeAttribute('aria-current');
      // A world's root link (#/league = Tier list) marks only its own page, not every page under it (#/league/play).
      const root = /^#\/[^\/#]+$/.test(href);
      if ((hash === href || (href !== '#' && !root && hash.startsWith(href + '/'))) && (!best || href.length > norm(best.getAttribute('href')).length)) best = a;
    }
    best?.setAttribute('aria-current', 'page');
    bar.querySelector('.sb-gear').toggleAttribute('aria-current', game === 'settings');
    for (const g of bar.querySelectorAll('[data-game]')) g.classList.toggle('open', g.dataset.game === game);
    const src = bar.querySelector(`[data-game="${game}"] .sb-pages`), html = src ? src.innerHTML : '';
    if (block.dataset.html !== html) { block.dataset.html = html; block.innerHTML = html; block.dataset.label = src ? src.previousElementSibling.title : ''; }
    // The world's page row repeats its sidebar pages, so a collapsed rail still reaches every page.
    // Deadlock draws its own row; home and companion leave it empty (just the drag strip).
    const pages = game !== 'deadlock' && bar.querySelector(`[data-game="${game}"] .sb-pages`);
    const row = game === 'settings' ? settingsView.row() : pages ? pages.innerHTML : '';
    // The Play control ([data-keep]: League's dock, TFT's button) stays first; only the page links are replaced.
    if (nav.dataset.row !== row) { nav.dataset.row = row; nav.querySelectorAll(':scope > :not([data-keep])').forEach(e => e.remove()); nav.insertAdjacentHTML('beforeend', row); }
    const tp = document.getElementById('tft-play'); if (tp) tp.hidden = game !== 'tft';
    remember();
    setTimeout(rowEdges);
  };
  // Page rows scroll sideways at big Text sizes (DONI-516); a fade at the right edge says there's more, and the wheel
  // scrolls them while the pointer is on the row (W's report, 2026-10-20).
  const wired = new WeakSet();
  function rowEdges() {
    const city = document.querySelector('#deadlock-view')?.shadowRoot?.querySelector('.city-nav');
    for (const r of [nav, city]) {
      if (!r) continue;
      if (!wired.has(r)) {
        wired.add(r);
        r.addEventListener('scroll', () => rowEdge(r), { passive: true });
        r.addEventListener('wheel', e => { if (r.scrollWidth > r.clientWidth + 2 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { r.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
      }
      rowEdge(r);
    }
  }
  const rowEdge = r => r.classList.toggle('more-right', r.scrollLeft + r.clientWidth < r.scrollWidth - 2);
  addEventListener('resize', rowEdges);
  // Deadlock and the TFT frame move the address with pushState/replaceState, which fires no hashchange.
  addEventListener('popstate', window.syncSidebar);
  // Clicks only matter when they moved the address (Deadlock/TFT pushState); everything else would redo the same work (DONI-535).
  addEventListener('click', () => setTimeout(() => { if (location.hash !== synced) window.syncSidebar(); }));
  // Shell add-ons that index.html doesn't list (DONI-537): the global search sheet.
  for (const src of ['palette.js', 'keys.js', 'statusline.js']) document.body.append(Object.assign(document.createElement('script'), { src })); // DONI-538: keys.js
  // The skip link lands on Settings too (worlds.js focuses it), so it must take focus.
  document.getElementById('settings-view')?.setAttribute('tabindex', '-1');
})();

// Where you are → the remembered state: {route, worlds: {league: '#/league/…', …}, champion: '103'}. Same object back when
// nothing changed. Pure; app/test-home.js checks it.
window.qpLastNext = function (last, hash) {
  const m = /^#\/(league|tft|deadlock|settings)(?=[\/#]|$)/.exec(hash || '');
  if (!/^#\/./.test(hash || '') && hash !== '#/') return last;
  const champ = /^#\/league\/champion\/(\d+)/.exec(hash);
  const next = { ...last, route: hash };
  if (m && m[1] !== 'settings') { next.worlds = { ...(last.worlds || {}), [m[1]]: hash }; next.recent = [m[1], ...(last.recent || []).filter(g => g !== m[1])]; }
  if (champ) next.champion = champ[1];
  return JSON.stringify(next) === JSON.stringify(last) ? last : next;
};

// DONI-522: the worlds you play (config games_enabled; all three until config loads). The rest leave the sidebar, home and
// search, and their routes go home (worlds.js render).
const QP_GAMES = ['league', 'tft', 'deadlock'];
window.qpGames = () => { const g = window.QP && QP.store && QP.store.config && QP.store.config.games_enabled; const on = Array.isArray(g) ? QP_GAMES.filter(x => g.includes(x)) : []; return on.length ? on : QP_GAMES; };
function applyGames() {
  const on = qpGames();
  document.documentElement.dataset.games = on.join(' ');
  for (const g of QP_GAMES) document.querySelectorAll(`#qp-sidebar .sb-group[data-game="${g}"]`).forEach(el => { el.hidden = !on.includes(g); });
  const game = location.hash.replace(/^#\/?/, '').split(/[\/#]/)[0];
  if (QP_GAMES.includes(game) && !on.includes(game)) location.replace('#/');
  else if (window.homeSetup) { homeSetup.refresh(); window.homeTicker && homeTicker.rerender(); }
}
if (window.QP && QP.bus) { QP.bus.on('config:loaded', applyGames); QP.bus.on('config:changed', ({ path }) => { if (path === 'games_enabled' || path === 'deadlock_account_id' || path === 'crawler_url') applyGames(); if (path === 'deadlock_account_id' && window.homeTicker) homeTicker.reload(); }); }

// First-run "set up" strip on home (Q5; an offline crawler is the status line's, statusline.js). Each item links to the Settings field that fixes it and goes away once done or
// dismissed (per item, or the whole strip). Pure; app/test-home.js checks it.
window.homeSetupItems = function ({ games, dlId, crawler, dismissed = [] }) {
  const items = [];
  if (games.includes('deadlock') && dlId === '') items.push({ id: 'deadlock', text: 'Add your Deadlock account to see your own matches.', action: 'Add it', href: '#/settings#account', focus: 'deadlock_account_id' });
  if (games.length === QP_GAMES.length) items.push({ id: 'games', text: 'Only play some of these? Hide the others.', action: 'Choose games', href: '#/settings#games', focus: 'games_enabled.league' });
  return items.filter(i => !dismissed.includes(i.id));
};
window.homeSetup = (() => {
  const KEY = 'queuepop-setup-dismissed-v1';
  let dismissed = []; try { dismissed = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}
  const E = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const facts = () => { const c = (window.QP && QP.store && QP.store.config) || null; return { games: qpGames(), dlId: c ? String(c.deadlock_account_id || '') : undefined, dismissed }; };
  function html() {
    const items = dismissed.includes('all') ? [] : homeSetupItems(facts());
    if (!items.length) return '<div id="home-setup" hidden></div>';
    return `<div id="home-setup" class="qp-setup" role="region" aria-label="Set up"><b class="su-kicker">Set up · ${items.length} left</b>
      <div class="su-items">${items.map(i => `<span class="su-item"><span>${E(i.text)}</span><a href="${i.href}" data-setup-focus="${E(i.focus)}">${E(i.action)} ↗</a><button type="button" class="su-x" data-setup-dismiss="${i.id}" aria-label="Dismiss: ${E(i.text)}" title="Dismiss">✕</button></span>`).join('')}</div>
      <button type="button" class="su-hide" data-setup-dismiss="all">Hide set-up</button></div>`;
  }
  function refresh() { const el = document.getElementById('home-setup'); if (el) el.outerHTML = html(); }
  document.addEventListener('click', e => {
    const d = e.target.closest && e.target.closest('[data-setup-dismiss]');
    if (d) { dismissed = [...new Set([...dismissed, d.dataset.setupDismiss])]; try { localStorage.setItem(KEY, JSON.stringify(dismissed)); } catch {} refresh(); return; }
    const a = e.target.closest && e.target.closest('[data-setup-focus]');
    if (a && a.dataset.setupFocus) setTimeout(() => window.qpSearch && qpSearch.focusSetting(a.dataset.setupFocus), 120);
  });
  return { html, refresh, reset: () => { dismissed = []; try { localStorage.removeItem(KEY); } catch {} refresh(); } };
})();

// Home's "Pick up where you left off" (Q7): one tile per world you've been in, most recent first, opening the exact page you
// left (champion, comp, hero), plus your last League champion when the League tile is elsewhere. pages = the sidebar links
// [{href, label, game}]. Pure; app/test-home.js checks it.
window.resumeTiles = function (last, games, pages) {
  last = last || {};
  const worlds = last.worlds || {}, order = [...(last.recent || []), ...Object.keys(worlds)].filter((g, i, a) => a.indexOf(g) === i && games.includes(g) && worlds[g]);
  const norm = h => h.replace(/\/+$/, '');
  const tiles = order.map(g => {
    const href = worlds[g], page = pages.filter(p => p.game === g && (norm(href) === norm(p.href) || norm(href).startsWith(norm(p.href) + '/')))
      .sort((a, b) => b.href.length - a.href.length)[0];
    const t = { game: g, href, page: page ? page.label : 'Overview' };
    let m;
    if ((m = /^#\/league\/champion\/(\d+)/.exec(href))) { t.page = 'Champion'; t.champion = m[1]; }
    else if ((m = /^#\/deadlock\/heroes\/([\w-]+)/.exec(href))) t.detail = m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    else if ((m = /^#\/tft\/comp\/(.+)$/.exec(href))) { t.page = 'Comp'; t.comp = decodeURIComponent(m[1]); }
    return t;
  });
  const lol = tiles.find(t => t.game === 'league');
  if (last.champion && games.includes('league') && !(lol && lol.champion === last.champion)) tiles.push({ game: 'league', href: '#/league/champion/' + last.champion, page: 'Last champion', champion: last.champion });
  return tiles;
};
window.homeContinue = (() => {
  const E = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const NAME = { league: 'League', tft: 'TFT', deadlock: 'Deadlock' };
  const LOGO = { league: 'assets/logos/league.svg', tft: 'assets/logos/tft.png', deadlock: 'assets/logos/deadlock.png' };
  const pages = () => [...document.querySelectorAll('#qp-sidebar .sb-group[data-game] .sb-pages a')].map(a => ({ href: a.getAttribute('href'), label: a.textContent.trim(), game: a.closest('[data-game]').dataset.game }));
  // Names the address can't carry: champion name + icon from Data Dragon, comp from the TFT names. Filled in after render.
  async function fill() {
    const box = document.getElementById('home-continue'); if (!box) return;
    const champs = box.querySelectorAll('[data-champ]');
    if (champs.length && window.statsApi) try {
      const { v, d } = await statsApi.ddChampions(), byKey = Object.fromEntries(Object.values(d.data || {}).map(c => [c.key, c]));
      champs.forEach(el => { const c = byKey[el.dataset.champ]; if (!c) return; el.querySelector('b').textContent = c.name; const img = el.querySelector('img'); img.src = `${statsApi.DD}/cdn/${v}/img/champion/${c.id}.png`; img.classList.add('hc-champ'); });
    } catch (err) { console.warn('home: champion names', err && err.message || err); }
    box.querySelectorAll('[data-comp]').forEach(el => { if (window.tftStats) el.querySelector('b').textContent = el.dataset.comp.split(',').map(k => tftStats.info(k).name).join(' · '); });
  }
  function html() {
    const tiles = resumeTiles(window.qpLast ? qpLast() : {}, window.qpGames ? qpGames() : [], pages()).slice(0, 4);
    setTimeout(fill);
    if (!tiles.length) return '<p class="eyebrow hc-first">Pick a game to start</p>';
    return `<section class="hc" id="home-continue" aria-label="Pick up where you left off"><p class="eyebrow">Pick up where you left off</p><div class="hc-row">${tiles.map(t =>
      `<a class="hc-tile" href="${E(t.href)}" data-game="${t.game}"${t.champion ? ` data-champ="${E(t.champion)}"` : ''}${t.comp ? ` data-comp="${E(t.comp)}"` : ''}><img src="${LOGO[t.game]}" alt=""><span><small>${E(NAME[t.game])}${t.detail || t.champion || t.comp ? ' · ' + E(t.page) : ''}</small><b>${E(t.detail || (t.champion ? 'Champion ' + t.champion : t.comp ? 'Comp' : t.page))}</b></span><i aria-hidden="true">↗</i></a>`).join('')}</div></section>`;
  }
  return { html };
})();

/* Home's paged bar (DONI-527) on scrollr's Pages model (myscrollr docs/CHIP_SPEC.md §P): a 192 px band with the game's
   logo, name and one pill per game, then that game's facts across the rest of the bar in equal columns, shown whole.
   One page per game, in order. The lit pill's 6 s fill is the clock (its animationend turns the page), so hover and
   focus freeze it in CSS; reduced motion cuts instead of swiping. */
const DASH = '—';
// Facts → pages. A column is {label, value, sub} or {label, strip: ['W', 'L'] | ['1', '5']} or {note}.
// undefined data has not loaded yet and reads as a dash; loaded but empty says so.
window.homePages = function (d) {
  const rk = d.info ? d.info.ranked || {} : undefined;
  const rank = r => d.offline ? { value: DASH, sub: 'client closed' } : rk === undefined ? {} : r && r.tier ? { value: rankLabel(r, false), sub: r.lp + ' LP' } : { value: 'Unranked' };
  // Client closed and nothing remembered: say how to fill the page instead of a row of dashes.
  const closed = list => d.offline && !(list && list.length) ? [{ note: 'Open the League client to see your ranks and games' }] : null;
  const last10 = (list, f) => list && list.slice(0, 10).map(f);
  const rate = (list, won) => { if (!list || !list.length) return {}; const w = list.filter(won).length; return { value: Math.round(100 * w / list.length) + '%', sub: `${w}W ${list.length - w}L` }; };
  const lol = d.lol && d.lol.slice(0, 10), tft = d.tft && d.tft.slice(0, 10), dlWon = m => m.match_result === m.player_team;
  return [
    { game: 'league', name: 'League', logo: 'assets/logos/league.svg', href: '#/league', cols: closed(lol) || [
      { label: 'Solo', ...rank(rk && rk.solo) }, { label: 'Flex', ...rank(rk && rk.flex) },
      { label: 'Last 10', strip: last10(lol, g => g.win ? 'W' : 'L') }, { label: 'Win rate', ...rate(lol, g => g.win) }] },
    { game: 'tft', name: 'TFT', logo: 'assets/logos/tft.png', href: '#/tft', cols: closed(tft) || [
      { label: 'Rank', ...rank(rk && rk.tft) }, { label: 'Last 10', strip: last10(tft, g => String(g.placement)) },
      { label: 'Avg place', value: tft && tft.length ? (tft.reduce((n, g) => n + g.placement, 0) / tft.length).toFixed(1) : undefined }] },
    d.dlId === '' ? { game: 'deadlock', name: 'Deadlock', logo: 'assets/logos/deadlock.png', href: '#/settings#account', cols: [{ note: 'Set your Deadlock account in Settings' }] }
      : { game: 'deadlock', name: 'Deadlock', logo: 'assets/logos/deadlock.png', href: '#/deadlock', cols: [
        { label: 'Matches', value: d.dl && d.dl.length.toLocaleString('en-US') }, { label: 'Win rate', ...rate(d.dl, dlWon) },
        { label: 'Last 10', strip: last10(d.dl, m => dlWon(m) ? 'W' : 'L') }] },
  ];
};

window.homeTicker = (() => {
  let data = {}, cur = 0, at = 0;
  const shownPages = () => { const on = qpGames(), p = homePages(data).filter(x => on.includes(x.game)); cur = Math.min(cur, p.length - 1); return p; };
  const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const cell = c => c.note ? `<span class="hp-note">${esc(c.note)}</span>`
    : `<span class="hp-label">${esc(c.label)}</span><span class="hp-value">${c.strip ? (c.strip.length ? `<span class="hp-strip">${c.strip.map(x => `<i${x === 'W' || +x <= 4 ? ' class="up"' : ''}>${esc(x)}</i>`).join('')}</span>` : 'No games') : esc(c.value ?? DASH)}${c.sub ? ` <small>${esc(c.sub)}</small>` : ''}</span>`;
  const cols = p => p.cols.map(c => `<span class="hp-col">${cell(c)}</span>`).join('');
  const page = (p, cls = '') => `<a class="hp-page ${cls}" href="${p.href}" style="--n:${p.cols.length}" data-game="${p.game}">${cols(p)}</a>`;
  const band = (pages) => `<div class="hp-id" data-game="${pages[cur].game}"><span class="hp-logo" style="--logo:url(${pages[cur].logo})"></span><b>${pages[cur].name}</b></div>
    <div class="hp-pills">${pages.map((p, k) => `<button type="button" class="hp-pill${k < cur ? ' seen' : ''}" data-i="${k}" aria-label="${p.name}"${k === cur ? ' aria-current="true"><span></span>' : '>'}</button>`).join('')}</div>`;
  const el = () => document.getElementById('home-pages');
  function turn(to) {
    const bar = el(); if (!bar || to === cur) return;
    const pages = shownPages(), n = pages.length, block = bar.querySelector('.hp-block'), old = block.lastElementChild;
    bar.toggleAttribute('data-back', to < cur && !(cur === n - 1 && to === 0)); // a pill behind the current one swipes the other way
    cur = to;
    bar.querySelector('.hp-band').innerHTML = band(pages);
    old.classList.add('leave'); setTimeout(() => old.remove(), 700);
    block.insertAdjacentHTML('beforeend', page(pages[cur], 'enter'));
  }
  // Data landing while a page is up changes its values only, never which page is up.
  function refresh() { const p = el() && el().querySelector('.hp-page:last-child'); if (!p) return; const q = shownPages()[cur]; p.href = q.href; p.style.setProperty('--n', q.cols.length); p.innerHTML = cols(q); }
  document.addEventListener('animationend', e => { if (e.target.matches('#home-pages .hp-pill span')) turn((cur + 1) % shownPages().length); });
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('#home-pages .hp-pill'); if (b) turn(+b.dataset.i); });
  return {
    rerender: () => { const b = el(); if (b) { cur = 0; b.outerHTML = window.homeTicker.html(); } },
    reload: () => { at = 0; data.dl = undefined; window.homeTicker.load(); },
    html: () => { const pages = shownPages(); return `<div class="qp-pages" id="home-pages" role="region" aria-label="Your games"><div class="hp-band">${band(pages)}</div><div class="hp-block">${page(pages[cur])}</div></div>`; },
    async load() {
      const a = window.pywebview && window.pywebview.api; if (!a || Date.now() - at < 60000) return; at = Date.now();
      const [info, lol, tft, id] = await Promise.all([a.get_summoner().catch(() => null), a.get_match_history(10).catch(() => null), a.get_tft_match_history(10).catch(() => null), Promise.resolve(a.get_deadlock_account && a.get_deadlock_account()).catch(() => '')]);
      let dlId = id || ''; if (!dlId) try { dlId = localStorage.getItem('queuepop-deadlock-acct') || ''; } catch {}
      // Offline (DONI-548): ranks need the client, but games the host remembers still show; retry next visit.
      data.offline = !(info && info.connected);
      if (!data.offline) Object.assign(data, { info, lol: lol || undefined, tft: tft || undefined });
      else { at = 0; if (Array.isArray(lol) && lol.length) data.lol = lol; if (Array.isArray(tft) && tft.length) data.tft = tft; }
      data.dlId = dlId; refresh();
      if (dlId) { data.dl = await fetch(`https://api.deadlock-api.com/v1/players/${dlId}/match-history`, { signal: AbortSignal.timeout(10000) }).then(r => r.ok ? r.json() : undefined).then(j => Array.isArray(j) ? j : undefined).catch(() => undefined); refresh(); }
    },
  };
})();
