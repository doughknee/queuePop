// DONI-507: the League champion page (#/league/champion/{id}[/{role}]), split out of league-stats.js. Lolalytics' build
// page information model, in Lolalytics' order: strip · role tabs · skills · spells + runes · items · objectives ·
// counters · synergies · best players. Data: crawler /lol/champion/{id} (crawler/README.md) + Data Dragon; shared helpers
// (lg, lgChamp, lgIcon, lgMount, lgPct...) live in league-stats.js, styles in league-champion.css.
const lgHashRole = () => lgRoleOf(location.hash.split('/')[4] || '');
const LG_SKILL_LEVELS = [6, 10, 15];
lg.slv = 15; // skill order view: levels shown
function leagueChampionPage(id) {
  lgMount('champion', t => lgFillChampion(t, id));
  const c = lgChamp(id), key = Object.keys(champions).find(k => champions[k].cid === c.id);
  return `<div class="lg-page lg-champ-page">${lgSearch()}<header class="lg-champ-head" style="--champ-art:url('${statsApi.DD}/cdn/img/champion/splash/${lgEsc(c.alias || 'Ahri')}_0.jpg')"><span id="lg-champ-icon">${lgIcon(id, 'lg-portrait')}</span><div><span class="lg-kicker" id="lg-champ-title">${lgEsc(c.title) || 'Champion stats'}</span><h1 id="lg-champ-name">${lgEsc(c.name)}</h1><p>${key ? `<a href="#/league/champions/${key}">Lore & abilities ↗</a>` : ''}<a href="#/league/champ">Plan in champ select ↗</a><a href="#/league">Tier list ↗</a></p></div></header>
    ${lgFilters(false)}<div id="lg-champ"><p class="lg-wait">Loading ${lgEsc(c.name)}…</p></div></div>`;
}
function lgPick(icons, label, e, extra = '') {
  return `<div class="lg-pick${e.lowSample ? ' low' : ''}"><span class="lg-pick-icons">${icons}</span><span class="lg-pick-label">${label}${extra}</span><b>${lgPct(e.winRate)}</b><small>${lgPct(e.pickRate)} · ${lgN(e.games)}</small></div>`;
}
const lgBlock = (title, note, body, cls = '') => `<article class="lg-block${cls ? ' ' + cls : ''}"><header><h3>${title}</h3>${note ? `<small>${note}</small>` : ''}</header><div class="lg-block-head" aria-hidden="true"><span></span><span></span><span>Win</span><span>Pick · games</span></div>${body || '<p class="lg-wait">No data yet.</p>'}</article>`;
const lgDelta = x => x == null ? '–' : `<span class="${x >= 0 ? 'up' : 'down'}">${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}</span>`;
const lgSection = (title, note, body) => `<section class="lg-section"><header class="lg-head"><h2>${title}</h2>${note ? `<small>${note}</small>` : ''}</header>${body}</section>`;
const lgTop = (arr, n, f) => (arr || []).slice(0, n).map(f).join('');

// Data Dragon lookups for one render: items, rune tree positions, spells. Stat mods are not in runesReforged.json.
const LG_SHARDS = { 5008: ['Adaptive Force', 'StatModsAdaptiveForceIcon', 'Adaptive'], 5005: ['Attack Speed', 'StatModsAttackSpeedIcon', 'AS'], 5007: ['Ability Haste', 'StatModsCDRScalingIcon', 'Haste'],
  5010: ['Move Speed', 'StatModsMovementSpeedIcon', 'MS'], 5011: ['Health', 'StatModsHealthPlusIcon', 'Health'], 5001: ['Health Scaling', 'StatModsHealthScalingIcon', 'Health/lvl'],
  5013: ['Tenacity and Slow Resist', 'StatModsTenacityIcon', 'Tenacity'], 5002: ['Armor', 'StatModsArmorIcon', 'Armor'], 5003: ['Magic Resist', 'StatModsMagicResIcon', 'MR'] };
