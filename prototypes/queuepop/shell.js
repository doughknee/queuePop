/* Shared conceptual chrome. No production APIs or client connection. */
window.renderQueuePopHeader = function (game = 'home', bridge = false) {
  const root = bridge ? '../queuepop/index.html' : '';
  document.querySelector('#qp-header').innerHTML = `
    <a class="qp-brand" href="${root}#/" aria-label="QueuePop home"><img src="${bridge ? '../queuepop/' : ''}assets/queuepop.svg" alt="" width="25" height="25">QueuePop<span>✦</span></a>
    <nav class="qp-games" aria-label="Your games">
      <a href="${root}#/" ${game === 'home' ? 'aria-current="page"' : ''}>Home</a>
      <a href="${root}#/league" ${game === 'league' ? 'aria-current="page"' : ''}><span class="game-symbol">L</span><span>League<span class="long-name"> of Legends</span></span></a>
      <a href="${root}#/tft" ${game === 'tft' ? 'aria-current="page"' : ''}><span class="game-symbol">⬡</span>TFT</a>
      <a href="${bridge ? '../queuepop/' : ''}deadlock.html#/" ${game === 'deadlock' ? 'aria-current="page"' : ''}><span class="game-symbol">◉</span>Deadlock</a>
    </nav>
    <a class="qp-companion" aria-label="Open QueuePop companion" href="${root}#/companion"><span class="qp-dot"></span><span id="header-status">Companion</span><b>Q</b></a>`;
};
if (document.body.dataset.bridge) renderQueuePopHeader('deadlock', true);
