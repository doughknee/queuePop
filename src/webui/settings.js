/* App-level Settings (DONI-489, #/settings[#section]): one page, one card per area. Every control reads
   QP.store.config and writes through QP.store.set (debounced save_config) with the keys the Python-era
   Settings/Alerts pages used. The stats crawler card talks to the crawler straight from the renderer. */
// The crawler's ~60 Riot rate-limit buckets are almost all idle: list the busy ones, fullest first, and count the rest.
// Pure; app/test-settings.js checks it.
window.stBusyBuckets = rl => {
  const all = Object.entries(rl || {}).map(([name, v]) => { const l = (v && v.limits || [])[0] || {}; return { name, used: l.used || 0, limit: l.limit, windowSec: l.windowSec, pct: l.limit ? Math.min(100, Math.round(100 * (l.used || 0) / l.limit)) : 0 }; });
  const busy = all.filter(b => b.used > 0).sort((a, b) => b.pct - a.pct || b.used - a.used);
  return { busy, idle: all.length - busy.length };
};
const ST_FF_ENC = { h264_nvenc: 'your NVIDIA card', h264_amf: 'your AMD card', h264_qsv: 'Intel Quick Sync', libx264: 'the CPU (slower)' };
// Studio > Capture > What gets recorded: what records the next game (recorder_status().engine). The QueuePop companion's Overwolf
// recorder first (game audio + mic, live clips), else ffmpeg (main screen, no audio), and what to do when neither is there.
const ST_OW_ENC = { h264_texture_amf: 'AMD AMF', obs_nvenc_h264_tex: 'NVIDIA NVENC', obs_qsv11_v2: 'Intel Quick Sync', obs_x264: 'the CPU' };
window.stEngineLine = (e, events) => {
  if (!e) return 'Couldn’t check.';
  const tail = events ? '' : ' Turn on recording in a game’s tab to record video.';
  const c = e.companion || {};
  const hint = c.running ? `The QueuePop companion is running, but its recorder isn’t ready${c.error ? ' (' + c.error + ')' : ''}: restart it.`
    : 'For the game window, game audio and a mic track, start the QueuePop companion (the Overwolf app).';
  if (e.engine === 'overwolf') return `Recording with Overwolf (${e.inProcess ? 'built in, ' : ''}${ST_OW_ENC[e.encoder] || e.encoder}), game audio + mic.${tail}`;
  if (e.engine === 'ffmpeg') return `Recording with ffmpeg (${ST_FF_ENC[e.encoder] || e.encoder}), main screen, no audio. ${hint}${tail}`;
  return `Nothing to record video with. ${hint} Or install ffmpeg from ffmpeg.org (and add it to PATH).`;
};
// DONI-594: Settings has an App tab (where alerts go, the phone, recording storage, stats, display) and one tab per
// game (that game's queue, alerts, champ select, recording). Every card lives on exactly one tab. Pure; test-settings.js checks it.
window.ST_TABS = ['app', 'league', 'tft', 'deadlock'];
window.ST_CARD_TAB = { notify: 'app', companion: 'app', recorder: 'app', crawler: 'app', display: 'app', about: 'app',
  'league-queue': 'league', 'league-alerts': 'league', champselect: 'league', 'league-record': 'league',
  'tft-queue': 'tft', 'tft-alerts': 'tft', 'tft-record': 'tft', 'deadlock-account': 'deadlock' };