function lgLookups(items, runes, spells) {
  const it = items?.data || {}, where = {};
  (runes || []).forEach(tree => tree.slots.forEach((s, slot) => s.runes.forEach(r => { where[r.id] = { tree, slot, r }; })));
  const spellBy = Object.fromEntries(Object.values(spells?.data || {}).map(s => [s.key, s]));
  const itemImg = k => lgImg(lgDD(`item/${k}.png`), it[k]?.name || `Item ${k}`);
  return { it, where, spellBy, itemImg, itemName: k => lgEsc(it[k]?.name || `Item ${k}`) };
}
// "1055,2003,2003" -> Doran's Blade, Health Potion ×2
function lgItemSet(L, key) {
  const n = {};
  for (const k of String(key || '').split(',').filter(Boolean)) n[k] = (n[k] || 0) + 1;
  return Object.entries(n).map(([k, c]) => `<span class="lg-stack">${L.itemImg(k)}${c > 1 ? `<i>×${c}</i>` : ''}</span>`).join('');
}

// --- Skills: priority (max order) + the full order at 6/10/15 levels as a grid ---
function lgSkillGrid(key) {
  const rows = 'QWER'.split('').map(s => `<div class="lg-sk-row"><kbd>${s}</kbd>${key.split('').map((k, i) => `<span class="${k === s ? 'on' : ''}">${k === s ? i + 1 : ''}</span>`).join('')}</div>`);
  return `<div class="lg-sk-grid" style="--n:${key.length}">${rows.join('')}</div>`;
}
function lgSkills(d) {
  const pri = d.builds?.skills || [], orders = d.skills?.[lg.slv] || [], top = orders[0];
  const priPick = e => lgPick(`<span class="lg-keys">${e.key.split('').map(k => `<kbd>${k}</kbd>`).join('<i>›</i>')}</span>`, '', e);
  const toggle = `<div class="lg-msort" role="group" aria-label="Levels shown">Levels ${LG_SKILL_LEVELS.map(n => `<button data-lg-slv="${n}" aria-pressed="${lg.slv === n}">${n}</button>`).join('')}</div>`;
  const alt = e => lgPick(`<code class="lg-sk-key">${e.key}</code>`, '', e);
  return `<div class="lg-sheet lg-sheet-skills">${lgBlock('Skill priority', 'order the basic skills reach rank 5', lgTop(pri, 3, priPick))}
    <article class="lg-block lg-skill-order${top?.lowSample ? ' low' : ''}"><header><h3>Skill order</h3><small>${top ? `most common first ${lg.slv} levels · ${lgPct(top.winRate)} win · ${lgN(top.games)} games` : ''}</small>${toggle}</header>
    ${top ? lgSkillGrid(top.key) + `<div class="lg-block-head" aria-hidden="true"><span></span><span></span><span>Win</span><span>Pick · games</span></div>${lgTop(orders.slice(1), 4, alt)}` : '<p class="lg-wait">No timeline-sampled games reach this level yet.</p>'}</article></div>`;
}

const lgSkillsSection = d => lgSection('Skills', `timeline-sampled: ${lgN(d.timelineGames || 0)} of ${lgN(d.strip?.games || 0)} ${LG_ROLE[lgRoleOf(d.role)] || ''} games`, lgSkills(d));

