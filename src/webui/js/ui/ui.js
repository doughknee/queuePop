/* Shared UI services: the auto-save toast and the floating tooltip engine. */

let toastTimer = null;

function showToast(msg, ok = true) {
  const t = $("toast");
  if (!t) return;
  $("toast-msg").textContent = msg;
  t.classList.toggle("err", !ok);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

// Tooltips: any [data-tip] element shows a floating panel on hover. Document-
// level delegation, so dynamically rendered rows need no re-init.
(function initTooltips() {
  const tip = document.createElement("div");
  tip.className = "tip";
  document.body.appendChild(tip);
  let cur = null;
  function position(el) {
    const r = el.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    let left = r.left + r.width / 2 - tr.width / 2;
    let top = r.bottom + 8;
    if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 8; // flip up
    left = Math.max(8, Math.min(left, window.innerWidth - tr.width - 8));
    tip.style.left = Math.round(left) + "px";
    tip.style.top = Math.round(top) + "px";
  }
  function show(el) {
    cur = el;
    tip.textContent = el.getAttribute("data-tip") || "";
    position(el); // measure with text in place
    tip.classList.add("show");
  }
  function hide() { cur = null; tip.classList.remove("show"); }
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el !== cur) show(el);
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-tip]");
    if (el && el === cur && !el.contains(e.relatedTarget)) hide();
  });
})();

QP._loaded.push("ui/ui");