window.ST_ALIAS = { alerts: 'league-alerts', queue: 'league-queue', account: 'deadlock-account', games: 'app' }; // older links
window.stCard = section => window.ST_ALIAS[section] || section;
window.stTabOf = section => { const c = window.stCard(section); return window.ST_TABS.includes(c) ? c : window.ST_CARD_TAB[c] || null; };
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900';
  const SECTIONS = [['app', 'App'], ['league', 'League'], ['tft', 'TFT'], ['deadlock', 'Deadlock']];
  const GAMES = [['league', 'League of Legends', 'League', 'assets/logos/league.svg'], ['tft', 'Teamfight Tactics', 'TFT', 'assets/logos/tft.png'], ['deadlock', 'Deadlock', 'Deadlock', 'assets/logos/deadlock.png']];
  const GN = Object.fromEntries(GAMES.map(g => [g[0], g[2]]));
  // What a game's tab leaves out, and why, at the foot of that tab.
  const NOT_FOR = { tft: [['Champ select', 'TFT has no champ select.']], deadlock: [['Queue, alerts and recording', 'Deadlock queues in Steam, where queuePop can’t see it.']] };
  const LEAGUE_EVENTS = [['queue_pop', 'Queue pops'], ['timeline', 'Queue timeline'], ['champ_select', 'Champ select starts'], ['locked_pick', 'Locked pick'], ['game_plan', 'Game plan at lock-in'], ['game_start', 'Game starts']];
  const TFT_EVENTS = [['queue_pop', 'Queue pops'], ['timeline', 'Queue timeline'], ['game_start', 'Game starts']];
  const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5], UI_DEFAULT = 1.1; // DONI-516: Text size = Electron zoom factor, config ui_scale
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bridge = () => window.pywebview && window.pywebview.api;
  const root = document.getElementById('settings-view');
  let built = false, timer = null, customSound = '';

  // DONI-594: the explanation sits behind an (i) that shows on hover or focus, so the page reads as a list of labels.
  const tip = t => t ? `<span class="st-tip" tabindex="0" role="note" aria-label="${E(t)}" data-tip="${E(t)}">i</span>` : '';
  const when = k => k ? ` data-when="${k}"` : ''; // shown only while that switch is on
  const sw = (key, label, hint, w) => `<label class="st-row"${when(w)}><span class="st-lbl">${label}${tip(hint)}</span><span class="st-sw"><input type="checkbox" role="switch" data-k="${key}"><i aria-hidden="true"></i></span></label>`;
  const num = (key, label, hint, min, max, w) => `<label class="st-row"${when(w)}><span class="st-lbl">${label}${tip(hint)}</span><input class="st-in st-num" type="number" data-k="${key}" data-num min="${min}" max="${max}"></label>`;
  const text = (key, label, hint, attrs, w) => `<label class="st-row"${when(w)}><span class="st-lbl">${label}${tip(hint)}</span><input class="st-in st-wide" data-k="${key}" ${attrs}></label>`;
  const act = (label, hint, inner, w) => `<div class="st-row"${when(w)}><span class="st-lbl">${label}${tip(hint)}</span><span class="st-act">${inner}</span></div>`;
  const btn = (d, l, gold) => `<button class="st-btn${gold ? ' st-gold' : ''}" data-do="${d}">${l}</button><span class="st-msg" data-msg="${d}"></span>`;
  const card = (id, title, body, lead) => `<section class="st-card" id="st-${id}" data-tab="${ST_CARD_TAB[id]}"><h2>${title}</h2>${lead ? `<p class="st-desc">${lead}</p>` : ''}<div class="st-body">${body}</div></section>`;
  const chips = (list, prefix) => `<div class="st-events">${list.map(([k, l]) => `<label class="st-chip"><input type="checkbox" data-k="${prefix}${k}"><span>${l}</span></label>`).join('')}</div>`;
  const queues = act('Queues to auto-accept', 'Pick them on the Play page. Leave it at Any queue to accept every pop.', '<span class="st-val" data-queues></span><a class="st-btn" href="#/league/play">Play page</a>');

  function build() {
    root.innerHTML = `<div class="st-wrap"><header class="st-head"><h1>Settings</h1><p>Changes apply as you make them.</p>
        <label class="st-find"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" id="st-find" placeholder="Find a setting" aria-label="Find a setting" autocomplete="off" spellcheck="false"></label>
        <p class="st-none" id="st-none" role="status" hidden></p></header>
      <div class="st-games" role="tablist" aria-label="Settings for">${[['app', 'App', 'App', ''], ...GAMES].map(([g, l, , logo]) => `<div class="st-game" data-tab="${g}" role="tab" tabindex="0" aria-selected="false">
          ${logo ? `<img src="${logo}" alt="">` : '<svg class="st-gear" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>'}<b class="st-gname">${l}</b>
          ${g === 'app' ? '' : `<label class="st-sw" title="Show or hide ${l} across queuePop"><input type="checkbox" role="switch" data-k="games_enabled.${g}" aria-label="Show ${l} in queuePop"><i aria-hidden="true"></i></label>`}
          <p class="st-who" id="st-who-${g}">${g === 'app' ? 'Alerts, phone, recording, display' : ''}</p></div>`).join('')}</div>
      <p class="st-offnote" id="st-offnote" role="status" hidden></p>` +
      // ---- App ----
      card('notify', 'Notifications', `
        ${sw('desktop_notifications', 'Windows notifications', 'A Windows notification for the moments you tick in each game’s Alerts.')}
        ${sw('discord_enabled', 'Discord', 'Posts to a Discord channel, so Discord pushes it to your phone.')}
        ${text('webhook_url', 'Webhook URL', 'In Discord: channel settings › Integrations › Webhooks › Copy URL.', 'placeholder="https://discord.com/api/webhooks/…"', 'discord_enabled')}
        ${text('user_id', 'Your Discord user ID', 'Optional. Adds an @mention so the push is louder.', 'placeholder="123456789012345678"', 'discord_enabled')}
        ${sw('ntfy.enabled', 'Push with ntfy', 'The free ntfy app buzzes your phone even with the screen off. No Discord, no account.')}
        ${act('ntfy topic', 'Subscribe to this topic in the ntfy app. Anyone who knows it can read your alerts, so keep it random.', '<input class="st-in" data-k="ntfy.topic" id="st-ntfy-topic" placeholder="queuepop-…"><button class="st-btn" data-do="ntfy-new">New topic</button>', 'ntfy.enabled')}
        ${text('ntfy.server', 'ntfy server', 'Leave as ntfy.sh, or your own server.', 'data-url placeholder="https://ntfy.sh"', 'ntfy.enabled')}
        ${text('ntfy.token', 'ntfy access token', 'Only for a protected server.', 'type="password" autocomplete="off"', 'ntfy.enabled')}
        ${sw('alert_events.disconnect', 'Tell me when the League client disconnects', 'For League and TFT: both run in the League client.')}
        ${num('timeline_load_seconds', 'Loading screen allowance (s)', 'Seconds the queue timeline adds for the loading screen when it says when your game starts.', 0, 300)}
        ${act('Try it', 'Test a queue pop sends exactly what a real one sends, through every channel that is on. Nothing is accepted.', btn('test-alert', 'Test a queue pop', true) + '<button class="st-btn" data-do="test-desktop">Windows</button><button class="st-btn" data-do="test-discord">Discord</button><button class="st-btn" data-do="test-ntfy">ntfy</button><span class="st-msg" data-msg="test-desktop" data-msg-alias="test-discord test-ntfy"></span>')}`,
        'Where alerts go. Each game picks its moments under its own Alerts.') +
      card('companion', 'Phone companion', `
        ${sw('companion.enabled', 'Alarm my phone when the queue pops', 'A page on your home Wi-Fi. No app, no account.')}
        ${num('companion.port', 'Port', 'Change it only if another program already uses 8420.', 1024, 65535, 'companion.enabled')}
        ${act('Alarm sound', 'What your phone plays when the queue pops.', `<select class="st-in" data-k="companion.sound"><option value="chime">Chime</option><option value="ping">Ping</option><option value="arcade">Arcade</option><option value="siren">Siren (loud)</option><option value="custom">Custom file</option></select>
          <button class="st-btn" data-do="preview-sound">Preview</button><button class="st-btn" data-do="pick-sound">Choose file…</button><span class="st-msg" id="st-sound-file"></span><span class="st-msg" data-msg="pick-sound" data-msg-alias="preview-sound"></span>`, 'companion.enabled')}
        <div class="st-comp" data-when="companion.enabled"><img id="st-qr" alt="Scan to open on your phone" hidden>
          <div><p id="st-comp-note" class="st-val"></p><p class="st-hint">Scan with your phone camera, tap Enable Alerts and keep the tab open. Same Wi-Fi only.</p>
          <span class="st-act"><button class="st-btn" data-do="copy-link">Copy link</button><button class="st-btn" data-do="test-companion">Test phone alert</button><button class="st-btn" data-do="new-link" title="Phones already set up stop getting alerts until they scan the new code">New link</button><span class="st-msg" data-msg="test-companion"></span></span></div></div>`,
        'Your phone rings for League and TFT queue pops.') +
      card('recorder', 'Recording', `
        ${act('Studio', 'Quality, sound, clips, the save-last-moments shortcut, storage and what records video all live in Studio > Capture.', '<span class="st-val" id="st-rec-who"></span><a class="st-btn" href="#/studio">Open Studio</a><a class="st-btn" href="#/studio/capture">Capture settings</a>')}`) +
      card('crawler', 'Stats crawler', `
        ${text('crawler_url', 'Address', 'Where League and TFT stats come from. Leave empty for the default.', `data-url placeholder="${DEFAULT_CRAWLER}"`)}
        <div class="st-row"><span class="st-lbl">Status<small id="st-cr-url"></small></span><span class="st-act"><span id="st-cr-state" class="st-val"></span><button class="st-btn" data-do="crawler-refresh">Refresh</button><button class="st-btn" data-do="crawler-open">Open status page</button><span class="st-msg" data-msg="crawler-refresh" data-msg-alias="crawler-open"></span></span></div>
        <div id="st-cr-grid" class="st-grid"></div>
        <details class="st-more" id="st-cr-keybox"><summary>Replace the Riot key</summary>
        ${act('Get a new key', 'Riot’s developer portal: log in, then Regenerate API Key. A development key lasts 24 hours.', '<button class="st-btn" data-do="riot-dev">Open developer.riotgames.com</button>')}
        <label class="st-row"><span class="st-lbl">For${tip('A personal key is registered per product: give League’s and TFT’s each to their game. One development key covers both.')}</span><select class="st-in" id="st-cr-game"><option value="">Both games</option><option value="lol">League only</option><option value="tft">TFT only</option></select></label>
        <label class="st-row"><span class="st-lbl">New key${tip('Starts with RGAPI-')}</span><input class="st-in st-wide" id="st-cr-key" type="password" autocomplete="off" placeholder="RGAPI-…"></label>
        <label class="st-row"><span class="st-lbl">Admin token${tip('The crawler’s ADMIN_TOKEN. Used once, never stored.')}</span><input class="st-in st-wide" id="st-cr-token" type="password" autocomplete="off"></label>
        <div class="st-row"><span class="st-lbl"></span><span class="st-act"><button class="st-btn st-gold" data-do="crawler-key">Update key</button><span class="st-msg" data-msg="crawler-key"></span></span></div></details>`,
        'League and TFT tier lists, builds and matchups come from here.') +
      card('display', 'Display and startup', `
        <label class="st-row"><span class="st-lbl">Text size${tip('Scales the whole app. Ctrl + and Ctrl − step through these; Ctrl 0 goes back to 110%.')}</span><select class="st-in" data-k="ui_scale" data-scale>${UI_SCALES.map(v => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}</select></label>
        ${sw('launch_at_login', 'Launch at login', 'Starts queuePop when you sign in to Windows.')}
        ${sw('start_minimized', 'Start in the tray', 'Opens to the tray icon instead of the window.')}
        ${sw('close_to_tray', 'Close to the tray', 'The window’s ✕ keeps queuePop running in the tray. When off, ✕ quits.')}
        ${act('Keyboard shortcuts', 'Press ? anywhere to see them all.', '<button class="st-btn" data-do="show-keys">Show shortcuts</button>')}
        ${act('Set-up tips on home', 'Bring back the set-up strip you hid.', btn('reset-setup', 'Show them again'))}`) +
      card('about', 'Updates and about', `
        <div class="st-row"><span class="st-lbl">Version<small id="st-upd-msg"></small></span><span class="st-act"><span id="st-ver" class="st-val"></span><button class="st-btn" data-do="check-update">Check for updates</button><span class="st-msg" data-msg="check-update"></span></span></div>
        <div class="st-row"><span class="st-lbl">Icon packs<small id="st-assets-msg"></small></span><span class="st-act"><button class="st-btn" data-do="refresh-assets">Download again</button><span class="st-msg" data-msg="refresh-assets"></span></span></div>
        ${act('Config folder', 'config.json and your stats live here.', btn('open-config', 'Open folder'))}
        <div class="st-sub">Release notes</div><div id="st-notes" class="st-notes">Loading…</div>`) +
      // ---- League ----
      card('league-queue', 'Queue', `
        <p class="st-store">queuePop alarms you everywhere you set up when the queue pops. Accept it in the League client on your PC, so you're there for champ select.</p>
        ${sw('auto_accept', 'Auto-accept queue pops', 'Accepts League matches for you. Stays as you set it after a restart; the tray’s Pause is for right now only.')}
        ${num('accept_delay_seconds', 'Accept delay (s)', 'Seconds to wait before accepting. 0 accepts at once.', 0, 10, 'auto_accept')}
        ${queues}`) +
      card('league-alerts', 'Alerts', chips(LEAGUE_EVENTS, 'alert_events.'), 'Tell me when… <a href="#/settings#notify">Where alerts go</a>') +
      card('champselect', 'Champ select', `
        <p class="st-store">When it's your turn, queuePop hovers your ban and your pick from your plan. You lock in.</p>
        ${sw('champ_select.enabled', 'Auto pick and ban', 'Hovers, bans, picks and locks in from your champ select plan.')}
        ${sw('champ_select.instant_lock', 'Lock in at once', 'When off, it locks in near the end of the timer instead.', 'champ_select.enabled')}
        ${num('champ_select.lock_in_at_seconds', 'Lock in with (s left)', 'Seconds left on the timer when it locks in.', 0, 30)}
        ${sw('champ_select.smart_pick', 'Smart pick from my list', 'Still picks only from your list for the role, but tries first the one that scores best against this draft.', 'champ_select.enabled')}
        ${sw('champ_select.auto_runes', 'Auto runes', 'Applies the recommended rune page when you lock in.')}
        ${sw('champ_select.trades.enabled', 'Champion trades', 'Asks teammates to swap when they have a champion you ranked higher.')}
        ${sw('champ_select.aram.enabled', 'ARAM bench', 'Takes upgrades from the ARAM bench.')}
        ${num('champ_select.aram.bench_delay', 'Bench grab delay (s)', 'Seconds an upgrade sits on the bench before it is taken (0 to 3).', 0, 3, 'champ_select.aram.enabled')}
        ${sw('float_window', 'Float suggestions over League', 'A small window on top of the League client during champ select with the best picks and the timer.')}`) +
      card('league-record', 'Recording', sw('recorder.enabled', 'Record League games', 'Keeps a timeline of your kills, deaths, objectives and the result. See them in Studio. Video, sound and storage are in Studio > Capture.')) +
      // ---- TFT ----
      card('tft-queue', 'Queue', `
        <p class="st-store">queuePop alarms you everywhere you set up when the queue pops. Accept it in the League client on your PC, so you're there for champ select.</p>
        ${sw('tft.auto_accept', 'Auto-accept queue pops', 'Accepts TFT matches for you, separately from League.')}
        ${num('tft.accept_delay_seconds', 'Accept delay (s)', 'Seconds to wait before accepting. 0 accepts at once.', 0, 10, 'tft.auto_accept')}
        ${queues}`) +
      card('tft-alerts', 'Alerts', chips(TFT_EVENTS, 'tft.alert_events.'), 'Tell me when… <a href="#/settings#notify">Where alerts go</a>') +
      card('tft-record', 'Recording', sw('tft.record', 'Record TFT games', 'Keeps a timeline of each game and your placement. See them in Studio. Video, sound and storage are in Studio > Capture.')) +
      // ---- Deadlock ----
      card('deadlock-account', 'Account and overlay', `
        <label class="st-row"><span class="st-lbl">Deadlock account ID${tip('Your Steam friend code (numbers only). Shows your own matches in Deadlock and on home.')}</span><input class="st-in" data-k="deadlock_account_id" data-digits inputmode="numeric" placeholder="123456789"></label>
        ${act('From Steam', 'queuePop fills this in by itself from the account signed in to Steam on this PC. Use this if you switched Steam accounts.', btn('dl-steam', 'Use my Steam account'))}
        <div class="st-row"><span class="st-lbl">In-game overlay<small id="st-dl-ov">Checking…</small></span><span class="st-act"><a class="st-btn" href="#/deadlock">Deadlock page</a></span></div>`) +
      `<div class="st-notfor" id="st-notfor"></div></div>`;
    root.querySelector('#st-find').addEventListener('input', e => find(e.target.value));
    // Ctrl+F on Settings goes to the find box.
    document.addEventListener('keydown', e => { if (!root.hidden && e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); const f = root.querySelector('#st-find'); f.focus(); f.select(); } });
    root.querySelector('#st-find').addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; find(''); } });
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
    root.addEventListener('click', e => { if (e.target.closest('.st-tip')) e.preventDefault(); }, true); // an (i) inside a row's label never flips its switch
    // A tile is a tab; its switch is a separate control and doesn't change the tab.
    root.addEventListener('click', e => { const t = e.target.closest('.st-game'); if (t && !e.target.closest('.st-sw')) setTab(t.dataset.tab); });
    root.addEventListener('keydown', e => {
      const t = e.target.closest?.('.st-game'); if (!t || e.target.closest('.st-sw')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setTab(t.dataset.tab); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const all = [...root.querySelectorAll('.st-game')], n = all[(all.indexOf(t) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; n.focus(); setTab(n.dataset.tab); }
    });
    built = true;
  }

  // --- find a setting (Q7): rows whose label/hint hold every typed word; a card whose title matches keeps all its rows ---
  function find(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean), has = t => words.every(w => t.toLowerCase().includes(w));
    let shown = 0;
    root.classList.toggle('st-searching', words.length > 0); // search looks across every tab
    root.querySelectorAll('.st-card').forEach(card => {
      const whole = !words.length || has(card.querySelector('h2').textContent + ' ' + (GN[card.dataset.tab] || card.dataset.tab)); // "tft" finds every TFT card
      let any = whole;
      card.querySelectorAll('.st-row, .st-chip').forEach(r => { const hit = whole || has(r.textContent + ' ' + [...r.querySelectorAll('.st-tip')].map(t => t.dataset.tip).join(' ')); r.classList.toggle('st-off', !hit); any ||= hit; });
      // Blocks that aren't settings (hints, the QR, the status grid, release notes) only show with their whole card.
      card.querySelectorAll('.st-hint, .st-comp, .st-grid, .st-sub, .st-notes').forEach(el => el.classList.toggle('st-off', !whole));
      card.querySelectorAll('details').forEach(d => { const hit = !!d.querySelector('.st-row:not(.st-off)'); if (!whole && hit) d.open = true; d.classList.toggle('st-off', !whole && !hit); });
      card.hidden = !any; if (any) shown++;
    });
    const none = root.querySelector('#st-none');
    applyTab();
    none.hidden = shown > 0; none.textContent = shown ? '' : `Nothing in Settings matches “${q.trim()}”. Ctrl K searches the whole app.`;
  }

  // --- config <-> controls ---------------------------------------------------
  function hydrate() {
    const c = QP.store.config || {};
    root.querySelectorAll('[data-k]').forEach(el => {
      let v = QP.store.get(el.dataset.k);
      if (el.dataset.k === 'champ_select.instant_lock' || el.dataset.k === 'close_to_tray' || el.dataset.k === 'float_window' || el.dataset.k === 'auto_accept' || el.dataset.k === 'tft.auto_accept') v = v ?? true;
      if (el.dataset.k === 'crawler_url') v = v || '';
      if (el.dataset.k === 'companion.sound') v = v || 'chime';
      if (el.dataset.k === 'ui_scale') v = UI_SCALES.includes(v) ? v : UI_DEFAULT;
      if (el.dataset.k.startsWith('games_enabled.')) { const on = window.qpGames ? qpGames() : []; v = on.includes(el.dataset.k.slice(14)); el.disabled = v && on.length === 1; el.closest('.st-game').title = el.disabled ? 'Keep at least one game on' : ''; }
      if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = v ?? '';
    });
    const ids = c.allowed_queue_ids || [];
    root.querySelectorAll('[data-queues]').forEach(el => { el.textContent = ids.length ? `${ids.length} chosen queue${ids.length > 1 ? 's' : ''}` : 'Any queue'; });
    // Rows that only matter while a switch is on stay out of the way until it is.
    root.querySelectorAll('[data-when]').forEach(r => { r.hidden = !QP.store.get(r.dataset.when); });
    const inst = QP.store.get('champ_select.instant_lock') ?? true;
    root.querySelector('[data-k="champ_select.lock_in_at_seconds"]').closest('.st-row').hidden = inst || !QP.store.get('champ_select.enabled');
    const rec = [QP.store.get('recorder.enabled') && 'League', QP.store.get('tft.record') && 'TFT'].filter(Boolean);
    root.querySelector('#st-rec-who').textContent = rec.length ? 'On for ' + rec.join(' and ') : 'Off for every game';
    const file = (c.companion || {}).sound_file || customSound;
    root.querySelector('#st-sound-file').textContent = (c.companion || {}).sound === 'custom' ? (file ? file.split(/[\\/]/).pop() : 'No file chosen') : '';
    applyTab();
  }

  // DONI-591/594: one tab at a time; search looks across all of them. A game that's switched off keeps its tab and
  // values, with one line saying so. Switching another game never moves this page.
  let tab = null;
  const savedTab = () => { try { return localStorage.getItem('qp.settings.tab'); } catch { return null; } };
  function setTab(t) {
    if (!ST_TABS.includes(t)) return;
    tab = t;
    try { localStorage.setItem('qp.settings.tab', t); } catch {}
    if (location.hash !== '#/settings#' + t) history.replaceState(null, '', '#/settings#' + t);
    window.syncSidebar?.(); // the page row marks this tab
    applyTab();
  }
  function applyTab() {
    const on = window.qpGames ? qpGames() : GAMES.map(g => g[0]);
    root.dataset.tab = tab;
    document.querySelectorAll('#world-nav a[href^="#/settings#"]').forEach(a => a.getAttribute('href') === '#/settings#' + tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    root.querySelectorAll('.st-game').forEach(t => {
      const sel = t.dataset.tab === tab;
      t.classList.toggle('is-sel', sel); t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
      t.classList.toggle('is-off', t.dataset.tab !== 'app' && !on.includes(t.dataset.tab));
    });
    root.querySelectorAll('.st-card').forEach(c => c.classList.toggle('st-other', c.dataset.tab !== tab));
    const off = tab !== 'app' && !on.includes(tab), note = root.querySelector('#st-offnote');
    note.hidden = !off;
    if (off) note.textContent = `${GN[tab]} is switched off, so these do nothing right now. They’re kept for when you switch it back on.`;
    const miss = NOT_FOR[tab] || [];
    root.querySelector('#st-notfor').innerHTML = miss.length ? `<b>Not for ${GN[tab]}</b>` + miss.map(([what, why]) => `<p><span>${what}</span>${why}</p>`).join('') : '';
    const dl = QP.store.get('deadlock_account_id');
    root.querySelector('#st-who-deadlock').textContent = dl ? 'Account ' + dl : 'No account set yet';
  }

  function onInput(e) {
    const el = e.target, k = el.dataset && el.dataset.k;
    if (!k || !QP.store.config) return;
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.dataset.num !== undefined) { if (v === '') return; v = Math.min(+el.max, Math.max(+el.min, Math.round(+v) || 0)); }
    if (el.dataset.scale !== undefined) return setScale(Number(v));
    if (k.startsWith('games_enabled.')) { // DONI-522: one switch per world, stored as the list of worlds that are on
      const g = k.slice(14), on = new Set(window.qpGames ? qpGames() : []);
      v ? on.add(g) : on.delete(g);
      if (on.size) QP.store.set('games_enabled', ['league', 'tft', 'deadlock'].filter(x => on.has(x)));
      return hydrate();
    }
    if (el.dataset.digits !== undefined) v = String(v).replace(/\D/g, '');
    if (el.dataset.url !== undefined) { v = String(v).trim().replace(/\/+$/, ''); if (v && !/^https?:\/\//i.test(v)) v = 'http://' + v; }
    // Typed fields commit on blur/Enter ('change'), never per keystroke: a half-typed URL must not be saved or fetched.
    if (e.type === 'input' && el.tagName === 'INPUT' && el.type !== 'checkbox') return;
    QP.store.set(k, typeof v === 'string' && !el.dataset.url && el.tagName === 'INPUT' ? v.trim() : v);
    if (k === 'crawler_url') loadCrawler();
    if (k === 'recorder.enabled' || k === 'tft.record') { if (!QP.store.get('recorder.enabled') && !QP.store.get('tft.record')) QP.store.set('recorder.video', false); } // video rides on a recorded game
    if (k === 'ntfy.enabled' && v && !QP.store.get('ntfy.topic')) root.querySelector('[data-do="ntfy-new"]').click(); // DONI-425
    if (k === 'webhook_url') say('test-discord', v && !/^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+\/?$/.test(String(v).trim()) ? 'That isn’t a Discord webhook address' : '', false);
    if (k === 'companion.enabled' || k === 'companion.port') setTimeout(loadCompanion, 900); // the host restarts it on save
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
  // A button's message goes to its own [data-msg] (or one that lists it in data-msg-alias); none is ever dropped silently.
  const say = (name, text, ok) => { const s = root.querySelector(`[data-msg="${name}"], [data-msg-alias~="${name}"]`); if (!s) { if (text) console.warn('settings:', name, text); return; } s.textContent = text; s.className = 'st-msg ' + (ok ? 'ok' : 'bad'); clearTimeout(s._t); s._t = setTimeout(() => (s.textContent = ''), 5000); };
  const base = () => (QP.store.get('crawler_url') || DEFAULT_CRAWLER).replace(/\/+$/, '');
  let compUrl = '';

  async function onClick(e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const a = bridge(), d = b.dataset.do;
    if (b.disabled) return;
    b.disabled = true; // one run at a time; a slow check can't be stacked by repeat clicks
    try {
      if (d === 'test-desktop') { const r = await a.test_desktop(); say(d, r && r.ok ? 'Sent' : (r && r.error) || 'Failed', r && r.ok); }
      else if (d === 'test-discord') { say(d, 'Sending…', true); const r = await a.test_discord(QP.store.get('webhook_url') || '', QP.store.get('user_id') || ''); say(d, r && r.ok ? 'Sent, check Discord' : (r && r.error) || 'Failed', r && r.ok); }
      else if (d === 'preview-sound') { const s = QP.store.get('companion.sound'); if (s === 'custom') return say('test-companion', 'Use Test phone alert to hear a custom file', false); const AC = window.AudioContext || window.webkitAudioContext; if (!AC || !window.QueuePopAlarm) say(d, 'Can’t play sounds here', false); else { window.__stCtx ||= new AC(); window.__stCtx.resume?.(); QueuePopAlarm.play(window.__stCtx, s); } }
      else if (d === 'pick-sound') { const r = await a.pick_sound_file(); if (r && r.error) say(d, r.error, false); if (r && r.ok) { customSound = r.path; QP.store.set('companion.sound_file', r.path); QP.store.set('companion.sound', 'custom'); hydrate(); } }
      else if (d === 'copy-link') { const ok = compUrl && await copyText(compUrl); say('test-companion', ok ? 'Link copied' : 'No link yet', !!ok); }
      else if (d === 'test-companion') { const r = await a.test_companion(); say(d, r && r.running ? 'Sent, your phone should alarm' : 'The companion is off. Turn it on above first', r && r.running); }
      else if (d === 'crawler-open') { const ok = await a.open_external(base() + '/'); if (ok === false) say(d, 'That address can’t be opened', false); }
      else if (d === 'riot-dev') await a.open_external('https://developer.riotgames.com/');
      else if (d === 'crawler-key') await postKey();
      else if (d === 'check-update') { say(d, 'Checking…', true); const s = await a.check_for_update(); renderUpdate(s); say(d, s && s.error ? 'Couldn’t reach the update server' : s && s.available ? 'Update available' : 'Up to date', !(s && s.error)); }
      else if (d === 'refresh-assets') { say(d, 'Refreshing…', true); const p = a.refresh_assets(); loadAssets(); const r = await p; loadAssets(); say(d, r && r.ok === false ? r.error || 'Failed' : 'Done', !(r && r.ok === false)); }
      else if (d === 'crawler-refresh') { await loadCrawler(); }
      else if (d === 'new-link') { const r = await a.new_companion_link(); say('test-companion', r && r.ok ? 'New link made. Scan the new code on your phone' : 'Couldn’t make a new link', r && r.ok); loadCompanion(); }
      else if (d === 'test-alert') { const r = await a.test_alert(); const c = (r && r.channels) || []; say(d, c.length ? 'Sent to ' + (c.length > 1 ? c.slice(0, -1).join(', ') + ' and ' + c[c.length - 1] : c[0]) : 'Nothing is on yet: turn on Windows notifications, Discord or the phone companion', c.length > 0); }
      else if (d === 'ntfy-new') { const t = 'queuepop-' + [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); QP.store.set('ntfy.topic', t); hydrate(); say('test-ntfy', 'New topic made. Subscribe to it in the ntfy app', true); }
      else if (d === 'test-ntfy') { say(d, 'Sending…', true); const r = await a.test_ntfy(); say(d, r && r.ok ? 'Sent, check your phone' : (r && r.error) || 'Failed', r && r.ok); }
      else if (d === 'rec-folder') { const r = await a.open_recordings_folder(); if (r && r.ok === false) say(d, r.error || 'Couldn’t open it', false); }
      else if (d === 'dl-steam') { const r = await a.detect_deadlock_account(); say(d, r && r.ok ? 'Filled in from Steam' : 'No Steam account found on this PC', !!(r && r.ok)); setTimeout(hydrate, 200); }
      else if (d === 'show-keys') { document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', shiftKey: true, bubbles: true })); }
      else if (d === 'reset-setup') { window.homeSetup?.reset(); say(d, 'They’ll show on home', true); }
      else if (d === 'open-config') { const r = await a.open_config_folder(); say(d, r && r.ok === false ? r.error : '', false); }
    } catch (err) { say(d, String(err.message || err), false); }
    finally { b.disabled = false; }
  }

  // --- live bits -------------------------------------------------------------
  // League and TFT share one Riot account, read from the League client; shown on both game tiles.
  async function loadAccount() {
    const els = ['#st-who-league', '#st-who-tft'].map(s => root.querySelector(s)), put = t => els.forEach(el => { el.textContent = t; });
    let i = {};
    try { i = (await bridge().get_summoner()) || {}; } catch (err) { return put('Could not ask the League client: ' + (err.message || err)); }
    put(i.connected && i.name ? 'Signed in as ' + (i.tag ? `${i.name} #${i.tag}` : i.name) : 'Riot account: open the League client');
  }
  async function loadOverlay() {
    let s = null; try { s = await bridge().deadlock_overlay_status(); } catch {}
    root.querySelector('#st-dl-ov').textContent = !s ? 'Couldn’t check.' : s.connected ? `Running${s.version ? ', v' + s.version : ''}.` : s.configured ? 'Installed, not running. It starts when you press Play on the Deadlock page.' : 'Not installed. The overlay is its own app, separate from queuePop.';
  }
  async function loadCompanion() {
    let i = {}; try { i = (await bridge().get_companion_info()) || {}; } catch (err) { root.querySelector('#st-comp-note').textContent = 'Couldn’t read the companion: ' + (err.message || err); return; }
    compUrl = i.url || '';
    const qr = root.querySelector('#st-qr'); qr.hidden = !i.qr; if (i.qr) qr.src = i.qr;
    root.querySelector('#st-comp-note').textContent = i.no_lan ? 'This PC doesn’t seem to be on a network your phone can reach (no Wi-Fi or LAN address found).' : !i.enabled ? 'Off. Turn it on above.' : i.running ? `Running at ${i.url}` : `Couldn’t start on port ${i.port}. Another program may be using it; try another port.`;
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
      const bk = stBusyBuckets(d.rateLimits), full = bk.busy.filter(b => b.pct >= 90 && !/\s/.test(b.name)).map(b => b.name), buckets = bk.busy.map(b => `<div class="st-bk"><span>${E(b.name)}</span><i><u style="width:${b.pct}%"></u></i><em>${E(b.used)}/${E(b.limit ?? '?')} per ${E(b.windowSec ?? '?')}s</em></div>`).join('')
        + (full.length ? `<p class="st-bk-idle st-bk-full">The Riot key’s allowance (100 requests per 2 minutes) is used up in ${E(full.join(', '))}. That is the ceiling on matches, not the regions; a production key raises it.</p>` : '')
        + (bk.idle ? `<p class="st-bk-idle">${bk.busy.length ? `${bk.idle} other rate limits idle` : `All ${bk.idle} rate limits idle`}</p>` : '');
      st.textContent = 'Online'; st.className = 'st-val ok';
      if (k.valid === false || k.source === 'none') root.querySelector('#st-cr-keybox').open = true; // the fix is right there
      grid.innerHTML = cell('Players', `${(p.lol || 0).toLocaleString()} LoL · ${(p.tft || 0).toLocaleString()} TFT`) +
        cell('Matches done', `${(sum(Object.values(m).map(x => (x && x.done) || 0))).toLocaleString()} (${(m.lol?.done || 0).toLocaleString()} LoL · ${(m.tft?.done || 0).toLocaleString()} TFT)`) +
        cell('Last fetch', ago(d.lastFetch)) + cell('Aggregated', ago(d.aggregatedAt)) +
        cell('Disk', `${mb((dk.dbBytes || 0) + (dk.walBytes || 0) + (dk.rawBytes || 0))} (${mb(dk.dbBytes || 0)} db)`) +
        Object.entries(k.games || { '': k }).map(([g, x]) => cell(`${{ lol: 'League', tft: 'TFT' }[g] || 'Riot'} key`, x.source === 'none' ? 'none set' : x.valid === false ? `rejected${x.reason ? ' (' + x.reason + ')' : ''}` : `${x.source === 'meta' && k.games ? 'shared' : x.source.replace(/^meta:\w+$/, 'own key')}${x.set_at ? ' · set ' + ago(x.set_at) : ''}`)).join('') +
        `<div class="st-buckets">${buckets}</div>`;
    } catch (err) {
      st.textContent = err.name === 'TimeoutError' ? 'Not answering (waited 8 s)' : err instanceof SyntaxError ? 'Online, but its status didn’t make sense' : /fetch/i.test(err.message) ? 'Not answering. Is it running, and is this the right address?' : 'Not answering (' + (err.message || err) + ')'; st.className = 'st-val bad'; grid.innerHTML = '';
    }
  }
  async function postKey() {
    const key = root.querySelector('#st-cr-key').value.trim(), tok = root.querySelector('#st-cr-token').value.trim(), game = root.querySelector('#st-cr-game').value;
    if (!/^RGAPI-/.test(key)) return say('crawler-key', 'That does not look like a Riot key (RGAPI-…)', false);
    if (!tok) return say('crawler-key', 'Admin token required', false);
    say('crawler-key', 'Sending…', true);
    try {
      // While a stats rebuild holds the crawler's database it answers 503 "busy": keep trying every 10 s for up to
      // 15 minutes (as its status page does) instead of making you press again.
      const send = () => fetch(base() + '/admin/key', { signal: AbortSignal.timeout(10000), method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ key, ...(game && { game }) }) });
      let r = await send();
      for (let i = 0; r.status === 503 && i < 90; i++) {
        const said = await r.clone().json().then(j => String(j && (j.error || j.message) || ''), () => '');
        if (!/busy|locked|try again/i.test(said)) break;
        say('crawler-key', `The crawler is rebuilding its stats; trying again every 10 s (${Math.round(i / 6)} of 15 min)…`, true);
        await new Promise(res => setTimeout(res, 10000));
        r = await send();
      }
      const msg = { 401: 'Wrong admin token', 400: 'The crawler rejected that key', 503: 'No ADMIN_TOKEN set on the crawler', 403: 'Crawler only accepts LAN requests' }[r.status];
      if (r.ok) { root.querySelector('#st-cr-key').value = root.querySelector('#st-cr-token').value = ''; say('crawler-key', 'Key updated', true); loadCrawler(); }
      else { // the crawler's own words first: a 503 can be "busy aggregating, try again in a minute" as well as "no ADMIN_TOKEN"
        const said = await r.json().then(j => j && (j.error || j.message), () => '');
        say('crawler-key', said ? String(said).replace(/^./, c => c.toUpperCase()) : msg || 'HTTP ' + r.status, false);
      }
    } catch (err) { say('crawler-key', 'Unreachable: ' + (err.message || err), false); }
  }
  function renderUpdate(s) {
    s = s || {};
    root.querySelector('#st-ver').textContent = s.current ? 'v' + s.current : '';
    root.querySelector('#st-upd-msg').textContent = s.available && s.latest ? `Version v${s.latest} is available.` : s.error ? "Couldn't reach the update server." : s.checked ? "You're up to date." : 'Not checked yet.';
  }
  let assetsTimer = null;
  async function loadAssets() {
    const el = root.querySelector('#st-assets-msg'); if (!el) return;
    clearTimeout(assetsTimer);
    try {
      const s = await bridge().get_asset_status(), n = (k) => `${s[k].have}/${s[k].want}`;
      el.textContent = (s.busy ? 'Downloading: ' : '') + `champions ${n('champions')}, spells ${n('spells')}, positions ${n('positions')}` + (s.lastError ? `. Last error: ${s.lastError}` : '');
      if (s.busy && !root.hidden) assetsTimer = setTimeout(loadAssets, 1500); // one poll chain, and only while Settings shows
    } catch (err) { el.textContent = 'Could not read the icon packs: ' + (err.message || err); }
  }
  async function loadAbout() {
    loadAssets();
    try { renderUpdate(await bridge().get_update_status()); } catch (err) { renderUpdate({ error: String(err.message || err) }); }
    const box = root.querySelector('#st-notes');
    try {
      const rel = ((await bridge().get_release_notes()) || {}).releases || [];
      box.innerHTML = rel.length ? rel.map((r, i) => `<details${i ? '' : ' open'}><summary>v${E(r.version)}${r.date ? ` <small>${E(r.date)}</small>` : ''}</summary><pre>${E(r.notes || 'No notes for this release.')}</pre></details>`).join('') : '<p class="st-hint">Could not load release notes.</p>';
    } catch { box.innerHTML = '<p class="st-hint">Could not load release notes.</p>'; }
  }

  // --- route entry -----------------------------------------------------------
  async function show(section) {
    if (!built) build();
    tab = stTabOf(section) || tab || (ST_TABS.includes(savedTab()) ? savedTab() : 'app');
    if (!QP.store.config) { try { await QP.store.load(); } catch (err) { console.error('settings: config load', err); } }
    // Without a config every edit would be dropped, so say so instead of looking editable.
    const lead = root.querySelector('.st-head p');
    lead.textContent = QP.store.config ? 'Changes apply as you make them.' : 'Couldn’t read your settings, so changes won’t save right now. Reopen Settings to try again.';
    lead.classList.toggle('bad', !QP.store.config);
    root.querySelectorAll('input, select').forEach(el => { el.disabled = !QP.store.config; });
    hydrate();
    if (!section || ST_TABS.includes(section)) setTab(tab); // the address and the page row name the tab
    if (bridge()) { loadAccount(); loadOverlay(); loadCompanion(); loadCrawler(); loadAbout(); }
    clearInterval(timer); timer = setInterval(() => { if (root.hidden) clearInterval(timer); else loadCrawler(); }, 60000); // /status is the crawler's slow admin view: once a minute while Settings shows // stops once you leave Settings
    if (section && !ST_TABS.includes(section)) requestAnimationFrame(() => document.getElementById('st-' + stCard(section))?.scrollIntoView({ block: 'start' }));
    else window.scrollTo(0, 0);
  }
  // Every control as {label, hint, id, section, key} for the global search (palette.js); builds the page if it isn't yet.
  function index() {
    if (!built) build();
    return [...root.querySelectorAll('.st-row, .st-chip')].map(r => {
      const lbl = r.querySelector('.st-lbl'), ctl = r.querySelector('[data-k], [data-do], input, select'), card = r.closest('.st-card');
      const label = lbl ? (lbl.firstChild?.textContent || '').trim() : r.textContent.trim();
      return { label, hint: lbl?.querySelector('.st-tip')?.dataset.tip || lbl?.querySelector('small')?.textContent.trim() || '', id: card.id.slice(3), section: `${SECTIONS.find(x => x[0] === card.dataset.tab)?.[1] || ''} › ${card.querySelector('h2').textContent}`, key: ctl?.dataset.k || '' };
    }).filter(x => x.label && x.key);
  }
  window.settingsView = { show, index, sections: SECTIONS, row: () => SECTIONS.map(([id, l]) => `<a href="#/settings#${id}">${l}</a>`).join('') };
})();
