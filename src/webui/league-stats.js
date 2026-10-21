// DONI-483: the League world leads with stats. Lolalytics' information model (density, ordering, a sample size on
// every number) on the queuePop crawler (js/stats-api.js), in League's own type and tokens (league-stats.css).
// Pages: #/league (the tier list under an art band with your one-line card; #/league/tiers redirects here),
// #/league/champion/{id}[/{role}], #/league/history. Renderers return markup synchronously and fill the data parts after worlds.js mounts them.
const LG_ROLES = ['top', 'jungle', 'middle', 'bottom', 'utility'];
const LG_ROLE = { top: 'Top', jungle: 'Jungle', middle: 'Mid', bottom: 'Bot', utility: 'Support' };
const LG_KEY = 'queuepop-league-stats-v1';
const lg = { patch: '', region: 'all', bracket: 'all', days: '', queue: '', modeN: {}, role: 'all', sort: 'score', dir: -1, msort: 'games', mdir: -1, q: '', token: 0, page: '', names: {}, ddv: '' };
try { const s = JSON.parse(localStorage.getItem(LG_KEY) || '{}'); for (const k of ['region', 'bracket', 'days', 'queue', 'role', 'sort', 'msort']) if (typeof s[k] === 'string') lg[k] = s[k]; for (const k of ['dir', 'mdir']) if (s[k] === 1 || s[k] === -1) lg[k] = s[k]; } catch {}
const lgSave = () => { try { localStorage.setItem(LG_KEY, JSON.stringify({ region: lg.region, bracket: lg.bracket, days: lg.days, queue: lg.queue, role: lg.role, sort: lg.sort, dir: lg.dir, msort: lg.msort, mdir: lg.mdir })); } catch {} };

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
  return `<img class="${cls}" src="${champBase}/${c.id}.png" alt="" loading="lazy" ${dd ? `data-fb-src="${dd}"` : ''} data-fb="hide">`;
}
const lgImg = (src, title = '', cls = 'lg-ico') => `<img class="${cls}" src="${src}" alt="" title="${lgEsc(title)}" loading="lazy" data-fb="hide">`;
// Position icons are downloaded assets (gitignored); a missing file falls back to the text label.
const lgRoleIcon = r => LG_ROLE[r] ? `<img class="lg-role-ico" src="assets/positions/${r}.svg" alt="${LG_ROLE[r]}" title="${LG_ROLE[r]}" data-fb-class="lg-role-txt" data-fb-text="@title">` : '';
async function lgNames(patch) {
  try { const { v, d } = await statsApi.ddChampions(patch); lg.ddv = v; for (const c of Object.values(d.data || {})) lg.names[Number(c.key)] = { name: c.name, alias: c.id, title: c.title }; } catch {}
}
// DONI-596: League modes, [lg.queue, tab label, crawler queue id]; the crawler's /patches counts each under the same key ('' = lol).
const LG_MODES = [['', 'Ranked Solo', '420'], ['flex', 'Flex', '440'], ['aram', 'ARAM', '450'], ['normal', 'Normal', '400'], ['swift', 'Swiftplay', '480']];
const LG_MODE_OF = { 440: 'flex', 450: 'aram', 400: 'normal', 480: 'swift', 490: 'swift' }; // a game's queueId -> mode ('' = solo)
const lgMode = (q = lg.queue) => LG_MODES.find(m => m[0] === q) || LG_MODES[0];
const lgParams = (role = lg.role, q = lg.queue) => ({ patch: lg.patch, region: lg.region, bracket: lg.bracket, days: lg.days, queue: lgMode(q)[2], role: q === 'aram' ? '' : role });
// A failed fetch says the crawler is offline; anything else is a bug on the page and says so (and logs the stack).
const lgBroke = (where, e) => { console.error(where, e); return '<p class="lg-offline">Something broke on this page. The stats crawler answered; reload with Ctrl+R, and if it stays, the log has the details.</p>'; };
const lgFail = (where, e, what = 'the stats crawler did not answer.') => e?.fetch ? lgOffline(what) : lgBroke(where, e);
const lgOffline = what => `<p class="lg-offline">Stats offline · ${what} Check its address in <a href="#/settings#crawler">Settings ↗</a>. The rest of the League world still works.</p>`;

