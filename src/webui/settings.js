/* App-level Settings (DONI-489, #/settings[#section]): one page, one card per area. Every control reads
   QP.store.config and writes through QP.store.set (debounced save_config) with the keys the Python-era
   Settings/Alerts pages used. The stats crawler card talks to the crawler straight from the renderer. */
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900';
  const SECTIONS = [['account', 'Account'], ['league', 'League'], ['alerts', 'Alerts'], ['companion', 'Phone companion'], ['crawler', 'Stats crawler'], ['display', 'Display'], ['about', 'Updates & about']];
  const EVENTS = [['queue_pop', 'Queue pops'], ['champ_select', 'Champ select starts'], ['locked_pick', 'Locked pick'], ['game_start', 'Game starts'], ['disconnect', 'Client disconnects']];
  const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5], UI_DEFAULT = 1.1; // DONI-516: Text size = Electron zoom factor, config ui_scale
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bridge = () => window.pywebview && window.pywebview.api;
  const root = document.getElementById('settings-view');
  let built = false, timer = null, customSound = '';

  const sw = (key, label, hint) => `<label class="st-row"><span class="st-lbl">${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="st-sw"><input type="checkbox" data-k="${key}"><i></i></span></label>`;
  const num = (key, label, hint, min, max) => `<label class="st-row"><span class="st-lbl">${label}${hint ? `<small>${hint}</small>` : ''}</span><input class="st-in st-num" type="number" data-k="${key}" data-num min="${min}" max="${max}"></label>`;
  const card = (id, title, body) => `<section class="st-card" id="st-${id}"><h2>${title}</h2>${body}</section>`;

  function build() {
    root.innerHTML = `<div class="st-wrap"><header class="st-head"><h1>Settings</h1><p>Everything queuePop can be told, in one place. Changes save as you make them.</p></header>` +
      card('account', 'Account', `
        <div class="st-row"><span class="st-lbl">League summoner<small>Read from the League client; sign in there to change it.</small></span><span id="st-summoner" class="st-val">Offline</span></div>
        <label class="st-row"><span class="st-lbl">Deadlock account ID<small>Your Steam friend ID (numbers). Powers the Deadlock player card.</small></span><input class="st-in" data-k="deadlock_account_id" data-digits inputmode="numeric" placeholder="e.g. 123456789"></label>
        <label class="st-row"><span class="st-lbl">Stats crawler URL<small>Where League and TFT stats come from.</small></span><input class="st-in st-wide" data-k="crawler_url" data-url placeholder="${DEFAULT_CRAWLER}"></label>`) +
      card('league', 'League', `
        ${num('accept_delay_seconds', 'Accept delay', 'Seconds to wait before accepting a ready check. 0 accepts instantly.', 0, 10)}
        <div class="st-row"><span class="st-lbl">Queues to auto-accept<small>Pick which queues on the Play page.</small></span><span id="st-queues" class="st-val"></span></div>
        ${sw('champ_select.enabled', 'Auto pick and ban', 'Hover, ban, pick and lock from your champ select plan.')}
        ${sw('champ_select.instant_lock', 'Lock in instantly', 'Off locks near the buzzer instead.')}
        ${num('champ_select.lock_in_at_seconds', 'Lock in with', 'Seconds left on the timer (when not instant).', 0, 30)}
        ${sw('champ_select.trades.enabled', 'Champion trades', 'Swap with teammates for a champion you ranked higher.')}
        ${sw('champ_select.aram.enabled', 'ARAM bench', 'Pick and grab upgrades from the ARAM bench.')}
        ${num('champ_select.aram.bench_delay', 'Bench grab delay', 'Seconds an upgrade sits on the bench before it is taken (0 to 3).', 0, 3)}
        ${sw('champ_select.auto_runes', 'Auto runes', 'Apply the recommended rune page when you lock.')}`) +
      card('alerts', 'Alerts', `
        <div class="st-sub">Tell me about</div>
        <div class="st-events">${EVENTS.map(([k, l]) => `<label class="st-chip"><input type="checkbox" data-k="alert_events.${k}"><span>${l}</span></label>`).join('')}</div>
        ${sw('desktop_notifications', 'Desktop notifications', 'A Windows toast for the events ticked above.')}
        ${sw('start_minimized', 'Start in the tray', 'Launch without opening the window.')}
        <div class="st-row"><span class="st-lbl">Test a toast</span><span class="st-act"><button class="st-btn" data-do="test-desktop">Send test</button><span class="st-msg" data-msg="test-desktop"></span></span></div>
        ${sw('discord_enabled', 'Discord', 'Post to a webhook so Discord pushes it to your phone.')}
        <label class="st-row"><span class="st-lbl">Webhook URL</span><input class="st-in st-wide" data-k="webhook_url" placeholder="https://discord.com/api/webhooks/…"></label>
        <label class="st-row"><span class="st-lbl">Discord user ID<small>Optional, for an @mention.</small></span><input class="st-in" data-k="user_id" placeholder="123456789012345678"></label>
        <div class="st-row"><span class="st-lbl">Test the webhook</span><span class="st-act"><button class="st-btn" data-do="test-discord">Send test</button><span class="st-msg" data-msg="test-discord"></span></span></div>
        <div class="st-row"><span class="st-lbl">Alarm sound<small>Used by the phone alarm.</small></span><span class="st-act">
          <select class="st-in" data-k="companion.sound"><option value="chime">Chime</option><option value="ping">Ping</option><option value="arcade">Arcade</option><option value="siren">Siren (loud)</option><option value="custom">Custom file</option></select>
          <button class="st-btn" data-do="preview-sound">Preview</button><button class="st-btn" data-do="pick-sound">Choose file…</button><span class="st-msg" id="st-sound-file"></span></span></div>`) +
      card('companion', 'Phone companion', `
        ${sw('companion.enabled', 'Alarm my phone when the queue pops', 'A page on your home Wi-Fi, no app or account. Restart queuePop after changing the port.')}
        ${num('companion.port', 'Port', '', 1024, 65535)}
        <div class="st-comp"><img id="st-qr" alt="Scan to open on your phone" hidden>
          <div><p id="st-comp-note" class="st-val"></p><p class="st-hint">Scan with your phone camera, tap Enable Alerts and keep the tab open. Same Wi-Fi only.</p>
          <span class="st-act"><button class="st-btn" data-do="copy-link">Copy link</button><button class="st-btn" data-do="test-companion">Test phone alert</button><span class="st-msg" data-msg="test-companion"></span></span></div></div>`) +
      card('crawler', 'Stats crawler', `
        <div class="st-row"><span class="st-lbl">Status<small id="st-cr-url"></small></span><span class="st-act"><span id="st-cr-state" class="st-val"></span><button class="st-btn" data-do="crawler-refresh">Refresh</button><button class="st-btn" data-do="crawler-open">Open status page</button></span></div>
        <div id="st-cr-grid" class="st-grid"></div>
        <div class="st-sub">Replace the Riot key</div>
        <label class="st-row"><span class="st-lbl">New key<small>Starts with RGAPI-</small></span><input class="st-in st-wide" id="st-cr-key" type="password" autocomplete="off" placeholder="RGAPI-…"></label>
        <label class="st-row"><span class="st-lbl">Admin token<small>The crawler's ADMIN_TOKEN. Used once, never stored.</small></span><input class="st-in st-wide" id="st-cr-token" type="password" autocomplete="off"></label>
        <div class="st-row"><span class="st-lbl"></span><span class="st-act"><button class="st-btn st-gold" data-do="crawler-key">Update key</button><span class="st-msg" data-msg="crawler-key"></span></span></div>`) +
      card('display', 'Display', `
        <label class="st-row"><span class="st-lbl">Text size<small>Scales the whole app. Ctrl + and Ctrl − step through these; Ctrl 0 goes back to 110%.</small></span><select class="st-in" data-k="ui_scale" data-scale>${UI_SCALES.map(v => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}</select></label>`) +
      card('about', 'Updates &amp; about', `
        <div class="st-row"><span class="st-lbl">Version<small id="st-upd-msg"></small></span><span class="st-act"><span id="st-ver" class="st-val"></span><button class="st-btn" data-do="check-update">Check for updates</button></span></div>
        <div class="st-row"><span class="st-lbl">Icon packs<small id="st-assets-msg"></small></span><span class="st-act"><button class="st-btn" data-do="refresh-assets">Refresh assets</button></span></div>
        <div class="st-row"><span class="st-lbl">Config folder<small>config.json and your stats live here.</small></span><span class="st-act"><button class="st-btn" data-do="open-config">Open folder</button><span class="st-msg" data-msg="open-config"></span></span></div>
        <div class="st-sub">Release notes</div><div id="st-notes" class="st-notes">Loading…</div>`) + `</div>`;
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    built = true;
  }

  // --- config <-> controls ---------------------------------------------------
  function hydrate() {
    const c = QP.store.config || {};
    root.querySelectorAll('[data-k]').forEach(el => {
      let v = QP.store.get(el.dataset.k);
      if (el.dataset.k === 'champ_select.instant_lock') v = v ?? true;
      if (el.dataset.k === 'crawler_url') v = v || '';
      if (el.dataset.k === 'ui_scale') v = UI_SCALES.includes(v) ? v : UI_DEFAULT;
      if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = v ?? '';
    });
    const ids = c.allowed_queue_ids || [];
    root.querySelector('#st-queues').textContent = ids.length ? `${ids.length} chosen queue${ids.length > 1 ? 's' : ''}` : 'Any queue';
    const inst = QP.store.get('champ_select.instant_lock') ?? true;
    root.querySelector('[data-k="champ_select.lock_in_at_seconds"]').closest('.st-row').hidden = inst;
    const file = (c.companion || {}).sound_file || customSound;
    root.querySelector('#st-sound-file').textContent = (c.companion || {}).sound === 'custom' ? (file ? file.split(/[\\/]/).pop() : 'No file chosen') : '';
  }

  function onInput(e) {
    const el = e.target, k = el.dataset && el.dataset.k;
    if (!k || !QP.store.config) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num !== undefined) { if (v === '') return; v = Math.min(+el.max, Math.max(+el.min, Math.round(+v) || 0)); }
    if (el.dataset.scale !== undefined) return setScale(Number(v));
    if (el.dataset.digits !== undefined) v = String(v).replace(/\D/g, '');
    if (el.dataset.url !== undefined) { v = String(v).trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) return; }
    if (k === 'companion.port' && e.type === 'input') return;   // commit on blur/enter, not per keystroke
    if (k === 'accept_delay_seconds' && e.type === 'input') return;
    QP.store.set(k, typeof v === 'string' && !el.dataset.url && el.tagName === 'INPUT' ? v.trim() : v);
    if (k === 'crawler_url') loadCrawler();
    hydrate();
  }

  function setScale(v) {
    if (!UI_SCALES.includes(v) || !QP.store.config) return;
    QP.store.set('ui_scale', v);
    bridge()?.set_ui_scale?.(v);
    if (built) hydrate();
  }
  // Ctrl+= / Ctrl+- / Ctrl+0 arrive from the host's before-input-event (app/main.js): dir 1, -1, or 0 for the default.
  window.qpStepScale = dir => {
    const i = UI_SCALES.indexOf(Number(QP.store.get('ui_scale'))), at = i < 0 ? UI_SCALES.indexOf(UI_DEFAULT) : i;
    setScale(dir ? UI_SCALES[Math.min(UI_SCALES.length - 1, Math.max(0, at + dir))] : UI_DEFAULT);
  };
  const say = (name, text, ok) => { const s = root.querySelector(`[data-msg="${name}"]`); if (!s) return; s.textContent = text; s.className = 'st-msg ' + (ok ? 'ok' : 'bad'); clearTimeout(s._t); s._t = setTimeout(() => (s.textContent = ''), 5000); };
  const base = () => (QP.store.get('crawler_url') || DEFAULT_CRAWLER).replace(/\/+$/, '');
  let compUrl = '';

  async function onClick(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const a = bridge(), d = b.dataset.do;
    try {
      if (d === 'test-desktop') { const r = await a.test_desktop(); say(d, r && r.ok ? 'Sent' : (r && r.error) || 'Failed', r && r.ok); }
      else if (d === 'test-discord') { say(d, 'Sending…', true); const r = await a.test_discord(QP.store.get('webhook_url') || '', QP.store.get('user_id') || ''); say(d, r && r.ok ? 'Sent, check Discord' : (r && r.error) || 'Failed', r && r.ok); }
      else if (d === 'preview-sound') { const s = QP.store.get('companion.sound'); if (s === 'custom') return say('test-companion', 'Use Test phone alert to hear a custom file', false); const AC = window.AudioContext || window.webkitAudioContext; if (AC && window.QueuePopAlarm) { window.__stCtx ||= new AC(); window.__stCtx.resume?.(); QueuePopAlarm.play(window.__stCtx, s); } }
      else if (d === 'pick-sound') { const r = await a.pick_sound_file(); if (r && r.ok) { customSound = r.path; QP.store.set('companion.sound_file', r.path); QP.store.set('companion.sound', 'custom'); hydrate(); } }
      else if (d === 'copy-link') { const ok = compUrl && await copyText(compUrl); say('test-companion', ok ? 'Link copied' : 'No link yet', !!ok); }
      else if (d === 'test-companion') { const r = await a.test_companion(); say(d, r && r.running ? 'Sent, your phone should alarm' : 'Server is not running, enable it and restart queuePop', r && r.running); }
      else if (d === 'crawler-refresh') loadCrawler();
      else if (d === 'crawler-open') a.open_external(base() + '/');
      else if (d === 'crawler-key') await postKey();
      else if (d === 'check-update') { const s = await a.check_for_update(); renderUpdate(s); }
      else if (d === 'refresh-assets') { loadAssets(); a.refresh_assets().then(loadAssets); setTimeout(loadAssets, 1500); }
      else if (d === 'open-config') { const r = await a.open_config_folder(); say(d, r && r.ok === false ? r.error : '', false); }
    } catch (err) { say(d, String(err.message || err), false); }
  }

  // --- live bits -------------------------------------------------------------
  async function loadAccount() {
    const el = root.querySelector('#st-summoner'); let i = {};
    try { i = (await bridge().get_summoner()) || {}; } catch (err) { el.textContent = 'Could not ask the League client: ' + (err.message || err); return; }
    el.textContent = i.connected && i.name ? (i.tag ? `${i.name} #${i.tag}` : i.name) : 'Offline (open the League client)';
  }
  async function loadCompanion() {
    let i = {}; try { i = (await bridge().get_companion_info()) || {}; } catch {}
    compUrl = i.url || '';
    const qr = root.querySelector('#st-qr'); qr.hidden = !i.qr; if (i.qr) qr.src = i.qr;
    root.querySelector('#st-comp-note').textContent = !i.enabled ? 'Off. Turn it on above, then restart queuePop.' : i.running ? `Running at ${i.url}` : 'Enabled, but the server is not running yet. Restart queuePop.';
  }
  const ago = t => { if (!t) return 'never'; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 90 ? s + 's ago' : s < 5400 ? Math.round(s / 60) + ' min ago' : Math.round(s / 3600) + ' h ago'; };
  const mb = n => n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : (n / 1e6).toFixed(0) + ' MB';
  async function loadCrawler() {
    const url = base(), st = root.querySelector('#st-cr-state'), grid = root.querySelector('#st-cr-grid');
    root.querySelector('#st-cr-url').textContent = url;
    try {
      const r = await fetch(url + '/status', { cache: 'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json(), m = d.matches || {}, p = d.players || {}, k = d.key || {}, dk = d.disk || {};
      const sum = o => Object.values(o || {}).reduce((x, y) => x + y, 0);
      const cell = (l, v) => `<div><b>${E(v)}</b><span>${l}</span></div>`;
      const buckets = Object.entries(d.rateLimits || {}).map(([n, v]) => { const l = (v.limits || [])[0] || {}, pct = l.limit ? Math.min(100, Math.round(100 * l.used / l.limit)) || 0 : 0; return `<div class="st-bk"><span>${E(n)}</span><i><u style="width:${pct}%"></u></i><em>${E(l.used ?? 0)}/${E(l.limit ?? '?')} per ${E(l.windowSec ?? '?')}s</em></div>`; }).join('');
      st.textContent = 'Online'; st.className = 'st-val ok';
      grid.innerHTML = cell('Players', `${(p.lol || 0).toLocaleString()} LoL · ${(p.tft || 0).toLocaleString()} TFT`) +
        cell('Matches done', `${(sum(Object.values(m).map(x => (x && x.done) || 0))).toLocaleString()} (${(m.lol?.done || 0).toLocaleString()} LoL · ${(m.tft?.done || 0).toLocaleString()} TFT)`) +
        cell('Last fetch', ago(d.lastFetch)) + cell('Aggregated', ago(d.aggregatedAt)) +
        cell('Disk', `${mb((dk.dbBytes || 0) + (dk.walBytes || 0) + (dk.rawBytes || 0))} (${mb(dk.dbBytes || 0)} db)`) +
        cell('Riot key', k.source === 'none' ? 'none set' : `${k.source}${k.set_at ? ' · set ' + ago(k.set_at) : ''}`) +
        `<div class="st-buckets">${buckets}</div>`;
    } catch (err) {
      st.textContent = err.name === 'TimeoutError' ? 'Unreachable: no answer in 8 s' : err instanceof SyntaxError ? 'Online, but its status did not parse' : 'Unreachable: ' + (err.message || err); st.className = 'st-val bad'; grid.innerHTML = '';
    }
  }
  async function postKey() {
    const key = root.querySelector('#st-cr-key').value.trim(), tok = root.querySelector('#st-cr-token').value.trim();
    if (!/^RGAPI-/.test(key)) return say('crawler-key', 'That does not look like a Riot key (RGAPI-…)', false);
    if (!tok) return say('crawler-key', 'Admin token required', false);
    say('crawler-key', 'Sending…', true);
    try {
      const r = await fetch(base() + '/admin/key', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ key }) });
      const msg = { 401: 'Wrong admin token', 400: 'The crawler rejected that key', 503: 'No ADMIN_TOKEN set on the crawler', 403: 'Crawler only accepts LAN requests' }[r.status];
      if (r.ok) { root.querySelector('#st-cr-key').value = root.querySelector('#st-cr-token').value = ''; say('crawler-key', 'Key updated', true); loadCrawler(); }
      else say('crawler-key', msg || 'HTTP ' + r.status, false);
    } catch (err) { say('crawler-key', 'Unreachable: ' + (err.message || err), false); }
  }
  function renderUpdate(s) {
    s = s || {};
    root.querySelector('#st-ver').textContent = s.current ? 'v' + s.current : '';
    root.querySelector('#st-upd-msg').textContent = s.available && s.latest ? `Version v${s.latest} is available.` : s.error ? "Couldn't reach the update server." : s.checked ? "You're up to date." : 'Not checked yet.';
  }
  async function loadAssets() {
    const el = root.querySelector('#st-assets-msg'); if (!el) return;
    try {
      const s = await bridge().get_asset_status(), n = (k) => `${s[k].have}/${s[k].want}`;
      el.textContent = (s.busy ? 'Downloading: ' : '') + `champions ${n('champions')}, spells ${n('spells')}, positions ${n('positions')}` + (s.lastError ? `. Last error: ${s.lastError}` : '');
      if (s.busy) setTimeout(loadAssets, 1500);
    } catch (err) { el.textContent = 'Could not read the icon packs: ' + (err.message || err); }
  }
  async function loadAbout() {
    loadAssets();
    try { renderUpdate(await bridge().get_update_status()); } catch {}
    const box = root.querySelector('#st-notes');
    try {
      const rel = ((await bridge().get_release_notes()) || {}).releases || [];
      box.innerHTML = rel.length ? rel.map((r, i) => `<details${i ? '' : ' open'}><summary>v${E(r.version)}${r.date ? ` <small>${E(r.date)}</small>` : ''}</summary><pre>${E(r.notes || 'No notes for this release.')}</pre></details>`).join('') : '<p class="st-hint">Could not load release notes.</p>';
    } catch { box.innerHTML = '<p class="st-hint">Could not load release notes.</p>'; }
  }

  // --- route entry -----------------------------------------------------------
  async function show(section) {
    if (!built) build();
    if (!QP.store.config) { try { await QP.store.load(); } catch {} }
    hydrate();
    if (bridge()) { loadAccount(); loadCompanion(); loadCrawler(); loadAbout(); }
    clearInterval(timer); timer = setInterval(() => { if (!root.hidden) loadCrawler(); }, 15000);
    if (section) requestAnimationFrame(() => document.getElementById('st-' + section)?.scrollIntoView({ block: 'start' }));
    else window.scrollTo(0, 0);
  }
  window.settingsView = { show, sections: SECTIONS, row: () => SECTIONS.map(([id, l]) => `<a href="#/settings#${id}">${l}</a>`).join('') };
})();
