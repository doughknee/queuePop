/* App-wide keyboard (DONI-538). Ctrl+1/2/3 worlds, Alt+Home home, Ctrl+, Settings, Alt+←/→ and the mouse's back/forward
   buttons walk history, Ctrl+B folds the sidebar, ? shows every shortcut in a sheet under the page row (not a modal).
   Ctrl+K and / belong to palette.js; Ctrl+= / Ctrl+- / Ctrl+0 (text size) are caught by the host (app/main.js). Loaded by shell.js. */
(function () {
  // [keys, what it does] — the sheet and the handler read the same list. `go` is a hash, `run` a function name below.
  const SHORTCUTS = [
    ['Ctrl K', 'Search everything', { run: 'search' }], ['/', 'Search everything', { run: 'search', bare: true }],
    ['Ctrl 1', 'League of Legends', { go: '#/league' }], ['Ctrl 2', 'Teamfight Tactics', { go: '#/tft' }], ['Ctrl 3', 'Deadlock', { go: '#/deadlock' }],
    ['Alt Home', 'Home', { go: '#/' }], ['Ctrl ,', 'Settings', { go: '#/settings' }],
    ['Alt ←', 'Back', { run: 'back' }], ['Alt →', 'Forward', { run: 'forward' }],
    ['Ctrl B', 'Collapse or expand the sidebar', { run: 'sidebar' }],
    ['Ctrl +', 'Bigger text', {}], ['Ctrl −', 'Smaller text', {}], ['Ctrl 0', 'Text size back to 110%', {}],
    ['Ctrl F', 'Find a setting (on Settings)', {}], ['?', 'This list', { run: 'help', bare: true }], ['Esc', 'Close a sheet', {}],
  ];
  // KeyboardEvent → the shortcut's key label ("Ctrl 1", "Alt ←", "?"), or '' for anything else. Pure; app/test-keys.js checks it.
  function keyLabel(e) {
    const k = { ArrowLeft: '←', ArrowRight: '→', ',': ',', Home: 'Home' }[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : '');
    if (!k) return '';
    if (e.ctrlKey && !e.altKey && !e.shiftKey) return 'Ctrl ' + k;
    if (e.altKey && !e.ctrlKey && !e.shiftKey) return 'Alt ' + k;
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (k === '?' || k === '/')) return k;
    return '';
  }
  window.qpKeyLabel = keyLabel; window.QP_SHORTCUTS = SHORTCUTS;
  if (typeof document === 'undefined' || !document.getElementById('qp-sidebar')) return; // app/test-keys.js

  const E = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
  const sheet = document.createElement('div');
  sheet.id = 'qp-keys'; sheet.className = 'qp-search qp-keys'; sheet.hidden = true; sheet.tabIndex = -1;
  sheet.setAttribute('role', 'region'); sheet.setAttribute('aria-label', 'Keyboard shortcuts');
  sheet.innerHTML = `<div class="qs-box"><b class="qk-title">Keyboard shortcuts</b><kbd>Esc</kbd></div>
    <dl class="qk-list">${SHORTCUTS.map(([k, what]) => `<div><dt>${k.split(' ').map(x => `<kbd>${E(x)}</kbd>`).join('')}</dt><dd>${E(what)}</dd></div>`).join('')}</dl>
    <p class="qs-foot">Mouse back and forward buttons walk history too.</p>`;
  document.body.append(sheet);
  let back = null;
  function place() {
    const city = document.querySelector('#deadlock-view:not([hidden])')?.shadowRoot?.querySelector('.city-nav');
    const r = (city || document.getElementById('world-nav')).getBoundingClientRect(), main = document.getElementById('qp-sidebar').getBoundingClientRect().right;
    const w = Math.min(640, innerWidth - main - 32);
    Object.assign(sheet.style, { top: Math.max(32, r.bottom) + 'px', left: main + Math.max(16, (innerWidth - main - w) / 2) + 'px', width: w + 'px' });
  }
  const help = (show = sheet.hidden) => {
    if (show) { back = document.activeElement; sheet.hidden = false; place(); sheet.focus(); window.qpSearch?.close(false); }
    else if (!sheet.hidden) { sheet.hidden = true; if (back && back.isConnected) back.focus({ preventScroll: true }); }
  };
  const RUN = {
    search: () => window.qpSearch?.open(), help: () => help(),
    back: () => history.back(), forward: () => history.forward(),
    sidebar: () => document.querySelector('#qp-sidebar .sb-toggle')?.click(),
  };
  const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !sheet.hidden) { e.preventDefault(); help(false); return; }
    const label = keyLabel(e), hit = label && SHORTCUTS.find(([k]) => k === label);
    if (!hit || (!hit[2].go && !hit[2].run) || hit[2].run === 'search') return; // Ctrl K and / are palette.js's
    if (hit[2].bare && typing(e.composedPath()[0])) return; // ? and / are just characters inside a text field
    e.preventDefault();
    if (hit[2].go) { help(false); if (location.hash !== hit[2].go) location.hash = hit[2].go.slice(1); }
    else RUN[hit[2].run]();
  });
  document.addEventListener('mouseup', e => { if (e.button === 3) history.back(); else if (e.button === 4) history.forward(); });
  document.addEventListener('pointerdown', e => { if (!sheet.hidden && !sheet.contains(e.target)) help(false); });
  sheet.addEventListener('focusout', e => { if (!sheet.hidden && e.relatedTarget && !sheet.contains(e.relatedTarget)) { sheet.hidden = true; } });
  addEventListener('hashchange', () => help(false));

  // The sidebar's resize grip, by keyboard: focus it and use ← / → (Home/End for the ends). shell.js owns the width.
  const grip = document.querySelector('#qp-sidebar .sb-resize');
  if (grip) {
    Object.assign(grip, { tabIndex: 0, title: 'Drag, or focus and use ← →, to resize the sidebar' });
    grip.removeAttribute('aria-hidden');
    grip.setAttribute('role', 'separator'); grip.setAttribute('aria-orientation', 'vertical'); grip.setAttribute('aria-label', 'Resize sidebar');
    grip.setAttribute('aria-valuemin', '200'); grip.setAttribute('aria-valuemax', '400');
    const sync = () => grip.setAttribute('aria-valuenow', String(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sb-open-w')) || 248));
    sync();
    grip.addEventListener('keydown', e => {
      const w = parseInt(grip.getAttribute('aria-valuenow')), to = { ArrowLeft: w - 16, ArrowRight: w + 16, Home: 200, End: 400 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); window.qpSidebarWidth?.(to); sync();
    });
  }
})();
