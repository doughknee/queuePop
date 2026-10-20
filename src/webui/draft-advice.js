/* Live draft suggestions (DONI-553): the crawler's /lol/draft ranks champions for your assigned role against the enemies who have
   locked, with the allies you have, minus bans and picked champions. The live champ select view (js/pages/live.js) shows
   the top 5, each with one line saying why. Loaded by shell.js; pure helpers are tested by app/test-draft.js. */
(function () {
  const ROLES = { top: 'top', jungle: 'jungle', middle: 'middle', mid: 'middle', bottom: 'bottom', bot: 'bottom', utility: 'utility', support: 'utility' };
  const ids = list => [...new Set((list || []).map(Number).filter(n => n > 0))];

  // get_champ_select's shape → what /lol/draft needs. role is null until the client assigns one (blind, ARAM).
  function draftContext(cs) {
    const me = (cs.myTeam || []).find(p => p.isLocal) || {};
    return {
      role: ROLES[String(me.position || '').toLowerCase()] || null,
      myChampion: Number(me.championId) || 0,
      enemies: ids((cs.theirTeam || []).map(p => p.championId)),
      allies: ids((cs.myTeam || []).filter(p => !p.isLocal).map(p => p.championId)),
      bans: ids([...(cs.bans?.my || []), ...(cs.bans?.their || [])].map(b => b.championId)),
    };
  }
  // The query string; the same draft state always gives the same string, so it doubles as the cache key.
  const draftQuery = ctx => new URLSearchParams({ role: ctx.role, enemies: ctx.enemies.join(','), allies: ctx.allies.join(','), bans: ctx.bans.join(',') }).toString();

  const pct = x => x * 100; // the crawler's rates and deltas are fractions (0.031 = 3.1 points), like /lol/tiers
  const signed = d => (d > 0 ? '+' : '') + pct(d).toFixed(1);
  // One line per candidate: its strongest matchup edge, its best ally, then the sample. E.g.
  // "+3.1 vs Caitlyn, good with Thresh, 52.4 % over 3,961 games".
  function whyLine(c, name) {
    const parts = [], comps = c.components || [];
    const vs = comps.filter(x => x.kind === 'vs' && Number.isFinite(x.delta)).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    if (vs && Math.abs(pct(vs.delta)) >= 0.5) parts.push(`${signed(vs.delta)} vs ${name(vs.champion)}`);
    const w = comps.filter(x => x.kind === 'with' && x.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    if (w && pct(w.delta) >= 0.5) parts.push(`good with ${name(w.champion)}`);
    if (Number.isFinite(c.winRate) && c.games) parts.push(`${pct(c.winRate).toFixed(1)} % over ${Number(c.games).toLocaleString('en-US')} games`);
    return parts.join(', ');
  }
  // Response → the rows to show: best first, low samples after full ones, never a champion already gone.
  function topCandidates(resp, ctx, n = 5) {
    const gone = new Set([...ctx.enemies, ...ctx.allies, ...ctx.bans]);
    return ((resp && resp.candidates) || []).filter(c => !gone.has(Number(c.champion)))
      .sort((a, b) => (a.lowSample ? 1 : 0) - (b.lowSample ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0)).slice(0, n);
  }
  const api = { draftContext, draftQuery, whyLine, topCandidates };
  if (typeof window !== 'undefined') window.draftAdvice = api;
  if (typeof document === 'undefined') return;

  // Fetch, once per draft state (a new lock or ban changes the query). Rejects when the crawler can't help, so the live
  // view falls back to the older rule-based suggestions.
  const memo = new Map();
  let base = null;
  async function crawler() {
    if (base) return base;
    let u = ''; try { u = ((await window.pywebview.api.get_config()) || {}).crawler_url || ''; } catch {}
    return (base = String(u || 'http://10.205.0.81:47900').replace(/\/+$/, ''));
  }
  api.fetch = async ctx => {
    const q = draftQuery(ctx);
    if (!memo.has(q)) {
      memo.set(q, crawler().then(b => fetch(`${b}/lol/draft?${q}`, { signal: AbortSignal.timeout(5000) }))
        .then(r => (r.ok ? r.json() : Promise.reject(new Error('draft ' + r.status)))));
      memo.get(q).catch(() => setTimeout(() => memo.delete(q), 15000)); // a miss retries after 15 s, not every poll
    }
    return memo.get(q);
  };
  // Names when the League client's catalog isn't loaded yet: Data Dragon, once.
  const dd = {};
  api.ddName = id => dd[id] || '';
  setTimeout(() => window.statsApi?.ddChampions().then(({ d }) => { for (const c of Object.values(d.data || {})) dd[c.key] = c.name; }).catch(() => {}), 2000);
  // crawler_url changed in Settings: next fetch uses it.
  if (window.QP && QP.bus) QP.bus.on('config:changed', ({ path }) => { if (path === 'crawler_url') { base = null; memo.clear(); } });
})();