// --- Runes, spells, stat mods ---
function lgRunes(d, L) {
  const b = d.builds || {};
  const runeEntry = e => L.where[e.key] && { ...e, ...L.where[e.key] };
  const keys = (b.keystone || []).map(runeEntry).filter(Boolean), all = (b.rune || []).map(runeEntry).filter(e => e && e.slot > 0);
  const primary = keys[0]?.tree, trees = {};
  for (const e of all) if (e.tree !== primary) trees[e.tree.id] = (trees[e.tree.id] || 0) + e.games;
  const secId = Number(Object.entries(trees).sort((x, y) => y[1] - x[1])[0]?.[0]), sec = secId && all.find(e => e.tree.id === secId)?.tree;
  const runePick = e => lgPick(lgImg(`${statsApi.DD}/cdn/img/${e.r.icon}`, e.r.name), lgEsc(e.r.name), e);
  const prim = [1, 2, 3].map(s => all.filter(e => e.tree === primary && e.slot === s).sort((x, y) => y.games - x.games)[0]).filter(Boolean);
  const secRows = all.filter(e => e.tree.id === secId).sort((x, y) => y.games - x.games).slice(0, 2);
  const spellPick = e => lgPick(e.key.split(',').map(k => lgImg(L.spellBy[k] ? lgDD(`spell/${L.spellBy[k].image.full}`) : `assets/spells/${k}.png`, L.spellBy[k]?.name || k)).join(''), lgEsc(e.key.split(',').map(k => L.spellBy[k]?.name || k).join(' + ')), e);
  const shardPick = e => lgPick(e.key.split(',').map(k => lgImg(`${statsApi.DD}/cdn/img/perk-images/StatMods/${LG_SHARDS[k]?.[1] || ''}.png`, LG_SHARDS[k]?.[0] || k, 'lg-ico lg-shard')).join(''), lgEsc(e.key.split(',').map(k => LG_SHARDS[k]?.[2] || k).join(' · ')), e);
  return `<div class="lg-sheet">
    ${lgBlock('Summoner spells', '', lgTop(b.spells, 4, spellPick))}
    ${lgBlock(`Primary${primary ? ` · ${lgEsc(primary.name)}` : ''}`, 'keystone, then the most-picked rune per row', lgTop(keys, 1, runePick) + prim.map(runePick).join('') + (keys.length > 1 ? `<div class="lg-sep"></div>${keys.slice(1, 3).map(runePick).join('')}` : ''))}
    ${lgBlock(`Secondary${sec ? ` · ${lgEsc(sec.name)}` : ''}`, 'two most-picked runes of the second tree', secRows.map(runePick).join(''))}
    ${lgBlock('Stat mods', 'offense · flex · defense', lgTop(d.shards, 4, shardPick))}
  </div>`;
}

// --- Items: starting sets, early items, core build with timing, items 4·5·6 as OR alternatives ---
function lgItems(d, L) {
  const tl = d.timelineGames || 0, note = `from ${lgN(tl)} timeline-sampled games`;
  const setPick = e => lgPick(lgItemSet(L, e.key), e.key ? L.itemName(e.key.split(',')[0]) : 'Nothing', e);
  const itemPick = (e, extra = '') => lgPick(L.itemImg(e.key), L.itemName(e.key), e, extra);
  const min = e => e.avgMinute != null ? `<small class="lg-min">${e.avgMinute.toFixed(1)} min</small>` : '';
  const corePick = e => lgPick(e.key.split(',').map((k, i) => (i ? '<i class="lg-arrow">›</i>' : '') + L.itemImg(k)).join(''), '', e, min(e));
  const alts = leagueSlotAlternatives(d.buildOrder);
  const altCol = (opts, i) => `<div class="lg-alt"><span class="lg-kicker">Item ${i + 4}</span>${opts.length ? opts.map((e, j) => (j ? '<span class="lg-or">or</span>' : '') + itemPick(e, min(e))).join('') : '<p class="lg-wait">No data yet.</p>'}</div>`;
  return `<div class="lg-sheet">
    ${lgBlock('Starting items', note, lgTop(d.starting, 4, setPick))}
    ${lgBlock('Early items', 'first bought 1:30–10:00', lgTop(d.early, 5, e => itemPick(e)))}
    ${lgBlock('Core build', 'first three finished items, in order · avg minute of the third', lgTop(d.buildOrder?.core, 4, corePick), 'lg-wide')}
  </div>
  <article class="lg-block lg-alts"><header><h3>Items 4 · 5 · 6</h3><small>each slot's most-bought options outside the core · avg purchase minute · win · pick within the slot · games</small></header><div class="lg-alt-cols">${alts.map(altCol).join('')}</div></article>`;
}

