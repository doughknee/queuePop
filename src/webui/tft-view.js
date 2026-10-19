// Keep the supplied Field Guide's styles, modules and saved-board behavior isolated.
window.createTftView = function (host) {
  const source = new URL('tft-field-guide/index.html', location.href).href;
  let frame;
  const bar = document.createElement('div');
  bar.className = 'tft-live';
  bar.innerHTML = '<span class="tft-live-rank" role="status">TFT rank: client not connected</span><span class="tft-live-msg" role="status"></span>';
  host.append(bar);
  const rankEl = bar.querySelector('.tft-live-rank'), msgEl = bar.querySelector('.tft-live-msg');
  const api = () => window.pywebview && window.pywebview.api;
  async function refreshRank() {
    try {
      const info = (await api().get_summoner()) || {};
      const r = info.connected && info.ranked && info.ranked.tft;
      rankEl.textContent = !info.connected ? 'TFT rank: client not connected'
        : r ? `TFT rank: ${r.tier[0] + r.tier.slice(1).toLowerCase()}${r.division && r.division !== 'NA' ? ' ' + r.division : ''} · ${r.lp} LP · ${r.wins}W ${r.losses}L` : 'TFT rank: unranked';
    } catch (_) { rankEl.textContent = 'TFT rank: unavailable'; }
  }
  // Play lives in the page row (#tft-play, index.html): start the ranked TFT queue (1100), click again to cancel.
  const play = document.getElementById('tft-play'), playLabel = play.querySelector('.tp-label');
  let queued = false;
  play.addEventListener('click', async () => {
    msgEl.textContent = '';
    try {
      const r = queued ? await api().cancel_queue() : await api().start_queue(1100);
      if (!r.ok) msgEl.textContent = r.error || 'Queue unavailable.';
      else queued = !queued;
    } catch (_) { msgEl.textContent = 'Queue unavailable.'; }
    play.classList.toggle('queued', queued);
    playLabel.textContent = queued ? 'In queue · Cancel' : 'Play';
  });
  function route() {
    const page = location.hash.replace(/^#\/tft\/?/, '');
    return page === 'planner' ? 'playground' : ['history', 'champions', 'items'].includes(page) ? 'home' : page || 'home';
  }
  // The sidebar's Champions / Items open the guide's own library dialog.
  function openLibrary() {
    const page = location.hash.replace(/^#\/tft\/?/, '');
    if (page === 'champions' || page === 'items') frame.contentDocument?.querySelector(`[data-library="${page}"]`)?.click();
  }
  return {
    show(focus = true) {
      document.title = 'TFT Field Guide · QueuePop';
      refreshRank();
      if (!frame) {
        frame = document.createElement('iframe');
        frame.title = 'TFT Field Guide — guides and interactive playground';
        frame.src = source + '#' + route();
        frame.addEventListener('load', () => {
          // The sidebar is the navigation: hide the guide's own nav row.
          frame.contentDocument.head.append(Object.assign(frame.contentDocument.createElement('style'), { textContent: '.main-header.field-nav{display:none}' }));
          openLibrary();
          frame.contentWindow.addEventListener('hashchange', () => {
            if (host.hidden) return;
            const hash = frame.contentWindow.location.hash.slice(1);
            history.replaceState(null, '', '#/tft' + (hash === 'home' ? '' : '/' + hash));
            window.syncSidebar?.();
          });
        });
        host.append(frame);
      } else if (frame.contentWindow.location.hash !== '#' + route()) {
        frame.contentWindow.location.replace(source + '#' + route());
      }
      if (frame.contentDocument?.readyState === 'complete') openLibrary();
      if (focus) frame.focus();
    },
    focus() { frame?.focus(); }
  };
};
