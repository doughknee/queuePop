// DONI-507: the League champion page (#/league/champion/{id}[/{role}]), split out of league-stats.js. Lolalytics'
// build page information model on the crawler's /lol/champion/{id}; shared helpers (lg, lgChamp, lgIcon, lgMount...) live in league-stats.js.

// --- Champion page: stats strip, role tabs, build sheet, matchups ---
const lgHashRole = () => lgRoleOf(location.hash.split('/')[4] || '');
function leagueChampionPage(id) {
  lgMount('champion', t => lgFillChampion(t, id));
  const c = lgChamp(id), key = Object.keys(champions).find(k => champions[k].cid === c.id);
  return `<div class="lg-page">${lgSearch()}<header class="lg-champ-head" style="--champ-art:url('${statsApi.DD}/cdn/img/champion/splash/${lgEsc(c.alias || 'Ahri')}_0.jpg')"><span id="lg-champ-icon">${lgIcon(id, 'lg-portrait')}</span><div><span class="lg-kicker" id="lg-champ-title">${lgEsc(c.title) || 'Champion stats'}</span><h1 id="lg-champ-name">${lgEsc(c.name)}</h1><p>${key ? `<a href="#/league/champions/${key}">Lore & abilities ↗</a>` : ''}<a href="#/league/champ">Plan in champ select ↗</a><a href="#/league">Tier list ↗</a></p></div></header>
    ${lgFilters(false)}<div id="lg-champ"><p class="lg-wait">Loading ${lgEsc(c.name)}…</p></div></div>`;
}
function lgPick(icons, label, e, extra = '') {
  return `<div class="lg-pick${e.lowSample ? ' low' : ''}"><span class="lg-pick-icons">${icons}</span><span class="lg-pick-label">${label}${extra}</span><b>${lgPct(e.winRate)}</b><small>${lgPct(e.pickRate)} · ${lgN(e.games)}</small></div>`;
}
const lgBlock = (title, note, body) => `<article class="lg-block"><header><h3>${title}</h3>${note ? `<small>${note}</small>` : ''}</header><div class="lg-block-head" aria-hidden="true"><span></span><span>Win</span><span>Pick · games</span></div>${body || '<p class="lg-wait">No data yet.</p>'}</article>`;
function lgBuildSheet(d, items, runes, spells) {
  const b = d.builds || {}, it = items?.data || {};
  // Runes: tree of the top keystone, its best rune per row; secondary = the other tree with the most games.
  const where = {};
  (runes || []).forEach(tree => tree.slots.forEach((s, slot) => s.runes.forEach(r => { where[r.id] = { tree, slot, r }; })));
  const runeEntry = e => where[e.key] && { ...e, ...where[e.key] };
  const keys = (b.keystone || []).map(runeEntry).filter(Boolean), all = (b.rune || []).map(runeEntry).filter(e => e && e.slot > 0);
  const primary = keys[0]?.tree;
  const trees = {};
  for (const e of all) if (e.tree !== primary) trees[e.tree.id] = (trees[e.tree.id] || 0) + e.games;
  const secId = Number(Object.entries(trees).sort((x, y) => y[1] - x[1])[0]?.[0]);
  const runeIcon = e => lgImg(`${statsApi.DD}/cdn/img/${e.r.icon}`, e.r.name);
  const runePick = e => lgPick(runeIcon(e), lgEsc(e.r.name), e);
  const prim = [1, 2, 3].map(s => all.filter(e => e.tree === primary && e.slot === s).sort((x, y) => y.games - x.games)[0]).filter(Boolean);
  const sec = all.filter(e => e.tree.id === secId).sort((x, y) => y.games - x.games).slice(0, 2);
  // Items: the crawler counts final inventories (no purchase order), so starting items are not measurable (they get
  // sold) and Data Dragon sorts what is left into boots and finished items.
  const item = e => ({ ...e, d: it[e.key] });
  const list = (b.item || []).map(item).filter(e => e.d);
  const tags = e => e.d.tags || [];
  const boots = list.filter(e => tags(e).includes('Boots') && e.d.from);
  const finished = list.filter(e => !(e.d.into || []).length && e.d.from && !tags(e).includes('Boots') && e.d.gold?.total >= 2000).sort((x, y) => y.games - x.games);
  const itemPick = e => lgPick(lgImg(lgDD(`item/${e.key}.png`), e.d.name), lgEsc(e.d.name), e);
  const spellBy = Object.fromEntries(Object.values(spells?.data || {}).map(s => [s.key, s]));
  const spellPick = e => lgPick(e.key.split(',').map(k => lgImg(spellBy[k] ? lgDD(`spell/${spellBy[k].image.full}`) : `assets/spells/${k}.png`, spellBy[k]?.name || k)).join(''), '', e);
  const skillGames = (b.skills || []).reduce((s, e) => s + e.games, 0);
  const skillPick = e => lgPick(`<span class="lg-keys">${e.key.split('').map(k => `<kbd>${k}</kbd>`).join('<i>›</i>')}</span>`, '', e);
  const top = (arr, n, f) => arr.slice(0, n).map(f).join('');
  return `<div class="lg-sheet">
    ${lgBlock('Summoner spells', '', top(b.spells || [], 3, spellPick))}
    ${lgBlock('Skill order', `from ${lgN(skillGames)} timeline-sampled games`, top(b.skills || [], 3, skillPick))}
    ${lgBlock('Keystone', '', top(keys, 3, runePick))}
    ${lgBlock(`Runes${primary ? ` · ${lgEsc(primary.name)}` : ''}${secId ? ` + ${lgEsc(runes.find(t => t.id === secId)?.name || '')}` : ''}`, 'most-picked rune per row', prim.map(runePick).join('') + (sec.length ? `<div class="lg-sep"></div>${sec.map(runePick).join('')}` : ''))}
    ${lgBlock('Boots', '', top(boots, 3, itemPick))}
    ${lgBlock('Core build', 'three most-built finished items', top(finished, 3, itemPick))}
    ${lgBlock('Items 4 · 5 · 6', 'the other finished items, by pick rate (no slot order yet)', finished.slice(3, 9).map(itemPick).join(''))}
  </div>`;
}
function lgMatchups(d) {
  const rows = lgSortRows(d.matchups || [], lg.msort, lg.mdir, r => lgChamp(r.opponent).name);
  const btn = (k, t) => `<button data-lg-msort="${k}" aria-pressed="${lg.msort === k}">${t}${lg.msort === k ? (lg.mdir < 0 ? ' ▾' : ' ▴') : ''}</button>`;
  return `<section class="lg-section"><header class="lg-head"><h2>Matchups</h2><small>${LG_ROLE[lgRoleOf(d.role)] || ''} lane opponent · your win rate against them</small><div class="lg-msort">Sort ${btn('games', 'Games')}${btn('winRate', 'Win rate')}${btn('name', 'Name')}</div></header>
    ${rows.length ? `<div class="lg-matchups">${rows.map(m => `<a class="lg-mu${m.lowSample ? ' low' : ''}" href="#/league/champion/${m.opponent}/${lgRoleOf(d.role)}">${lgIcon(m.opponent)}<span>${lgEsc(lgChamp(m.opponent).name)}</span><b class="${m.winRate >= 0.5 ? 'up' : 'down'}">${lgPct(m.winRate)}</b><small>${lgN(m.games)}</small></a>`).join('')}</div>` : '<p class="lg-wait">No matchups recorded yet.</p>'}</section>`;
}
let lgChampData = null;
async function lgFillChampion(token, id) {
  const box = () => token === lg.token && document.getElementById('lg-champ');
  try {
    const want = lgHashRole();
    const d = await statsApi.champion(id, lgParams(LG_ROLES.includes(want) ? want : ''));
    const [list, items, runes, spells] = await Promise.all([
      statsApi.tiers(lgParams(lgRoleOf(d.role))).catch(() => null), statsApi.items(d.patch).catch(() => null),
      statsApi.runes(d.patch).catch(() => null), statsApi.spells(d.patch).catch(() => null), lgNames(d.patch)]);
    if (!box()) return;
    lgChampData = d;
    const c = lgChamp(id), banded = list ? leagueTierRows(list.champions) : [], me = banded.find(r => r.champion === Number(id));
    const byScore = [...banded].sort((a, b) => b.score - a.score), rank = me ? byScore.indexOf(me) + 1 : 0;
    const roleGames = banded.reduce((s, r) => s + r.games, 0), avg = roleGames ? banded.reduce((s, r) => s + r.wins, 0) / roleGames : 0;
    const s = d.strip || {}, delta = roleGames && s.games ? (s.winRate - avg) * 100 : null, role = lgRoleOf(d.role);
    document.getElementById('lg-champ-name').textContent = c.name;
    document.getElementById('lg-champ-title').textContent = c.title || 'Champion stats';
    if (!s.games) { box().innerHTML = `<p class="lg-wait">No ranked games for ${lgEsc(c.name)} on patch ${lgEsc(d.patch)} with these filters yet.</p>`; return; }
    box().innerHTML = `
      <nav class="lg-tabs" aria-label="Role">${(d.roles || []).map(r => `<button data-lg-crole="${lgRoleOf(r.role)}" aria-pressed="${lgRoleOf(r.role) === role}">${lgRoleIcon(lgRoleOf(r.role))}${LG_ROLE[lgRoleOf(r.role)] || r.role}<small>${lgN(r.games)}</small></button>`).join('')}</nav>
      <dl class="lg-strip${s.lowSample ? ' low' : ''}">
        <div><dt>Win rate</dt><dd>${lgPct(s.winRate)}</dd><dd class="lg-sub">${delta == null ? '' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} vs ${LG_ROLE[role] || ''} avg`}</dd></div>
        <div><dt>Pick rate</dt><dd>${lgPct(s.pickRate)}</dd><dd class="lg-sub">of ${lgN(s.matches)} matches</dd></div>
        <div><dt>Ban rate</dt><dd>${lgPct(s.banRate)}</dd><dd class="lg-sub">of ${lgN(s.matches)} matches</dd></div>
        <div><dt>Games</dt><dd>${lgN(s.games)}</dd><dd class="lg-sub">${s.lowSample ? `under ${lgN(d.minGames)}: low sample` : `${lgN(s.wins)} wins`}</dd></div>
        <div><dt>Rank</dt><dd>${rank ? `${rank} <small>of ${banded.length}</small>` : '–'}</dd><dd class="lg-sub">${LG_ROLE[role] || ''} on ${lgEsc(d.patch)}</dd></div>
        <div><dt>Tier</dt><dd>${me ? lgTier(me.tier, me.lowSample) : '–'}</dd><dd class="lg-sub">${list ? `${lgN(list.matches)} matches` : ''}</dd></div>
      </dl>
      <section class="lg-section"><header class="lg-head"><h2>Build</h2><small>every block: win rate · pick rate · games, out of ${lgN(s.games)} ${LG_ROLE[role] || ''} games</small></header>${lgBuildSheet(d, items?.d, runes?.d, spells?.d)}</section>
      ${lgMatchups(d)}`;
  } catch {
    if (box()) box().innerHTML = lgOffline('the stats crawler did not answer.');
  }
}
