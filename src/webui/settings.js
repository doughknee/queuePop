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
// Settings > Recorder (beta) > ffmpeg: what was found, and why Record video is greyed out (said in the line, not only a hover title).
window.stFfmpegLine = (f, events) => !f ? 'Couldn’t check.' : !f.found ? 'ffmpeg not found: install it from ffmpeg.org (and add it to PATH) to enable video.'
  : `Found ${f.version ? 'ffmpeg ' + f.version : 'ffmpeg'}, encoding with ${{ h264_nvenc: 'your NVIDIA card', h264_amf: 'your AMD card', h264_qsv: 'Intel Quick Sync', libx264: 'the CPU (slower)' }[f.encoder] || f.encoder}.${events ? '' : ' Turn on Record game events to record video.'}`;
// DONI-590: which games each Settings card is for (cards not listed are app-wide). TFT queues through the League
// client, so the queue, alerts and phone features serve both; champ select is League's alone. Pure; test-settings.js checks it.
window.ST_FOR = { queue: ['league', 'tft'], champselect: ['league'], deadlock: ['deadlock'], alerts: ['league', 'tft'], companion: ['league', 'tft'], recorder: ['league', 'tft'], crawler: ['league', 'tft'] };
window.stCovers = g => Object.keys(window.ST_FOR).filter(id => window.ST_FOR[id].includes(g));
// DONI-591: Settings opens one tab at a time (a game, or App). A link to a card lands on the tab that shows it:
// the current tab when it has the card, else the card's first game. Old ids (account, games) keep working.
window.ST_TABS = ['league', 'tft', 'deadlock', 'app'];
window.stTabCards = tab => tab === 'app' ? ['display', 'about'] : window.stCovers(tab);
window.stTabOf = (section, current) => {
  if (window.ST_TABS.includes(section)) return section;
  if (section === 'account') return 'deadlock';
  if (section === 'display' || section === 'about') return 'app';
  const gs = window.ST_FOR[section];
  return gs ? (gs.includes(current) ? current : gs[0]) : null;
};
(function () {
  const DEFAULT_CRAWLER = 'http://10.205.0.81:47900';
  const SECTIONS = [['league', 'League'], ['tft', 'TFT'], ['deadlock', 'Deadlock'], ['app', 'App']];
  const TITLE = { queue: 'Queue', champselect: 'Champ select', deadlock: 'Deadlock', alerts: 'Alerts', companion: 'Phone companion', recorder: 'Recorder (beta)', crawler: 'Stats crawler' };
  const GAMES = [['league', 'League of Legends', 'League', 'assets/logos/league.svg'], ['tft', 'Teamfight Tactics', 'TFT', 'assets/logos/tft.png'], ['deadlock', 'Deadlock', 'Deadlock', 'assets/logos/deadlock.png']];
  const GN = Object.fromEntries(GAMES.map(g => [g[0], g[2]]));
  // Why a game's tab leaves a card out, listed at the foot of that tab.
  const STEAM = 'Deadlock queues in Steam, where queuePop can’t see it.';
  const WHY = { queue: { deadlock: STEAM }, champselect: { tft: 'TFT has no champ select.', deadlock: 'Deadlock picks heroes in game, where queuePop can’t reach.' }, alerts: { deadlock: STEAM }, companion: { deadlock: STEAM }, recorder: { deadlock: 'Deadlock isn’t recorded yet.' }, crawler: { deadlock: 'Deadlock stats come from their own source; nothing to set.' } };
  const EVENTS = [['queue_pop', 'Queue pops'], ['timeline', 'Queue timeline (ETA, game start, come back)'], ['game_start', 'Game starts'], ['disconnect', 'Client disconnects']];
  const LEAGUE_EVENTS = [['champ_select', 'Champ select starts'], ['locked_pick', 'Locked pick'], ['game_plan', 'Game plan at lock-in']];
  const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5], UI_DEFAULT = 1.1; // DONI-516: Text size = Electron zoom factor, config ui_scale
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const bridge = () => window.pywebview && window.pywebview.api;
  const root = document.getElementById('settings-view');
  let built = false, timer = null, customSound = '';

  const sw = (key, label, hint) => `<label class="st-row"><span class="st-lbl">${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="st-sw"><input type="checkbox" role="switch" data-k="${key}"><i aria-hidden="true"></i></span></label>`;
  const num = (key, label, hint, min, max) => `<label class="st-row"><span class="st-lbl">${label}${hint ? `<small>${hint}</small>` : ''}</span><input class="st-in st-num" type="number" data-k="${key}" data-num min="${min}" max="${max}"></label>`;
  const forLine = id => !ST_FOR[id] || ST_FOR[id].length < 2 ? '' : `<p class="st-for">${ST_FOR[id].map(g => `<span class="st-g" data-g="${g}">${GN[g]}</span>`).join('')}</p>`;
  // Game chips show only on cards more than one game shares.
  const card = (id, title, body) => `<section class="st-card" id="st-${id}"><h2>${title}</h2>${forLine(id)}<div class="st-body">${body}</div></section>`;
  const chips = list => `<div class="st-events">${list.map(([k, l]) => `<label class="st-chip"><input type="checkbox" data-k="alert_events.${k}"><span>${l}</span></label>`).join('')}</div>`;

  function build() {
    root.innerHTML = `<div class="st-wrap"><header class="st-head"><h1>Settings</h1><p>Everything queuePop can be told, in one place. Changes apply as you make them.</p>
        <label class="st-find"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="m13 13 4 4"/></svg><input type="search" id="st-find" placeholder="Find a setting" aria-label="Find a setting" autocomplete="off" spellcheck="false"></label>
        <p class="st-none" id="st-none" role="status" hidden></p></header>` +
      `<div class="st-games" role="tablist" aria-label="Settings for">${[...GAMES, ['app', 'App', 'App', '']].map(([g, l, , logo]) => `<div class="st-game" data-tab="${g}" role="tab" tabindex="0" aria-selected="false">
          ${logo ? `<img src="${logo}" alt="">` : '<svg class="st-gear" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></svg>'}<b class="st-gname">${l}</b>
          ${g === 'app' ? '' : `<label class="st-sw" title="Show or hide ${l} across queuePop"><input type="checkbox" role="switch" data-k="games_enabled.${g}" aria-label="Show ${l} in queuePop"><i aria-hidden="true"></i></label>`}
          <p class="st-who" id="st-who-${g}">${g === 'app' ? 'Display, startup and updates' : ''}</p></div>`).join('')}</div>
        <p class="st-hint st-tabhint">Pick a game to see its settings. Its switch shows or hides it across queuePop; what you set here is kept either way.</p>
        <p class="st-offnote" id="st-offnote" role="status" hidden></p>` +
      card('queue', 'Queue', `
        ${sw('auto_accept', 'Auto-accept queue pops', 'Accepts League and TFT matches for you. Stays as you set it after a restart; the tray’s Pause is for right now only.')}
        ${num('accept_delay_seconds', 'Accept delay', 'Seconds to wait before accepting a queue pop. 0 accepts at once.', 0, 10)}
        <div class="st-row"><span class="st-lbl">Queues to auto-accept<small>Choose them on the Play page.</small></span><span class="st-act"><span id="st-queues" class="st-val"></span><a class="st-btn" href="#/league/play">Play page</a></span></div>`) +
      card('champselect', 'Champ select', `
        ${sw('champ_select.enabled', 'Auto pick and ban', 'Hovers, bans, picks and locks in from your champ select plan.')}
        ${sw('champ_select.instant_lock', 'Lock in at once', 'When off, it locks in near the end of the timer instead.')}
        ${num('champ_select.lock_in_at_seconds', 'Lock in with', 'Seconds left on the timer when it locks in.', 0, 30)}
        ${sw('champ_select.trades.enabled', 'Champion trades', 'Asks teammates to swap when they have a champion you ranked higher.')}
        ${sw('champ_select.aram.enabled', 'ARAM bench', 'Takes upgrades from the ARAM bench.')}
        ${num('champ_select.aram.bench_delay', 'Bench grab delay', 'Seconds an upgrade sits on the bench before it is taken (0 to 3).', 0, 3)}
        ${sw('champ_select.smart_pick', 'Smart pick from my list', 'Auto pick still picks only from your list for the role, but tries first the one that scores best against this draft (from the stats crawler). Off picks in the order you wrote.')}
        ${sw('float_window', 'Float suggestions over League', 'A small window on top of the League client during champ select with the best picks and the timer. Drag it anywhere; it remembers.')}
        ${sw('champ_select.auto_runes', 'Auto runes', 'Applies the recommended rune page when you lock in.')}`) +
      card('deadlock', 'Deadlock', `
        <label class="st-row"><span class="st-lbl">Deadlock account ID<small>Your Steam friend code (numbers only). Shows your own matches in Deadlock and on home.</small></span><input class="st-in" data-k="deadlock_account_id" data-digits inputmode="numeric" placeholder="e.g. 123456789"></label>
        <div class="st-row"><span class="st-lbl">In-game overlay<small id="st-dl-ov">Checking…</small></span><span class="st-act"><a class="st-btn" href="#/deadlock">Deadlock page</a></span></div>`) +
      card('alerts', 'Alerts', `
        <div class="st-row"><span class="st-lbl">Test a queue pop<small>Sends exactly what a real queue pop sends, through every channel that is on. Nothing is accepted.</small></span><span class="st-act"><button class="st-btn st-gold" data-do="test-alert">Test a queue pop</button><span class="st-msg" data-msg="test-alert"></span></span></div>
        <div class="st-sub">Tell me when</div>
        ${chips(EVENTS)}
        <div data-only="league"><div class="st-sub st-sub2">League only</div>${chips(LEAGUE_EVENTS)}</div>
        ${num('timeline_load_seconds', 'Loading screen allowance', 'Seconds the timeline adds for the loading screen when it says when your game starts.', 0, 300)}
        ${sw('desktop_notifications', 'Windows notifications', 'A Windows notification for the events ticked above.')}
        <div class="st-row"><span class="st-lbl">Test a notification</span><span class="st-act"><button class="st-btn" data-do="test-desktop">Send a test notification</button><span class="st-msg" data-msg="test-desktop"></span></span></div>
        ${sw('discord_enabled', 'Discord', 'Posts to a Discord webhook, so Discord pushes it to your phone.')}
        <label class="st-row"><span class="st-lbl">Webhook URL<small>Discord: channel settings › Integrations › Webhooks › Copy URL.</small></span><input class="st-in st-wide" data-k="webhook_url" placeholder="https://discord.com/api/webhooks/…"></label>
        <label class="st-row"><span class="st-lbl">Discord user ID<small>Optional. Adds an @mention so the push is louder.</small></span><input class="st-in" data-k="user_id" placeholder="123456789012345678"></label>
        <div class="st-row"><span class="st-lbl">Test Discord</span><span class="st-act"><button class="st-btn" data-do="test-discord">Send a test to Discord</button><span class="st-msg" data-msg="test-discord"></span></span></div>
        ${sw('ntfy.enabled', 'Push with ntfy', 'The free ntfy app buzzes your phone even with the screen off. No Discord, no account.')}
        <label class="st-row"><span class="st-lbl">ntfy topic<small>Subscribe to this topic in the ntfy app. Anyone who knows it can read your alerts, so keep it random.</small></span><span class="st-act"><input class="st-in" data-k="ntfy.topic" id="st-ntfy-topic" placeholder="queuepop-…"><button class="st-btn" data-do="ntfy-new">New topic</button></span></label>
        <label class="st-row"><span class="st-lbl">ntfy server<small>Leave as ntfy.sh, or your own server.</small></span><input class="st-in st-wide" data-k="ntfy.server" data-url placeholder="https://ntfy.sh"></label>
        <label class="st-row"><span class="st-lbl">ntfy access token<small>Only for a protected server.</small></span><input class="st-in st-wide" data-k="ntfy.token" type="password" autocomplete="off"></label>
        <div class="st-row"><span class="st-lbl">Test ntfy</span><span class="st-act"><button class="st-btn" data-do="test-ntfy">Send a test push</button><span class="st-msg" data-msg="test-ntfy"></span></span></div>`) +
      card('companion', 'Phone companion', `
        ${sw('companion.enabled', 'Alarm my phone when the queue pops', 'A page on your home Wi-Fi. No app, no account.')}
        ${num('companion.port', 'Port', 'Change it only if another program already uses 8420.', 1024, 65535)}
        <div class="st-row"><span class="st-lbl">Alarm sound<small>What your phone plays when the queue pops.</small></span><span class="st-act">
          <select class="st-in" data-k="companion.sound"><option value="chime">Chime</option><option value="ping">Ping</option><option value="arcade">Arcade</option><option value="siren">Siren (loud)</option><option value="custom">Custom file</option></select>
          <button class="st-btn" data-do="preview-sound">Preview</button><button class="st-btn" data-do="pick-sound">Choose file…</button><span class="st-msg" id="st-sound-file"></span><span class="st-msg" data-msg="pick-sound" data-msg-alias="preview-sound"></span></span></div>
        <div class="st-comp"><img id="st-qr" alt="Scan to open on your phone" hidden>
          <div><p id="st-comp-note" class="st-val"></p><p class="st-hint">Scan with your phone camera, tap Enable Alerts and keep the tab open. Same Wi-Fi only.</p>
          <span class="st-act"><button class="st-btn" data-do="copy-link">Copy link</button><button class="st-btn" data-do="test-companion">Test phone alert</button><button class="st-btn" data-do="new-link" title="Phones already set up stop getting alerts until they scan the new code">New link</button><span class="st-msg" data-msg="test-companion"></span></span></div></div>`) +
      card('recorder', 'Recorder (beta)', `
        ${sw('recorder.enabled', 'Record game events', 'Keeps a timeline of each League and TFT game: your kills, deaths, assists, multikills, objectives and the result. See them under Recordings.')}
        ${sw('recorder.video', 'Record video', 'Records your main screen while a game is in progress and cuts a clip around each moment. Needs ffmpeg; uses your graphics card when it can.')}
        <div class="st-row"><span class="st-lbl">ffmpeg<small id="st-rec-ff">Checking…</small></span><span class="st-act"><button class="st-btn" data-do="rec-recheck">Check again</button></span></div>
        <label class="st-row"><span class="st-lbl">Video quality</span><select class="st-in" data-k="recorder.preset"><option value="720p30">720p, 30 fps</option><option value="1080p30">1080p, 30 fps</option><option value="1080p60">1080p, 60 fps</option></select></label>
        <label class="st-row"><span class="st-lbl">Folder<small>Leave empty for queuePop's own folder.</small></span><input class="st-in st-wide" data-k="recorder.folder" placeholder="queuePop's recordings folder"></label>
        ${num('recorder.cap_gb', 'Size limit (GB)', 'When videos pass this, the oldest are deleted first.', 1, 2000)}
        <div class="st-row"><span class="st-lbl">Recordings</span><span class="st-act"><a class="st-btn" href="#/recordings">Open Recordings</a><button class="st-btn" data-do="rec-folder">Open folder</button><span class="st-msg" data-msg="rec-folder"></span></span></div>`) +
      card('crawler', 'Stats crawler', `
        <label class="st-row"><span class="st-lbl">Address<small>Where League and TFT stats come from. Leave empty for the default.</small></span><input class="st-in st-wide" data-k="crawler_url" data-url placeholder="${DEFAULT_CRAWLER}"></label>
        <div class="st-row"><span class="st-lbl">Status<small id="st-cr-url"></small></span><span class="st-act"><span id="st-cr-state" class="st-val"></span><button class="st-btn" data-do="crawler-refresh">Refresh</button><button class="st-btn" data-do="crawler-open">Open status page</button><span class="st-msg" data-msg="crawler-refresh" data-msg-alias="crawler-open"></span></span></div>
        <div id="st-cr-grid" class="st-grid"></div>
        <details class="st-more" id="st-cr-keybox"><summary>Replace the Riot key</summary>
        <div class="st-row"><span class="st-lbl">Get a new key<small>Riot’s developer portal: log in, then Regenerate API Key. A development key lasts 24 hours.</small></span><span class="st-act"><button class="st-btn" data-do="riot-dev">Open developer.riotgames.com</button></span></div>
        <label class="st-row"><span class="st-lbl">New key<small>Starts with RGAPI-</small></span><input class="st-in st-wide" id="st-cr-key" type="password" autocomplete="off" placeholder="RGAPI-…"></label>
        <label class="st-row"><span class="st-lbl">Admin token<small>The crawler's ADMIN_TOKEN. Used once, never stored.</small></span><input class="st-in st-wide" id="st-cr-token" type="password" autocomplete="off"></label>
        <div class="st-row"><span class="st-lbl"></span><span class="st-act"><button class="st-btn st-gold" data-do="crawler-key">Update key</button><span class="st-msg" data-msg="crawler-key"></span></span></div></details>`) +
      card('display', 'App &amp; display', `
        <label class="st-row"><span class="st-lbl">Text size<small>Scales the whole app. Ctrl + and Ctrl − step through these; Ctrl 0 goes back to 110%.</small></span><select class="st-in" data-k="ui_scale" data-scale>${UI_SCALES.map(v => `<option value="${v}">${Math.round(v * 100)}%</option>`).join('')}</select></label>
        ${sw('launch_at_login', 'Launch at login', 'Starts queuePop when you sign in to Windows.')}
        ${sw('start_minimized', 'Start in the tray', 'Opens to the tray icon instead of the window.')}
        ${sw('close_to_tray', 'Close to the tray', 'The window’s ✕ keeps queuePop running in the tray. When off, ✕ quits.')}
        <div class="st-row"><span class="st-lbl">Keyboard shortcuts<small>Press ? anywhere to see them all.</small></span><span class="st-act"><button class="st-btn" data-do="show-keys">Show shortcuts</button></span></div>
        <div class="st-row"><span class="st-lbl">Set-up tips on home<small>Bring back the set-up strip you hid.</small></span><span class="st-act"><button class="st-btn" data-do="reset-setup">Show them again</button><span class="st-msg" data-msg="reset-setup"></span></span></div>`) +
      card('about', 'Updates &amp; about', `
        <div class="st-row"><span class="st-lbl">Version<small id="st-upd-msg"></small></span><span class="st-act"><span id="st-ver" class="st-val"></span><button class="st-btn" data-do="check-update">Check for updates</button><span class="st-msg" data-msg="check-update"></span></span></div>
        <div class="st-row"><span class="st-lbl">Icon packs<small id="st-assets-msg"></small></span><span class="st-act"><button class="st-btn" data-do="refresh-assets">Download again</button><span class="st-msg" data-msg="refresh-assets"></span></span></div>
        <div class="st-row"><span class="st-lbl">Config folder<small>config.json and your stats live here.</small></span><span class="st-act"><button class="st-btn" data-do="open-config">Open folder</button><span class="st-msg" data-msg="open-config"></span></span></div>
        <div class="st-sub">Release notes</div><div id="st-notes" class="st-notes">Loading…</div>`) + `<div class="st-notfor" id="st-notfor"></div></div>`;
    root.querySelector('#st-find').addEventListener('input', e => find(e.target.value));
    // Ctrl+F on Settings goes to the find box.
    document.addEventListener('keydown', e => { if (!root.hidden && e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); const f = root.querySelector('#st-find'); f.focus(); f.select(); } });
    root.querySelector('#st-find').addEventListener('keydown', e => { if (e.key === 'Escape' && e.target.value) { e.stopPropagation(); e.target.value = ''; find(''); } });
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
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
      const whole = !words.length || has(card.querySelector('h2').textContent + ' ' + [...card.querySelectorAll('.st-g')].map(g => g.textContent).join(' ')); // "tft" finds every TFT card
      let any = whole;
      card.querySelectorAll('.st-row, .st-chip').forEach(r => { const hit = whole || has(r.textContent); r.classList.toggle('st-off', !hit); any ||= hit; });
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
      if (el.dataset.k === 'champ_select.instant_lock' || el.dataset.k === 'close_to_tray' || el.dataset.k === 'float_window' || el.dataset.k === 'auto_accept') v = v ?? true;
      if (el.dataset.k === 'crawler_url') v = v || '';
      if (el.dataset.k === 'companion.sound') v = v || 'chime';
      if (el.dataset.k === 'ui_scale') v = UI_SCALES.includes(v) ? v : UI_DEFAULT;
      if (el.dataset.k.startsWith('games_enabled.')) { const on = window.qpGames ? qpGames() : []; v = on.includes(el.dataset.k.slice(14)); el.disabled = v && on.length === 1; el.closest('.st-game').title = el.disabled ? 'Keep at least one game on' : ''; }
      if (el.type === 'checkbox') el.checked = !!v; else if (document.activeElement !== el) el.value = v ?? '';
    });
    const ids = c.allowed_queue_ids || [];
    root.querySelector('#st-queues').textContent = ids.length ? `${ids.length} chosen queue${ids.length > 1 ? 's' : ''}` : 'Any queue';
    const inst = QP.store.get('champ_select.instant_lock') ?? true;
    root.querySelector('[data-k="champ_select.lock_in_at_seconds"]').closest('.st-row').hidden = inst;
    const file = (c.companion || {}).sound_file || customSound;
    root.querySelector('#st-sound-file').textContent = (c.companion || {}).sound === 'custom' ? (file ? file.split(/[\\/]/).pop() : 'No file chosen') : '';
    applyTab();
  }

  // DONI-591: one tab at a time. Cards the tab doesn't use are hidden (search still finds them); a game that's
  // switched off keeps its tab and values, with one line saying so. Switching another game never moves this page.
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
    const on = window.qpGames ? qpGames() : GAMES.map(g => g[0]), searching = root.classList.contains('st-searching');
    root.dataset.tab = tab;
    document.querySelectorAll('#world-nav a[href^="#/settings#"]').forEach(a => a.getAttribute('href') === '#/settings#' + tab ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    root.querySelectorAll('.st-game').forEach(t => {
      const sel = t.dataset.tab === tab;
      t.classList.toggle('is-sel', sel); t.setAttribute('aria-selected', String(sel)); t.tabIndex = sel ? 0 : -1;
      t.classList.toggle('is-off', t.dataset.tab !== 'app' && !on.includes(t.dataset.tab));
    });
    const cards = stTabCards(tab);
    root.querySelectorAll('.st-card').forEach(c => c.classList.toggle('st-other', !cards.includes(c.id.slice(3))));
    root.querySelectorAll('[data-only]').forEach(el => { el.hidden = !searching && tab !== el.dataset.only; });
    const off = tab !== 'app' && !on.includes(tab), note = root.querySelector('#st-offnote');
    note.hidden = !off;
    if (off) note.textContent = `${GN[tab]} is switched off, so these do nothing right now. They’re kept for when you switch it back on.`;
    // What this game's tab leaves out, and why, grouped by reason.
    const why = new Map();
    for (const id of Object.keys(WHY)) { const r = WHY[id][tab]; if (r) why.set(r, [...(why.get(r) || []), TITLE[id]]); }
    root.querySelector('#st-notfor').innerHTML = why.size ? `<b>Not for ${GN[tab]}</b>` + [...why].map(([r, ts]) => `<p><span>${ts.join(', ')}</span>${r}</p>`).join('') : '';
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
    if (k === 'recorder.enabled') { if (!v) QP.store.set('recorder.video', false); loadRecorder(); } // video rides on event recording
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
      else if (d === 'rec-recheck') { loadRecorder(true); }
      else if (d === 'rec-folder') { const r = await a.open_recordings_folder(); if (r && r.ok === false) say(d, r.error || 'Couldn’t open it', false); }
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
        cell('Riot key', k.source === 'none' ? 'none set' : k.valid === false ? `rejected${k.reason ? ' (' + k.reason + ')' : ''}` : `${k.source}${k.set_at ? ' · set ' + ago(k.set_at) : ''}`) +
        `<div class="st-buckets">${buckets}</div>`;
    } catch (err) {
      st.textContent = err.name === 'TimeoutError' ? 'Not answering (waited 8 s)' : err instanceof SyntaxError ? 'Online, but its status didn’t make sense' : /fetch/i.test(err.message) ? 'Not answering. Is it running, and is this the right address?' : 'Not answering (' + (err.message || err) + ')'; st.className = 'st-val bad'; grid.innerHTML = '';
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
  // Q21: video needs ffmpeg on PATH; say so and keep the switch off when it isn't there.
  async function loadRecorder() {
    const el = root.querySelector('#st-rec-ff'), sw = root.querySelector('[data-k="recorder.video"]'); if (!el) return;
    let s = null; try { s = await bridge().recorder_status(); } catch {}
    const f = s && s.ffmpeg;
    const events = !!QP.store.get('recorder.enabled');
    el.textContent = stFfmpegLine(f, events);
    sw.disabled = !(f && f.found) || !events; sw.closest('.st-row').title = !(f && f.found) ? 'Install ffmpeg first' : !events ? 'Turn on Record game events first' : '';
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
    tab = stTabOf(section, tab) || tab || (ST_TABS.includes(savedTab()) ? savedTab() : (window.qpGames ? qpGames()[0] : 'league'));
    if (!QP.store.config) { try { await QP.store.load(); } catch (err) { console.error('settings: config load', err); } }
    // Without a config every edit would be dropped, so say so instead of looking editable.
    const lead = root.querySelector('.st-head p');
    lead.textContent = QP.store.config ? 'Everything queuePop can be told, in one place. Changes apply as you make them.' : 'Couldn’t read your settings, so changes won’t save right now. Reopen Settings to try again.';
    lead.classList.toggle('bad', !QP.store.config);
    root.querySelectorAll('input, select').forEach(el => { el.disabled = !QP.store.config; });
    hydrate();
    if (!section || ST_TABS.includes(section)) setTab(tab); // the address and the page row name the tab
    if (bridge()) { loadAccount(); loadOverlay(); loadCompanion(); loadCrawler(); loadAbout(); loadRecorder(); }
    clearInterval(timer); timer = setInterval(() => { if (root.hidden) clearInterval(timer); else loadCrawler(); }, 60000); // /status is the crawler's slow admin view: once a minute while Settings shows // stops once you leave Settings
    if (section && !ST_TABS.includes(section)) requestAnimationFrame(() => document.getElementById('st-' + section)?.scrollIntoView({ block: 'start' }));
    else window.scrollTo(0, 0);
  }
  // Every control as {label, hint, id, section, key} for the global search (palette.js); builds the page if it isn't yet.
  function index() {
    if (!built) build();
    return [...root.querySelectorAll('.st-row, .st-chip')].map(r => {
      const lbl = r.querySelector('.st-lbl'), ctl = r.querySelector('[data-k], [data-do], input, select'), card = r.closest('.st-card');
      const label = lbl ? (lbl.firstChild?.textContent || '').trim() : r.textContent.trim();
      return { label, hint: lbl?.querySelector('small')?.textContent.trim() || '', id: card.id.slice(3), section: card.querySelector('h2').textContent, key: ctl?.dataset.k || '' };
    }).filter(x => x.label && x.key);
  }
  window.settingsView = { show, index, sections: SECTIONS, row: () => SECTIONS.map(([id, l]) => `<a href="#/settings#${id}">${l}</a>`).join('') };
})();
