/* Route nav (icon tabs + the routeless live/account routes).
   "live" has no nav icon — it's reached via the PLAY→LIVE button, which glows
   while it's the active view (.play-btn.live-active). "account" is reached via
   the summoner badge. Emits a "route" bus event on every change. */

let activeTab = "dashboard";
function activateTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".nav-route").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("tab-live").classList.toggle("hidden", tab !== "live");
  $("tab-dashboard").classList.toggle("hidden", tab !== "dashboard");
  $("tab-champ").classList.toggle("hidden", tab !== "champ");
  $("tab-settings").classList.toggle("hidden", tab !== "settings");
  $("tab-account").classList.toggle("hidden", tab !== "account");
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
