// DONI-508: any summoner's page and the ranked ladder, Lolalytics/OP.GG style, on the crawler's on-demand lookups.
// #/league/summoner/{Name-TAG}[/{region}] reads GET /lol/summoner/{riotId}?region (account, ranks, last 20 matches; the crawler
// caches 10 min and allows a few uncached lookups a minute), #/league/leaderboard[/{region}] reads GET /lol/leaderboard.
// The League search opens Riot IDs here (league-stats.js). Champion leaderboards stay on each champion page (best players).
// D15: one sentence per lookup failure (crawler /lol/summoner, /lol/match, /tft/player, /tft/match).
const lgLookupError = (e, what) => { const c = e?.status || Number(String(e?.message).split(' ')[0]);
  return c === 404 ? `Riot has no ${what}.` : c === 400 ? `That ${what === 'match with this id' ? 'match id' : 'Riot ID or region'} doesn't look right.`
    : c === 429 ? `The crawler allows a few fresh lookups a minute so the Riot key stays healthy. Try again in ${e?.retry ? e.retry + ' s' : 'a minute'}.`
    : c === 503 ? "The crawler's Riot key is not valid right now; replace it in Settings > Stats crawler." : 'Stats offline · the stats crawler did not answer. Check its address in Settings > Stats crawler.'; };
const LG_QUEUE_NAME = { RANKED_SOLO_5x5: 'Solo / duo', RANKED_FLEX_SR: 'Flex' };
const LG_REGION_CODE = { na: 'na1', euw: 'euw1', eune: 'eun1', oc: 'oc1', oce: 'oc1', br: 'br1', jp: 'jp1', tr: 'tr1', la: 'la1', lan: 'la1', las: 'la2', sg: 'sg2', tw: 'tw2', vn: 'vn2', ph: 'ph2', th: 'th2', me: 'me1', ru: 'ru', kr: 'kr' };
// DONI-569: your own Riot platform id (summoner.platform, e.g. sg2), not the op.gg-style region.
const lgMyPlatform = () => (leagueLive.summoner?.platform || lgRegionCode(leagueLive.summoner?.region)).toLowerCase();
const lgRegionCode = r => { r = String(r || '').toLowerCase(); return LG_REGION_CODE[r] || r || 'na1'; };
const lgRiotSlug = id => encodeURIComponent(String(id).replace('#', '-'));
const lgTierWord = t => t ? t[0] + t.slice(1).toLowerCase() : 'Unranked';
const lgAgoMs = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

