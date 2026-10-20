// Smoke check: open every League champion page, TFT comp and Deadlock hero in the running app and fail if any says
// "Stats offline" while the stats crawler's /status answers, or "Something broke" anywhere. #137 shipped a champion page
// that read "Stats offline" for every champion for 20 minutes because a render error landed in the offline catch.
// Needs the Electron host running with CDP:  cd app && npx electron . --remote-debugging-port=9333
// Run from the repo root:                     node scripts/smoke-stats.js   (env CDP_PORT, CRAWLER, LIMIT)
const http = require('http');
const WS = require('../app/node_modules/ws');
const PORT = process.env.CDP_PORT || 9333, CRAWLER = process.env.CRAWLER || 'http://10.205.0.81:47900', LIMIT = Number(process.env.LIMIT) || 0;
const getJSON = (u) => new Promise((res, rej) => http.get(u, (r) => { let d = ''; r.on('data', (c) => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } }); }).on('error', rej));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /Stats offline|Something broke|deadlock-api error/;
// Text of the page, the TFT view and the Deadlock shadow root, so one check covers all three worlds.
const TEXT = `(() => { const host = [...document.querySelectorAll('*')].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.deadlock-surface'));
  return document.body.innerText + '\\n' + (host && !host.hidden ? host.shadowRoot.textContent : ''); })()`;

(async () => {
  const status = await getJSON(CRAWLER + '/status').catch(() => null);
  if (!status) { console.log(`stats crawler at ${CRAWLER} did not answer /status: nothing to check`); process.exit(2); }
  const page = (await getJSON(`http://127.0.0.1:${PORT}/json`)).find((p) => p.type === 'page' && /index\.html/.test(p.url));
  if (!page) { console.log(`no app window on CDP port ${PORT}`); process.exit(2); }
  const ws = new WS(page.webSocketDebuggerUrl); await new Promise((r) => ws.on('open', r));
  let id = 0; const pend = {};
  ws.on('message', (m) => { const x = JSON.parse(m); if (pend[x.id]) { pend[x.id](x); delete pend[x.id]; } });
  const evaluate = (expression) => new Promise((r) => { const i = ++id; pend[i] = (x) => r(x.result?.result?.value); ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } })); });
  const go = async (hash) => { await evaluate(`location.hash = ${JSON.stringify(hash)}`); };

  const lol = await getJSON(CRAWLER + '/lol/tiers');
  const champs = [...new Set((lol.champions || []).map((c) => c.champion))];
  const comps = ((await getJSON(CRAWLER + '/tft/comps')).comps || []).map((c) => c.id);
  await go('#/deadlock/heroes'); await wait(4000);
  const heroes = await evaluate(`(() => { const h = [...document.querySelectorAll('*')].find((e) => e.shadowRoot && e.shadowRoot.querySelector('.deadlock-surface'));
    return h ? [...new Set([...h.shadowRoot.querySelectorAll('[data-hero]')].map((b) => b.dataset.hero))] : []; })()`) || [];
  const cut = (a) => LIMIT ? a.slice(0, LIMIT) : a;
  const routes = [...cut(champs).map((c) => `#/league/champion/${c}`), ...cut(comps).map((c) => `#/tft/comp/${encodeURIComponent(c)}`), ...cut(heroes).map((h) => `#/deadlock/heroes/${h}`)];
  console.log(`checking ${routes.length} pages (${Math.min(champs.length, LIMIT || 1e9)} champions, ${Math.min(comps.length, LIMIT || 1e9)} comps, ${Math.min(heroes.length, LIMIT || 1e9)} heroes)`);

  const failures = [];
  for (const [n, hash] of routes.entries()) {
    await go(hash);
    let text = '';
    await wait(1000); // let the route swap in before reading, or the previous page passes for this one
    for (let t = 0; t < 40; t++) { // up to 10 s for the page to settle (no "Loading…" left)
      await wait(250);
      text = await evaluate(TEXT) || '';
      if (BAD.test(text) || !/Loading|Reading/.test(text)) break;
    }
    const m = text.match(BAD);
    if (m) { failures.push(`${hash}: ${text.slice(Math.max(0, m.index - 40), m.index + 100).replace(/\s+/g, ' ')}`); process.stdout.write('x'); } else process.stdout.write('.');
    if ((n + 1) % 80 === 0) process.stdout.write('\n');
  }
  await go('#/'); ws.close();
  console.log(`\n${failures.length} failing of ${routes.length}`);
  for (const f of failures) console.log(f);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
