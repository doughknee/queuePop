// DONI-508: any summoner's page and the ranked ladder, Lolalytics/OP.GG style, on the crawler's on-demand lookups.
// #/league/summoner/{Name-TAG}[/{region}] reads GET /lol/summoner/{riotId}?region (account, ranks, last 20 matches; the crawler
// caches 10 min and allows a few uncached lookups a minute), #/league/leaderboard[/{region}] reads GET /lol/leaderboard.
// The League search opens Riot IDs here (league-stats.js). Champion leaderboards stay on each champion page (best players).
const LG_QUEUE_NAME = { RANKED_SOLO_5x5: 'Solo / duo', RANKED_FLEX_SR: 'Flex' };
const LG_REGION_CODE = { na: 'na1', euw: 'euw1', eune: 'eun1', oc: 'oc1', oce: 'oc1', br: 'br1', jp: 'jp1', tr: 'tr1', la: 'la1', lan: 'la1', las: 'la2' };
const lgRegionCode = r => { r = String(r || '').toLowerCase(); return LG_REGION_CODE[r] || r || 'na1'; };
const lgRiotSlug = id => encodeURIComponent(String(id).replace('#', '-'));
const lgTierWord = t => t ? t[0] + t.slice(1).toLowerCase() : 'Unranked';
const lgAgoMs = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

function leagueSummonerPage() {
  const [, , , slug = '', region = ''] = location.hash.split('/'), riot = decodeURIComponent(slug).replace(/-(?=[^-]*$)/, '#');
  const reg = lgRegionCode(region || (lg.region !== 'all' ? lg.region : leagueLive.summoner?.region));
  lgMount('summoner', t => lgFillSummoner(t, riot, reg));
  const top = Object.keys(champions)[0], art = leagueLive.real ? champArt(top) : `url('assets/ahri.webp')`;
  return `<div class="lg-page lg-summoner">${lgBand(art, 'center 20%', `<div class="lg-band-row"><h1 id="lg-sum-name">${lgEsc(riot.split('#')[0])}</h1><span class="lg-meta" id="lg-meta">#${lgEsc(riot.split('#')[1] || '')} · ${lgEsc(reg.toUpperCase())}</span>${lgSearch()}</div><div class="lg-you" id="lg-sum-ranks"></div>`)}
    <div id="lg-sum"><p class="lg-wait">Looking up ${lgEsc(riot)} on ${lgEsc(reg.toUpperCase())}… a fresh lookup reads up to 20 matches from Riot and can take half a minute.</p></div></div>`;
}

async function lgFillSummoner(token, riot, region) {
  const box = () => token === lg.token && document.getElementById('lg-sum');
  let d;
  try { d = await statsApi.summoner(riot, region); } catch (e) {
    const code = String(e.message).split(' ')[0];
    if (box()) box().innerHTML = `<p class="lg-offline">${code === '404' ? `No Riot ID "${lgEsc(riot)}" on ${lgEsc(region.toUpperCase())}. Check the #tag, or pick the region in the filters of the tier list.` : code === '429' ? 'The crawler allows a few fresh lookups a minute so the Riot key stays healthy. Try again in a minute.' : code === '503' ? 'The crawler\'s Riot key is not valid right now, so it cannot look players up. Replace it in Settings > Stats crawler.' : code === '400' ? 'That does not look like a Riot ID (name#tag).' : 'Stats offline · the stats crawler did not answer.'}</p>`;
    return;
  }
  await lgNames().catch(() => null);
  if (!box()) return;
  document.getElementById('lg-sum-name').textContent = d.riotId.split('#')[0];
  document.getElementById('lg-meta').textContent = `#${d.riotId.split('#')[1] || ''} · ${d.region.toUpperCase()} · level ${d.level}`;
  document.getElementById('lg-sum-ranks').innerHTML = (d.ranked || []).map(r => { const g = r.wins + r.losses; return `<span class="lg-you-rank"><small>${LG_QUEUE_NAME[r.queue] || lgEsc(r.queue)}</small> ${lgTierWord(r.tier)}${r.division && !/MASTER|CHALLENGER/.test(r.tier) ? ' ' + r.division : ''} <small>${r.lp} LP</small> ${g ? lgHeat(r.wins / g, 0.5, 0.1, g, lgPct(r.wins / g)) : ''}<small>${g} games</small></span>`; }).join('') || '<span class="lg-wait">Unranked this split.</span>';
  const m = d.matches || [], w = m.filter(x => x.win).length;
  box().innerHTML = !m.length ? '<p class="lg-wait">No recent matches.</p>' : `<header class="lg-head"><h2>Last ${m.length} matches</h2><span class="lg-sub">${w}W ${m.length - w}L · ${lgPct(w / m.length)} · fetched ${lgAgoMs(d.fetchedAt)}</span></header>
    <div class="lg-sum-list">${m.map(x => { const c = lgChamp(x.champion), kda = (x.kills + x.assists) / Math.max(1, x.deaths), role = lgRoleOf(x.role); return `<div class="lg-match ${x.win ? 'win' : 'loss'}"><div class="lg-match-row lg-sum-row">
      <span class="lg-result">${x.win ? 'Victory' : 'Defeat'}</span><a href="#/league/champion/${x.champion}${LG_ROLES.includes(role) ? '/' + role : ''}" title="Open ${lgEsc(c.name)}'s stats">${lgIcon(x.champion)}</a>
      <span class="lg-match-name"><a href="#/league/champion/${x.champion}">${lgEsc(c.name)}</a><small>${lgEsc(queueMap[x.queueId] || 'Queue ' + x.queueId)}</small></span>
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
    <div id="lg-ladder"><p class="lg-wait">Loading the ladder…</p></div>
    <p class="lg-rule">The crawler's ladder: Master and above refresh every 30 minutes, the rest daily. Click a player for their ranks and last 20 matches. Champion leaderboards are on each champion page (Best players).</p></div>`;
}

async function lgFillLeaderboard(token, region) {
  const box = () => token === lg.token && document.getElementById('lg-ladder');
  let d;
  try { d = await statsApi.leaderboard('lol', region, 200); } catch (_) { if (box()) box().innerHTML = lgOffline('the stats crawler did not answer.'); return; }
  if (!box()) return;
  const ps = d.players || [];
  box().innerHTML = !ps.length ? '<p class="lg-wait">No ladder for this region yet.</p>' : `<table class="lg-table lg-ladder"><thead><tr><th class="num">#</th><th>Player</th><th>Rank</th><th class="num">LP</th><th class="num">Win</th><th class="num">W</th><th class="num">L</th><th class="num">Games</th></tr></thead><tbody>
    ${ps.map(p => `<tr><td class="num">${p.rank}</td><td class="lg-name">${p.riotId ? `<a href="#/league/summoner/${lgRiotSlug(p.riotId)}/${p.region}"><span>${lgEsc(p.riotId.split('#')[0])}</span><small>#${lgEsc(p.riotId.split('#')[1] || '')}</small></a>` : '<span class="lg-wait">Name not crawled yet</span>'}</td>
      <td>${lgTierWord(p.tier)}${p.division ? ' ' + p.division : ''}</td><td class="num">${lgN(p.lp)}</td><td class="num">${lgHeat(p.winRate, 0.5, 0.1, p.games, lgPct(p.winRate))}</td><td class="num">${p.wins}</td><td class="num">${p.losses}</td><td class="num">${lgN(p.games)}</td></tr>`).join('')}
  </tbody></table>`;
}
