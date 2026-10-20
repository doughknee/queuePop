// DONI-509: Lolalytics' item, rune and summoner-spell pages across every champion, on the crawler's /lol/items, /lol/runes and
// /lol/spells. Route #/league/items[/{kind}] (kind: items, keystones, runes, shards, spells). Same band, lane tabs, filters and
// heat cells as the tier list (league-stats.js); names and icons from Data Dragon through lgLookups (league-champion.js).
const LG_KINDS = { items: 'Items', keystones: 'Keystones', runes: 'Runes', shards: 'Stat mods', spells: 'Summoner spells' };
const lgb = { sort: 'games', dir: -1, data: null, L: null, kind: 'items' };
const lgKindOf = () => { const k = location.hash.split('/')[3]; return LG_KINDS[k] ? k : 'items'; };

function leagueBuildsPage() {
  const kind = lgb.kind = lgKindOf();
  lgMount('items', t => lgFillBuilds(t));
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  const tabs = `<nav class="lg-roles lg-kinds" aria-label="What to list">${Object.entries(LG_KINDS).map(([k, l]) => `<a href="#/league/items/${k}" aria-pressed="${k === kind}">${l}</a>`).join('')}</nav>`;
  return `<div class="lg-page${lg.queue ? ' lg-aram' : ''}">${lgBand(art, championWorlds[top]?.position || 'center 20%', `<div class="lg-band-row"><h1>${LG_KINDS[kind]}</h1><span class="lg-meta" id="lg-meta"></span>${lgSearch()}</div>`)}
    ${lgFilters(true, '', false)}${tabs}<div id="lg-builds"><p class="lg-wait">Loading ${LG_KINDS[kind].toLowerCase()}…</p></div>
    <p class="lg-rule">Win and Δ tint red below and green above everyone's average in this lane, fainter on smaller samples; pick tints purple by size. Pick = share of champion-games in this lane that ${kind === 'items' ? 'finished the item' : kind === 'spells' ? 'took the pair' : 'took it'}. Top champions = the five that use it most; click one for its page.</p></div>`;
}

async function lgFillBuilds(token, retried = false) {
  const box = () => token === lg.token && document.getElementById('lg-builds'), kind = lgb.kind;
  const ep = kind === 'items' ? 'lolItems' : kind === 'spells' ? 'lolSpells' : 'lolRunes';
  let data, items, runes, spells;
  try {
    data = await statsApi[ep](lgParams());
    [items, runes, spells] = await Promise.all([statsApi.items(data.patch).catch(() => null), statsApi.runes(data.patch).catch(() => null),
      statsApi.spells(data.patch).catch(() => null), lgNames(data.patch).catch(() => null)]);
  } catch (e) {
    if (!retried) { await new Promise(r => setTimeout(r, 2000)); return lgFillBuilds(token, true); }
    if (box()) { box().innerHTML = lgOffline('the stats crawler did not answer.'); document.getElementById('lg-meta').textContent = 'Stats offline'; }
    return;
  }
  if (!box()) return;
  lgb.data = data; lgb.L = lgLookups(items?.d, runes?.d, spells?.d);
  const rows = data[kind] || [];
  document.getElementById('lg-meta').innerHTML = `${LG_ROLE[lgRoleOf(data.role)] || 'All lanes'} · ${lgN(data.players)} champion-games · ${rows.length} ${LG_KINDS[kind].toLowerCase()}${rows.some(r => r.lowSample) ? ` · under ${lgN(data.minGames)} games greyed` : ''}`;
  box().innerHTML = lgBuildsTable(data, kind);
}

// One row's identity: icon(s) and a name, per kind.
function lgBuildName(kind, key, L) {
  const keys = String(key).split(',');
  if (kind === 'items') return [L.itemImg(key), L.itemName(key)];
  if (kind === 'spells') return [keys.map(k => lgImg(L.spellBy[k] ? lgDD(`spell/${L.spellBy[k].image.full}`) : `assets/spells/${k}.png`, L.spellBy[k]?.name || k)).join(''), lgEsc(keys.map(k => L.spellBy[k]?.name || k).join(' + '))];
  if (kind === 'shards') return [keys.map(k => lgImg(`${statsApi.DD}/cdn/img/perk-images/StatMods/${LG_SHARDS[k]?.[1] || ''}.png`, LG_SHARDS[k]?.[0] || k, 'lg-ico lg-shard')).join(''), lgEsc(keys.map(k => LG_SHARDS[k]?.[0] || k).join(' · '))];
  const w = L.where[key];
  return w ? [lgImg(`${statsApi.DD}/cdn/img/${w.r.icon}`, w.r.name), `${lgEsc(w.r.name)} <small>${lgEsc(w.tree.name)}</small>`] : ['', `Rune ${lgEsc(key)}`];
}