// --- Search: champions jump to their page, a Riot ID opens your account page or anyone's summoner page (league-players.js) ---
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
    const [name, tag = ''] = q.trim().split('#'), region = lg.region !== 'all' ? lgRegionCode(lg.region) : lgMyPlatform();
    out.push(`<div class="lg-hits"><span class="lg-kicker">Summoner</span>${tag ? `<a class="lg-hit" href="#/league/summoner/${lgRiotSlug(name + '#' + tag)}/${region}"><span>${lgEsc(q.trim())}<small>open their page · ${region.toUpperCase()}</small></span></a>` : `<span class="lg-hit"><span>${lgEsc(q.trim())}<small>add #tag to look up a Riot ID</small></span></span>`}</div>`);
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

// --- You, in one line inside the art band: name, both ranks, top mastery (links to their stats), last-10 form ---
function lgYouRank(label, r) {
  if (!r) return `<span class="lg-you-rank"><small>${label}</small> Unranked</span>`;
  const tier = r.tier.charAt(0) + r.tier.slice(1).toLowerCase(), g = r.wins + r.losses, apex = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(r.tier.toUpperCase());
  return `<span class="lg-you-rank" title="${r.wins}W ${r.losses}L"><small>${label}</small> ${tier}${apex ? '' : ' ' + r.division} <small>${lgN(r.lp)} LP</small> ${g ? lgHeat(r.wins / g, 0.5, 0.1, g, lgPct(r.wins / g)) : ''} <small>${g} games</small></span>`;
}
function lgYou() {
  const s = leagueLive.summoner;
  if (!s) return `<p class="lg-you lg-wait">Open the League client and your ranks, top mastery and last ten games show up here.</p>`;
  return `<div class="lg-you">${s.icon ? lgImg(s.icon, '', 'lg-avatar') : ''}<a class="lg-you-name" href="#/league/account">${lgEsc(s.name)}<small>#${lgEsc(s.tag)}</small></a>
    ${lgYouRank('Solo', s.ranked?.solo)}${lgYouRank('Flex', s.ranked?.flex)}
    <span class="lg-you-mastery"><small>Top mastery</small>${(s.mastery || []).slice(0, 3).map(m => `<a href="#/league/champion/${m.championId}" title="${lgEsc(lgChamp(m.championId).name)} · M${m.level} · ${lgN(m.points)} pts">${lgIcon(m.championId)}</a>`).join('') || ' none yet'}</span>
    <span class="lg-you-form" id="lg-form"><small>Last 10</small> loading…</span></div>`;
}
async function lgFillForm(token) {
  const el = () => token === lg.token && document.getElementById('lg-form');
  const games = await lgHistory(10);
  if (!el()) return;
  if (!games.length) { el().innerHTML = '<small>Last 10</small> no recent games'; return; }
  const w = games.filter(g => g.win).length, k = games.reduce((s, g) => s + g.kills + g.assists, 0), d = games.reduce((s, g) => s + g.deaths, 0);
  el().innerHTML = `<small>Last 10</small><a class="lg-chips" href="#/league/history" aria-label="${w} wins, ${games.length - w} losses: open match history">${games.map(g => `<b class="${g.win ? 'w' : 'l'}" title="${lgEsc(lgChamp(g.championId).name)} ${g.kills}/${g.deaths}/${g.assists}"></b>`).join('')}</a>${w}W ${games.length - w}L <small>${(k / Math.max(1, d)).toFixed(2)} KDA</small>`;
}
let lgHistCache = { t: 0, n: 0, p: null };
function lgHistory(n) {
  const a = window.pywebview?.api;
  if (!a?.get_match_history) return Promise.resolve([]);
  if (!lgHistCache.p || lgHistCache.n < n || Date.now() - lgHistCache.t > 60000) lgHistCache = { t: Date.now(), n, p: a.get_match_history(n).catch(() => []) };
  return lgHistCache.p.then(g => (g || []).slice(0, n));
}

// --- Filter strip + tier list (DONI-506: Lolalytics' columns and filters) ---
const LG_TKEY = 'queuepop-league-tiers-v1';
const lgt = { minLane: 5, minPick: 0, minGames: 200, regions: [] }; // min lane % and min pick % in percent
try { const s = JSON.parse(localStorage.getItem(LG_TKEY) || '{}'); for (const k of ['minLane', 'minPick', 'minGames']) if (Number.isFinite(s[k]) && s[k] >= 0) lgt[k] = s[k]; if (Array.isArray(s.regions)) lgt.regions = s.regions.filter(r => typeof r === 'string'); } catch {}
const lgtSave = () => { try { localStorage.setItem(LG_TKEY, JSON.stringify(lgt)); } catch {} };
// DONI-513: the crawler's daily snapshots let the tier list and champion strip read the last N days of the patch.
const LG_WINDOWS = [['', 'Whole patch'], ['7', 'Last 7 days'], ['3', 'Last 3 days'], ['1', 'Today']];
// A win-rate sparkline over the window's days (crawler ?trend=1 daily[]), green when the last day beats the first.
function lgSpark(daily) {
  const d = (daily || []).filter(x => x.games > 0 && x.winRate != null);
  if (d.length < 2) return '';
  const v = d.map(x => x.winRate), lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 0.01, w = 34, h = 11;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - (x - lo) / span * h).toFixed(1)}`).join(' ');
  const up = v[v.length - 1] >= v[0];
  return `<svg class="lg-spark ${up ? 'up' : 'down'}" viewBox="-1 -1 ${w + 2} ${h + 2}" width="${w}" height="${h}" aria-label="Win rate ${lgPct(v[0])} to ${lgPct(v[v.length - 1])} over ${d.length} days"><title>${d.map(x => `${x.day}: ${lgPct(x.winRate)} (${lgN(x.games)})`).join('\n')}</title><polyline points="${pts}"/></svg>`;
}
const LG_BRACKETS = [['all', 'All ranks'], ['emerald', 'Emerald+'], ['diamond', 'Diamond+'], ['master', 'Master+'], ['grandmaster', 'Grandmaster+'], ['challenger', 'Challenger']];
// Regions come from the crawler (/lol/tiers regions[], remembered between sessions); the current pick always stays listed.
const lgRegionOpts = () => [['all', 'All regions'], ...[...new Set([...lgt.regions, ...(lg.region !== 'all' ? [lg.region] : [])])].map(r => [r, r.replace(/\d+$/, '').toUpperCase()])];
// DONI-565/596: Ranked Solo, Flex, ARAM, Normal, Swiftplay. ARAM has no lanes, so the page drops lane tabs and the lane column (.lg-aram).
// DONI-595: a mode's tab shows whenever it has data (or is picked); a thin sample (< 1,000 games) says so on the tab instead of hiding it.
// Game mode: one dropdown (the tabs took a third of the filter row and wrapped it). A thin mode says its game count.
const lgQueueTabs = () => {
  const modes = LG_MODES.filter(([v]) => !v || lg.modeN[v] > 0 || lg.queue === v);
  return modes.length > 1 ? `<select class="lg-mode" data-lg-mode aria-label="Game mode" title="Game mode">${modes.map(([v, t]) => { const n = lg.modeN[v] || 0, thin = v && n < 1000; return `<option value="${v}"${lg.queue === v ? ' selected' : ''}>${t}${thin ? ` · ${lgN(n)}` : ''}</option>`; }).join('')}</select>` : '';
};
document.addEventListener('change', e => {
  const m = e.target.closest?.('[data-lg-mode]'); if (!m) return;
  lg.queue = m.value; lgSave(); document.querySelector('.lg-page')?.classList.toggle('lg-aram', lg.queue === 'aram'); lgRefill();
});
function lgFilters(withRole = true, lead = '', nums = withRole) {
  const sel = (key, opts) => `<select data-lg-filter="${key}" aria-label="${{ patch: 'Patch', region: 'Region', bracket: 'Rank', days: 'Window' }[key]}">${opts.map(([v, t]) => `<option value="${v}" ${lg[key] === v ? 'selected' : ''}>${t}</option>`).join('')}</select>`;
  const num = (key, label, unit, step, max, title) => `<label class="lg-num" title="${title}"><span>${label}</span><input type="number" inputmode="decimal" min="0" max="${max}" step="${step}" value="${lgt[key]}" data-lg-num="${key}">${unit}</label>`;
  return `<div class="lg-filters"><span id="lg-queues">${lgQueueTabs()}</span>${withRole ? `<div class="lg-roles lg-lanes" role="group" aria-label="Lane">${['all', ...LG_ROLES].map(r => `<button data-lg-role="${r}" aria-pressed="${lg.role === r}" title="${LG_ROLE[r] || 'All lanes'}">${r === 'all' ? 'All' : lgRoleIcon(r)}</button>`).join('')}</div>` : lead}
    ${sel('patch', [[lg.patch, lg.patch ? 'Patch ' + lg.patch : 'Newest patch']])}${sel('region', lgRegionOpts())}${sel('bracket', LG_BRACKETS)}${sel('days', LG_WINDOWS)}
    ${nums ? `<details class="lg-thresh"><summary title="Lane ${lgt.minLane}% · pick ${lgt.minPick}% · ${lgN(lgt.minGames)} games">Thresholds</summary><div class="lg-thresh-panel">${num('minLane', 'Lane', '%', 1, 100, 'Hide champions under this share of their games in the lane')}${num('minPick', 'Pick', '%', 0.1, 100, 'Hide champions under this pick rate')}${num('minGames', 'Games', '', 50, 100000, 'Rows under this many games stay listed, greyed and without a tier')}</div></details>` : ''}${lgLegend()}</div>`;
}
async function lgFillPatches(token) {
  try {
    const p = await statsApi.patches(), def = p.default?.lol || (p.lol || [])[0];
    const sel = token === lg.token && document.querySelector('[data-lg-filter=patch]');
    if (sel) sel.innerHTML = (p.lol || []).map(v => `<option value="${v}" ${(lg.patch || def) === v ? 'selected' : ''}>Patch ${v}</option>`).join('');
    lg.modeN = Object.fromEntries(LG_MODES.slice(1).map(([v]) => [v, Math.max(0, ...Object.values(p.counts?.[v] || {}))]));
    const q = token === lg.token && document.getElementById('lg-queues');
    if (q) q.innerHTML = lgQueueTabs();
  } catch {}
}
// [sort key, header, title]; keys starting "best." read r.best.*
const LG_COLS = [['score', 'Tier', 'S+ to D-: the rule is under the table'], ['name', 'Champion', ''], ['laneShare', 'Lane', "Share of this champion's games played in this lane"],
  ['winRate', 'Win', ''], ['delta', 'Δ', 'Win rate minus the average win rate for these filters, in points'], ['pickRate', 'Pick', ''], ['banRate', 'Ban', ''],
  ['pbi', 'PBI', 'Pick-ban influence: Δ × ban rate ÷ (1 − pick rate). High = banning it takes away a lot of win rate'], ['games', 'Games', 'Sample size'],
  ['best.winRate', 'Win', 'Pooled win rate of players with 20+ games on the champion'], ['best.games', 'Games', 'Their games · how many players'], ['best.avgTier', 'Rank', 'Their average rank']];
// Used by the champion page's matchups.
function lgSortRows(rows, key, dir, name) {
  const v = r => key === 'name' ? name(r) : key === 'role' ? LG_ROLES.indexOf(lgRoleOf(r.role)) : r[key];
  // Tier order keeps low-sample rows below the rest; every other column sorts them in place.
  return [...rows].sort((a, b) => { const x = v(a), y = v(b); return (a.lowSample !== b.lowSample ? (a.lowSample ? 1 : -1) : 0) || (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || b.games - a.games; });
}
const lgVal = (r, k) => k === 'name' ? lgChamp(r.champion).name : k.startsWith('best.') ? r.best?.[k.slice(5)] : r[k];
function lgTierSort(rows) {
  const k = lg.sort, d = lg.dir, cmp = (x, y) => (typeof x === 'string' ? x.localeCompare(y) : x - y) * d;
  // Low-sample rows (not tiered), then rows without the value, stay below the rest whatever the column.
  return [...rows].sort((a, b) => {
    const x = lgVal(a, k), y = lgVal(b, k);
    return (a.lowSample - b.lowSample) || ((x == null) - (y == null)) || (x == null ? 0 : cmp(x, y)) || b.games - a.games;
  });
}
const LG_TIER_SHORT = ['I', 'B', 'S', 'G', 'P', 'E', 'D', 'M', 'GM', 'C'];
// best.avgTier is a tier index (Iron 0 .. Challenger 9) plus the division (IV 0, III .25, II .5, I .75): 6.5 -> D2.
const lgRankLabel = n => n == null ? '–' : n >= 7 ? LG_TIER_SHORT[Math.min(9, Math.floor(n))] : `${LG_TIER_SHORT[Math.floor(n)]}${4 - Math.floor((n % 1) * 4 + 1e-9)}`;
// DONI-516 / DONI-528: value color. A number is tinted green (above the centre) or red (below) by how far it sits from the
// centre, 1 = the column's 90th-percentile distance over full-sample rows, times its sample weight: 20 games 0.15, 2,000 games 1 (log scale).
const lgSpread = (rows, get, c) => { const d = rows.filter(r => !r.lowSample).map(get).filter(x => x != null).map(x => Math.abs(x - c)).sort((a, b) => a - b); return d[Math.floor(d.length * 0.9)] || 1; };
const lgMean = (rows, k) => { let n = 0, s = 0; for (const r of rows) if (r[k] != null) { n += r.games; s += r[k] * r.games; } return n ? s / n : null; };
function lgHeat(x, c, spread, games, text) {
  if (x == null) return '–';
  const w = 0.15 + 0.85 * Math.min(1, Math.max(0, Math.log(games / 20) / Math.log(100))), k = c == null ? 0 : Math.min(1, Math.abs(x - c) / spread) * w; // linear: the 90th-percentile distance is the full colour
  return `<span class="lg-v ${x >= c ? 'vg' : 'vb'}" style="--k:${k.toFixed(2)}">${text}</span>`;
}
const lgLegend = (what = 'average') => `<span class="lg-legend" title="Cells tint red below and green above the ${what}, purple for a bigger pick or ban; fainter on smaller samples (20 games faint, 2,000 full)"><i aria-hidden="true"></i>worse · better than ${what}</span>`;
// Pick and ban are magnitudes, not good or bad: tinted purple by size, 1 = the list's 90th percentile.
const lgMag = (x, p90, text) => x == null ? '–' : `<span class="lg-v vn" style="--k:${Math.sqrt(Math.min(1, x / (p90 || 1))).toFixed(2)}">${text}</span>`;
const lgTier = (t, low) => t ? `<b class="lg-tier t-${t[0]}" title="Tier ${t}">${t}</b>` : `<span class="lg-tier-none" title="${low ? 'Low sample: not tiered' : 'No tier'}">–</span>`;
const lgSign = (x, d = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}`;
function lgTierTable(data) {
  const banded = leagueTierRows(data.champions);
  const shown = banded.filter(r => (r.laneShare == null || r.laneShare * 100 >= lgt.minLane) && r.pickRate * 100 >= lgt.minPick);
  const rows = lgTierSort(shown), hidden = banded.length - shown.length;
  const note = hidden ? `<p class="lg-wait">${hidden} more under the lane and pick filters.</p>` : '';
  if (!rows.length) return note || '<p class="lg-wait">No games for these filters yet.</p>';
  const avg = data.avgWinRate || lgMean(rows, 'winRate'), sp = k => lgSpread(rows, r => lgVal(r, k), k === 'delta' || k === 'pbi' ? 0 : avg);
  const S = { win: sp('winRate'), delta: sp('delta'), pbi: sp('pbi'), best: sp('best.winRate'), pick: sp('pickRate'), ban: sp('banRate') };
  const th = ([k, t, title], i) => `<th class="${i > 1 ? 'num' : ''}${i === 9 ? ' lg-best-first' : ''}" aria-sort="${lg.sort === k ? (lg.dir < 0 ? 'descending' : 'ascending') : 'none'}"${title ? ` title="${lgEsc(title)}"` : ''}><button data-lg-sort="${k}">${t}${lg.sort === k ? (lg.dir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`;
  return `<table class="lg-table lg-tiers"><thead><tr class="lg-group"><th colspan="10"></th><th colspan="3" class="lg-best-first" title="Players with 20+ games on the champion this patch, any lane">Best on champion</th></tr>
    <tr><th class="num">#</th>${LG_COLS.map(th).join('')}</tr></thead><tbody>${rows.map((r, i) => {
    const c = lgChamp(r.champion), role = lgRoleOf(r.role), href = `#/league/champion/${r.champion}/${role}`, b = r.best;
    return `<tr class="${r.lowSample ? 'low' : ''}" data-lg-go="${href}"><td class="num">${i + 1}</td><td>${lgTier(r.tier, r.lowSample)}</td>
      <td class="lg-name"><a href="${href}">${lgIcon(r.champion)}<span>${lgEsc(c.name)}</span>${lg.role === 'all' ? lgRoleIcon(role) : ''}${lgSpark(r.daily)}</a></td>
      <td class="num">${r.laneShare == null ? '–' : lgPct(r.laneShare)}</td><td class="num">${lgHeat(r.winRate, avg, S.win, r.games, lgPct(r.winRate))}</td><td class="num">${lgHeat(r.delta, 0, S.delta, r.games, lgSign(r.delta * 100))}</td>
      <td class="num">${lgMag(r.pickRate, S.pick, lgPct(r.pickRate))}</td><td class="num">${lgMag(r.banRate, S.ban, lgPct(r.banRate))}</td><td class="num">${lgHeat(r.pbi, 0, S.pbi, r.games, r.pbi == null ? '' : lgSign(r.pbi, 2))}</td><td class="num">${lgN(r.games)}</td>
      <td class="num lg-best-first">${b ? lgHeat(b.winRate, avg, S.best, b.games, lgPct(b.winRate)) : '–'}</td><td class="num">${b ? `${lgN(b.games)}<small> · ${b.players}p</small>` : '–'}</td><td class="num" title="${b?.avgTier ?? ''}">${b ? lgRankLabel(b.avgTier) : '–'}</td></tr>`;
  }).join('')}</tbody></table>${note}`;
}
let lgTierData = null;
async function lgFillTiers(token, retried = false) {
  const box = () => token === lg.token && document.getElementById('lg-tiers');
  let data;
  try {
    // DONI-515: Data Dragon names are a nicety (rows fall back to ids); only the crawler decides "offline", and it gets one retry.
    [data] = await Promise.all([statsApi.tiers({ ...lgParams(), min_games: String(lgt.minGames), trend: '1' }), lgNames(lg.patch).catch(() => null)]);
  } catch (e) {
    if (!retried) { await new Promise(r => setTimeout(r, 2000)); return lgFillTiers(token, true); }
    if (box()) { box().innerHTML = lgOffline('the stats crawler did not answer.'); document.getElementById('lg-meta').textContent = 'Stats offline'; }
    return;
  }
  try {
    if (!box()) return;
    lgTierData = data;
    if (Array.isArray(data.regions) && data.regions.join() !== lgt.regions.join()) {
      lgt.regions = data.regions; lgtSave();
      const sel = document.querySelector('[data-lg-filter=region]');
      if (sel) sel.innerHTML = lgRegionOpts().map(([v, t]) => `<option value="${v}" ${lg.region === v ? 'selected' : ''}>${t}</option>`).join('');
    }
    box().innerHTML = lgTierTable(data);
    const low = data.champions.filter(c => c.lowSample).length;
    document.getElementById('lg-meta').innerHTML = `${lg.queue ? lgMode()[1] : LG_ROLE[lg.role] || 'All lanes'} · ${lgN(data.matches)} matches${data.avgWinRate ? ` · average ${lgPct(data.avgWinRate)}` : ''}${low ? ` · under ${lgN(data.minGames)} games greyed` : ''}`;
  } catch (e) {
    console.error('tier list render failed', e);
    if (box()) box().innerHTML = '<p class="lg-offline">The tier list could not be drawn from this answer. Change a filter to try again.</p>';
  }
}
// Min lane % / min pick % re-filter the loaded rows; min games is the crawler's low-sample line, so it refetches.
document.addEventListener('change', e => {
  const k = e.target.dataset?.lgNum;
  if (!k) return;
  const v = Number(e.target.value);
  if (e.target.value === '' || !(v >= 0)) { e.target.value = lgt[k]; return; }
  lgt[k] = v; lgtSave();
  if (k === 'minGames') lgFillTiers(++lg.token); else if (lgTierData) document.getElementById('lg-tiers').innerHTML = lgTierTable(lgTierData);
});
const lgTierRule = `<details class="lg-rule"><summary>How tiers and colours work</summary><p>Win, Δ and PBI cells tint red below and green above the average win rate (Win) or zero (Δ, PBI); pick and ban tint purple by size; all fainter on smaller samples (20 games faint, 2,000 full).</p><p>Tier: win rate shrunk toward the list average by 100 games (55%), PBI (20%), and the win rate (15%) and average rank (10%) of players with 20+ games on the champion, each as a percentile of the list; top 10% S, next 20% A, middle 40% B, next 20% C, last 10% D, each split into +, plain and −; badges run green (S), blue (A), grey (B), amber (C), red (D). Greyed rows are under the games line: shown, never tiered. Lane = share of the champion's games in this lane; Δ = win rate minus the average for these filters; PBI = Δ × ban rate ÷ (1 − pick rate). Best on champion = players with 20+ games on it this patch.</p></details>`;
// The art band: the League world's frame (champion art, lime hairline, Anton title) around the page's own numbers.
const lgBand = (art, pos, inner, cls = '') => `<header class="lg-band${cls}" style="--champ-art:${art};--portrait-position:${pos}">${inner}</header>`;
function lgMount(page, fill) {
  const token = ++lg.token; lg.page = page;
  queueMicrotask(() => { lgFillPatches(token); fill(token); });
}

