/* Bookmarks bar (Brandon, 2026-10-20): the title bar holds the pages you pinned, from any game, with their icons.
   ☆ (or Ctrl+D) pins the page you're on; hover a bookmark for ×; drag to reorder. Stored in config.json (bookmarks). */
// Pure; app/test-bookmarks.js checks it. Toggling adds the page at the end, or removes it when it's already there.
window.qpMarksToggle = (list, page) => list.some(b => b.href === page.href) ? list.filter(b => b.href !== page.href) : [...list, page].slice(-30);
window.qpMarksMove = (list, from, to) => { const l = list.slice(), [b] = l.splice(from, 1); if (b) l.splice(Math.max(0, Math.min(to, l.length)), 0, b); return l; };
window.qpMarkGame = href => (/^#\/(league|tft|deadlock|settings|recordings)\b/.exec(href || '') || [])[1] || 'home';
(function () {
  const bar = document.getElementById('qp-marks'); if (!bar) return;
  const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const LOGO = { league: 'assets/logos/league.svg', tft: 'assets/logos/tft.png', deadlock: 'assets/logos/deadlock.png' };
  const SVG = {
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/></svg>',
    recordings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
    home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/></svg>',
  };
  const icon = g => LOGO[g] ? `<img src="${LOGO[g]}" alt="">` : SVG[g] || SVG.home;
  const list = () => (window.QP && QP.store && QP.store.config && QP.store.config.bookmarks) || [];
  const here = () => (location.hash || '#/').replace(/\/+$/, '') || '#/';
  // The page's own title, without the app and game suffixes: "Ezreal · League of Legends · QueuePop" → "Ezreal".
  const title = () => (document.title.replace(/\s*·\s*QueuePop$/i, '').split(' · ')[0] || 'Home').trim();
  function render() {
    const l = list(), at = here(), on = l.some(b => b.href === at);
    bar.innerHTML = `<button class="qb-star" type="button" aria-pressed="${on}" title="${on ? 'Remove this page from your bookmarks' : 'Bookmark this page'} (Ctrl+D)">${on ? '★' : '☆'}</button>` +
      (l.length ? l.map((b, i) => `<a class="qb-mark" href="${E(b.href)}" data-i="${i}" draggable="true" title="${E(b.label)}"${b.href === at ? ' aria-current="page"' : ''}>${icon(b.game)}<span>${E(b.label)}</span><i data-rm="${i}" role="button" aria-label="Remove ${E(b.label)}" title="Remove">×</i></a>`).join('')
        : '<span class="qb-hint">Press ☆ on any page to keep it up here</span>');
  }
  const save = l => { QP.store.set('bookmarks', l); render(); };
  const toggle = () => { if (QP.store.config) save(qpMarksToggle(list(), { href: here(), label: title().slice(0, 60), game: qpMarkGame(here()) })); };
  bar.addEventListener('click', e => {
    if (e.target.closest('.qb-star')) return toggle();
    const rm = e.target.closest('[data-rm]');
    if (rm) { e.preventDefault(); save(list().filter((_, i) => i !== +rm.dataset.rm)); }
  });
  let dragFrom = null;
  bar.addEventListener('dragstart', e => { const a = e.target.closest('.qb-mark'); if (a) { dragFrom = +a.dataset.i; e.dataTransfer.effectAllowed = 'move'; } });
  bar.addEventListener('dragover', e => { if (dragFrom !== null && e.target.closest('.qb-mark')) e.preventDefault(); });
  bar.addEventListener('drop', e => { const a = e.target.closest('.qb-mark'); if (dragFrom === null || !a) return; e.preventDefault(); save(qpMarksMove(list(), dragFrom, +a.dataset.i)); dragFrom = null; });
  bar.addEventListener('dragend', () => { dragFrom = null; });
  document.addEventListener('keydown', e => { if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggle(); } });
  // Pages set their title as they render, so the star and the current bookmark settle a beat after the route changes.
  addEventListener('hashchange', () => setTimeout(render, 60));
  (function waitForConfig(n) { if (window.QP && QP.store && QP.store.config) render(); else if (n < 100) setTimeout(() => waitForConfig(n + 1), 100); else render(); })(0);
})();
