// Keep the supplied Field Guide's styles, modules and saved-board behavior isolated.
window.createTftView = function (host) {
  const source = new URL('tft-field-guide/index.html', location.href).href;
  let frame;
  function route() {
    const page = location.hash.replace(/^#\/tft\/?/, '');
    return page === 'planner' ? 'playground' : page === 'history' ? 'home' : page || 'home';
  }
  return {
    show(focus = true) {
      document.title = 'TFT Field Guide · QueuePop';
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
