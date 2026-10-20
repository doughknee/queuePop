// DONI-564 (W8): a League match, all ten players, on the crawler's GET /lol/match/{id} (raw from its store, else Riot under the
// shared lookup cap). Route #/league/match/{PLATFORM_gameId}; opened from match history, summoner pages and the leaderboard's
// players. Per team: result, bans, objectives; per player: champion (linked), Riot ID (linked to their page), KDA, damage with
// a bar against the match's highest, taken, CS/min, gold, vision, items, spells and keystone. Lowroll grammar, tokens only.
const LG_MT_OBJ = [['tower', 'Towers'], ['dragon', 'Dragons'], ['baron', 'Barons'], ['riftHerald', 'Heralds'], ['horde', 'Grubs'], ['inhibitor', 'Inhibitors']];
const lgMatchId = (gameId, region) => `${(region ? lgRegionCode(region) : lgMyPlatform()).toUpperCase()}_${gameId}`;

function leagueMatchPage() {
  const id = decodeURIComponent(location.hash.split('/')[3] || '');
  lgMount('match', t => lgFillMatch(t, id));
  return `<div class="lg-page lg-match-page"><header class="lg-band lg-match-band"><div class="lg-band-row"><h1 id="lg-mt-title">Match</h1><span class="lg-meta" id="lg-meta">${lgEsc(id)}</span>${lgSearch()}</div></header>
    <div id="lg-mt"><p class="lg-wait">Reading the match… a match the crawler doesn't hold yet comes from Riot and can take a few seconds.</p></div></div>`;
}

async function lgFillMatch(token, id) {
  const box = () => token === lg.token && document.getElementById('lg-mt');
  let m, items, runes, spells;
  try {
    m = await statsApi.match(id);
    [items, runes, spells] = await Promise.all([statsApi.items(m.patch).catch(() => null), statsApi.runes(m.patch).catch(() => null), statsApi.spells(m.patch).catch(() => null), lgNames(m.patch).catch(() => null)]);
  } catch (e) {
    if (box()) box().innerHTML = `<p class="lg-offline">${lgLookupError(e, 'match with this id')}</p>`;
    return;
  }
  if (!box()) return;
  const L = lgLookups(items?.d, runes?.d, spells?.d), s = leagueLive.summoner, me = s ? `${s.name}#${s.tag}`.toLowerCase() : '', min = m.duration / 60;
  const ps = m.participants || [], maxDmg = Math.max(1, ...ps.map(p => p.damage || 0)), slim = m.source === 'rows';
  document.getElementById('lg-mt-title').textContent = queueMap[m.queueId] || `Queue ${m.queueId}`;
  document.getElementById('lg-meta').textContent = `${m.duration ? `${Math.floor(min)}:${String(Math.round(m.duration % 60)).padStart(2, '0')} · ` : ''}patch ${m.patch} · ${new Date(m.startedAt).toLocaleString()}`;
  const team = t => {
    const T = (m.teams || []).find(x => x.team === t) || {}, rows = ps.filter(p => p.team === t), k = rows.reduce((n, p) => n + (p.kills || 0), 0);
    const obj = LG_MT_OBJ.map(([key, label]) => T.objectives?.[key] && T.objectives[key].kills != null ? `<span title="${label}${T.objectives[key].first ? ' · took the first' : ''}">${label} <b>${T.objectives[key].kills}</b>${T.objectives[key].first ? '<i>1st</i>' : ''}</span>` : '').join('');
    return `<section class="lg-mt-team ${T.win ? 'win' : 'loss'}"><header><b class="lg-result">${T.win ? 'Victory' : 'Defeat'}</b><span>${t === 100 ? 'Blue' : 'Red'} side · ${k} kills</span>
      <span class="lg-mt-obj">${obj}</span><span class="lg-mt-bans">${(T.bans || []).filter(b => b > 0).map(b => `<a href="#/league/champion/${b}" title="Banned: ${lgEsc(lgChamp(b).name)}">${lgIcon(b, 'lg-icon lg-ban')}</a>`).join('')}</span></header>
      <table class="lg-table lg-mt-table"><thead><tr><th>Player</th><th class="num">KDA</th><th>Damage</th><th class="num">Taken</th><th class="num">CS</th><th class="num">Gold</th><th class="num">Vision</th><th>Build</th></tr></thead><tbody>
      ${rows.map(p => { const c = lgChamp(p.champion), role = lgRoleOf(p.role), kda = p.kills == null ? '–' : ((p.kills + p.assists) / Math.max(1, p.deaths)).toFixed(2);
        const ks = p.keystone && L.where[p.keystone], rid = p.riotId || '';
        return `<tr class="${me && (p.riotId || '').toLowerCase() === me ? 'lg-mt-me' : ''}"><td class="lg-name"><a href="#/league/champion/${p.champion}${LG_ROLES.includes(role) ? '/' + role : ''}" title="${lgEsc(c.name)} · level ${p.level ?? '–'}">${lgIcon(p.champion)}</a>
          <span class="lg-mt-who">${rid ? `<a href="#/league/summoner/${lgRiotSlug(rid)}/${String(m.id).split('_')[0].toLowerCase()}">${lgEsc(rid.split('#')[0])}</a>` : '<span>Unknown</span>'}<small>${lgEsc(c.name)}${LG_ROLE[role] ? ' · ' + LG_ROLE[role] : ''}</small></span></td>
          <td class="num">${p.kills ?? '–'} / ${p.deaths ?? '–'} / ${p.assists ?? '–'}<small>${kda}</small></td>
          <td class="lg-mt-dmg">${p.damage == null ? '–' : `<span class="lg-mt-bar" style="--w:${(p.damage / maxDmg * 100).toFixed(0)}%"></span>${lgN(p.damage)}`}</td>
          <td class="num">${p.damageTaken == null ? '–' : lgN(p.damageTaken)}</td><td class="num">${p.cs ?? '–'}<small>${p.cs == null || !min ? '' : (p.cs / min).toFixed(1) + '/m'}</small></td>
          <td class="num">${p.gold == null ? '–' : (p.gold / 1000).toFixed(1) + 'k'}</td><td class="num">${p.vision ?? '–'}</td>
          <td class="lg-mt-build">${(p.spells || []).map(k => lgImg(L.spellBy[k] ? lgDD(`spell/${L.spellBy[k].image.full}`) : `assets/spells/${k}.png`, L.spellBy[k]?.name || k)).join('')}${ks ? lgImg(`${statsApi.DD}/cdn/img/${ks.r.icon}`, ks.r.name) : ''}<span class="lg-mt-items">${(p.items || []).filter(Boolean).map(i => L.itemImg(i)).join('')}</span></td></tr>`; }).join('')}
      </tbody></table></section>`;
  };
  // Q22: your recorded moments (Settings > Recorder) as a strip above the teams; nothing when the game wasn't recorded.
  const getRec = id => Promise.resolve(window.pywebview?.api?.get_recording?.(id)).catch(() => null); // the recorder keys by the bare game id
  const rec = (await getRec(m.id)) || (await getRec(String(m.id).split('_').pop()));
  if (!box()) return;
  box().innerHTML = (rec && window.recStrip ? `<section class="lg-mt-rec"><span class="lg-kicker">Your moments</span>${recStrip(rec)}</section>` : '') + (slim ? '<p class="lg-wait">The full details of this match are past the crawler\'s 7-day window; only the outline is left.</p>' : '') + team(100) + team(200);
}
