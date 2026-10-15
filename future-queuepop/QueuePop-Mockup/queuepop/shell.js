/* Shared conceptual chrome. No production APIs or client connection. */
window.renderQueuePopHeader = function (game = 'home') {
  const root = '';
  const header = document.querySelector('#qp-header');
  if (header.childElementCount) {
    for (const link of header.querySelectorAll('.qp-games a')) {
      if (link.dataset.game === game) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    header.querySelector('#header-status').textContent = 'Companion';
    return;
  }
  document.querySelector('#qp-header').innerHTML = `
    <a class="qp-brand" href="${root}#/" aria-label="QueuePop home"><img src="assets/queuepop.svg" alt="" width="25" height="25">QueuePop<span>✦</span></a>
    <nav class="qp-games" aria-label="Your games">
      <a data-game="home" href="${root}#/" ${game === 'home' ? 'aria-current="page"' : ''}>Home</a>
      <a data-game="league" href="${root}#/league" ${game === 'league' ? 'aria-current="page"' : ''}><span class="game-symbol">L</span><span>League<span class="long-name"> of Legends</span></span></a>
      <a data-game="tft" href="${root}#/tft" ${game === 'tft' ? 'aria-current="page"' : ''}><span class="game-symbol">⬡</span>TFT</a>
      <a data-game="deadlock" href="#/deadlock" ${game === 'deadlock' ? 'aria-current="page"' : ''}><span class="game-symbol">◉</span>Deadlock</a>
    </nav>
    <a class="qp-companion" aria-label="Open QueuePop companion" href="${root}#/companion"><span class="qp-dot"></span><span id="header-status">Companion</span><b>Q</b></a>`;
};