function lgBuildsTable(data, kind) {
  const all = data[kind] || [], L = lgb.L, role = LG_ROLES.includes(lgRoleOf(data.role)) ? '/' + lgRoleOf(data.role) : '';
  if (!all.length) return `<p class="lg-wait">No ${LG_KINDS[kind].toLowerCase()} recorded for these filters yet.</p>`;
  const S = { win: lgSpread(all, r => r.winRate, data.winRate), delta: lgSpread(all, r => r.delta, 0), pick: lgSpread(all, r => r.pickRate, 0) };
  const v = { win: r => r.winRate, delta: r => r.delta, pick: r => r.pickRate, games: r => r.games }[lgb.sort] || (r => r.games);
  const rows = [...all].sort((a, b) => a.lowSample - b.lowSample || lgb.dir * ((v(a) ?? -1) - (v(b) ?? -1)));
  const th = (k, l) => `<th class="num" aria-sort="${lgb.sort === k ? (lgb.dir < 0 ? 'descending' : 'ascending') : 'none'}"><button data-lgb-sort="${k}">${l}</button></th>`;
  return `<table class="lg-table lg-builds"><thead><tr><th class="num">#</th><th>${LG_KINDS[kind].replace(/s$/, '')}</th>${th('win', 'Win')}${th('delta', 'Δ')}${th('pick', 'Pick')}${th('games', 'Games')}<th>Top champions</th></tr></thead><tbody>
    ${rows.map((r, i) => { const [ico, name] = lgBuildName(kind, r.key, L); return `<tr class="${r.lowSample ? 'low' : ''}"><td class="num">${i + 1}</td><td class="lg-bname"><span class="lg-pick-icons">${ico}</span><span>${name}</span></td>
      <td class="num">${lgHeat(r.winRate, data.winRate, S.win, r.games, lgPct(r.winRate))}</td><td class="num">${lgHeat(r.delta, 0, S.delta, r.games, lgSign(r.delta * 100))}</td>
      <td class="num">${lgMag(r.pickRate, S.pick, lgPct(r.pickRate))}</td><td class="num">${lgN(r.games)}</td>
      <td class="lg-bchamps">${(r.champions || []).map(c => `<a href="#/league/champion/${c.champion}${role}" title="${lgEsc(lgChamp(c.champion).name)} · ${lgPct(c.winRate)} win · ${lgN(c.games)} games">${lgIcon(c.champion)}</a>`).join('')}</td></tr>`; }).join('')}
  </tbody></table>`;
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-lgb-sort]');
  if (!b || !lgb.data) return;
  const k = b.dataset.lgbSort;
  lgb.dir = lgb.sort === k ? -lgb.dir : -1; lgb.sort = k;
  document.getElementById('lg-builds').innerHTML = lgBuildsTable(lgb.data, lgb.kind);
});

// League's page row (DONI-571): three stats pages plus "More", which lands here: the rest of the League pages as an
// inline list (no popup). The sidebar keeps every page (index.html: .lg-row-hide hides them in the row only).
function leagueMorePage() {
  const P = [['#/league/leaderboard', 'Leaderboard', 'The ranked ladder per region; open anyone for their ranks and last 20 matches.'], ['#/league/champions', 'Champions', 'Your most-played champions: lore, abilities and a plan for each.'],
    ['#/league/champ', 'Champ select', 'Auto pick and ban, runes and loadouts for every role, set up before the timer starts.'],
    ['#/league/dashboard', 'Dashboard', 'Auto-accept, alerts and what happened in your last queues.'],
    ['#/league/play', 'Queue', 'Start any queue from here, with your favourites first.'],
    ['#/league/account', 'Account', 'Your ranks, mastery and challenges from the League client.']];
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  return `<div class="lg-page">${lgBand(art, 'center 20%', `<div class="lg-band-row"><h1>More</h1><span class="lg-meta">The rest of the League world</span>${lgSearch()}</div>`)}
    <nav class="lg-more" aria-label="More League pages">${P.map(([h, t, d]) => `<a href="${h}"><b>${t}</b><span>${d}</span><i aria-hidden="true">↗</i></a>`).join('')}</nav></div>`;
}