// --- Objectives: secure vs yield with the win rate in each case, plus sides ---
const LG_OBJ = { first_blood: 'First blood', first_tower: 'First tower', first_dragon: 'First drake', grubs: 'Voidgrubs (first)', herald: 'Rift Herald', baron: 'Baron (first)', first_inhibitor: 'First inhibitor', atakhan: 'Atakhan', soul: 'Dragon soul (4+ drakes)' };
function lgObjectives(d) {
  const rows = Object.keys(LG_OBJ).map(k => (d.objectives || []).find(o => o.objective === k)).filter(o => o && o.games);
  if (!rows.length && !d.sides) return '<p class="lg-wait">No objective data yet (the crawler reads it from match JSON on its next aggregation).</p>';
  const side = (name, x) => x ? `<div class="${x.games < d.minGames ? 'low' : ''}"><dt>${name} side</dt><dd>${lgPct(x.winRate)}</dd><dd class="lg-sub">${lgN(x.games)} games</dd></div>` : '';
  const cell = (rate, wr, n) => `<td class="num">${lgPct(rate)}</td><td class="num">${wr == null ? '–' : `${lgBar(wr)}${lgPct(wr)}`}</td><td class="num">${lgN(n)}</td>`;
  return `${d.sides ? `<dl class="lg-sides">${side('Blue', d.sides.blue)}${side('Red', d.sides.red)}</dl>` : ''}
    <table class="lg-table lg-obj"><thead><tr><th class="num">Objective</th><th class="num">Secured</th><th class="num">Win when secured</th><th class="num">Games</th><th class="num">Yielded</th><th class="num">Win when yielded</th><th class="num">Games</th></tr></thead>
    <tbody>${rows.map(o => `<tr class="${o.lowSample ? 'low' : ''}"><td>${LG_OBJ[o.objective]}</td>${cell(o.securedRate, o.securedWinRate, o.secured)}${cell(o.yieldedRate, o.yieldedWinRate, o.yielded)}</tr>`).join('')}</tbody></table>`;
}

// --- Counters: lane opponents, sortable (win, delta 1, delta 2, pick, games) ---
const LG_MU_COLS = [['name', 'Opponent'], ['winRate', 'Win'], ['delta1', 'Delta 1'], ['delta2', 'Delta 2'], ['pickRate', 'Pick'], ['games', 'Games']];
function lgMatchups(d) {
  const rows = lgSortRows((d.matchups || []).map(m => ({ ...m, delta1: m.delta1 ?? null, delta2: m.delta2 ?? null })), lg.msort, lg.mdir, r => lgChamp(r.opponent).name);
  const th = ([k, t]) => `<th class="${k === 'name' ? '' : 'num'}" aria-sort="${lg.msort === k ? (lg.mdir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-lg-msort="${k}">${t}${lg.msort === k ? (lg.mdir < 0 ? ' ▾' : ' ▴') : ''}</button></th>`;
  const role = lgRoleOf(d.role);
  return lgSection('Counters', `${LG_ROLE[role] || ''} lane opponent · Delta 1 = win vs them − your average · Delta 2 = also corrected for their average`,
    rows.length ? `<table class="lg-table lg-mu-table"><thead><tr>${LG_MU_COLS.map(th).join('')}</tr></thead><tbody>${rows.map(m => `<tr class="${m.lowSample ? 'low' : ''}" data-lg-go="#/league/champion/${m.opponent}/${role}"><td class="lg-name"><a href="#/league/champion/${m.opponent}/${role}">${lgIcon(m.opponent)}<span>${lgEsc(lgChamp(m.opponent).name)}</span></a></td><td class="num">${lgBar(m.winRate)}${lgPct(m.winRate)}</td><td class="num">${lgDelta(m.delta1)}</td><td class="num">${lgDelta(m.delta2)}</td><td class="num">${m.pickRate == null ? '–' : lgPct(m.pickRate)}</td><td class="num">${lgN(m.games)}</td></tr>`).join('')}</tbody></table>` : '<p class="lg-wait">No matchups recorded yet.</p>');
}