function leagueSummonerPage() {
  const [, , , slug = '', region = ''] = location.hash.split('/'), riot = decodeURIComponent(slug).replace(/-(?=[^-]*$)/, '#');
  const reg = lgRegionCode(region || (lg.region !== 'all' ? lg.region : lgMyPlatform()));
  lgMount('summoner', t => lgFillSummoner(t, riot, reg));
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  return `<div class="lg-page lg-summoner">${lgBand(art, 'center 20%', `<div class="lg-band-row"><h1 id="lg-sum-name">${lgEsc(riot.split('#')[0])}</h1><span class="lg-meta" id="lg-meta">#${lgEsc(riot.split('#')[1] || '')} · ${lgEsc(reg.toUpperCase())}</span>${lgSearch()}</div><div class="lg-you" id="lg-sum-ranks"></div>`)}
    <div id="lg-sum"><p class="lg-wait">Looking up ${lgEsc(riot)} on ${lgEsc(reg.toUpperCase())}… a fresh lookup reads up to 20 matches from Riot and can take half a minute.</p></div></div>`;
}

async function lgFillSummoner(token, riot, region) {
  const box = () => token === lg.token && document.getElementById('lg-sum');
  let d;
  try { d = await statsApi.summoner(riot, region); } catch (e) {
    if (box()) box().innerHTML = `<p class="lg-offline">${e?.status === 404 || String(e?.message).startsWith('404') ? `No Riot ID "${lgEsc(riot)}" on ${lgEsc(region.toUpperCase())}. Check the #tag.` : lgLookupError(e, 'player with this Riot ID')}</p>`;
    return;
  }
  const [runes, spells] = await Promise.all([statsApi.runes(lg.patch).catch(() => null), statsApi.spells(lg.patch).catch(() => null), lgNames().catch(() => null)]);
  if (!box()) return;
  const L = lgLookups(null, runes?.d, spells?.d);
  const h1 = document.getElementById('lg-sum-name');
  h1.textContent = d.riotId.split('#')[0];
  if (d.iconId != null) h1.insertAdjacentHTML('beforebegin', lgImg(lgDD(`profileicon/${d.iconId}.png`), '', 'lg-sum-icon'));
  document.getElementById('lg-meta').textContent = `#${d.riotId.split('#')[1] || ''} · ${d.region.toUpperCase()} · level ${d.level}`;
  document.getElementById('lg-sum-ranks').innerHTML = (d.ranked || []).map(r => { const g = r.wins + r.losses; return `<span class="lg-you-rank"><small>${LG_QUEUE_NAME[r.queue] || lgEsc(r.queue)}</small> ${lgTierWord(r.tier)}${r.division && !/MASTER|CHALLENGER/.test(r.tier) ? ' ' + r.division : ''} <small>${lgN(r.lp)} LP</small> ${g ? lgHeat(r.wins / g, 0.5, 0.1, g, lgPct(r.wins / g)) : ''} <small>${g} games</small></span>`; }).join('') || '<span class="lg-wait">Unranked this split.</span>';
  // Same rules as your own match history: a game under 5 minutes is a remake, greyed and left out of the record and the pool.
  const m = d.matches || [], real = m.filter(x => !(x.duration && x.duration < 300)), w = real.filter(x => x.win).length, remakes = m.length - real.length;
  const pool = lgHistChamps(real.map(x => ({ championId: x.champion, win: x.win, kills: x.kills, deaths: x.deaths, assists: x.assists, position: LG_ROLES.includes(lgRoleOf(x.role)) ? lgRoleOf(x.role) : '' })));
  const spell = k => lgImg(L.spellBy[k] ? lgDD(`spell/${L.spellBy[k].image.full}`) : `assets/spells/${k}.png`, L.spellBy[k]?.name || '', 'lg-ico');
  box().innerHTML = !m.length ? '<p class="lg-wait">No recent matches.</p>' : `<header class="lg-head lg-sum-head"><h2>Last ${m.length} matches</h2><span class="lg-sub">${real.length ? `${w}W ${real.length - w}L · ${lgPct(w / real.length)}` : ''}${remakes ? ` · ${remakes} ${remakes === 1 ? 'remake' : 'remakes'} left out` : ''} · fetched ${lgAgoMs(d.fetchedAt)}</span></header>${pool.replace('aria-label="Your champions"', 'aria-label="Their champions"')}
    <div class="lg-sum-list">${m.map(x => { const c = lgChamp(x.champion), kda = (x.kills + x.assists) / Math.max(1, x.deaths), role = lgRoleOf(x.role), remake = x.duration && x.duration < 300, ks = x.keystone && L.where[x.keystone]; return `<div class="lg-match ${remake ? 'remake' : x.win ? 'win' : 'loss'}"><div class="lg-match-row lg-sum-row">
      <span class="lg-result">${remake ? 'Remake' : x.win ? 'Victory' : 'Defeat'}</span><a href="#/league/champion/${x.champion}${LG_ROLES.includes(role) ? '/' + role : ''}" title="Open ${lgEsc(c.name)}'s stats">${lgIcon(x.champion)}</a>
      <span class="lg-sum-load"><span>${(x.spells || []).map(spell).join('')}</span>${ks ? lgImg(`${statsApi.DD}/cdn/img/${ks.r.icon}`, ks.r.name, 'lg-ico lg-sum-ks') : ''}</span>
      <span class="lg-match-name"><a href="#/league/champion/${x.champion}">${lgEsc(c.name)}</a><small>${lgEsc(queueMap[x.queueId] || 'Other mode')}</small></span>
      <span>${lgRoleIcon(role)}</span><span class="lg-kda">${x.kills} / ${x.deaths} / ${x.assists}<small>${kda.toFixed(2)} KDA · ${x.cs} cs</small></span>
      <span class="lg-sum-items">${(x.items || []).filter(Boolean).map(i => lgImg(lgDD(`item/${i}.png`), '', 'lg-ico')).join('')}</span>
      <span class="lg-ago"><a href="#/league/match/${encodeURIComponent(x.id)}" title="Open the full match">${Math.round(x.duration / 60)} min ↗</a><small>${lgAgoMs(x.startedAt)}</small></span></div></div>`; }).join('')}</div>`;
}

