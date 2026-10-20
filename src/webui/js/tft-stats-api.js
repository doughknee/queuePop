// TFT stats data (DONI-484): the queuePop stats crawler (config key crawler_url) and Community Dragon names/icons.
// Plain script, no DOM: app/test-tft.js runs it in a vm to check the comp banding.
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900';
  const CDRAGON = 'https://raw.communitydragon.org/latest/';

  // Tier banding. Score = average placement minus a popularity bonus of up to half a place
  // (5 x pick rate, capped at a 10% pick rate), so a popular comp that places well outranks a rare one.
  // S: score <= 3.5 · A: <= 4.0 · B: <= 4.5 (an average lobby placement) · C: everything else.
  // Low-sample rows get no tier (DONI-505): compRows sets tier null and the UI shows a dash, greyed, below the ranked rows.
  function compTier(c) {
    const score = c.avgPlacement - 5 * Math.min(c.pickRate || 0, 0.1);
    return score <= 3.5 ? 'S' : score <= 4 ? 'A' : score <= 4.5 ? 'B' : 'C';
  }
  // /tft/comps response → rows with a tier, best first: full-sample rows before low-sample ones, then tier, then avg placement.
  function compRows(resp) {
    const order = { S: 0, A: 1, B: 2, C: 3 };
    return ((resp && resp.comps) || []).filter((c) => c.id !== 'none').map((c) => ({ ...c, tier: c.lowSample ? null : compTier(c) }))
      .sort((a, b) => a.lowSample - b.lowSample || (order[a.tier] ?? 4) - (order[b.tier] ?? 4) || a.avgPlacement - b.avgPlacement);
  }

  let base = null;
  async function crawler() {
    if (base) return base;
    let url = '';
    try { url = String(((await window.pywebview.api.get_config()) || {}).crawler_url || '').trim(); } catch (_) { /* default */ }
    return (base = (url || DEFAULT_CRAWLER).replace(/\/+$/, ''));
  }
  const memo = new Map();
  // GET {crawler}{path}; cached per URL for the session. Rejects on network error, timeout or non-2xx.
  async function get(path, ms = 6000) {
    const url = (await crawler()) + path;
    if (!memo.has(url)) {
      memo.set(url, fetch(url, { signal: AbortSignal.timeout(ms) }).then((r) => r.ok ? r.json() : Promise.reject(Object.assign(new Error(r.status), { status: r.status, retry: Number(r.headers.get('Retry-After')) || 0 }))));
      memo.get(url).catch(() => memo.delete(url));
    }
    return memo.get(url);
  }

  // Names and icons (DONI-550): the crawler's /tft/meta (current set, ~250 KB, cached daily) first; Community Dragon's
  // ~24 MB en_us.json (every set, plus attack range for the comp board) only as the fallback or when loadFull() is asked.
  let dragon = null, full = null, names = new Map();
  const png = (p) => p && p !== 'None' ? CDRAGON + 'game/' + p.toLowerCase().replace(/\.(tex|dds)$/, '.png') : '';
  function loadDragon() {
    return dragon || (dragon = get('/tft/meta', 10000).then((m) => {
      const map = new Map(names), tn = (t) => (m.traits && m.traits[t] && m.traits[t].name) || t;
      for (const [k, u] of Object.entries(m.units || {})) map.set(k, { ...(names.get(k) || {}), name: u.name, icon: u.icon, cost: u.cost, traits: (u.traits || []).map(tn) });
      for (const [k, t] of Object.entries(m.traits || {})) map.set(k, { name: t.name, icon: t.icon, breakpoints: t.breakpoints });
      for (const [k, i] of Object.entries(m.items || {})) map.set(k, { name: i.name, icon: i.icon });
      return (names = map);
    }).catch(() => loadFull()));
  }
  function loadFull() {
    return full || (full = fetch(CDRAGON + 'cdragon/tft/en_us.json', { signal: AbortSignal.timeout(60000) }).then((r) => r.json()).then((j) => {
      const map = new Map();
      for (const s of Object.keys(j.sets || {}).sort((a, b) => a - b).map((k) => j.sets[k])) {
        for (const c of s.champions || []) map.set(c.apiName, { name: c.name, icon: png(c.tileIcon || c.squareIcon), cost: c.cost, range: c.stats && c.stats.range, traits: c.traits || [] });
        for (const t of s.traits || []) map.set(t.apiName, { name: t.name, icon: png(t.icon), breakpoints: (t.effects || []).map((e) => e.minUnits).filter(Boolean) });
      }
      for (const i of j.items || []) if (!map.has(i.apiName)) map.set(i.apiName, { name: i.name, icon: png(i.icon) });
      for (const [k, v] of names) map.set(k, { ...(map.get(k) || {}), ...v, range: (map.get(k) || {}).range }); // meta wins, CDragon adds range
      return (names = map);
    }).catch(() => names));
  }
  // Fallback name: TFT16_MissFortune / DA_18_Azir / DA_Fiddlesticks18 → "Miss Fortune" / "Azir" / "Fiddlesticks".
  const bare = (key) => String(key).replace(/^(?:[A-Za-z]*\d*_)+(?=[A-Za-z])/, '').replace(/\d+$/, '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  // Sync lookup; names fill in once loadDragon() resolves (the view re-renders then).
  const info = (key) => names.get(key) || { name: bare(key), icon: '' };

  // Regions the crawler seeds for TFT (DONI-505), from /status seed keys like "tft:na1"; labels like NA, KR, EUW, OCE.
  const regionLabel = (r) => ({ oc1: 'OCE' })[r] || r.replace(/\d+$/, '').toUpperCase();
  const regions = () => get('/status').then((s) => (s.seed || []).filter((k) => k.startsWith('tft:')).map((k) => k.slice(4)).sort())
    .catch(() => ['kr', 'na1']);

  window.tftStats = { compTier, compRows, get, crawler, loadDragon, loadFull, info, bare, regions, regionLabel };
})();