// --- Synergies: most common teammates, best and worst by Delta 2 (full-sample rows first) ---
function lgSynergies(d) {
  const all = d.synergies || [];
  if (!all.length) return lgSection('Synergies', '', '<p class="lg-wait">No teammate data yet.</p>');
  const row = s => `<a class="lg-syn${s.lowSample ? ' low' : ''}" href="#/league/champion/${s.ally}/${lgRoleOf(s.role)}">${lgIcon(s.ally)}<span>${lgEsc(lgChamp(s.ally).name)}<small>${LG_ROLE[lgRoleOf(s.role)] || s.role}</small></span><b>${lgPct(s.winRate)}</b>${lgDelta(s.delta2)}<small>${lgN(s.games)}</small></a>`;
  const ranked = [...all].filter(s => s.delta2 != null).sort((a, b) => (a.lowSample - b.lowSample) || b.delta2 - a.delta2);
  const col = (t, list) => `<article class="lg-block"><header><h3>${t}</h3></header><div class="lg-syn-head" aria-hidden="true"><span></span><span>Win</span><span>Δ2</span><span>Games</span></div>${list.map(row).join('') || '<p class="lg-wait">No data yet.</p>'}</article>`;
  return lgSection('Synergies', 'same-team champions · win together · Delta 2 vs what both averages predict',
    `<div class="lg-sheet lg-syn-sheet">${col('Common teammates', all.slice(0, 8))}${col('Good synergy', ranked.slice(0, 8))}${col('Bad synergy', ranked.slice(-8).reverse())}</div>`);
}

// --- Best players on this champion (DONI-506's /lol/champion/{id}/players); "coming soon" until the crawler serves it ---
async function lgFillPlayers(token, id) {
  const el = () => token === lg.token && document.getElementById('lg-best');
  let data = null;
  try { data = await statsApi.championPlayers(id, lgParams(lgRoleOf(lgChampData?.role))); } catch {}
  if (!el()) return;
  const ps = data?.players || [];
  if (!data) { el().innerHTML = '<p class="lg-wait">Coming soon: the stats crawler does not rank players on a champion yet.</p>'; return; }
  if (!ps.length) { el().innerHTML = `<p class="lg-wait">Nobody has ${lgN(data.minPlayerGames || 20)}+ games on this champion under these filters yet.</p>`; return; }
  const tier = p => p.tier ? `${p.tier.charAt(0)}${p.tier.slice(1).toLowerCase()} ${['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(p.tier) ? '' : p.division || ''}` : '';
  el().innerHTML = `<table class="lg-table lg-best"><thead><tr><th class="num">#</th><th class="num">Player</th><th class="num">Rank</th><th class="num">Win</th><th class="num">Games</th></tr></thead><tbody>${ps.slice(0, 10).map((p, i) => `<tr><td class="num">${i + 1}</td><td>${lgEsc(p.riotId || 'Unknown')} <small>${lgEsc((p.region || '').toUpperCase())}</small></td><td>${lgEsc(tier(p))}${p.lp != null ? ` <small>${lgN(p.lp)} LP</small>` : ''}</td><td class="num">${lgBar(p.winRate)}${lgPct(p.winRate)}</td><td class="num">${lgN(p.games)}</td></tr>`).join('')}</tbody></table>`;
}

