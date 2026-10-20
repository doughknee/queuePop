/* Global search (DONI-537): Ctrl+K or / opens one sheet anchored under the page row (not a modal; the page stays live
   behind it). It finds every page, every Settings control, League champions, TFT comps/traits/units and Deadlock heroes,
   fuzzy and keyboard-first, with your recent picks when the box is empty. Loaded by shell.js. */
(function () {
  // Higher is better, -1 is no match. Prefix > word start > substring > in-order letters (fewer gaps first).
  function qpFuzzy(q, text) {
    q = String(q).toLowerCase().trim(); text = String(text).toLowerCase();
    if (!q) return 0;
    if (text.startsWith(q)) return 1000 - text.length;
    const at = text.indexOf(q);
    if (at > 0 && /[^a-z0-9]/.test(text[at - 1])) return 800 - at;
    if (at > 0) return 600 - at;
    let i = 0, gaps = 0, last = -1;
    for (let k = 0; k < text.length && i < q.length; k++) {
      if (text[k] === q[i]) { if (last >= 0 && k > last + 1) gaps++; last = k; i++; }
    }
    return i === q.length ? 300 - gaps * 20 - text.length : -1;
  }
  // Best items for a query: score on label; the sub line counts at half and only at a word start (scattered letters
  // across a long title are noise). Ties keep the source order. Empty query = [].
  const subScore = (q, sub) => { const s = sub ? qpFuzzy(q, sub) : -1; return s >= 600 ? s / 2 : -1; };
  function qpRank(items, q, n = 40) {
    if (!String(q).trim()) return [];
    return items.map((it, i) => ({ it, i, s: Math.max(qpFuzzy(q, it.label), subScore(q, it.sub)) }))
      .filter(x => x.s >= 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map(x => x.it);
  }
  window.qpFuzzy = qpFuzzy; window.qpRank = qpRank;
  // Q queue 5: TFT units from the crawler's /tft/meta (any set's key: TFT16_…, DA_18_…), each opening its unit page; the
  // board-only ones (no traits: golems, dummies, minions) are left out. Recordings: one row each, by recFacts' title.
  window.qpUnitItems = m => { const seen = new Set(), out = [];
    for (const [key, u] of Object.entries((m && m.units) || {})) if (u.cost >= 1 && u.cost <= 5 && (u.traits || []).length && !seen.has(u.name)) { seen.add(u.name); out.push({ kind: 'unit', label: u.name, sub: `${u.cost} cost · ${u.traits.map(t => (m.traits && m.traits[t] && m.traits[t].name) || t).join(', ')}`, href: '#/tft/unit/' + encodeURIComponent(key), icon: u.icon }); }
    return out.sort((a, b) => a.label.localeCompare(b.label)); };
  window.qpRecordingItems = (list, facts, when) => (list || []).map(r => { const f = facts(r);
    return { kind: 'recording', label: f.title, sub: [when(r.startedAt), f.result, f.facts].filter(Boolean).join(' · '), href: '#/recordings' }; });
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return; // app/test-palette.js

  const KEY = 'queuepop-palette-recent-v1';
  const E = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const KIND = { page: 'Page', setting: 'Setting', action: 'Command', champion: 'League champion', comp: 'TFT comp', trait: 'TFT trait', unit: 'TFT unit', hero: 'Deadlock hero', recording: 'Recording' };
  let recent = []; try { recent = JSON.parse(localStorage.getItem(KEY) || '[]').filter(r => r && r.label && (r.href || r.act)); } catch {}
  const live = { champion: [], comp: [], trait: [], carry: [], unit: [], hero: [], recording: [] }, loading = new Set();

  const sheet = document.createElement('div');
  sheet.id = 'qp-search'; sheet.className = 'qp-search'; sheet.hidden = true;
  sheet.innerHTML = `<div class="qs-box" role="search"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/></svg>
    <input type="text" role="combobox" aria-expanded="true" aria-controls="qs-list" aria-autocomplete="list" aria-label="Search queuePop" placeholder="Search champions, comps, heroes, pages, settings" autocomplete="off" spellcheck="false">
    <kbd>Esc</kbd></div><div class="qs-list" id="qs-list" role="listbox" aria-label="Results"></div><p class="qs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Ctrl</kbd><kbd>K</kbd> or <kbd>/</kbd> search from anywhere</span><span class="qs-state" role="status"></span></p>`;
  document.body.append(sheet);
  const input = sheet.querySelector('input'), list = sheet.querySelector('.qs-list'), state = sheet.querySelector('.qs-state');
  let shown = [], cur = 0, back = null;

  // --- what can be found -----------------------------------------------------
  function statics() {
    const out = [{ kind: 'page', label: 'Home', sub: 'Your games', href: '#/' }];
    for (const g of document.querySelectorAll('#qp-sidebar .sb-group[data-game]:not([hidden])')) {
      const game = g.querySelector('.sb-item')?.title || '';
      for (const a of g.querySelectorAll('.sb-pages a')) out.push({ kind: 'page', label: a.textContent.trim(), sub: game, href: a.getAttribute('href') });
    }
    for (const [id, l] of (window.settingsView?.sections || [])) out.push({ kind: 'page', label: l, sub: 'Settings', href: '#/settings#' + id });
    for (const s of (window.settingsView?.index?.() || [])) out.push({ kind: 'setting', label: s.label, sub: s.section + (s.hint ? ' · ' + s.hint : ''), href: '#/settings#' + s.id, focus: s.key });
    out.push({ kind: 'page', label: 'Recordings', sub: 'Recorder (beta)', href: '#/recordings' });
    out.push({ kind: 'action', label: 'Collapse or expand the sidebar', sub: 'Ctrl+B', act: 'sidebar' },
      { kind: 'action', label: 'Bigger text', sub: 'Ctrl +', act: 'bigger' }, { kind: 'action', label: 'Smaller text', sub: 'Ctrl −', act: 'smaller' },
      { kind: 'action', label: 'Reset text size', sub: 'Ctrl 0', act: 'reset' });
    return out;
  }
  // Each source loads once, on the first open, and the open list refreshes as it lands. A failed source retries next open.
  const SOURCES = {
    // The crawler's /tft/meta is ~250 KB (DONI-550), so units load from every world now.
    unit: async () => qpUnitItems(await window.tftStats.get('/tft/meta', 10000)),
    // Recordings change during a session, so open() clears this list and it reloads each time.
    recording: async () => { const a = window.pywebview && window.pywebview.api; if (!a || !a.list_recordings || !window.recFacts) return [];
      return qpRecordingItems(await a.list_recordings(), recFacts, ms => new Date(ms).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })); },
    champion: async () => {
      const { v, d } = await window.statsApi.ddChampions();
      return Object.values(d.data || {}).sort((a, b) => a.name.localeCompare(b.name)).map(c => ({ kind: 'champion', label: c.name, sub: c.title, href: '#/league/champion/' + c.key, icon: `${window.statsApi.DD}/cdn/${v}/img/champion/${c.id}.png` }));
    },
    comp: async () => {
      const rows = window.tftStats.compRows(await window.tftStats.get('/tft/comps')), name = t => window.tftStats.info(t).name;
      // A comp id is "<top trait>,<carry unit>" (DONI-502), so the first part is a trait and the second a unit.
      const part = i => [...new Set(rows.map(r => r.id.split(',')[i]).filter(Boolean))].map(name).sort((a, b) => a.localeCompare(b));
      live.trait = part(0).map(n => ({ kind: 'trait', label: n, sub: 'Filter the comps list', href: '#/tft', tft: n }));
      live.carry = part(1).map(n => ({ kind: 'unit', label: n, sub: 'Carry · filter the comps list', href: '#/tft', tft: n }));
      return rows.map(r => ({ kind: 'comp', label: r.id.split(',').map(name).join(' · '), sub: `Tier ${r.tier} · avg place ${(+r.avgPlacement).toFixed(2)} · ${(+r.games).toLocaleString()} games`, href: '#/tft/comp/' + encodeURIComponent(r.id) }));
    },
    hero: async () => {
      const r = await fetch('https://api.deadlock-api.com/v1/assets/heroes?only_active=true', { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('deadlock-api ' + r.status);
      const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      return (await r.json()).filter(h => h.player_selectable && !h.disabled).map(h => ({ kind: 'hero', label: h.name, sub: String(h.hero_type || 'Hero').replace(/^./, c => c.toUpperCase()), href: '#/deadlock/heroes/' + slug(h.name), icon: h.images && (h.images.icon_image_small_webp || h.images.icon_image_small) }));
    },
  };
  function loadSources() {
    for (const [k, fn] of Object.entries(SOURCES)) {
      if (live[k].length || loading.has(k)) continue;
      loading.add(k);
      fn().then(items => { live[k] = items; }, err => console.warn('search:', k, err && err.message || err))
        .finally(() => { loading.delete(k); if (!sheet.hidden) draw(); });
    }
  }

  // --- the sheet ---------------------------------------------------------------
  const GAME = { champion: 'league', comp: 'tft', trait: 'tft', unit: 'tft', hero: 'deadlock' };
  function all() { const on = window.qpGames ? qpGames() : Object.values(GAME); return [...statics(), ...live.champion, ...live.comp, ...live.trait, ...(live.unit.length ? live.unit : live.carry), ...live.hero, ...live.recording].filter(it => !GAME[it.kind] || on.includes(GAME[it.kind])); }
  function row(it, i) {
    const ico = it.icon ? `<img src="${E(it.icon)}" alt="" loading="lazy">` : `<span class="qs-glyph" aria-hidden="true">${{ page: '→', setting: '⚙', action: '›', recording: '◉', comp: '◆', trait: '◇', unit: '●' }[it.kind] || '·'}</span>`;
    return `<div class="qs-row" role="option" id="qs-o${i}" data-i="${i}" aria-selected="${i === cur}">${ico}<span class="qs-txt"><b>${E(it.label)}</b>${it.sub ? `<small>${E(it.sub)}</small>` : ''}</span><em>${KIND[it.kind]}</em></div>`;
  }
  function draw() {
    const q = input.value;
    shown = q.trim() ? qpRank(all(), q) : recent.slice(0, 8);
    cur = Math.min(cur, Math.max(0, shown.length - 1));
    const head = q.trim() ? '' : shown.length ? '<p class="qs-head">Recent</p>' : '<p class="qs-empty">Type a champion, comp, hero, page or setting.</p>';
    list.innerHTML = head + (shown.length ? shown.map(row).join('') : q.trim() ? `<p class="qs-empty">Nothing matches “${E(q.trim())}”.</p>` : '');
    input.setAttribute('aria-activedescendant', shown.length ? 'qs-o' + cur : '');
    state.textContent = loading.size ? 'Loading ' + [...loading].map(k => ({ champion: 'champions', comp: 'TFT comps', hero: 'heroes', unit: 'TFT units', recording: 'recordings' })[k]).join(', ') + '…' : '';
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function place() {
    // Under the page row: the shared #world-nav, or Deadlock's own row inside its shadow root.
    const city = document.querySelector('#deadlock-view:not([hidden])')?.shadowRoot?.querySelector('.city-nav');
    const nav = document.getElementById('world-nav'), r = (city || nav).getBoundingClientRect();
    const main = document.getElementById('qp-sidebar').getBoundingClientRect().right;
    const w = Math.min(760, innerWidth - main - 32);
    sheet.style.top = Math.max(32, r.bottom) + 'px';
    sheet.style.left = main + Math.max(16, (innerWidth - main - w) / 2) + 'px';
    sheet.style.width = w + 'px';
  }
  function open(q = '') {
    if (sheet.hidden) back = document.activeElement;
    sheet.hidden = false; place(); input.value = q; cur = 0; live.recording = []; draw(); input.focus(); input.select(); loadSources();
  }
  function close(restore = true) {
    if (sheet.hidden) return;
    sheet.hidden = true;
    if (restore && back && back.isConnected) back.focus({ preventScroll: true });
  }
  // Scroll a Settings control into view, focus it and flash its row (also used by home's set-up strip).
  function focusSetting(key) {
    const el = document.querySelector(`#settings-view [data-k="${CSS.escape(key)}"]`) || document.getElementById(key), rowEl = el?.closest('.st-row, .st-chip') || el;
    if (!el) return;
    rowEl.scrollIntoView({ block: 'center' }); el.focus({ preventScroll: true });
    rowEl.classList.remove('qs-flash'); void rowEl.offsetWidth; rowEl.classList.add('qs-flash');
  }
  function go(it) {
    if (!it) return;
    recent = [it, ...recent.filter(r => !(r.label === it.label && r.href === it.href && r.act === it.act))].slice(0, 8);
    try { localStorage.setItem(KEY, JSON.stringify(recent.map(({ kind, label, sub, href, icon, act, focus, tft }) => ({ kind, label, sub, href, icon, act, focus, tft })))); } catch {}
    close(false);
    if (it.act) {
      if (it.act === 'sidebar') document.querySelector('#qp-sidebar .sb-toggle')?.click();
      else window.qpStepScale?.({ bigger: 1, smaller: -1, reset: 0 }[it.act]);
      return;
    }
    if (location.hash !== it.href) location.hash = it.href.replace(/^#/, ''); else window.dispatchEvent(new HashChangeEvent('hashchange'));
    if (it.focus) setTimeout(() => focusSetting(it.focus), 80);
    if (it.tft) setTimeout(() => {
      const box = document.querySelector('#tft-view .ts-search input');
      if (box) { box.value = it.tft; box.dispatchEvent(new Event('input', { bubbles: true })); box.focus(); }
    }, 80);
  }

  input.addEventListener('input', () => { cur = 0; draw(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length; draw(); } }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[cur]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('mousemove', e => { const r = e.target.closest('.qs-row'); if (r && +r.dataset.i !== cur) { cur = +r.dataset.i; list.querySelectorAll('.qs-row').forEach(x => x.setAttribute('aria-selected', String(+x.dataset.i === cur))); } });
  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus in the box
  list.addEventListener('click', e => { const r = e.target.closest('.qs-row'); if (r) go(shown[+r.dataset.i]); });
  // Not a modal: clicking or tabbing anywhere else just closes it.
  document.addEventListener('pointerdown', e => { if (!sheet.hidden && !sheet.contains(e.target) && !e.target.closest('[data-qs-open]')) close(false); });
  sheet.addEventListener('focusout', e => { if (!sheet.hidden && e.relatedTarget && !sheet.contains(e.relatedTarget)) close(false); });
  addEventListener('resize', () => { if (!sheet.hidden) place(); });
  addEventListener('hashchange', () => close(false));
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); sheet.hidden ? open() : close(); }
    else if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey && !typing(e.composedPath()[0]) && sheet.hidden) { e.preventDefault(); open(); }
  });

  // A Search entry at the top of the sidebar, so the sheet is findable without the shortcut.
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'sb-item sb-search'; btn.dataset.qsOpen = ''; btn.title = 'Search (Ctrl+K)';
  btn.innerHTML = '<svg class="sb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>Search</span><kbd>Ctrl K</kbd>';
  btn.addEventListener('click', () => sheet.hidden ? open() : close());
  document.querySelector('#qp-sidebar .sb-scroll').prepend(btn);
  window.qpSearch = { open, close, focusSetting };
})();
