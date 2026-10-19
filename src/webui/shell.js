/* The sidebar (index.html #qp-sidebar) is the host's only navigation. This
   highlights the current game and page, collapses it to an icon rail and
   resizes it by its right edge; width and collapse persist in localStorage. */
(function () {
  const root = document.documentElement, bar = document.querySelector('#qp-sidebar'), nav = document.querySelector('#world-nav');
  const toggle = bar.querySelector('.sb-toggle'), grip = bar.querySelector('.sb-resize');
  const KEY = 'queuepop-sidebar-v1';
  const s = { w: 248, collapsed: false };
  try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };
  function apply() {
    s.w = Math.min(400, Math.max(200, Number(s.w) || 248));
    root.style.setProperty('--sb-open-w', s.w + 'px');
    root.classList.toggle('sb-collapsed', !!s.collapsed);
    toggle.setAttribute('aria-expanded', String(!s.collapsed));
    toggle.setAttribute('aria-label', s.collapsed ? 'Expand sidebar' : 'Collapse sidebar');
    toggle.title = toggle.getAttribute('aria-label');
  }
  apply();
  toggle.addEventListener('click', () => { s.collapsed = !s.collapsed; apply(); save(); });
  grip.addEventListener('pointerdown', e => { grip.setPointerCapture(e.pointerId); root.classList.add('sb-dragging'); });
  grip.addEventListener('pointermove', e => { if (grip.hasPointerCapture(e.pointerId)) { s.w = e.clientX; apply(); } });
  grip.addEventListener('lostpointercapture', () => { root.classList.remove('sb-dragging'); save(); });

  // '#/', '#/deadlock/' and '' all normalise to their unslashed form; the longest matching link is the page.
  const norm = h => h.replace(/\/+$/, '') || '#';
  window.syncSidebar = function () {
    const hash = norm(location.hash), game = hash.replace(/^#\/?/, '').split(/[\/#]/)[0] || 'home';
    let best = null;
    for (const a of bar.querySelectorAll('.sb-pages a')) {
      const href = norm(a.getAttribute('href'));
      a.removeAttribute('aria-current');
      if ((hash === href || (href !== '#' && hash.startsWith(href + '/'))) && (!best || href.length > norm(best.getAttribute('href')).length)) best = a;
    }
    best?.setAttribute('aria-current', 'page');
    bar.querySelector('.sb-gear').toggleAttribute('aria-current', game === 'settings');
    for (const g of bar.querySelectorAll('[data-game]')) g.classList.toggle('open', g.dataset.game === game);
    // The world's page row repeats its sidebar pages, so a collapsed rail still reaches every page.
    // Deadlock draws its own row; home and companion leave it empty (just the drag strip).
    const pages = game !== 'deadlock' && bar.querySelector(`[data-game="${game}"] .sb-pages`);
    const row = game === 'settings' ? settingsView.row() : pages ? pages.innerHTML : '';
    // The Play control ([data-keep]: League's dock, TFT's button) stays first; only the page links are replaced.
    if (nav.dataset.row !== row) { nav.dataset.row = row; nav.querySelectorAll(':scope > :not([data-keep])').forEach(e => e.remove()); nav.insertAdjacentHTML('beforeend', row); }
    const tp = document.getElementById('tft-play'); if (tp) tp.hidden = game !== 'tft';
  };
  // Deadlock and the TFT frame move the address with pushState/replaceState, which fires no hashchange.
  addEventListener('popstate', window.syncSidebar);
  addEventListener('click', () => setTimeout(window.syncSidebar));
})();
