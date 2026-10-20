/* DONI-533: image fallbacks without inline handlers, so the page can run under a CSP with script-src 'self'.
   One capture-phase listener reads the failed <img>'s data attributes:
     data-fb-src="url"   try this URL once, then fall through to the rest
     data-fb="none"      display:none (default: visibility:hidden, the old onerror's most common choice)
     data-fb-text="x"    replace the image with <span class="{data-fb-class}">x</span>; data-fb-text="@title" uses its title */
window.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const d = img.dataset;
  if (d.fbSrc) { const next = d.fbSrc; delete d.fbSrc; img.src = next; return; }
  if (d.fbText != null) {
    img.replaceWith(Object.assign(document.createElement('span'), { className: d.fbClass || '', textContent: d.fbText === '@title' ? img.title : d.fbText }));
    return;
  }
  if (d.fb === 'none') img.style.display = 'none'; else img.style.visibility = 'hidden';
}, true);
