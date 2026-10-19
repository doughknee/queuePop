// DONI-483: the League world leads with stats. Lolalytics' information model (density, ordering, a sample size on
// every number) on the queuePop crawler (js/stats-api.js), in League's own type and tokens (league-stats.css).
// Pages: #/league (The Rift: search, your card, tier list), #/league/tiers, #/league/champion/{id}[/{role}],
// #/league/history. Renderers return markup synchronously and fill the data parts after worlds.js mounts them.
const LG_ROLES = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const LG_ROLE = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };
const LG_KEY = 'queuepop-league-stats-v1';
const lg = { patch: '', region: 'all', bracket: 'all', role: 'all', sort: 'score', dir: -1, msort: 'games', mdir: -1, q: '', token: 0, page: '', names: {}, ddv: '' };
try { const s = JSON.parse(localStorage.getItem(LG_KEY) || '{}'); for (const k of ['region', 'bracket', 'role', 'sort', 'msort']) if (typeof s[k] === 'string') lg[k] = s[k]; for (const k of ['dir', 'mdir']) if (s[k] === 1 || s[k] === -1) lg[k] = s[k]; } catch {}
const lgSave = () => { try { localStorage.setItem(LG_KEY, JSON.stringify({ region: lg.region, bracket: lg.bracket, role: lg.role, sort: lg.sort, dir: lg.dir, msort: lg.msort, mdir: lg.mdir })); } catch {} };

