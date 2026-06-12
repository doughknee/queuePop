/* Route nav (icon tabs + the routeless live/account routes).
   "live" has no nav icon — it's reached via the PLAY→LIVE button, which glows
   while it's the active view (.play-btn.live-active). "account" is reached via
   the summoner badge. Emits a "route" bus event on every change. */

let activeTab = "dashboard";
const NAV_TABS = ["live", "dashboard", "champ", "alerts", "about", "account"];
function activateTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-route").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  for (const t of NAV_TABS) $(`tab-${t}`).classList.toggle("hidden", t !== tab);
  replay($(`tab-${tab}`), "fade-up");
  // The PLAY button doubles as the live-route indicator; the summoner badge
  // doubles as the account-route indicator.
  $("play-btn").classList.toggle("live-active", tab === "live");
  $("summoner-btn").classList.toggle("route-active", tab === "account");
  QP.bus.emit("route", { tab });
}
document.querySelectorAll(".nav-route").forEach((btn) => {
  btn.addEventListener("click", () => activateTab(btn.dataset.tab));
});

QP._loaded.push("features/nav");
