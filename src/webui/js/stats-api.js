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
  window.leagueSlotAlternatives = leagueSlotAlternatives;
  window.statsApi = {
    patches: () => crawler('/patches'),
    tiers: p => crawler('/lol/tiers', p),
    champion: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}`, p),
    players: (id, p) => crawler(`/lol/champion/${encodeURIComponent(id)}/players`, p), // DONI-506: top 50 on a champion
    status: () => crawler('/status'),
    ddVersion,
    items: patch => ddData(patch, 'item.json'),
    runes: patch => ddData(patch, 'runesReforged.json'),
    ddChampions: patch => ddData(patch, 'champion.json'),
    spells: patch => ddData(patch, 'summoner.json'),
    DD,
  };
})();
