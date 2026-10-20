// TFT world. Stats pages (DONI-484) render here on crawler data: #/tft (your card + comps tier list), #/tft/comp/{id},
// #/tft/history. The supplied Field Guide keeps its styles, modules and saved boards isolated in an iframe for
// #/tft/{comps,planner,champions,items}.
window.createTftView = function (host) {
  const S = window.tftStats;
  const source = new URL('tft-field-guide/index.html', location.href).href;
  let frame;
  const bar = document.createElement('div');
  bar.className = 'tft-live';
  bar.innerHTML = '<span class="tft-live-rank" role="status">TFT rank: client not connected</span><span class="tft-live-msg" role="status"></span>';
  const search = document.createElement('div');
  search.className = 'ts-search';
  search.innerHTML = '<input type="search" placeholder="Search units, traits or comps" aria-label="Search TFT units, traits and comps" autocomplete="off"><div class="ts-results" hidden></div>';
  const page = document.createElement('div');
  page.className = 'ts-page';
  page.tabIndex = -1;
  host.append(bar, search, page);
  const rankEl = bar.querySelector('.tft-live-rank'), msgEl = bar.querySelector('.tft-live-msg');
  const input = search.querySelector('input'), results = search.querySelector('.ts-results');
  const api = () => window.pywebview && window.pywebview.api;
  const rankText = (r) => `${r.tier[0] + r.tier.slice(1).toLowerCase()}${r.division && r.division !== 'NA' ? ' ' + r.division : ''}`;
  let myRegion = 'NA1', myRiot = ''; // your platform prefix for match ids and your Riot ID, to mark you in a match (DONI-564)
  async function refreshRank() {
    try {
      const info = (await api().get_summoner()) || {};
      if (info.platform || info.region) myRegion = String(info.platform || ({ na: 'NA1', euw: 'EUW1', eune: 'EUN1', oce: 'OC1', oc: 'OC1', br: 'BR1', jp: 'JP1', tr: 'TR1', lan: 'LA1', las: 'LA2', sg: 'SG2', tw: 'TW2', vn: 'VN2', ph: 'PH2', th: 'TH2', me: 'ME1' })[String(info.region).toLowerCase()] || info.region).toUpperCase(); // DONI-569
      if (info.name) myRiot = `${info.name}#${info.tag || ''}`.toLowerCase();
      const r = info.connected && info.ranked && info.ranked.tft;
      rankEl.textContent = !info.connected ? 'TFT rank: client not connected'
        : r ? `TFT rank: ${rankText(r)} · ${Number(r.lp).toLocaleString()} LP · ${r.wins}W ${r.losses}L` : 'TFT rank: unranked';
    } catch (_) { rankEl.textContent = 'TFT rank: unavailable'; }
  }
  // Play lives in the page row (#tft-play, index.html): start the ranked TFT queue (1100), click again to cancel.
  const play = document.getElementById('tft-play'), playLabel = play.querySelector('.tp-label');
  let queued = false;
  play.addEventListener('click', async () => {
    msgEl.textContent = '';
    try {
      const r = queued ? await api().cancel_queue() : await api().start_queue(1100);
      if (!r.ok) msgEl.textContent = r.error || 'Queue unavailable.';
      else queued = !queued;
    } catch (_) { msgEl.textContent = 'Queue unavailable.'; }
    play.classList.toggle('queued', queued);
    playLabel.textContent = queued ? 'In queue · Cancel' : 'Play';
  });

  // --- Field Guide frame ---------------------------------------------------
  // DONI-531: the live comps tier list (#/tft) is the one comps page; #/tft/comps redirects there. The guide's practice
  // comps stay inside the Planner (its own links), so every guide page reports as Planner except the library on home.
  const GUIDE = { planner: 'playground', champions: 'home', 'item-library': 'home' };
  const parse = () => { const [p = '', id = ''] = location.hash.replace(/^#\/tft\/?/, '').split('/'); return { p, id: decodeURIComponent(id) }; };
  // The sidebar's Champions / Items open the guide's own library panel; Comps and Planner close it (DONI-531).
  function openLibrary() {
    const { p } = parse(), doc = frame.contentDocument;
    if (p === 'champions' || p === 'item-library') doc?.querySelector(`[data-library="${p === 'item-library' ? 'items' : p}"]`)?.click();
    else if (doc?.querySelector('#fieldLibrary') && !doc.querySelector('#fieldLibrary').hidden) doc.querySelector('#libraryClose')?.click();
  }
  function showGuide(p, focus) {
    document.title = 'TFT Field Guide · QueuePop';
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = 'TFT Field Guide: guides and interactive playground';
      frame.src = source + '#' + GUIDE[p];
      frame.addEventListener('load', () => {
        // The sidebar is the navigation: hide the guide's own nav row.
        frame.contentDocument.head.append(Object.assign(frame.contentDocument.createElement('style'), { textContent: '.main-header.field-nav{display:none}' }));
        openLibrary();
        frame.contentWindow.addEventListener('hashchange', () => {
          if (frame.hidden) return;
          const hash = frame.contentWindow.location.hash.slice(1), { p } = parse();
          if (hash === 'home' && (p === 'champions' || p === 'item-library')) return; // the library sits on the guide's home
          history.replaceState(null, '', '#/tft/planner');
          window.syncSidebar?.();
        });
      });
      host.append(frame);
    } else if (frame.contentWindow.location.hash !== '#' + GUIDE[p]) {
      frame.contentWindow.location.replace(source + '#' + GUIDE[p]);
    }
    if (frame.contentDocument?.readyState === 'complete') window.syncSidebar?.();
    if (frame.contentDocument?.readyState === 'complete') openLibrary();
    if (focus) frame.focus();
  }

  // --- Stats pages -----------------------------------------------------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const enc = encodeURIComponent;
  const name = (key) => S.info(key).name;
  // Icon with a lettered fallback when Community Dragon has no art (or it fails to load).
  const icon = (key, cls = '') => {
    const i = S.info(key), letters = i.name.replace(/\W/g, '').slice(0, 2);
    return i.icon ? `<img class="ts-ico ${cls}" src="${esc(i.icon)}" alt="" title="${esc(i.name)}" loading="lazy" data-fb-class="ts-ico ts-ico-x ${cls}" data-fb-text="${letters}">`
      : `<span class="ts-ico ts-ico-x ${cls}" title="${esc(i.name)}">${letters}</span>`;
  };
  const compName = (id) => id.split(',').map(name).join(' · ');
  const traitsMarkup = (id) => id.split(',').map((t) => `<span class="ts-trait">${icon(t, 'ts-ico-trait')}${esc(name(t))}</span>`).join('');
  const tierBadge = (t) => t ? `<span class="ts-tier t-${t}" title="Tier ${t}: average placement with a pick-rate bonus">${t}</span>`
    : '<span class="ts-tier ts-untiered" title="Low sample: not tiered">–</span>';
  // Value colour (DONI-531): green better than a lobby average, red worse, by distance x sample weight (20 games faint, 2,000 full).
  const heat = (x, centre, spread, n, text, lowerIsBetter) => {
    const w = 0.15 + 0.85 * Math.min(1, Math.max(0, Math.log(n / 20) / Math.log(100))), d = (x - centre) * (lowerIsBetter ? -1 : 1);
    return `<span class="ts-v ${d >= 0 ? 'vg' : 'vb'}" style="--k:${(Math.min(1, Math.abs(d) / spread) * w).toFixed(2)}">${text}</span>`;
  };
  // DONI-513: average place over the window's days (crawler ?trend=1 daily[]); green when the last day places better than the first.
  const spark = (daily) => {
    const d = (daily || []).filter((x) => x.games > 0 && x.avgPlacement != null);
    if (d.length < 2) return '';
    const v = d.map((x) => x.avgPlacement), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 0.05, w = 34, h = 11;
    const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${((x - lo) / span * h).toFixed(1)}`).join(' ');
    return `<svg class="ts-spark ${v[v.length - 1] <= v[0] ? 'up' : 'down'}" viewBox="-1 -1 ${w + 2} ${h + 2}" width="${w}" height="${h}"><title>${d.map((x) => `${x.day}: ${x.avgPlacement.toFixed(2)} avg (${x.games})`).join('\n')}</title><polyline points="${pts}"/></svg>`;
  };
  const mag = (x, p90, text) => `<span class="ts-v vn" style="--k:${Math.sqrt(Math.min(1, x / (p90 || 1))).toFixed(2)}">${text}</span>`;
  const games = (n) => `<span class="ts-games">${n.toLocaleString()} games</span>`;

  const filters = { patch: '', region: 'all', bracket: 'all', days: '' };
  // Region, rank and window are remembered between sessions like League's (patch always starts on the newest).
  const FKEY = 'queuepop-tft-filters-v1', saveFilters = () => { try { localStorage.setItem(FKEY, JSON.stringify({ region: filters.region, bracket: filters.bracket, days: filters.days })); } catch (_) {} };
  try { const s = JSON.parse(localStorage.getItem(FKEY) || '{}'); for (const k of ['region', 'bracket', 'days']) if (typeof s[k] === 'string') filters[k] = s[k]; } catch (_) {}
  let defaultPatch = '', augmentNote = '', rows = [], shown = 30, open = null, query = '', patches = null, offline = false, dragonAsked = false, regions = ['kr', 'na1'];
  const qs = () => `patch=${enc(filters.patch)}&region=${filters.region}&bracket=${filters.bracket}${filters.days ? '&days=' + filters.days : ''}`;
  // DONI-570: units, augments and traits are whole-patch tables, so the detail never sends the window (Played stays <= 100 %).
  const detail = (id) => S.get(`/tft/comp/${enc(id)}?patch=${enc(filters.patch)}&region=${filters.region}&bracket=${filters.bracket}`);
  const known = new Map(); // comp id → its loaded unit keys (search matches unit names through these)

  async function loadComps() {
    offline = false;
    try {
      if (!patches) [patches, regions] = await Promise.all([S.get('/patches').then((p) => { defaultPatch = p.default?.tft || ''; return p.tft || []; }), S.regions()]);
      S.get('/tft/augments').then((a) => { augmentNote = a.note || ''; }).catch(() => {}); // D15: Riot's own reason when there are none
      if (!filters.patch) filters.patch = defaultPatch || patches[0] || ''; // D15: the crawler's default waits on patch day
      rows = filters.patch ? S.compRows(await S.get(`/tft/comps?${qs()}&trend=1`)) : [];
      for (const r of rows) if (Array.isArray(r.units)) known.set(r.id, r.units); // crawler rows carry their top units (D, 2026-10-20)
    } catch (_) { offline = true; rows = []; }
  }
  // Fill unit icons for rows on screen, six requests at a time (the crawler is on the LAN).
  let unitWatch = null;
  async function fillUnits(ids) {
    for (let i = 0; i < ids.length; i += 6) {
      await Promise.allSettled(ids.slice(i, i + 6).map(async (id) => {
        const d = await detail(id);
        known.set(id, d.units.map((u) => u.key));
        const el = page.querySelector(`[data-units="${CSS.escape(id)}"]`);
        if (el) el.innerHTML = d.units.slice(0, 9).map((u) => icon(u.key)).join('');
        const ch = page.querySelector(`[data-chips="${CSS.escape(id)}"]`);
        if (ch) ch.innerHTML = traitChips(d.activeTraits);
      }));
    }
  }
  // DONI-561: MetaTFT's active-trait chips: per trait, the highest breakpoint at least half the boards reach, as icon + unit
  // count (breakpoints from /tft/meta), most units first, one-unit uniques left out; the title says how often.
  function traitChips(active) {
    const best = new Map();
    // Review #118: frequencies are per exact tier, so add them from the top tier down ("this tier or higher") before the 50 % test.
    const by = new Map();
    for (const t of active || []) { const [k, tier] = t.key.split(':'); (by.get(k) || by.set(k, []).get(k)).push({ tier: +tier, f: t.frequency }); }
    for (const [k, list] of by) { let acc = 0; for (const x of list.sort((a, b) => b.tier - a.tier)) { acc += x.f; if (acc >= 0.5) { best.set(k, { tier: x.tier, f: acc }); break; } } }
    return [...best].map(([k, b]) => ({ k, b, n: (S.info(k).breakpoints || [])[b.tier - 1] || b.tier })).filter((x) => x.n > 1).sort((x, y) => y.n - x.n).slice(0, 6)
      .map(({ k, b, n }) => `<span class="ts-chip" title="${esc(name(k))} ${n} · ${pct(b.f)} of these boards">${icon(k, 'ts-ico-trait')}${n}</span>`).join('');
  }
  const matches = (r) => !query || (compName(r.id) + ' ' + (known.get(r.id) || []).map(name).join(' ')).toLowerCase().includes(query);

  function card() {
    // Morning pass: the landing opens on a title band like League's (art, lime hairline, Anton), your rank and last ten in it.
    return `<section class="ts-card ts-band" aria-label="Your TFT"><div class="ts-band-title"><h1>Tier list</h1><span class="ts-quiet ts-band-meta"></span></div><div class="ts-rank"><small>Your TFT</small><strong>Client not connected</strong></div><div class="ts-form"></div></section>`;
  }
  async function loadCard() {
    const el = page.querySelector('.ts-card');
    let info = {}, list = [];
    try { info = (await api().get_summoner()) || {}; } catch (_) { /* rank only */ }
    try { list = ((await api().get_tft_match_history(10)) || []).slice(0, 10); } catch (_) { /* bridge without TFT history */ }
    if (!el.isConnected) return;
    const r = info.connected && info.ranked && info.ranked.tft;
    el.querySelector('.ts-rank').innerHTML = `<small>Your TFT${info.connected && info.name ? ' · ' + esc(info.name) : ''}</small>`
      + (!info.connected ? '<strong>Client not connected</strong><span>Open the League client to see your rank and last games.</span>' : r ? `<strong>${rankText(r)}</strong><span>${Number(r.lp).toLocaleString()} LP · ${r.wins}W ${r.losses}L</span>` : '<strong>Unranked</strong>');
    if (!list.length) return;
    const avg = list.reduce((s, g) => s + g.placement, 0) / list.length, top4 = list.filter((g) => g.placement <= 4).length;
    el.querySelector('.ts-form').innerHTML = `<small>Last ${list.length} · avg ${avg.toFixed(2)} · ${top4} top 4</small><div class="ts-places">${list.map((g) => `<a class="ts-place p${g.placement <= 1 ? 1 : g.placement <= 4 ? 4 : 8}" href="#/tft/history" title="${esc(QUEUES[g.queueId] || 'TFT')}">${g.placement}</a>`).join('')}</div>`;
  }

  function filterStrip() {
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    return `<div class="ts-filters"><label>Patch <select data-f="patch">${(patches || []).map((p) => opt(p, p, filters.patch)).join('') || `<option value="">${offline ? 'Offline' : 'None yet'}</option>`}</select></label>
      <div class="ts-seg" role="group" aria-label="Region">${[['all', 'All regions'], ...regions.map((r) => [r, S.regionLabel(r)])].map(([v, l]) => `<button data-region="${v}" aria-pressed="${filters.region === v}">${l}</button>`).join('')}</div>
      <label${LISTS[parse().p] || parse().p !== '' ? ' hidden' : ''}>Window <select data-f="days">${[['', 'Whole patch'], ['7', 'Last 7 days'], ['3', 'Last 3 days'], ['1', 'Today']].map(([v, l]) => opt(v, l, filters.days)).join('')}</select></label>
      <label>Rank <select data-f="bracket">${[['all', 'All ranks'], ['emerald', 'Emerald+'], ['diamond', 'Diamond+'], ['master', 'Master+']].map(([v, l]) => opt(v, l, filters.bracket)).join('')}</select></label></div>`;
  }
  function stateLine() {
    if (offline) return 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.';
    if (!filters.patch) return 'No TFT stats yet. The crawler aggregates every hour.';
    if (!rows.length) return 'No comps for these filters yet.';
    return '';
  }
  function compDetail(d) {
    const table = (list, label) => list.length ? `<table class="ts-table"><thead><tr><th>${label}</th><th>Played</th><th>Avg place</th><th>Top 4</th><th>Games</th></tr></thead><tbody>${list.map((u) => `<tr class="${u.lowSample ? 'low' : ''}"><td>${icon(u.key)}${esc(name(u.key))}</td><td>${mag(u.frequency, 1, pct(u.frequency))}</td><td>${heat(u.avgPlacement, 4.5, 0.6, u.games, u.avgPlacement.toFixed(2), true)}</td><td>${heat(u.top4Rate, 0.5, 0.12, u.games, pct(u.top4Rate))}</td><td>${u.games.toLocaleString()}</td></tr>`).join('')}</tbody></table>` : `<p class="ts-quiet">No ${label.toLowerCase()} recorded.</p>`;
    return `<div class="ts-detail-grid"><div><h3>Units</h3>${table(d.units, 'Unit')}</div><div><h3>Augments</h3>${d.augments.length ? table(d.augments, 'Augment') : `<p class="ts-quiet">${esc(augmentNote || 'No augments recorded for this comp.')}</p>`}</div></div>`;
  }
  function renderList() {
    const list = page.querySelector('.ts-list');
    if (!list) return;
    page.querySelector('.ts-state').textContent = stateLine();
    const vis = rows.filter(matches), slice = vis.slice(0, shown);
    list.innerHTML = !vis.length ? (rows.length ? `<p class="ts-quiet">No comps match “${esc(query)}”.</p>` : '') :
      `<div class="ts-head" aria-hidden="true"><span>Tier</span><span>Comp</span><span>Units</span><span>Avg place</span><span>Top 4</span><span>Win</span><span>Pick</span><span>Games</span></div>`
      + slice.map((r) => `<div class="ts-row ${r.lowSample ? 'low' : ''} ${open === r.id ? 'open' : ''}" data-row="${esc(r.id)}"${r.lowSample ? ' title="Low sample: under ' + r.games + ' games is not enough to trust"' : ''}>
        <button class="ts-main" data-open="${esc(r.id)}" aria-expanded="${open === r.id}">${tierBadge(r.tier)}<span class="ts-name">${traitsMarkup(r.id)}${spark(r.daily)}<span class="ts-chips" data-chips="${esc(r.id)}"></span></span>
        <span class="ts-units" data-units="${esc(r.id)}">${(known.get(r.id) || []).slice(0, 9).map((k) => icon(k)).join('')}</span><span class="ts-num">${heat(r.avgPlacement, 4.5, 0.8, r.games, r.avgPlacement.toFixed(2), true)}</span><span class="ts-num">${heat(r.top4Rate, 0.5, 0.15, r.games, pct(r.top4Rate))}</span>
        <span class="ts-num">${heat(r.winRate, 0.125, 0.06, r.games, pct(r.winRate))}</span><span class="ts-num">${mag(r.pickRate, 0.05, pct(r.pickRate))}</span><span class="ts-num">${r.games.toLocaleString()}</span></button>
        ${open === r.id ? `<div class="ts-detail" data-detail="${esc(r.id)}"><p class="ts-quiet">Loading…</p></div>` : ''}</div>`).join('')
      + (vis.length > shown ? `<button class="ts-more" data-more>Show ${Math.min(30, vis.length - shown)} more of ${vis.length - shown}</button>` : '');
    // Q review: unit icons fill as rows come into view, not 30 comp requests per visit.
    unitWatch?.disconnect();
    unitWatch = new IntersectionObserver((es) => { const ids = es.filter((e) => e.isIntersecting).map((e) => { unitWatch.unobserve(e.target); return e.target.dataset.units; }); if (ids.length) fillUnits(ids); }, { root: page, rootMargin: '200px' });
    page.querySelectorAll('[data-units]').forEach((el) => unitWatch.observe(el));
    if (open && slice.some((r) => r.id === open)) {
      const id = open;
      detail(id).then((d) => {
        const el = page.querySelector(`[data-detail="${CSS.escape(id)}"]`);
        if (el) el.innerHTML = compDetail(d) + `<a class="ts-link" href="#/tft/comp/${enc(id)}">Open the comp page ↗</a>`;
      }).catch(() => {
        const el = page.querySelector(`[data-detail="${CSS.escape(id)}"]`);
        if (el) el.innerHTML = '<p class="ts-quiet">Stats offline: could not load this comp.</p>';
      });
    }
  }
  async function landing() {
    document.title = 'Teamfight Tactics · QueuePop';
    page.innerHTML = `<div class="ts-wrap">${card()}<div class="ts-filter-slot"></div><p class="ts-state" role="status">Loading comps…</p><div class="ts-list"></div></div>`;
    loadCard();
    await loadComps();
    if (parse().p !== '') return;
    page.querySelector('.ts-filter-slot').innerHTML = filterStrip();
    const bm = page.querySelector('.ts-band-meta');
    if (bm && rows.length) bm.textContent = `${rows.length} comps · patch ${filters.patch} · best first`;
    renderList();
  }

  // Comp page: the expanded view as a page, with its most-played units placed on a read-only board.
  // ponytail: the Field Guide's planner (ArenaModel) only accepts its Set 13 sample roster, so live units get this
  // static board (melee front, ranged back); an editable live-set planner is its own issue.
  function boardFor(units) {
    const cells = Array(28).fill(null), order = [3, 2, 4, 1, 5, 0, 6];
    const place = (key, rowsTry) => { for (const r of rowsTry) for (const c of order) if (!cells[r * 7 + c]) { cells[r * 7 + c] = key; return; } };
    units.filter((u) => u.frequency >= 0.3).slice(0, 9).forEach((u) => {
      const range = S.info(u.key).range;
      place(u.key, range > 2 ? [3, 2, 1, 0] : [0, 1, 2, 3]);
    });
    return `<div class="ts-board" aria-label="Suggested board">${[0, 1, 2, 3].map((r) => `<div class="ts-hexrow">${cells.slice(r * 7, r * 7 + 7).map((k) => `<span class="ts-hex ${k ? 'on' : ''}">${k ? icon(k) + `<small>${esc(name(k))}</small>` : ''}</span>`).join('')}</div>`).join('')}</div>`;
  }
  async function compPage(id) {
    document.title = compName(id) + ' · TFT · QueuePop';
    page.innerHTML = '<div class="ts-wrap"><a class="ts-back" href="#/tft">← All comps</a><p class="ts-state" role="status">Loading comp…</p></div>';
    if (!patches) await loadComps();
    let d;
    S.loadFull().then(() => { if (parse().p === 'comp' && parse().id === id) { const b = page.querySelector('.ts-comp-board'); if (b && d) b.innerHTML = `<h3>Board</h3>${boardFor(d.units)}`; } }); // ranges for the board, later
    try { d = await detail(id); } catch (e) {
      page.querySelector('.ts-state').textContent = e.message === '404' ? 'No games for this comp with these filters.' : 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.';
      return;
    }
    if (parse().id !== id) return;
    page.querySelector('.ts-wrap').innerHTML = `<a class="ts-back" href="#/tft">← All comps</a>
      <header class="ts-comp-head ${d.lowSample ? 'low' : ''}">${tierBadge(d.lowSample ? null : S.compTier(d))}<div><h1>${esc(compName(id))}</h1><div class="ts-name">${traitsMarkup(id)}</div></div></header>
      <div class="ts-stats">${[['Avg place', d.avgPlacement.toFixed(2)], ['Top 4', pct(d.top4Rate)], ['Win', pct(d.winRate)], ['Pick', pct(d.pickRate)]].map(([l, v]) => `<div><small>${l}</small><strong>${v}</strong></div>`).join('')}<div><small>Sample</small><strong>${d.games.toLocaleString()}</strong>${d.lowSample ? `<span class="ts-quiet">under ${d.minGames} games</span>` : ''}</div></div>
      <p class="ts-quiet">Patch ${esc(d.patch)} · ${d.region === 'all' ? 'all regions' : esc(d.region.toUpperCase())} · ${d.bracket === 'all' ? 'all ranks' : esc(d.bracket) + '+'}</p>
      <section class="ts-comp-board"><h3>Board</h3>${boardFor(d.units)}<p class="ts-quiet">Units played in at least 30% of these boards; melee in front, ranged behind. <a href="#/tft/planner">Open the planner ↗</a></p></section>
      ${compDetail(d)}`;
  }

  // Match history: your recent TFT games from the client (bridge get_tft_match_history).
  const QUEUES = { 1090: 'Normal', 1100: 'Ranked', 1130: 'Hyper Roll', 1160: 'Double Up', 1210: 'Choncc’s Treasure', 1220: 'Revival' };
  let played = [], openGame = null;
  const ago = (ts) => { const m = Math.round((Date.now() / 1000 - ts) / 60); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
  const stars = (n) => `<i class="ts-stars s${n}">${'★'.repeat(n)}</i>`;
  function renderHistory() {
    const list = page.querySelector('.ts-hist');
    if (!list) return;
    list.innerHTML = played.map((g, i) => {
      const traits = [...g.traits].sort((a, b) => b.style - a.style || b.units - a.units);
      return `<div class="ts-game ${openGame === i ? 'open' : ''}"><button class="ts-game-main" data-game="${i}" aria-expanded="${openGame === i}">
        <span class="ts-place p${g.placement <= 1 ? 1 : g.placement <= 4 ? 4 : 8}">${g.placement}</span>
        <span class="ts-game-meta"><strong>${esc(QUEUES[g.queueId] || 'TFT')}</strong><small>${ago(g.ts)} · level ${g.level} · ${Math.round(g.length / 60)} min</small></span>
        <span class="ts-game-traits">${traits.slice(0, 6).map((t) => `<span class="ts-trait st${t.style}">${icon(t.key, 'ts-ico-trait')}${t.units}</span>`).join('')}</span>
        <span class="ts-units">${g.units.map((u) => icon(u.key)).join('')}</span></button>
        ${openGame === i ? `<div class="ts-detail ts-detail-grid"><div><h3>Final board</h3>${g.units.map((u) => `<div class="ts-unit-line">${icon(u.key)}<span>${esc(name(u.key))} ${stars(u.stars)}</span><span class="ts-items">${u.items.map((k) => icon(k, 'ts-ico-item')).join('')}</span></div>`).join('') || '<p class="ts-quiet">No units.</p>'}</div>
          <div>${g.id ? `<a class="ts-link" href="#/tft/match/${enc(String(g.id).includes('_') ? g.id : myRegion + '_' + g.id)}">Open the full match ↗</a>` : ''}<h3>Traits</h3><div class="ts-trait-list">${traits.map((t) => `<span class="ts-trait st${t.style}">${icon(t.key, 'ts-ico-trait')}${esc(name(t.key))} ${t.units}</span>`).join('')}</div>
          <h3>Augments</h3>${g.augments.length ? `<div class="ts-trait-list">${g.augments.map((a) => `<span class="ts-trait">${icon(a, 'ts-ico-item')}${esc(name(a))}</span>`).join('')}</div>` : '<p class="ts-quiet">The client’s copy of this game has no augments.</p>'}</div></div>` : ''}</div>`;
    }).join('');
  }
  async function historyPage() {
    document.title = 'TFT match history · QueuePop';
    page.innerHTML = '<div class="ts-wrap"><h1 class="ts-h1">Match history</h1><p class="ts-state" role="status">Loading your games…</p><div class="ts-hist"></div></div>';
    let err = '';
    try { played = (await api().get_tft_match_history(20)) || []; } catch (_) { played = []; err = 'Match history is not available in this build.'; }
    if (parse().p !== 'history') return;
    page.querySelector('.ts-state').textContent = err || (played.length ? `Your last ${played.length} TFT games.` : 'No TFT games found. Is the League client open?');
    renderHistory();
  }

  // --- Search: filters the comps list as you type; results jump to a comp or narrow to a unit/trait. ----------
  function renderResults() {
    if (!query) { results.hidden = true; return; }
    const units = new Set([...known.values()].flat()), traits = new Set(rows.flatMap((r) => r.id.split(',')).filter((k) => !units.has(k))); // a comp id is trait,carry: the carry is a unit, not a trait
    const hit = (k) => name(k).toLowerCase().includes(query);
    const u = [...units].filter(hit).slice(0, 8), t = [...traits].filter(hit).slice(0, 8);
    const c = rows.filter(matches).slice(0, 5);
    results.hidden = false;
    // DONI-512: name#tag opens that player's page.
    const riot = input.value.trim().includes('#') ? input.value.trim() : '';
    results.innerHTML = (riot ? `<div><small>Player</small><a href="#/tft/player/${slugOf(riot)}/${filters.region !== 'all' ? filters.region : 'na1'}">${esc(riot)}</a></div>` : '') + (u.length ? `<div><small>Units</small>${u.map((k) => `<button data-pick="${esc(name(k))}">${icon(k)}${esc(name(k))}</button>`).join('')}</div>` : '')
      + (t.length ? `<div><small>Traits</small>${t.map((k) => `<button data-pick="${esc(name(k))}">${icon(k, 'ts-ico-trait')}${esc(name(k))}</button>`).join('')}</div>` : '')
      + (c.length ? `<div><small>Comps</small>${c.map((r) => `<a href="#/tft/comp/${enc(r.id)}">${tierBadge(r.tier)}${esc(compName(r.id))}</a>`).join('')}</div>` : '')
      || `<div><small>${offline ? 'Stats offline' : rows.length ? 'No matches' : 'No comps loaded yet'}</small></div>`;
  }
  let searchedAll = false;
  input.addEventListener('input', async () => {
    query = input.value.trim().toLowerCase();
    if (!query) { renderResults(); renderList(); return; }
    if (!rows.length && !offline) await loadComps();
    renderResults(); renderList();
    // Unit names match through each comp's loaded units; load the rest once.
    // ponytail: one request per comp (<= 200, cached); add units to /tft/comps if that gets slow.
    // Only rows without crawler units (an older crawler) need their detail fetched to search by unit name.
    if (!searchedAll) { searchedAll = true; const missing = rows.map((r) => r.id).filter((id) => !known.has(id)); if (missing.length) { await fillUnits(missing); renderResults(); renderList(); } }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); }
    if (e.key === 'Enter') results.querySelector('a,button')?.click();
  });
  results.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b) return;
    input.value = b.dataset.pick;
    query = b.dataset.pick.toLowerCase();
    results.hidden = true;
    if (parse().p !== '') location.hash = '/tft'; else renderList();
  });
  search.addEventListener('click', (e) => { if (e.target.closest('a')) results.hidden = true; });

  page.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o) { open = open === o.dataset.open ? null : o.dataset.open; renderList(); page.querySelector(`[data-open="${CSS.escape(o.dataset.open)}"]`)?.focus(); return; }
    const cb = e.target.closest('[data-cost]');
    if (cb) { costFilter = +cb.dataset.cost; statsList('units'); return; }
    const r = e.target.closest('[data-region]');
    if (r) { filters.region = r.dataset.region; saveFilters(); refilter(); return; }
    if (e.target.closest('[data-more]')) { shown += 30; renderList(); return; }
    const g = e.target.closest('[data-game]');
    if (g) { openGame = openGame === +g.dataset.game ? null : +g.dataset.game; renderHistory(); page.querySelector(`[data-game="${g.dataset.game}"]`)?.focus(); }
  });
  page.addEventListener('change', (e) => { if (e.target.dataset.f) { filters[e.target.dataset.f] = e.target.value; if (e.target.dataset.f !== 'patch') saveFilters(); refilter(); } });
  async function refilter() {
    if (LISTS[parse().p]) return statsList(parse().p);
    open = null; shown = 30; known.clear(); searchedAll = false;
    page.querySelector('.ts-state').textContent = 'Loading comps…';
    await loadComps();
    page.querySelector('.ts-filter-slot').innerHTML = filterStrip();
    renderList();
  }


  // --- DONI-510 / DONI-511: MetaTFT's Units, Items and Traits stat pages, and a page per unit ----------------------------
  // #/tft/units (cost filter), #/tft/unit/{key}, #/tft/items, #/tft/traits on the crawler's /tft/units, /tft/unit/{key},
  // /tft/items, /tft/traits (same patch/region/rank filters as the tier list). Lobby averages colour the numbers: 4.5 place,
  // 50 % top 4, 12.5 % win; frequency tints purple. The field guide's libraries stay at #/tft/champions and #/tft/item-library.
  const LISTS = { units: 'Units', items: 'Items', traits: 'Traits' };
  let costFilter = 0;
  const qsAll = () => `${qs()}`;
  const cells = (r) => `<span class="ts-num">${heat(r.avgPlacement, 4.5, 0.6, r.games, r.avgPlacement.toFixed(2), true)}</span><span class="ts-num">${heat(r.top4Rate, 0.5, 0.12, r.games, pct(r.top4Rate))}</span>
    <span class="ts-num">${heat(r.winRate, 0.125, 0.06, r.games, pct(r.winRate))}</span><span class="ts-num">${mag(r.frequency, 0.3, pct(r.frequency))}</span><span class="ts-num">${r.games.toLocaleString()}</span>`;
  const costOf = (key) => S.info(key).cost || 0;
  const unitLink = (key, extra = '') => `<a class="ts-unit-link cost${costOf(key)}" href="#/tft/unit/${enc(key)}" title="${esc(name(key))}${extra}">${icon(key)}</a>`;
  async function statsList(kind) {
    document.title = LISTS[kind] + ' · TFT · QueuePop';
    const libs = kind === 'units' ? '<a href="#/tft/champions">Champion library ↗</a>' : kind === 'items' ? '<a href="#/tft/item-library">Item library ↗</a>' : '';
    page.innerHTML = `<div class="ts-wrap"><header class="ts-list-head"><h1>${LISTS[kind]}</h1><span class="ts-quiet ts-meta"></span>${libs}</header><div class="ts-filter-slot"></div><p class="ts-state" role="status">Loading ${kind}…</p><div class="ts-list"></div></div>`;
    if (!patches) await loadComps();
    if (parse().p !== kind) return;
    page.querySelector('.ts-filter-slot').innerHTML = filterStrip() + (kind === 'units' ? `<div class="ts-seg ts-costs" role="group" aria-label="Cost">${[0, 1, 2, 3, 4, 5].map((c) => `<button data-cost="${c}" aria-pressed="${costFilter === c}">${c ? c + ' gold' : 'All costs'}</button>`).join('')}</div>` : '');
    let d;
    try { d = await S.get(`/tft/${kind}?${qsAll()}`); } catch (_) {
      page.querySelector('.ts-state').textContent = 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.'; return;
    }
    if (parse().p !== kind) return;
    const rows = (d[kind] || []).filter((r) => kind !== 'units' || !costFilter || costOf(r.key) === costFilter)
      .sort((a, b) => a.lowSample - b.lowSample || a.avgPlacement - b.avgPlacement);
    page.querySelector('.ts-state').textContent = rows.length ? '' : 'Nothing recorded for these filters yet.';
    page.querySelector('.ts-meta').textContent = `${d.boards.toLocaleString()} boards · patch ${d.patch} · best average place first`;
    const extraHead = { units: 'Popular items', items: 'Best holders', traits: 'By breakpoint' }[kind];
    const extra = (r) => kind === 'units' ? `<span class="ts-units">${(r.items || []).map((i) => `<span title="${esc(name(i.key))} · ${i.avgPlacement.toFixed(2)} avg · ${i.games.toLocaleString()} games">${icon(i.key, 'ts-ico-item')}</span>`).join('')}</span>`
      : kind === 'items' ? `<span class="ts-units">${(r.units || []).map((u) => unitLink(u.unit, ` · ${u.avgPlacement.toFixed(2)} avg · ${u.games.toLocaleString()} games`)).join('')}</span>`
      : `<span class="ts-tiers">${(r.tiers || []).map((t) => `<span class="${t.lowSample ? 'low' : ''}" title="Breakpoint ${t.tier}: ${t.games.toLocaleString()} games, ${pct(t.top4Rate)} top 4">${t.tier} ${heat(t.avgPlacement, 4.5, 0.6, t.games, t.avgPlacement.toFixed(2), true)}</span>`).join('')}</span>`;
    const lead = (r) => kind === 'units' ? `<a class="ts-name ts-unit-name cost${costOf(r.key)}" href="#/tft/unit/${enc(r.key)}">${icon(r.key)}<span>${esc(name(r.key))}</span></a>`
      : `<span class="ts-name">${icon(r.key, kind === 'traits' ? 'ts-ico-trait' : 'ts-ico-item')}<span>${esc(name(r.key))}</span></span>`;
    page.querySelector('.ts-list').innerHTML = `<div class="ts-head ts-head-list" aria-hidden="true"><span>${LISTS[kind].replace(/s$/, '')}</span><span>Avg place</span><span>Top 4</span><span>Win</span><span>Frequency</span><span>Games</span><span>${extraHead}</span></div>`
      + rows.map((r) => `<div class="ts-row ts-row-list ${r.lowSample ? 'low' : ''}">${lead(r)}${cells(r)}${extra(r)}</div>`).join('');
  }
  async function unitPage(key) {
    document.title = name(key) + ' · TFT · QueuePop';
    page.innerHTML = '<div class="ts-wrap"><a class="ts-back" href="#/tft/units">← All units</a><p class="ts-state" role="status">Loading unit…</p></div>';
    if (!patches) await loadComps();
    let d;
    try { d = await S.get(`/tft/unit/${enc(key)}?${qsAll()}`); } catch (e) {
      page.querySelector('.ts-state').textContent = e.message === '404' ? 'No games for this unit with these filters.' : 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.'; return;
    }
    if (parse().id !== key) return;
    const tbl = (head, rows, f) => rows.length ? `<table class="ts-table"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(f).join('')}</tbody></table>` : '<p class="ts-quiet">None recorded.</p>';
    const num = (r) => `<td>${heat(r.avgPlacement, 4.5, 0.6, r.games, r.avgPlacement.toFixed(2), true)}</td><td>${r.top4Rate == null ? '–' : pct(r.top4Rate)}</td><td>${r.games.toLocaleString()}</td>`;
    page.querySelector('.ts-wrap').innerHTML = `<a class="ts-back" href="#/tft/units">← All units</a>
      <header class="ts-comp-head ${d.lowSample ? 'low' : ''}"><span class="ts-unit-name cost${costOf(key)}">${icon(key)}</span><div><h1>${esc(name(key))}</h1><div class="ts-name">${costOf(key) ? costOf(key) + ' gold · ' : ''}${(S.info(key).traits || []).map((t) => `<span class="ts-trait">${esc(t)}</span>`).join(' · ')}</div></div></header>
      <div class="ts-stats">${[['Avg place', d.avgPlacement.toFixed(2)], ['Top 4', pct(d.top4Rate)], ['Win', pct(d.winRate)], ['Frequency', pct(d.frequency)], ['Games', d.games.toLocaleString()]].map(([l, v]) => `<div><small>${l}</small><strong>${v}</strong></div>`).join('')}</div>
      <p class="ts-quiet">Patch ${esc(d.patch)} · ${d.region === 'all' ? 'all regions' : esc(d.region.toUpperCase())} · ${d.bracket === 'all' ? 'all ranks' : esc(d.bracket) + '+'}</p>
      <div class="ts-detail-grid">
        <div><h3>By star level</h3>${tbl(['Star', 'Avg place', 'Top 4', 'Games'], d.stars || [], (s) => `<tr class="${s.lowSample ? 'low' : ''}"><td>${stars(s.star)}</td>${num(s)}</tr>`)}
          <h3>Comps it plays in</h3>${tbl(['Comp', 'Avg place', 'Top 4', 'Games'], (d.comps || []).slice(0, 12), (c) => `<tr class="${c.lowSample ? 'low' : ''}"><td><a href="#/tft/comp/${enc(c.id)}">${esc(compName(c.id))}</a></td>${num(c)}</tr>`)}</div>
        <div><h3>Item sets</h3>${tbl(['Items', 'Avg place', 'Top 4', 'Games'], (d.itemSets || []).slice(0, 12), (s) => `<tr><td>${s.key ? s.key.split(',').map((i) => icon(i, 'ts-ico-item')).join('') : '<span class="ts-quiet">No items</span>'}</td>${num(s)}</tr>`)}
          <h3>Single items</h3>${tbl(['Item', 'Avg place', 'Top 4', 'Games'], (d.items || []).slice(0, 15), (i) => `<tr><td>${icon(i.key, 'ts-ico-item')}${esc(name(i.key))}</td>${num(i)}</tr>`)}</div>
      </div>`;
  }


  // --- DONI-512: MetaTFT's leaderboard and any player's page -------------------------------------------------------------
  // #/tft/leaderboard[/{region}] reads /tft/leaderboard (ladder order, our crawled avg place where we hold their boards);
  // #/tft/player/{Name-TAG}[/{region}] reads the crawler's on-demand /tft/player lookup (rank + last 20 games with boards).
  const slugOf = (id) => enc(String(id).replace('#', '-'));
  const idOf = (slug) => decodeURIComponent(slug).replace(/-(?=[^-]*$)/, '#');
  const tierWord = (t) => t ? t[0] + t.slice(1).toLowerCase() : 'Unranked';

  // --- DONI-564: one TFT match, all eight boards, MetaTFT's match view (crawler GET /tft/match/{id}) -----------------------
  async function matchPage(id) {
    document.title = 'Match · TFT · QueuePop';
    page.innerHTML = `<div class="ts-wrap"><header class="ts-list-head"><h1>Match</h1><span class="ts-quiet ts-meta">${esc(id)}</span></header><p class="ts-state" role="status">Reading the match… one the crawler doesn't hold yet comes from Riot.</p><div class="ts-match"></div></div>`;
    let m;
    try { m = await S.get(`/tft/match/${enc(id)}`, 30000); } catch (e) {
      const code = String(e.message || e).split(' ')[0];
      page.querySelector('.ts-state').textContent = code === '404' ? 'Riot has no match with this id.' : code === '400' ? "That match id doesn't look right." : code === '429' ? `The crawler allows a few fresh lookups a minute. Try again in ${e.retry ? e.retry + ' s' : 'a minute'}.` : 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.';
      return;
    }
    if (parse().p !== 'match' || parse().id !== id) return;
    await S.loadDragon();
    if (parse().p !== 'match' || parse().id !== id) return; // review #121: a slower older match never paints over a newer one
    const region = String(m.id).split('_')[0].toLowerCase();
    page.querySelector('.ts-list-head h1').textContent = QUEUES[m.queueId] || 'TFT';
    page.querySelector('.ts-meta').textContent = `${Math.round(m.length / 60)} min · set ${m.set} · ${new Date(m.startedAt).toLocaleString()}`;
    page.querySelector('.ts-state').textContent = m.source === 'rows' ? "The full boards of this match are past the crawler's 7-day window." : '';
    const getRec = (x) => Promise.resolve(api()?.get_recording?.(x)).catch(() => null); // Q22: your recorded moments (keyed by bare game id)
    const rec = (await getRec(m.id)) || (await getRec(String(m.id).split('_').pop()));
    if (parse().p !== 'match' || parse().id !== id) return;
    page.querySelector('.ts-match').innerHTML = (rec && window.recStrip ? `<section class="ts-mt-rec"><h3>Your moments</h3>${recStrip(rec)}</section>` : '') + (m.participants || []).map((p) => {
      const traits = [...(p.traits || [])].filter(([, tier]) => tier > 0).sort((a, b) => b[1] - a[1] || (b[2] || 0) - (a[2] || 0));
      return `<div class="ts-mt-row ${myRiot && (p.riotId || '').toLowerCase() === myRiot ? 'ts-mt-me' : ''}"><span class="ts-place p${p.placement <= 1 ? 1 : p.placement <= 4 ? 4 : 8}">${p.placement}</span>
        <span class="ts-game-meta">${p.riotId ? `<a href="#/tft/player/${slugOf(p.riotId)}/${region}"><strong>${esc(p.riotId.split('#')[0])}</strong></a>` : '<strong>Unknown</strong>'}<small>level ${p.level ?? '–'} · round ${p.lastRound ?? '–'}${p.goldLeft != null ? ' · ' + p.goldLeft + ' gold left' : ''}</small></span>
        <span class="ts-game-traits">${traits.map(([t, tier, n]) => `<span class="ts-trait st${Math.min(4, tier)}" title="${esc(name(t))}">${icon(t, 'ts-ico-trait')}${n ?? tier}</span>`).join('')}</span>
        <span class="ts-units">${(p.units || []).map(([u, st, items]) => `<span class="ts-unit-cell">${unitLink(u, ' · ' + '★'.repeat(st))}<i class="ts-stars s${st}">${'★'.repeat(st)}</i><span class="ts-unit-items">${(items || []).map((k) => icon(k, 'ts-ico-item')).join('')}</span></span>`).join('')}</span></div>`;
    }).join('');
  }

  // DONI-571: the page row shows Tier list, Match history, Units and More; More lists the rest inline (no popup).
  function morePage() {
    document.title = 'More · TFT · QueuePop';
    const P = [['#/tft/items', 'Items', 'Every item: average place, top 4, frequency and its best holders.'], ['#/tft/traits', 'Traits', 'Every trait and how each breakpoint places.'],
      ['#/tft/leaderboard', 'Leaderboard', 'The ranked ladder per region; open anyone for their last 20 boards.'], ['#/tft/planner', 'Planner', 'The field guide: practice boards, champions and items.']];
    page.innerHTML = `<div class="ts-wrap"><header class="ts-list-head"><h1>More</h1><span class="ts-quiet ts-meta">The rest of the TFT world</span></header><nav class="ts-more" aria-label="More TFT pages">${P.map(([h, t, d]) => `<a href="${h}"><b>${t}</b><span>${d}</span><i aria-hidden="true">↗</i></a>`).join('')}</nav></div>`;
  }
  async function leaderboardPage(region) {
    region = region || (filters.region !== 'all' ? filters.region : 'na1');
    document.title = 'Leaderboard · TFT · QueuePop';
    page.innerHTML = `<div class="ts-wrap"><header class="ts-list-head"><h1>Leaderboard</h1><span class="ts-quiet ts-meta">Ranked ladder · ${esc(region.toUpperCase())}</span></header>
      <div class="ts-filters"><div class="ts-seg" role="group" aria-label="Region">${regions.map((r) => `<a class="ts-seg-a" href="#/tft/leaderboard/${r}" aria-pressed="${r === region}">${S.regionLabel(r)}</a>`).join('')}</div></div>
      <p class="ts-state" role="status">Loading the ladder…</p><div class="ts-ladder"></div></div>`;
    if (!patches) await loadComps();
    let d;
    try { d = await S.get(`/tft/leaderboard?region=${enc(region)}&limit=200`); } catch (_) { page.querySelector('.ts-state').textContent = 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.'; return; }
    if (parse().p !== 'leaderboard') return;
    const ps = d.players || [];
    page.querySelector('.ts-state').textContent = ps.length ? '' : 'No ladder for this region yet.';
    page.querySelector('.ts-ladder').innerHTML = ps.length ? `<table class="ts-table ts-ladder-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>LP</th><th title="Riot counts a top-4 finish as a ranked win">Top 4 rate</th><th>Games</th><th>Our boards: avg place</th><th>Our top 4</th></tr></thead><tbody>
      ${ps.map((p) => `<tr><td>${p.rank}</td><td>${p.riotId ? `<a href="#/tft/player/${slugOf(p.riotId)}/${p.region}">${esc(p.riotId.split('#')[0])}</a> <small class="ts-quiet">#${esc(p.riotId.split('#')[1] || '')}</small>` : '<span class="ts-quiet">Name not crawled yet</span>'}</td>
        <td>${tierWord(p.tier)}${p.division ? ' ' + p.division : ''}</td><td>${p.lp.toLocaleString()}</td><td>${heat(p.winRate, 0.5, 0.12, p.games, pct(p.winRate))}</td><td>${p.games.toLocaleString()}</td>
        <td>${p.crawled ? heat(p.crawled.avgPlacement, 4.5, 0.8, p.crawled.games, p.crawled.avgPlacement.toFixed(2), true) + ` <small class="ts-quiet">${p.crawled.games}</small>` : '–'}</td><td>${p.crawled ? pct(p.crawled.top4Rate) : '–'}</td></tr>`).join('')}
    </tbody></table><p class="ts-quiet">Top 4 rate is Riot's ladder record (a top-4 finish counts as a win). Average place and our top 4 come from the boards the crawler holds for that player.</p>` : '';
  }
  async function playerPage(slug, region) {
    const riot = idOf(slug);
    region = region || (filters.region !== 'all' ? filters.region : 'na1');
    document.title = riot + ' · TFT · QueuePop';
    page.innerHTML = `<div class="ts-wrap"><a class="ts-back" href="#/tft/leaderboard">← Leaderboard</a><header class="ts-list-head"><h1>${esc(riot.split('#')[0])}</h1><span class="ts-quiet ts-meta">#${esc(riot.split('#')[1] || '')} · ${esc(region.toUpperCase())}</span></header>
      <p class="ts-state" role="status">Looking ${esc(riot)} up… a fresh lookup reads up to 20 games from Riot and can take up to a minute.</p><div class="ts-player"></div></div>`;
    let d;
    try { d = await S.get(`/tft/player/${enc(riot)}?region=${enc(region)}`, 60000); } catch (e) {
      const code = String(e.message || e).split(' ')[0];
      page.querySelector('.ts-state').textContent = code === '404' ? `No Riot ID "${riot}" on ${region.toUpperCase()}.` : code === '400' ? "That Riot ID or region doesn't look right (name#tag)." : code === '429' ? `The crawler allows a few fresh lookups a minute so the Riot key stays healthy. Try again in ${e.retry ? e.retry + ' s' : 'a minute'}.`
        : code === '503' ? "The crawler's Riot key is not valid right now; replace it in Settings > Stats crawler." : 'Stats offline: the stats crawler did not answer. Check its address in Settings > Stats crawler.';
      return;
    }
    if (parse().p !== 'player') return;
    const r = (d.ranked || []).find((x) => /TFT/.test(x.queue)) || (d.ranked || [])[0], g = d.matches || [];
    const avg = g.length ? g.reduce((s, x) => s + x.placement, 0) / g.length : 0;
    page.querySelector('.ts-state').textContent = '';
    page.querySelector('.ts-player').innerHTML = `<section class="ts-card"><div class="ts-rank"><small>${esc(d.region.toUpperCase())}</small>${r ? `<strong>${tierWord(r.tier)}${r.division && !/MASTER|CHALLENGER/.test(r.tier) ? ' ' + r.division : ''}</strong><span>${Number(r.lp).toLocaleString()} LP · ${r.wins}W ${r.losses}L</span>` : '<strong>Unranked</strong>'}</div>
      ${g.length ? `<div class="ts-form"><small>Last ${g.length} · avg ${avg.toFixed(2)} · ${g.filter((x) => x.placement <= 4).length} top 4</small><div class="ts-places">${g.map((x) => `<span class="ts-place p${x.placement <= 1 ? 1 : x.placement <= 4 ? 4 : 8}">${x.placement}</span>`).join('')}</div></div>` : ''}</section>
      <div class="ts-hist">${g.map((x) => `<div class="ts-game"><div class="ts-game-main ts-game-static"><a class="ts-place p${x.placement <= 1 ? 1 : x.placement <= 4 ? 4 : 8}" href="#/tft/match/${enc(x.id)}" title="Open the full match">${x.placement}</a>
        <span class="ts-game-meta"><strong>${esc(QUEUES[x.queueId] || 'TFT')}</strong><small>${ago(Math.round(x.startedAt / 1000))} · level ${x.level} · ${Math.round(x.length / 60)} min</small></span>
        <span class="ts-game-traits">${[...(x.traits || [])].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `<span class="ts-trait st${Math.min(4, n)}" title="${esc(name(t))}">${icon(t, 'ts-ico-trait')}${(S.info(t).breakpoints || [])[n - 1] || n}</span>`).join('')}</span>
        <span class="ts-units">${(x.units || []).map(([u, st, items]) => `<span class="ts-unit-cell">${unitLink(u, ' · ' + '★'.repeat(st))}<i class="ts-stars s${st}">${'★'.repeat(st)}</i></span>`).join('')}</span></div></div>`).join('')}</div>`;
  }

  function showStats(p, id) {
    if (!dragonAsked) { dragonAsked = true; S.loadDragon().then(() => { if (!page.hidden) render(); }); }
    render();
    function render() {
      const cur = parse();
      if (cur.p === 'comp') compPage(cur.id);
      else if (cur.p === 'unit') unitPage(cur.id);
      else if (cur.p === 'leaderboard') leaderboardPage(cur.id);
      else if (cur.p === 'match') matchPage(cur.id);
      else if (cur.p === 'more') morePage();
      else if (cur.p === 'player') playerPage(cur.id, location.hash.split('/')[4]);
      else if (LISTS[cur.p]) statsList(cur.p);
      else if (cur.p === 'history') historyPage();
      else landing();
    }
  }

  return {
    show(focus = true) {
      if (/^#\/tft\/comps\/?$/.test(location.hash)) { location.replace('#/tft'); return; }
      const { p, id } = parse();
      const stats = !GUIDE[p];
      page.hidden = stats ? false : true;
      if (frame) frame.hidden = stats;
      rankEl.hidden = stats;
      results.hidden = true;
      refreshRank();
      if (stats) { showStats(p, id); if (focus) page.focus({ preventScroll: true }); page.scrollTop = 0; }
      else showGuide(p, focus);
    },
    focus() { (page.hidden ? frame : page)?.focus(); }
  };
};
