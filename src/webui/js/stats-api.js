/* DONI-483: queuePop stats crawler + Data Dragon, fetched from the renderer and cached in memory (never on disk).
   Crawler base: config key crawler_url (get_config), default the Unraid box. Shapes: crawler/README.md "Endpoints". */
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900', DD = 'https://ddragon.leagueoflegends.com';
  const TTL = 10 * 60 * 1000; // the crawler aggregates hourly; ten minutes keeps a long session fresh enough
  const memo = new Map(), good = new Map(), RETRY = 30000;
  // Crawler down mid-session (Q queue 5): a refetch that fails on the network, a timeout or a 5xx answers with the last good
  // copy instead, so a page that re-renders keeps its data; statsApi.stale says so (the status line shows "retrying"), and
  // that key is tried again after 30 s. A 4xx, or a key never loaded, still fails as before.
  const setStale = v => { if (api.stale !== v) { api.stale = v; try { window.dispatchEvent(new CustomEvent('qp:crawler-stale', { detail: v })); } catch {} } };
  function once(key, fn, ttl = TTL) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = fn().then(v => { good.set(key, v); if (key[0] === 'c') setStale(false); return v; }, e => {
      memo.delete(key); // failures retry on the next render
      if (good.has(key) && !(e.status >= 400 && e.status < 500)) { memo.set(key, { t: Date.now() - ttl + RETRY, p: Promise.resolve(good.get(key)) }); setStale(true); return good.get(key); }
      throw e;
    });
    memo.set(key, { t: Date.now(), p });
    return p;
  }
  // D15: errors keep the HTTP status and Retry-After (seconds) so pages can say what happened.
  const json = (url, ms = 6000) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) { const e = new Error(`${r.status} ${url}`); e.status = r.status; e.retry = Number(r.headers.get('Retry-After')) || 0; throw e; } return r.json(); }).catch(e => { e.fetch = true; throw e; }); // fetch: a network/HTTP failure, as opposed to a page bug (see lgFail)
  // DONI-515: before the bridge is ready, use the default without memoising it, so a configured crawler_url wins on the next call.
  const base = () => !window.pywebview?.api ? Promise.resolve(DEFAULT_CRAWLER) : once('base', async () => {
    let u = '';
    try { u = (await window.pywebview?.api?.get_config())?.crawler_url || ''; } catch {}
    return String(u || DEFAULT_CRAWLER).replace(/\/+$/, '');
  }, 60000);
  const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v && v !== 'all')).toString();
  const crawler = async (path, params = {}, ms) => { const q = qs(params), b = await base(); return once(`c${b}${path}?${q}`, () => json(`${b}${path}${q ? '?' + q : ''}`, ms)); }; // the base is in the key (review #74)
  // A crawler patch ("16.20") maps to the newest Data Dragon build of it ("16.20.1"); unknown patches use the newest build.
  const ddVersion = patch => once('ddv', () => json(`${DD}/api/versions.json`), 3600000)
    .then(v => { const p = String(patch || '').replace(/-(flex|aram|normal|swift)$/, ''); return v.find(x => p && x.startsWith(p + '.')) || v[0]; }); // D15/DONI-596: mode answers carry "16.20-aram", "16.20-flex", ...
  const ddData = (patch, file) => ddVersion(patch).then(v => once(`dd${v}${file}`, () => json(`${DD}/cdn/${v}/data/en_US/${file}`), 3600000).then(d => ({ v, d })));

  /* Tier banding (DONI-506, Lolalytics-style S+ .. D-), over the rows of one /lol/tiers response:
     1. win rate is shrunk toward the list's average by 100 prior games: (wins + 100*avg) / (games + 100),
        so a 20-game 70% row lands near average instead of S;
     2. score = 0.55 * pct(shrunk win rate) + 0.20 * pct(PBI) + 0.15 * pct(best-player win rate)
              + 0.10 * pct(best-player avg rank), percentiles 0..1 among the banded rows; a row with no best block
        (or an older crawler without pbi) gets the neutral 0.5 for that part;
     3. ranked by score: top 10% S, next 20% A, middle 40% B, next 20% C, bottom 10% D, each band split in thirds
        into +, plain and - (S+ S S- A+ ... D-).
     lowSample rows are not banded: tier null, score -1, so they sort last and render greyed without a badge. */
  const PRIOR = 100, BANDS = [['S', 0.1], ['A', 0.3], ['B', 0.7], ['C', 0.9], ['D', 1]];
  function pct(values) {
    const sorted = [...values].sort((a, b) => a - b), n = values.length;
    return values.map(v => {
      if (n < 2) return 1;
      const lo = sorted.findIndex(x => x >= v), hi = sorted.findLastIndex(x => x <= v);
      return (lo + hi) / 2 / (n - 1); // ties share their average rank
    });
  }
  // Percentiles of f(row) where it is defined, 0.5 where it is not.
  function pctOr(rows, f) {
    const have = rows.map(f), idx = have.map((v, i) => v == null ? -1 : i).filter(i => i >= 0), p = pct(idx.map(i => have[i])), out = rows.map(() => 0.5);
    idx.forEach((i, k) => { out[i] = p[k]; });
    return out;
  }
  function bandOf(p) {
    let lo = 0;
    for (const [t, hi] of BANDS) { if (p < hi) return t + ['+', '', '-'][Math.min(2, Math.floor(3 * (p - lo) / (hi - lo) + 1e-9))]; lo = hi; }
    return 'D-';
  }
  function leagueTierRows(champions) {
    const all = (champions || []).filter(c => c && c.games > 0);
    const rows = all.filter(c => !c.lowSample);
    const out = all.filter(c => c.lowSample).map(c => ({ ...c, score: -1, tier: null }));
    if (!rows.length) return out;
    const games = rows.reduce((s, c) => s + c.games, 0), avg = rows.reduce((s, c) => s + c.wins, 0) / games;
    const wr = pct(rows.map(c => (c.wins + PRIOR * avg) / (c.games + PRIOR))), pbi = pctOr(rows, c => c.pbi);
    const bw = pctOr(rows, c => c.best?.winRate), bt = pctOr(rows, c => c.best?.avgTier);
    const scored = rows.map((c, i) => ({ ...c, score: 0.55 * wr[i] + 0.2 * pbi[i] + 0.15 * bw[i] + 0.1 * bt[i] }));
    [...scored].sort((a, b) => b.score - a.score).forEach((c, i) => { c.tier = bandOf(i / scored.length); });
    return [...scored, ...out];
  }

  /* DONI-507 items 4·5·6: per build slot 4..6, the most-bought options that are not already in the core build, so each
     slot reads "this OR that OR that". buildOrder = /lol/champion's { core, slots }; returns [[option, ...] × 3]. */
  function leagueSlotAlternatives(buildOrder, n = 3) {
    const core = new Set(String(buildOrder?.core?.[0]?.key || '').split(',').filter(Boolean));
    return [3, 4, 5].map(i => (buildOrder?.slots?.[i] || []).filter(o => !core.has(String(o.key))).slice(0, n));
  }

  window.leagueTierRows = leagueTierRows;
  // League match history: your champions over these games, most played first (games, win rate, KDA). test-league.js checks it.
  window.lgChampSplit = games => {
    const by = new Map();
    for (const g of games) { const r = by.get(g.championId) || { championId: g.championId, games: 0, wins: 0, k: 0, d: 0, a: 0, position: g.position }; r.games++; r.wins += g.win ? 1 : 0; r.k += g.kills; r.d += g.deaths; r.a += g.assists; by.set(g.championId, r); }
    return [...by.values()].sort((a, b) => b.games - a.games || b.wins - a.wins).map(r => ({ ...r, winRate: r.wins / r.games, kda: (r.k + r.a) / Math.max(1, r.d) }));
  };
  window.leagueSlotAlternatives = leagueSlotAlternatives;
  const api = window.statsApi = { stale: false,
    patches: () => crawler('/patches'),
    tiers: p => crawler('/lol/tiers', p),
    champion: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}`, p),
    players: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}/players`, p), // DONI-506: top 50 on a champion
    status: () => crawler('/status'),
    // DONI-509: rolled up on first read after each aggregation (~10 s cold on the live box), so these wait longer.
    // DONI-508/512: on-demand player lookups (up to ~23 Riot requests when uncached) and the ranked ladders.
    summoner: (riotId, region) => crawler(`/lol/summoner/${encodeURIComponent(riotId)}`, { region }, 45000),
    tftPlayer: (riotId, region) => crawler(`/tft/player/${encodeURIComponent(riotId)}`, { region }, 45000),
    match: id => crawler(`/lol/match/${encodeURIComponent(id)}`, {}, 30000), // DONI-564
    tftMatch: id => crawler(`/tft/match/${encodeURIComponent(id)}`, {}, 30000),
    leaderboard: (game, region, limit = 100) => crawler(`/${game}/leaderboard`, { region, limit: String(limit) }, 20000),
    lolItems: p => crawler('/lol/items', p, 20000), lolRunes: p => crawler('/lol/runes', p, 20000), lolSpells: p => crawler('/lol/spells', p, 20000),
    ddVersion,
    items: patch => ddData(patch, 'item.json'),
    runes: patch => ddData(patch, 'runesReforged.json'),
    ddChampions: patch => ddData(patch, 'champion.json'),
    ddChampion: (patch, alias) => ddData(patch, `champion/${encodeURIComponent(alias)}.json`), // DONI-450: spells + passive
    spells: patch => ddData(patch, 'summoner.json'),
    DD,
  };
})();