function leagueRift() {
  lgMount('', t => { lgFillTiers(t); if (leagueLive.summoner) lgFillForm(t); });
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  return `<div class="lg-page${lg.queue === 'aram' ? ' lg-aram' : ''}">${lgBand(art, championWorlds[top]?.position || 'center 20%', `<div class="lg-band-row"><h1>Tier list</h1><span class="lg-meta" id="lg-meta"></span>${lgSearch()}</div>${lgYou()}`)}
    ${lgFilters()}<div id="lg-tiers"><p class="lg-wait">Loading the tier list…</p><div class="qp-skel" aria-hidden="true">${'<i></i>'.repeat(12)}</div></div>${lgTierRule}</div>`;
}

// --- Match history: real recent matches from the bridge, each row expandable ---
function leagueHistoryPage() {
  lgMount('history', lgFillHistory);
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  return `<div class="lg-page">${lgBand(art, championWorlds[top]?.position || 'center 20%', `<div class="lg-band-row"><h1>Match history</h1><span class="lg-meta" id="lg-hist-sum"></span>${lgSearch()}</div>`)}<div id="lg-history"><p class="lg-wait">Loading your games…</p></div></div>`;
}
let lgGames = [];
async function lgFillHistory(token) {
  const box = () => token === lg.token && document.getElementById('lg-history');
  // DONI-349 (W): the host's draft recaps (what queuePop suggested at your lock, and the result), keyed by game.
  const [games, , recaps] = await Promise.all([lgHistory(20), lgNames(lg.patch), Promise.resolve(window.pywebview?.api?.get_draft_recaps?.()).catch(() => null)]);
  const recapBy = new Map(((recaps && recaps.rows) || []).filter(r => r.gameId).map(r => [Number(r.gameId), r]));
  if (!box()) return;
  lgGames = games;
  if (!games.length) { box().innerHTML = `<p class="lg-wait">${window.pywebview?.api ? 'No recent games. Open the League client, play one and it shows up here.' : 'Connect League to see your matches.'}</p>`; return; }
  const w = games.filter(g => g.win).length;
  const rec = recaps?.record, rs = b => b && b.games ? `${b.wins}W ${b.games - b.wins}L` : '';
  document.getElementById('lg-hist-sum').textContent = `${w}W ${games.length - w}L · ${lgPct(w / games.length)} over your last ${games.length === 1 ? 'game' : games.length + ' games'}`
    + (rec && (rec.followed.games || rec.ignored.games) ? ` · following queuePop's pick ${rs(rec.followed) || '0 games'}, ignoring it ${rs(rec.ignored) || '0 games'}` : '');
  box().innerHTML = lgHistChamps(games) + games.map((g, i) => {
    const c = lgChamp(g.championId), kda = (g.kills + g.assists) / Math.max(1, g.deaths), ago = fmtAgoShort(g.ts), go = `data-lg-goto="#/league/champion/${g.championId}${g.position ? '/' + g.position : ''}" title="Open ${lgEsc(c.name)}'s stats"`;
    return `<div class="lg-match ${g.win ? 'win' : 'loss'}"><button class="lg-match-row" data-lg-match="${i}" aria-expanded="false" aria-controls="lg-more-${i}"><span class="lg-result">${g.win ? 'Victory' : 'Defeat'}</span>${lgIcon(g.championId).replace('<img', `<img ${go}`)}<span class="lg-match-name" ${go}>${lgEsc(c.name)}<small>${lgEsc(queueMap[g.queueId] || 'Other mode')}${(r => r && r.suggested ? ` · ${r.followed ? 'took the suggestion' : 'suggested ' + lgEsc(r.suggested)}` : '')(recapBy.get(Number(g.gameId)))}</small></span><span class="lg-hist-build" data-hist="${g.gameId}"></span><span>${lgRoleIcon(g.position)}</span><span class="lg-kda">${g.kills} / ${g.deaths} / ${g.assists}<small>${kda.toFixed(2)} KDA</small></span><span class="lg-ago">${ago === 'now' ? 'just now' : ago + ' ago'}</span><i aria-hidden="true">▾</i></button><div class="lg-match-more" id="lg-more-${i}" hidden></div></div>`;
  }).join('');
  lgFillHistoryBuilds(token);
}
// Your champions over these games (window.lgChampSplit, js/stats-api.js), most played first; each opens its page.
function lgHistChamps(games) {
  const top = lgChampSplit(games).slice(0, 5);
  if (top.length < 2) return '';
  return `<div class="lg-hist-champs" aria-label="Your champions">${top.map(r => `<a href="#/league/champion/${r.championId}${r.position ? '/' + r.position : ''}">${lgIcon(r.championId)}<span><b>${lgEsc(lgChamp(r.championId).name)}</b><small>${r.games} ${r.games === 1 ? 'game' : 'games'} · <em class="${r.winRate >= 0.5 ? 'up' : 'down'}">${lgPct(r.winRate)}</em></small><small>${r.kda.toFixed(1)} KDA</small></span></a>`).join('')}</div>`;
}
// The history rows' middle: items, CS/min and length from the crawler's cached lookup of your own account (/lol/summoner,
// 10 min cache, one of its few lookups a minute); rows it doesn't hold stay as they are.
async function lgFillHistoryBuilds(token) {
  for (let i = 0; i < 30 && !leagueLive.summoner?.name && token === lg.token; i++) await new Promise(r => setTimeout(r, 500)); // the client connects after launch
  const s = leagueLive.summoner;
  if (!s?.name || !window.statsApi?.summoner || token !== lg.token) return;
  let d;
  try { d = await statsApi.summoner(`${s.name}#${s.tag}`, lgMyPlatform()); } catch { return; }
  if (token !== lg.token) return;
  const remakes = new Set();
  for (const m of d.matches || []) {
    const el = document.querySelector(`[data-hist="${String(m.id).split('_')[1]}"]`);
    if (!el) continue;
    const min = m.duration ? m.duration / 60 : 0;
    // A game under 5 minutes is a remake: it says so and leaves the win/loss line.
    if (m.duration && m.duration < 300) { const row = el.closest('.lg-match'); row.classList.remove('win', 'loss'); row.classList.add('remake'); row.querySelector('.lg-result').textContent = 'Remake'; remakes.add(String(m.id).split('_')[1]); }
    el.innerHTML = `<span class="lg-hist-items">${(m.items || []).filter(Boolean).map(i => lgImg(lgDD(`item/${i}.png`), '', 'lg-ico')).join('')}</span>`
      + `<small>${m.cs != null && min ? `${m.cs}&nbsp;CS · ${(m.cs / min).toFixed(1)}/m<br>` : ''}${min ? Math.round(min) + '&nbsp;min' : ''}</small>`;
  }
  if (remakes.size) {
    const real = lgGames.filter(g => !remakes.has(String(g.gameId))), w = real.filter(g => g.win).length, sum = document.getElementById('lg-hist-sum');
    if (sum && real.length) sum.textContent = sum.textContent.replace(/^\d+W \d+L · [\d.]+% over your last \d+ games?/, `${w}W ${real.length - w}L · ${lgPct(w / real.length)} over your last ${real.length} games (${remakes.size} ${remakes.size === 1 ? 'remake' : 'remakes'} left out)`);
  }
}
async function lgExpandMatch(btn) {
  const open = btn.getAttribute('aria-expanded') !== 'true', more = btn.nextElementSibling, g = lgGames[+btn.dataset.lgMatch];
  btn.setAttribute('aria-expanded', String(open));
  more.hidden = !open;
  if (!open || more.dataset.done || !g) return;
  more.dataset.done = '1';
  const c = lgChamp(g.championId), role = g.position || '', href = `#/league/champion/${g.championId}${role ? '/' + role : ''}`;
  more.innerHTML = `<dl><div><dt>Played</dt><dd>${lgEsc(fmtClock(g.ts))}</dd></div><div id="lg-meta-${btn.dataset.lgMatch}"><dt>${lgEsc(c.name)} this patch</dt><dd class="lg-wait">Loading…</dd></div></dl><a href="${href}">Open ${lgEsc(c.name)}'s stats ↗</a>${g.gameId ? ` <a href="#/league/match/${lgMatchId(g.gameId)}">Open the full match ↗</a><div class="lg-peek" id="lg-peek-${btn.dataset.lgMatch}"><p class="lg-wait">Reading the match…</p></div>` : ''}`;
  const slot = document.getElementById('lg-meta-' + btn.dataset.lgMatch);
  if (g.gameId) lgPeekMatch(document.getElementById('lg-peek-' + btn.dataset.lgMatch), lgMatchId(g.gameId));
  try {
    // review #122: the game's own queue decides which mode's numbers, not the tier list's toggle (unknown queues read solo)
    const data = await statsApi.tiers(lgParams(LG_ROLES.includes(role) ? role : 'all', LG_MODE_OF[g.queueId] || ''));
    const rows = leagueTierRows(data.champions), r = rows.filter(x => x.champion === Number(g.championId)).sort((a, b) => b.games - a.games)[0];
    slot.innerHTML = `<dt>${lgEsc(c.name)} ${LG_ROLE[role] || ''} · ${lgEsc(data.patch)}${[lg.region !== 'all' ? lg.region.replace(/\d+$/, '').toUpperCase() : '', lg.bracket !== 'all' ? (LG_BRACKETS.find(b => b[0] === lg.bracket) || [])[1] : '', lg.days ? (LG_WINDOWS.find(w => w[0] === lg.days) || [])[1] : ''].filter(Boolean).map(x => ' · ' + lgEsc(x)).join('')}</dt><dd${r?.lowSample ? ' class="low"' : ''}>${r ? `${lgTier(r.tier, r.lowSample)} ${lgPct(r.winRate)} <small>${lgN(r.games)} games</small>` : 'No crawler games yet'}</dd>`;
  } catch { slot.innerHTML = `<dt>${lgEsc(c.name)} this patch</dt><dd class="lg-wait">Stats offline</dd>`; }
}