const lgPct = x => x == null ? '–' : (x * 100).toFixed(1) + '%';
const lgN = n => Number(n || 0).toLocaleString();
const lgEsc = s => escapeHtml(s == null ? '' : s);
const lgRoleOf = r => String(r || '').toLowerCase();
const lgDD = path => `${statsApi.DD}/cdn/${lg.ddv}/img/${path}`;
// Names: the app's champion catalog first, Data Dragon's champion.json for anything it lacks (and for aliases/titles).
function lgChamp(id) {
  id = Number(id);
  const c = (typeof catalog !== 'undefined' ? catalog : []).find(x => Number(x.id) === id), d = lg.names[id];
  return { id, name: c?.name || d?.name || `Champion ${id}`, alias: c?.alias || d?.alias || '', title: d?.title || '' };
}
function lgAllChamps() {
  const m = new Map(Object.keys(lg.names).map(k => [Number(k), lgChamp(k)]));
  for (const c of (typeof catalog !== 'undefined' ? catalog : [])) if (c.id > 0 && !m.has(Number(c.id))) m.set(Number(c.id), lgChamp(c.id));
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function lgIcon(id, cls = 'lg-icon') {
  const c = lgChamp(id), dd = c.alias && lg.ddv ? lgDD(`champion/${c.alias}.png`) : '';
  return `<img class="${cls}" src="${champBase}/${c.id}.png" alt="" loading="lazy" onerror="this.onerror=null;${dd ? `this.src='${dd}'` : `this.style.visibility='hidden'`}">`;
}
const lgImg = (src, title = '', cls = 'lg-ico') => `<img class="${cls}" src="${src}" alt="" title="${lgEsc(title)}" loading="lazy" onerror="this.style.visibility='hidden'">`;
const lgRoleIcon = r => LG_ROLE[r] ? `<img class="lg-role-ico" src="assets/positions/${r}.svg" alt="" title="${LG_ROLE[r]}">` : '';
async function lgNames(patch) {
  try { const { v, d } = await statsApi.ddChampions(patch); lg.ddv = v; for (const c of Object.values(d.data || {})) lg.names[Number(c.key)] = { name: c.name, alias: c.id, title: c.title }; } catch {}
}
const lgParams = (role = lg.role) => ({ patch: lg.patch, region: lg.region, bracket: lg.bracket, role });
const lgOffline = what => `<p class="lg-offline">Stats offline · ${what} The rest of the League world still works.</p>`;

// --- Search: champions jump to their page, a Riot ID opens the account page (yours) or OP.GG (anyone else) ---
function lgSearch() {
  return `<div class="lg-search"><label class="lg-visually-hidden" for="lg-search">Search League</label><input id="lg-search" type="search" autocomplete="off" spellcheck="false" placeholder="Search a champion or a Riot ID (name#tag)" value="${lgEsc(lg.q)}" aria-controls="lg-results"><div id="lg-results" class="lg-results" aria-live="polite" ${lg.q ? '' : 'hidden'}>${lg.q ? lgResults(lg.q) : ''}</div></div>`;
}
function lgResults(q) {
  const t = q.trim().toLowerCase();
  if (!t) return '';
  const champs = lgAllChamps().filter(c => c.name.toLowerCase().includes(t) || c.alias.toLowerCase().includes(t))
    .sort((a, b) => a.name.toLowerCase().startsWith(t) === b.name.toLowerCase().startsWith(t) ? 0 : a.name.toLowerCase().startsWith(t) ? -1 : 1).slice(0, 8);
  const s = leagueLive.summoner, mine = s && (`${s.name}#${s.tag}`.toLowerCase().startsWith(t) || s.name.toLowerCase() === t);
  const out = [];
  if (champs.length) out.push(`<div class="lg-hits"><span class="lg-kicker">Champions</span>${champs.map(c => `<a class="lg-hit" href="#/league/champion/${c.id}">${lgIcon(c.id)}<span>${lgEsc(c.name)}</span></a>`).join('')}</div>`);
  if (mine) out.push(`<div class="lg-hits"><span class="lg-kicker">Summoner</span><a class="lg-hit" href="#/league/account">${s.icon ? lgImg(s.icon, '', 'lg-icon') : ''}<span>${lgEsc(s.name)}<small>#${lgEsc(s.tag)} · your account</small></span></a></div>`);
  else if (t.includes('#') || !champs.length) {
    const [name, tag = ''] = q.trim().split('#'), region = s?.region || 'na';
    const url = `https://op.gg/lol/summoners/${encodeURIComponent(region)}/${encodeURIComponent(name)}${tag ? '-' + encodeURIComponent(tag) : ''}`;
    out.push(`<div class="lg-hits"><span class="lg-kicker">Summoner</span><button class="lg-hit" data-lg-ext="${lgEsc(url)}"><span>${lgEsc(q.trim())}<small>${tag ? 'look up on OP.GG ↗' : 'add #tag to look up a Riot ID'}</small></span></button></div>`);
  }
  return out.join('') || '<p class="lg-wait">No match.</p>';
}
function lgOnSearch(input) {
  lg.q = input.value;
  const box = document.getElementById('lg-results');
  box.innerHTML = lgResults(lg.q);
  box.hidden = !lg.q.trim();
  if (!Object.keys(lg.names).length) lgNames(lg.patch).then(() => { if (lg.q === input.value) box.innerHTML = lgResults(lg.q); });
}

// --- Your card: real summoner, ranks, top mastery, last-10 form; the top champion's splash stays as the scene ---
function lgRank(label, r) {
  if (!r) return `<div><dt>${label}</dt><dd>Unranked</dd></div>`;
  const tier = r.tier.charAt(0) + r.tier.slice(1).toLowerCase(), g = r.wins + r.losses;
  return `<div><dt>${label}</dt><dd>${tier} ${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier.toUpperCase()) ? '' : r.division} <small>${r.lp} LP</small></dd><dd class="lg-sub">${r.wins}W ${r.losses}L · ${g ? lgPct(r.wins / g) : '–'} <small>(${g} games)</small></dd></div>`;
}
function lgCard() {
  const s = leagueLive.summoner, top = Object.keys(champions)[0];
  const art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  if (!s) return `<section class="lg-card lg-card-empty" style="--champ-art:${art}"><div class="lg-card-who"><span class="lg-kicker">Your stats</span><h2>Connect League</h2><p>Open the League client and your ranks, mastery and last ten games show up here.</p></div></section>`;
  const mastery = (s.mastery || []).slice(0, 3);
  return `<section class="lg-card" style="--champ-art:${art};--portrait-position:${championWorlds[top]?.position || 'center 20%'}">
    <div class="lg-card-who">${s.icon ? lgImg(s.icon, '', 'lg-avatar') : ''}<div><span class="lg-kicker">Your stats</span><h2>${lgEsc(s.name)}<small>#${lgEsc(s.tag)}</small></h2><p>Level ${lgN(s.level)} · <a href="#/league/account">Account ↗</a></p></div></div>
    <dl class="lg-card-ranks">${lgRank('Ranked solo', s.ranked?.solo)}${lgRank('Ranked flex', s.ranked?.flex)}</dl>
    <div class="lg-card-mastery"><span class="lg-kicker">Top mastery</span>${mastery.map(m => `<a href="#/league/champion/${m.championId}">${lgIcon(m.championId)}<span>${lgEsc(lgChamp(m.championId).name)}<small>M${m.level} · ${lgN(m.points)} pts</small></span></a>`).join('') || '<p class="lg-wait">No mastery yet.</p>'}</div>
    <div class="lg-card-form"><span class="lg-kicker">Last 10</span><div id="lg-form"><p class="lg-wait">Loading your games…</p></div></div>
  </section>`;
}
async function lgFillForm(token) {
  const el = () => token === lg.token && document.getElementById('lg-form');
  const games = await lgHistory(10);
  if (!el()) return;
  if (!games.length) { el().innerHTML = '<p class="lg-wait">No recent games.</p>'; return; }
  const w = games.filter(g => g.win).length, k = games.reduce((s, g) => s + g.kills + g.assists, 0), d = games.reduce((s, g) => s + g.deaths, 0);
  el().innerHTML = `<a class="lg-chips" href="#/league/history" aria-label="${w} wins, ${games.length - w} losses: open match history">${games.map(g => `<b class="${g.win ? 'w' : 'l'}" title="${lgEsc(lgChamp(g.championId).name)} ${g.kills}/${g.deaths}/${g.assists}">${g.win ? 'W' : 'L'}</b>`).join('')}</a><p>${w}W ${games.length - w}L · ${lgPct(w / games.length)} · ${(k / Math.max(1, d)).toFixed(2)} KDA <small>(${games.length} games)</small></p>`;
}
let lgHistCache = { t: 0, n: 0, p: null };
function lgHistory(n) {
  const a = window.pywebview?.api;
  if (!a?.get_match_history) return Promise.resolve([]);
  if (!lgHistCache.p || lgHistCache.n < n || Date.now() - lgHistCache.t > 60000) lgHistCache = { t: Date.now(), n, p: a.get_match_history(n).catch(() => []) };
  return lgHistCache.p.then(g => (g || []).slice(0, n));
}

// --- Filter strip + tier list ---
function lgFilters(withRole = true) {
  const sel = (key, opts) => `<label><span>${{ patch: 'Patch', region: 'Region', bracket: 'Rank' }[key]}</span><select data-lg-filter="${key}">${opts.map(([v, t]) => `<option value="${v}" ${lg[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`;
  return `<div class="lg-filters">${sel('patch', [[lg.patch, lg.patch || 'Newest']])}${sel('region', [['all', 'All regions'], ['na1', 'NA'], ['kr', 'KR']])}${sel('bracket', [['all', 'All ranks'], ['emerald', 'Emerald+'], ['diamond', 'Diamond+']])}
    ${withRole ? `<div class="lg-roles" role="group" aria-label="Role">${['all', ...LG_ROLES].map(r => `<button data-lg-role="${r}" aria-pressed="${lg.role === r}" title="${LG_ROLE[r] || 'All roles'}">${r === 'all' ? 'All' : lgRoleIcon(r)}</button>`).join('')}</div>` : ''}<span class="lg-meta" id="lg-meta"></span></div>`;
}
async function lgFillPatches(token) {
  try {
    const p = await statsApi.patches();
    const sel = token === lg.token && document.querySelector('[data-lg-filter=patch]');
    if (sel) sel.innerHTML = (p.lol || []).map(v => `<option value="${v}" ${(lg.patch || p.lol[0]) === v ? 'selected' : ''}>${v}</option>`).join('');
  } catch {}
}
const LG_COLS = [['score', 'Tier'], ['name', 'Champion'], ['role', 'Role'], ['winRate', 'Win rate'], ['pickRate', 'Pick rate'], ['banRate', 'Ban rate'], ['games', 'Games']];
function lgSortRows(rows, key, dir, name) {
  const v = r => key === 'name' ? name(r) : key === 'role' ? LG_ROLES.indexOf(lgRoleOf(r.role)) : r[key];
  // Tier order keeps low-sample rows below the rest; every other column sorts them in place.
  return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (key === 'score' && a.lowSample !== b.lowSample ? (a.lowSample ? 1 : -1) : 0) || (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || b.games - a.games; });
}
const lgBar = wr => `<i class="lg-bar ${wr >= 0.5 ? 'up' : 'down'}" style="--v:${Math.max(0.04, Math.min(1, Math.abs(wr - 0.5) / 0.1))}"></i>`;
const lgTier = (t, low) => `<b class="lg-tier t-${t}${low ? ' low' : ''}" title="Tier ${t}${low ? ' (low sample)' : ''}">${t}</b>`;
function lgTierTable(data) {
  const rows = lgSortRows(leagueTierRows(data.champions), lg.sort, lg.dir, r => lgChamp(r.champion).name);
  if (!rows.length) return '<p class="lg-wait">No games for these filters yet.</p>';
  const th = ([k, t]) => `<th aria-sort="${lg.sort === k ? (lg.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-lg-sort="${k}">${t}${lg.sort === k ? (lg.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`;
  return `<table class="lg-table lg-tiers"><thead><tr><th class="num">#</th>${LG_COLS.map(th).join('')}</tr></thead><tbody>${rows.map((r, i) => {
    const c = lgChamp(r.champion), role = lgRoleOf(r.role), href = `#/league/champion/${r.champion}/${role}`;
    return `<tr class="${r.lowSample ? 'low' : ''}" data-lg-go="${href}"><td class="num">${i + 1}</td><td>${lgTier(r.tier, r.lowSample)}</td><td class="lg-name"><a href="${href}">${lgIcon(r.champion)}<span>${lgEsc(c.name)}</span></a></td><td>${lgRoleIcon(role)}</td><td class="num">${lgBar(r.winRate)}${lgPct(r.winRate)}</td><td class="num">${lgPct(r.pickRate)}</td><td class="num">${lgPct(r.banRate)}</td><td class="num">${lgN(r.games)}</td></tr>`;
  }).join('')}</tbody></table>`;
}
let lgTierData = null;
async function lgFillTiers(token) {
  const box = () => token === lg.token && document.getElementById('lg-tiers');
  try {
    const [data] = await Promise.all([statsApi.tiers(lgParams()), lgNames(lg.patch)]);
    if (!box()) return;
    lgTierData = data;
    box().innerHTML = lgTierTable(data);
    const low = data.champions.filter(c => c.lowSample).length;
    document.getElementById('lg-meta').innerHTML = `Patch ${lgEsc(data.patch)} · ${lgN(data.matches)} matches · ${data.champions.length} rows${low ? `, ${low} under ${lgN(data.minGames)} games (greyed)` : ''}`;
  } catch {
    if (box()) { box().innerHTML = lgOffline('the stats crawler did not answer.'); document.getElementById('lg-meta').textContent = ''; }
  }
}
const lgTierRule = `<p class="lg-rule">Tier: win rate shrunk toward the list average by 100 games, then 75% win-rate percentile + 25% pick-rate percentile; top 10% S, next 20% A, middle 40% B, next 20% C, last 10% D. Greyed rows are under the crawler's minimum sample.</p>`;
function lgTierSection(title) {
  return `<section class="lg-section"><header class="lg-head"><h2>${title}</h2></header>${lgFilters()}<div id="lg-tiers"><p class="lg-wait">Loading the tier list…</p></div>${lgTierRule}</section>`;
}
function lgMount(page, fill) {
  const token = ++lg.token; lg.page = page;
  queueMicrotask(() => { lgFillPatches(token); fill(token); });
}

function leagueRift() {
  lgMount('', t => { lgFillTiers(t); if (leagueLive.summoner) lgFillForm(t); });
  return `<div class="lg-page">${lgSearch()}${lgCard()}${lgTierSection('Champion tier list')}
    <nav class="lg-links" aria-label="More in League"><a href="#/league/champions">Champions<small>Lore & abilities of your top mastery</small></a><a href="#/league/history">Match history<small>Your recent games</small></a><a href="#/league/champ">Champ select<small>Picks, bans, loadouts</small></a><a href="#/league/dashboard">Dashboard<small>Queue, alerts, activity</small></a></nav></div>`;
}
function leagueTierPage() {
  lgMount('tiers', lgFillTiers);
  return `<div class="lg-page">${lgSearch()}${lgTierSection('Tier list')}</div>`;
}

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

// --- Match history: real recent matches from the bridge, each row expandable ---
function leagueHistoryPage() {
  lgMount('history', lgFillHistory);
  return `<div class="lg-page">${lgSearch()}<section class="lg-section"><header class="lg-head"><h2>Match history</h2><small id="lg-hist-sum"></small></header><div id="lg-history"><p class="lg-wait">Loading your games…</p></div></section></div>`;
}
let lgGames = [];
async function lgFillHistory(token) {
  const box = () => token === lg.token && document.getElementById('lg-history');
  const [games] = await Promise.all([lgHistory(20), lgNames(lg.patch)]);
  if (!box()) return;
  lgGames = games;
  if (!games.length) { box().innerHTML = `<p class="lg-wait">${window.pywebview?.api ? 'No recent games. Open the League client, play one and it shows up here.' : 'Connect League to see your matches.'}</p>`; return; }
  const w = games.filter(g => g.win).length;
  document.getElementById('lg-hist-sum').textContent = `${w}W ${games.length - w}L · ${lgPct(w / games.length)} over your last ${games.length} games`;
  box().innerHTML = games.map((g, i) => {
    const c = lgChamp(g.championId), kda = (g.kills + g.assists) / Math.max(1, g.deaths), ago = fmtAgoShort(g.ts);
    return `<div class="lg-match ${g.win ? 'win' : 'loss'}"><button class="lg-match-row" data-lg-match="${i}" aria-expanded="false" aria-controls="lg-more-${i}"><span class="lg-result">${g.win ? 'Victory' : 'Defeat'}</span>${lgIcon(g.championId)}<span class="lg-match-name">${lgEsc(c.name)}<small>${lgEsc(queueMap[g.queueId] || 'Queue ' + g.queueId)}</small></span><span>${lgRoleIcon(g.position)}</span><span class="lg-kda">${g.kills} / ${g.deaths} / ${g.assists}<small>${kda.toFixed(2)} KDA</small></span><span class="lg-ago">${ago === 'now' ? 'just now' : ago + ' ago'}</span><i aria-hidden="true">▾</i></button><div class="lg-match-more" id="lg-more-${i}" hidden></div></div>`;
  }).join('');
}
async function lgExpandMatch(btn) {
  const open = btn.getAttribute('aria-expanded') !== 'true', more = btn.nextElementSibling, g = lgGames[+btn.dataset.lgMatch];
  btn.setAttribute('aria-expanded', String(open));
  more.hidden = !open;
  if (!open || more.dataset.done || !g) return;
  more.dataset.done = '1';
  const c = lgChamp(g.championId), role = g.position || '', href = `#/league/champion/${g.championId}${role ? '/' + role : ''}`;
  more.innerHTML = `<dl><div><dt>Played</dt><dd>${lgEsc(fmtClock(g.ts))}</dd></div><div><dt>Kills + assists</dt><dd>${g.kills + g.assists}</dd></div><div><dt>Deaths</dt><dd>${g.deaths}</dd></div><div id="lg-meta-${btn.dataset.lgMatch}"><dt>${lgEsc(c.name)} this patch</dt><dd class="lg-wait">Loading…</dd></div></dl><a href="${href}">Open ${lgEsc(c.name)}'s stats ↗</a>`;
  const slot = document.getElementById('lg-meta-' + btn.dataset.lgMatch);
  try {
    const data = await statsApi.tiers(lgParams(LG_ROLES.includes(role) ? role : 'all'));
    const rows = leagueTierRows(data.champions), r = rows.filter(x => x.champion === Number(g.championId)).sort((a, b) => b.games - a.games)[0];
    slot.innerHTML = `<dt>${lgEsc(c.name)} ${LG_ROLE[role] || ''} · ${lgEsc(data.patch)}</dt><dd${r?.lowSample ? ' class="low"' : ''}>${r ? `${lgTier(r.tier, r.lowSample)} ${lgPct(r.winRate)} <small>${lgN(r.games)} games</small>` : 'No crawler games yet'}</dd>`;
  } catch { slot.innerHTML = `<dt>${lgEsc(c.name)} this patch</dt><dd class="lg-wait">Stats offline</dd>`; }
}

// --- Events: one delegated listener each, scoped to the League stats pages ---
function lgRefill() {
  const t = ++lg.token;
  if (lg.page === 'champion') { const id = location.hash.split('/')[3]; lgFillChampion(t, id); } else lgFillTiers(t);
}
document.addEventListener('input', e => { if (e.target.id === 'lg-search') lgOnSearch(e.target); });
document.addEventListener('keydown', e => {
  if (e.target.id !== 'lg-search') return;
  if (e.key === 'Enter') { const first = document.querySelector('#lg-results .lg-hit'); if (first) { e.preventDefault(); first.click(); } }
  if (e.key === 'Escape') { e.target.value = ''; lgOnSearch(e.target); }
});
document.addEventListener('change', e => {
  const f = e.target.dataset?.lgFilter;
  if (!f) return;
  lg[f] = e.target.value; lgSave(); lgRefill();
});
document.addEventListener('click', e => {
  const t = e.target;
  if (t.closest('#lg-results a')) { lg.q = ''; return; }
  const ext = t.closest('[data-lg-ext]');
  if (ext) { const a = window.pywebview?.api; a?.open_external ? a.open_external(ext.dataset.lgExt) : window.open(ext.dataset.lgExt, '_blank', 'noopener'); return; }
  const role = t.closest('[data-lg-role]');
  if (role) { lg.role = role.dataset.lgRole; lgSave(); document.querySelectorAll('[data-lg-role]').forEach(b => b.setAttribute('aria-pressed', String(b === role))); lgRefill(); return; }
  const sort = t.closest('[data-lg-sort]');
  if (sort) { const k = sort.dataset.lgSort; lg.dir = lg.sort === k ? -lg.dir : (k === 'name' || k === 'role' ? 1 : -1); lg.sort = k; lgSave(); if (lgTierData) document.getElementById('lg-tiers').innerHTML = lgTierTable(lgTierData); return; }
  const msort = t.closest('[data-lg-msort]');
  if (msort) { const k = msort.dataset.lgMsort; lg.mdir = lg.msort === k ? -lg.mdir : (k === 'name' ? 1 : -1); lg.msort = k; lgSave(); const sec = msort.closest('.lg-section'); if (lgChampData && sec) sec.outerHTML = lgMatchups(lgChampData); return; }
  const crole = t.closest('[data-lg-crole]');
  if (crole) { const id = location.hash.split('/')[3]; history.replaceState(null, '', `#/league/champion/${id}/${crole.dataset.lgCrole}`); lgRefill(); return; }
  const match = t.closest('[data-lg-match]');
  if (match) { lgExpandMatch(match); return; }
  const row = t.closest('tr[data-lg-go]');
  if (row && !t.closest('a')) location.hash = row.dataset.lgGo.slice(1);
});
