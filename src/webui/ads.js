/* The one Overwolf ad (docs/ads.md): a 300×250 box at the bottom of the sidebar. While it shows, the sidebar is fixed at
   316 px and can't collapse or be dragged (shell.js reads html.ads-on); supporters (config.ads.premium) get no ad and keep
   both. Serves only on ow-electron (get_status().overwolf); localStorage 'queuepop-ads-preview' = '1' shows a placeholder
   box in plain Electron for layout work. Loaded by shell.js. */
(function () {
  // ow-electron host? supporter? preview flag? ads live? -> 'ad' | 'preview' | 'off'. Pure; app/test-ads.js checks it.
  // Until the release gate (docs/ads.md) real ads serve only when asked for (--test-ad or config ads.live); before that an
  // ow-electron build shows the placeholder box, so you never see or click your own live ads.
  window.qpAdMode = (overwolf, premium, preview, live) => (premium ? 'off' : overwolf && live ? 'ad' : overwolf || preview ? 'preview' : 'off');
  const bar = typeof document !== 'undefined' && document.getElementById('qp-sidebar');
  if (!bar) return;
  const root = document.documentElement;
  let overwolf = false, live = false;
  const preview = () => { try { return localStorage.getItem('queuepop-ads-preview') === '1'; } catch { return false; } };
  // The container holds nothing but Overwolf's tag; the placeholder behind it is its own background (Overwolf's rule).
  function slot(mode) {
    let box = document.getElementById('qp-ad');
    if (box && box.dataset.mode === mode) return;
    if (box) box.remove(); // moving or stopping an ad = shut the container down and open a new one
    if (mode === 'off') return;
    box = document.createElement('div');
    box.id = 'qp-ad'; box.className = 'sb-ad'; box.dataset.mode = mode;
    box.innerHTML = `<div class="sb-ad-label"><span>Ad</span><span>Supports queuePop</span></div><div class="sb-ad-box">${mode === 'ad' ? '<owadview cid="queuepop_300x250_sb"></owadview>' : ''}</div>`;
    bar.querySelector('.sb-user').before(box);
  }
  function apply() {
    const premium = !!(window.QP && QP.store.config && (QP.store.config.ads || {}).premium);
    const mode = qpAdMode(overwolf, premium, preview(), live);
    root.classList.toggle('ads-on', mode !== 'off');
    slot(mode);
    if (window.qpSidebarApply) qpSidebarApply();
  }
  if (window.QP && QP.bus) {
    QP.bus.on('status', s => { const ow = !!(s && s.overwolf), lv = !!(s && s.ads_live); if (ow !== overwolf || lv !== live) { overwolf = ow; live = lv; apply(); } });
    QP.bus.on('config:loaded', apply);
    QP.bus.on('config:changed', ({ path }) => { if (String(path).startsWith('ads')) apply(); });
  }
  window.qpAdsApply = apply;
  apply();
})();