// Both teams at a glance inside the expanded row: champion, player, KDA, damage against the match's highest. The full table
// (gold, vision, builds, objectives) stays on #/league/match.
async function lgPeekMatch(box, id) {
  let m;
  try { m = await statsApi.match(id); } catch { box.innerHTML = '<p class="lg-wait">The teams are not available for this match.</p>'; return; }
  const s = leagueLive.summoner, me = s ? `${s.name}#${s.tag}`.toLowerCase() : '', ps = m.participants || [], max = Math.max(1, ...ps.map(p => p.damage || 0));
  const row = p => { const rid = p.riotId || '', k = p.kills ?? '–';
    return `<li class="${me && rid.toLowerCase() === me ? 'me' : ''}">${lgIcon(p.champion)}<span class="lg-peek-who">${rid ? `<a href="#/league/summoner/${lgRiotSlug(rid)}/${String(m.id).split('_')[0].toLowerCase()}">${lgEsc(rid.split('#')[0])}</a>` : 'Unknown'}<small>${lgEsc(lgChamp(p.champion).name)}</small></span>
      <span class="lg-peek-kda">${k} / ${p.deaths ?? '–'} / ${p.assists ?? '–'}</span><span class="lg-peek-dmg">${p.damage == null ? '' : `<span class="lg-mt-bar" style="--w:${(p.damage / max * 100).toFixed(0)}%"></span>${lgN(p.damage)}`}</span></li>`; };
  const team = t => { const T = (m.teams || []).find(x => x.team === t) || {}, rows = ps.filter(p => p.team === t);
    return rows.length ? `<div class="${T.win ? 'win' : 'loss'}"><h4>${T.win ? 'Victory' : 'Defeat'} · ${t === 100 ? 'Blue' : 'Red'} side</h4><ul>${rows.map(row).join('')}</ul></div>` : ''; };
  box.innerHTML = team(100) + team(200) || '<p class="lg-wait">The teams are not available for this match.</p>';
}

// --- Events: one delegated listener each, scoped to the League stats pages ---
function lgRefill() {
  const t = ++lg.token;
  if (lg.page === 'champion') { const id = location.hash.split('/')[3]; lgFillChampion(t, id); } else if (lg.page === 'items') lgFillBuilds(t); else lgFillTiers(t);
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
  const goto = t.closest('[data-lg-goto]'); // the champion inside a history row opens its page; the rest of the row expands
  if (goto) { location.hash = goto.dataset.lgGoto.slice(1); return; }
  const match = t.closest('[data-lg-match]');
  if (match) { lgExpandMatch(match); return; }
  const row = t.closest('tr[data-lg-go]');
  if (row && !t.closest('a')) location.hash = row.dataset.lgGo.slice(1);
});
