/* DONI-483: queuePop stats crawler + Data Dragon, fetched from the renderer and cached in memory (never on disk).
   Crawler base: config key crawler_url (get_config), default the Unraid box. Shapes: crawler/README.md "Endpoints". */
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900', DD = 'https://ddragon.leagueoflegends.com';
  const TTL = 10 * 60 * 1000; // the crawler aggregates hourly; ten minutes keeps a long session fresh enough
  const memo = new Map();
  function once(key, fn, ttl = TTL) {
    const hit = memo.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.p;
    const p = fn().catch(e => { memo.delete(key); throw e; }); // failures retry on the next render
    memo.set(key, { t: Date.now(), p });
    return p;
  }
  const json = url => fetch(url, { signal: AbortSignal.timeout(6000) }).then(r => { if (!r.ok) throw new Error(`${r.status} ${url}`); return r.json(); });
  const base = () => once('base', async () => {
    let u = '';
    try { u = (await window.pywebview?.api?.get_config())?.crawler_url || ''; } catch {}
    return String(u || DEFAULT_CRAWLER).replace(/\/+$/, '');
  }, 60000);
  const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v && v !== 'all')).toString();
  const crawler = (path, params = {}) => { const q = qs(params); return once(`c${path}?${q}`, async () => json(`${await base()}${path}${q ? '?' + q : ''}`)); };
  // A crawler patch ("16.20") maps to the newest Data Dragon build of it ("16.20.1"); unknown patches use the newest build.
  const ddVersion = patch => once('ddv', () => json(`${DD}/api/versions.json`), 3600000)
    .then(v => v.find(x => patch && x.startsWith(patch + '.')) || v[0]);
  const ddData = (patch, file) => ddVersion(patch).then(v => once(`dd${v}${file}`, () => json(`${DD}/cdn/${v}/data/en_US/${file}`), 3600000).then(d => ({ v, d })));

  /* Tier banding (Lolalytics-style percentile bands), over the rows of one /lol/tiers response:
     1. win rate is shrunk toward the list's average by 100 prior games: (wins + 100*avg) / (games + 100),
        so a 2-game 100% row lands near average instead of S;
     2. score = 0.75 * percentile(shrunk win rate) + 0.25 * percentile(pick rate), percentiles 0..1 within the list;
     3. ranked by score: top 10% S, next 20% A, middle 40% B, next 20% C, bottom 10% D.
     lowSample rows are banded too but render greyed. */
  const PRIOR = 100;
  function pct(values) {
    const sorted = [...values].sort((a, b) => a - b), n = values.length;
    return values.map(v => {
      if (n < 2) return 1;
      const lo = sorted.findIndex(x => x >= v), hi = sorted.findLastIndex(x => x <= v);
      return (lo + hi) / 2 / (n - 1); // ties share their average rank
    });
  }
  function leagueTierRows(champions) {
    const rows = (champions || []).filter(c => c && c.games > 0);
    if (!rows.length) return [];
    const games = rows.reduce((s, c) => s + c.games, 0), avg = rows.reduce((s, c) => s + c.wins, 0) / games;
    const wr = pct(rows.map(c => (c.wins + PRIOR * avg) / (c.games + PRIOR))), pr = pct(rows.map(c => c.pickRate));
    const scored = rows.map((c, i) => ({ ...c, score: 0.75 * wr[i] + 0.25 * pr[i] }));
    [...scored].sort((a, b) => b.score - a.score).forEach((c, i) => {
      const p = i / scored.length;
      c.tier = p < 0.1 ? 'S' : p < 0.3 ? 'A' : p < 0.7 ? 'B' : p < 0.9 ? 'C' : 'D';
    });
    return scored;
  }

  /* DONI-507 items 4·5·6: per build slot 4..6, the most-bought options that are not already in the core build, so each
     slot reads "this OR that OR that". buildOrder = /lol/champion's { core, slots }; returns [[option, ...] × 3]. */
  function leagueSlotAlternatives(buildOrder, n = 3) {
    const core = new Set(String(buildOrder?.core?.[0]?.key || '').split(',').filter(Boolean));
    return [3, 4, 5].map(i => (buildOrder?.slots?.[i] || []).filter(o => !core.has(String(o.key))).slice(0, n));
  }

  window.leagueTierRows = leagueTierRows;
  window.leagueSlotAlternatives = leagueSlotAlternatives;
  window.statsApi = {
    patches: () => crawler('/patches'),
    tiers: p => crawler('/lol/tiers', p),
    champion: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}`, p),
    championPlayers: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}/players`, p), // DONI-506's endpoint; 404 until deployed
    status: () => crawler('/status'),
    ddVersion,
    items: patch => ddData(patch, 'item.json'),
    runes: patch => ddData(patch, 'runesReforged.json'),
    ddChampions: patch => ddData(patch, 'champion.json'),
    spells: patch => ddData(patch, 'summoner.json'),
    DD,
  };
})();