let lgChampData = null, lgChampL = null;
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
    lgChampL = lgLookups(items?.d, runes?.d, spells?.d);
    const c = lgChamp(id), banded = list ? leagueTierRows(list.champions) : [], me = banded.find(r => r.champion === Number(id));
    const byScore = [...banded].sort((a, b) => b.score - a.score), rank = me ? byScore.indexOf(me) + 1 : 0;
    const roleGames = banded.reduce((s, r) => s + r.games, 0), avg = roleGames ? banded.reduce((s, r) => s + r.wins, 0) / roleGames : null;
    const s = d.strip || {}, delta = avg != null && s.games ? (s.winRate - avg) * 100 : null, role = lgRoleOf(d.role), R = LG_ROLE[role] || '';
    document.getElementById('lg-champ-name').textContent = c.name;
    document.getElementById('lg-champ-title').textContent = c.title || 'Champion stats';
    if (!s.games) { box().innerHTML = `<p class="lg-wait">No ranked games for ${lgEsc(c.name)} on patch ${lgEsc(d.patch)} with these filters yet.</p>`; return; }
    box().innerHTML = `
      <dl class="lg-strip${s.lowSample ? ' low' : ''}">
        <div><dt>Win rate</dt><dd>${lgPct(s.winRate)}</dd><dd class="lg-sub">${lgN(s.wins)} wins</dd></div>
        <div><dt>Delta</dt><dd class="${delta == null ? '' : delta >= 0 ? 'up' : 'down'}">${delta == null ? '–' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta).toFixed(1)}`}</dd><dd class="lg-sub">vs ${R} average</dd></div>
        <div><dt>Game avg</dt><dd>${avg == null ? '–' : lgPct(avg)}</dd><dd class="lg-sub">every ${R} pick</dd></div>
        <div><dt>Pick rate</dt><dd>${lgPct(s.pickRate)}</dd><dd class="lg-sub">of ${lgN(s.matches)} matches</dd></div>
        <div><dt>Ban rate</dt><dd>${lgPct(s.banRate)}</dd><dd class="lg-sub">of ${lgN(s.matches)} matches</dd></div>
        <div><dt>Tier</dt><dd>${me ? lgTier(me.tier, me.lowSample) : '–'}</dd><dd class="lg-sub">${R} on ${lgEsc(d.patch)}</dd></div>
        <div><dt>Rank</dt><dd>${rank ? `${rank} <small>/ ${banded.length}</small>` : '–'}</dd><dd class="lg-sub">${list ? `${lgN(list.matches)} matches` : ''}</dd></div>
        <div><dt>Games</dt><dd>${lgN(s.games)}</dd><dd class="lg-sub">${s.lowSample ? `under ${lgN(d.minGames)}: low sample` : `${lgN(d.timelineGames || 0)} with timeline`}</dd></div>
      </dl>
      <nav class="lg-tabs" aria-label="Role">${(d.roles || []).map(r => `<button data-lg-crole="${lgRoleOf(r.role)}" aria-pressed="${lgRoleOf(r.role) === role}">${lgRoleIcon(lgRoleOf(r.role))}${LG_ROLE[lgRoleOf(r.role)] || r.role}<small>${lgN(r.games)}</small></button>`).join('')}</nav>
      <div id="lg-skills">${lgSkillsSection(d)}</div>
      ${lgSection('Runes & spells', `win · pick · games, out of ${lgN(s.games)} ${R} games`, lgRunes(d, lgChampL))}
      ${lgSection('Items', 'purchase order from timeline-sampled games', lgItems(d, lgChampL))}
      ${lgSection('Objectives', 'your team took it first (secured) or the enemy did (yielded); rates out of all games', lgObjectives(d))}
      ${lgMatchups(d)}
      ${lgSynergies(d)}
      ${lgSection('Best players', `most wins on ${lgEsc(c.name)} · this patch`, '<div id="lg-best"><p class="lg-wait">Loading…</p></div>')}`;
    lgFillPlayers(token, id);
  } catch {
    if (box()) box().innerHTML = lgOffline('the stats crawler did not answer.');
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-lg-slv]');
  if (!b || !lgChampData) return;
  lg.slv = Number(b.dataset.lgSlv);
  document.getElementById('lg-skills').innerHTML = lgSkillsSection(lgChampData);
});