function leagueLeaderboardPage() {
  const region = lgRegionCode(location.hash.split('/')[3] || (lg.region !== 'all' ? lg.region : 'na1'));
  lgMount('leaderboard', t => lgFillLeaderboard(t, region));
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  const regions = [...new Set([...lgt.regions, region])];
  return `<div class="lg-page">${lgBand(art, 'center 20%', `<div class="lg-band-row"><h1>Leaderboard</h1><span class="lg-meta" id="lg-meta">Solo / duo ladder · ${region.toUpperCase()}</span>${lgSearch()}</div>`)}
    <nav class="lg-roles lg-kinds" aria-label="Region">${regions.map(r => `<a href="#/league/leaderboard/${r}" aria-pressed="${r === region}">${r.replace(/\d+$/, '').toUpperCase()}</a>`).join('')}</nav>
    <input type="search" class="lg-ladder-find" id="lg-ladder-find" placeholder="Find a player on this ladder" aria-label="Find a player on this ladder" autocomplete="off">
    <div id="lg-ladder"><p class="lg-wait">Loading the ladder…</p></div>
    <p class="lg-rule">The crawler's ladder: Master and above refresh every 30 minutes, the rest daily. Click a player for their ranks and last 20 matches. Champion leaderboards are on each champion page (Best players).</p></div>`;
}

function lgLadderFind() {
  const q = (document.getElementById('lg-ladder-find')?.value || '').trim().toLowerCase();
  document.querySelectorAll('.lg-ladder tbody tr').forEach(tr => { tr.hidden = !!q && (tr.classList.contains('lg-ladder-tier') || !tr.dataset.find.includes(q)); });
}
document.addEventListener('input', e => { if (e.target.id === 'lg-ladder-find') lgLadderFind(); });

async function lgFillLeaderboard(token, region, retried = false) {
  const box = () => token === lg.token && document.getElementById('lg-ladder');
  let d;
  try { d = await statsApi.leaderboard('lol', region, 200); } catch (_) {
    if (!retried) { await new Promise(r => setTimeout(r, 2000)); return lgFillLeaderboard(token, region, true); } // a busy crawler can miss one 20 s window
    if (box()) box().innerHTML = lgOffline('the stats crawler did not answer.'); return;
  }
  if (!box()) return;
  const ps = d.players || [], newest = Math.max(0, ...ps.map(p => p.updatedAt || 0));
  if (newest) document.getElementById('lg-meta').textContent = `Solo / duo ladder · ${region.toUpperCase()} · updated ${lgAgoMs(newest)}`;
  // The tier is a divider where it changes (a top 200 is mostly one tier), not a column repeating it on every row.
  const floor = {}; ps.forEach(p => { const k = p.tier + (p.division || ''); floor[k] = Math.min(floor[k] ?? Infinity, p.lp); });
  const rows = ps.map((p, i) => { const tier = `${lgTierWord(p.tier)}${p.division ? ' ' + p.division : ''}`, prev = ps[i - 1], href = p.riotId ? `#/league/summoner/${lgRiotSlug(p.riotId)}/${p.region}` : '';
    return (!prev || prev.tier !== p.tier || prev.division !== p.division ? `<tr class="lg-ladder-tier"><th colspan="5">${tier}<small>lowest here ${lgN(floor[p.tier + (p.division || '')])} LP</small></th></tr>` : '')
      + `<tr data-find="${lgEsc((p.riotId || '').toLowerCase())}"${href ? ` data-lg-go="${href}"` : ''}><td class="num">${p.rank}</td><td class="lg-name">${href ? `<a href="${href}"><span>${lgEsc(p.riotId.split('#')[0])}</span><small>#${lgEsc(p.riotId.split('#')[1] || '')}</small></a>` : '<span class="lg-wait">Name not crawled yet</span>'}</td>
      <td class="num">${lgN(p.lp)} LP</td><td class="num">${lgHeat(p.winRate, 0.5, 0.1, p.games, lgPct(p.winRate))}</td><td class="num"><small>${p.wins}W ${p.losses}L</small>${lgN(p.games)}</td></tr>`; });
  box().innerHTML = !ps.length ? '<p class="lg-wait">No ladder for this region yet.</p>' : `<table class="lg-table lg-ladder"><thead><tr><th class="num">#</th><th>Player</th><th class="num">LP</th><th class="num">Win</th><th class="num">Games</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  lgLadderFind();
}
