// Keep the supplied Field Guide's styles, modules and saved-board behavior isolated.
window.createTftView = function (host) {
  const source = new URL('tft-field-guide/index.html', location.href).href;
  let frame;
  const bar = document.createElement('div');
  bar.className = 'tft-live';
  bar.innerHTML = '<span class="tft-live-rank" role="status">TFT rank: client not connected</span><span class="tft-live-msg" role="status"></span><button type="button" class="tft-live-queue">TFT queue</button>';
  host.append(bar);
  const rankEl = bar.querySelector('.tft-live-rank'), msgEl = bar.querySelector('.tft-live-msg');
  const api = () => window.pywebview && window.pywebview.api;
  async function refreshRank() {
    try {
      const info = (await api().get_summoner()) || {};
      const r = info.connected && info.ranked && info.ranked.tft;
      rankEl.textContent = !info.connected ? 'TFT rank: client not connected'
        : r ? `TFT rank: ${r.tier[0] + r.tier.slice(1).toLowerCase()} ${r.division} · ${r.lp} LP · ${r.wins}W ${r.losses}L` : 'TFT rank: unranked';
    } catch (_) { rankEl.textContent = 'TFT rank: unavailable'; }
  }
  bar.querySelector('button').addEventListener('click', async () => {
    msgEl.textContent = 'Starting…';
    try { const r = await api().start_queue(1090); msgEl.textContent = r.ok ? 'Queue started.' : r.error; }
    catch (_) { msgEl.textContent = 'Queue unavailable.'; }
  });
  function route() {
    const page = location.hash.replace(/^#\/tft\/?/, '');
    return page === 'planner' ? 'playground' : page === 'history' ? 'home' : page || 'home';
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
          frame.contentWindow.addEventListener('hashchange', () => {
            if (host.hidden) return;
            const hash = frame.contentWindow.location.hash.slice(1);
            history.replaceState(null, '', '#/tft' + (hash === 'home' ? '' : '/' + hash));
          });
        });
        host.append(frame);
      } else if (frame.contentWindow.location.hash !== '#' + route()) {
        frame.contentWindow.location.replace(source + '#' + route());
      }
      if (focus) frame.focus();
    },
    focus() { frame?.focus(); }
  };
};
