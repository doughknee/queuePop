'use strict';

// This standalone study never calls the game, the QueuePop bridge, or notification services.
const heroes = [
  { id: 'warden', name: 'Warden', role: 'Control / Durability', icon: '♜', intro: 'Hold your ground. Make them think twice.', story: 'A relentless enforcer with a knack for turning a dangerous street into a dead end.', strength: 'Make space for your team. Pick an isolated target and keep the pressure on.', caution: 'Don’t chase so far that your team cannot follow. Your presence is worth more than a risky finish.' },
  { id: 'infernus', name: 'Infernus', role: 'Pressure / Damage over time', icon: '♨', intro: 'Some problems need a little heat.', story: 'A smooth operator who leaves a lasting impression. Usually a burning one.', strength: 'Keep applying pressure over longer fights, then use your mobility to change the angle.', caution: 'Commit after your team is ready. A dramatic entrance is less useful without an exit.' },
  { id: 'ivy', name: 'Ivy', role: 'Support / Mobility', icon: '♧', intro: 'Nobody gets left behind.', story: 'An unlikely guardian with a soft spot for her friends and a very hard exterior.', strength: 'Stay connected to your teammates and turn a good engagement into a shared advantage.', caution: 'Keep checking where your allies are. Going alone gives up your greatest advantage.' },
  { id: 'seven', name: 'Seven', role: 'Area control / Spirit', icon: 'ϟ', intro: 'The forecast is deeply unpleasant.', story: 'A storm with a score to settle, finding opportunity wherever enemies gather.', strength: 'Look for space to influence several opponents at once, especially around objectives.', caution: 'Find cover and a safe angle before committing to a prolonged fight.' },
  { id: 'haze', name: 'Haze', role: 'Ambush / Weapon', icon: '◈', intro: 'By the time they notice, you’re gone.', story: 'An unseen threat in the city’s blind spots. Patience is part of the job.', strength: 'Use alternate routes to reach vulnerable targets while your team draws attention.', caution: 'Choose the moment carefully. Walking straight into a prepared group rarely ends well.' },
  { id: 'dynamo', name: 'Dynamo', role: 'Teamfight / Support', icon: '◎', intro: 'A small disturbance in the natural order.', story: 'A brilliant mind, an unusual predicament, and a talent for bringing people together.', strength: 'Coordinate with allies and turn a crowded fight into an opening for the whole team.', caution: 'Let your team know before engaging so they can make the most of the opportunity.' }
];
const storageKey = 'queuepop-deadlock-city-v1';
let saved = { balanced:false, survival:false, support:false, phone:true, discord:false };
let currentBuild = 'balanced';
let rememberedHero = 'warden';
try { const data = JSON.parse(localStorage.getItem(storageKey)); if(data && heroes.some(hero => hero.id === data.selectedHero)) rememberedHero = data.selectedHero; if(data && typeof data === 'object') for(const key of Object.keys(saved)) if(typeof data[key] === 'boolean') saved[key] = data[key]; } catch {}
let storageAvailable = true;
let activePanel = '', selectedHero = rememberedHero, recordFilter = 'All', queueState = 'idle', queueStarted = 0, toastTimer;
const sheet = document.querySelector('#sheet');
const body = document.querySelector('#sheet-body');
function persist() { try { localStorage.setItem(storageKey, JSON.stringify({...saved,selectedHero})); } catch { storageAvailable = false; } }
function toast(message) {
  const el = document.querySelector('#toast');
  clearTimeout(toastTimer);
  el.textContent = message; el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
function syncHero() {
  const hero = heroes.find(item => item.id === selectedHero);
  document.querySelector('.entry-portrait img').src = `assets/heroes/${hero.id}.webp`;
  document.querySelector('.dossier-entry strong').textContent = hero.id === 'warden' ? 'The Warden' : hero.name;
  document.querySelector('.dossier-entry small').textContent = 'Your person of interest';
  document.querySelector('.dossier-entry em').textContent = hero.role;
}
function header(kicker,title,intro) { return `<div class="sheet-kicker">${kicker}</div><h2 id="sheet-title">${title}</h2><p class="sheet-intro">${intro}</p>`; }
function renderRoster(query = '') {
  const filtered = heroes.filter(hero => `${hero.name} ${hero.role}`.toLowerCase().includes(query.toLowerCase()));
  document.querySelector('#roster').innerHTML = filtered.length ? filtered.map(hero => `<button class="hero-row" data-hero="${hero.id}" aria-pressed="${hero.id === inspectedHero}"><img src="assets/heroes/${hero.id}.webp" alt="" width="46" height="62"><span><strong>${hero.name}</strong><small>${hero.role.split(' / ')[0]}</small></span><span aria-hidden="true">↗</span></button>`).join('') : '<p class="no-results">No dossiers found. Try a hero name or support.</p>';
}
let inspectedHero = selectedHero;
function renderHeroes() {
  inspectedHero = selectedHero;
  body.innerHTML = `<div class="archive-intro"><div><div class="sheet-kicker">The personnel archive</div><h2 id="sheet-title">A face you can trust.</h2></div><span class="archive-count">6 dossiers<br><small>Curated for this study</small></span></div><div class="archive-layout"><aside class="directory"><label for="hero-search" class="sr-only">Search heroes or playstyles</label><input class="search" id="hero-search" type="search" placeholder="Find a hero…"><div class="roster" id="roster"></div></aside><section class="dossier" id="dossier" aria-label="Hero dossier" aria-live="polite"></section></div>`;
  renderRoster(); renderHero(inspectedHero); liftPageHeading();
}
function renderHero(id) {
  const hero = heroes.find(item => item.id === id); if(!hero) return;
  inspectedHero = id;
  document.querySelector('#dossier').innerHTML = `<div class="dossier-feature"><div class="portrait-plate"><span class="portrait-ring" aria-hidden="true"></span><img src="assets/heroes/${hero.id}.webp" alt="${hero.name}" width="280" height="380"><span class="portrait-caption">Personnel file / ${hero.id.toUpperCase()}</span></div><div class="dossier-lede"><div class="sheet-kicker">${hero.role}</div><h3 class="hero-name">${hero.name}</h3><p class="hero-intro">${hero.intro}</p><p>${hero.story}</p><button class="action choose-hero" data-select="${hero.id}" aria-pressed="${selectedHero === id}">${selectedHero === id ? `${hero.name} selected ✓` : `Choose ${hero.name}`}</button></div></div><div class="dossier-notes"><section><h4>Your opening</h4><p>${hero.strength}</p></section><section><h4>Keep in mind</h4><p>${hero.caution}</p></section></div><div class="dossier-foot"><span>Playstyle notes · Design study</span><button class="back-link" data-hero-build="${hero.id}">Explore the build ledger ↗</button></div>`;
  for(const button of document.querySelectorAll('[data-hero]')) button.setAttribute('aria-pressed',String(button.dataset.hero === id));
}
function renderGuides() { body.innerHTML = header('A newcomer’s field guide','Find your way through.','Three things to carry into your first night. Take your time; the city rewards a little curiosity.') + `<div class="guide"><details open><summary>Make your first souls count</summary><p>Focus on learning how to earn and secure souls in lane. A steady economy gives you more choices than an early, risky chase.</p></details><details><summary>Watch the streets, not just your lane</summary><p>Check the minimap between waves. Notice missing opponents, nearby allies, and which routes give you a safer way to reach a fight.</p></details><details><summary>Turn a good fight into an objective</summary><p>After winning a fight, regroup and look for something lasting. Pushing together often matters more than chasing one more elimination.</p></details></div><div class="action-row"><button class="action" data-open="heroes">Find your first hero</button></div><p>Introductory concept content, not a patch-specific strategy guide.</p>`; }
function elapsed() { const seconds = Math.max(0,Math.floor((Date.now() - queueStarted) / 1000)); return `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`; }
function syncQueue() { document.querySelector('#header-status').textContent = queueState === 'idle' ? 'Companion ready' : queueState === 'searching' ? 'Watching · Demo' : 'Queue popped · Demo'; document.querySelector('#queue-status').textContent = queueState === 'idle' ? 'Local demo · Ready when you are' : queueState === 'searching' ? 'Demo running · You can step away' : 'Your simulated queue is ready'; }
function renderCompanion() { body.innerHTML = header('QueuePop / Your companion','The city can wait.','Try the queue flow, then get back to real life. This demo does not connect to a game or send notifications.') + `<div class="queue-dial"><strong id="queue-clock">${queueState === 'idle' ? 'Ready' : queueState === 'searching' ? elapsed() : 'It’s time'}</strong><small>${queueState === 'idle' ? 'LOCAL DEMO' : queueState === 'searching' ? 'WATCHING · DEMO' : 'QUEUE POPPED'}</small></div><div class="action-row queue-controls">${queueState === 'idle' ? '<button class="action" data-queue="start">Start demo queue</button>' : queueState === 'searching' ? '<button class="action" data-queue="pop">Simulate queue pop</button><button class="action secondary" data-queue="reset">Cancel demo</button>' : '<button class="action" data-queue="reset">Back at my desk</button>'}</div><p class="demo-explanation">${queueState === 'searching' ? 'Stretch your legs. The timer keeps running if you close this panel. Use “Simulate queue pop” when you’re ready.' : queueState === 'ready' ? 'This is your simulated ready check. No game action has been taken.' : 'Start, step away, and try a ready check. You’re in control of the demo.'}</p><fieldset class="notification-options"><legend>Remembered preferences · Demo only</legend><label><input type="checkbox" data-pref="phone" ${saved.phone ? 'checked' : ''}>Phone alert</label><label><input type="checkbox" data-pref="discord" ${saved.discord ? 'checked' : ''}>Discord alert</label></fieldset>`; }
const pageNames = {heroes:'Hero dossiers',builds:'Build ledger',history:'Match history',guides:'Field guide',companion:'Your companion'};
function liftPageHeading() {
  const destination = document.querySelector('#page-title');
  const intro = body.querySelector('.archive-intro');
  destination.replaceChildren();
  if(intro) destination.append(intro);
  else {
    for(const element of body.querySelectorAll(':scope > .sheet-kicker, :scope > #sheet-title, :scope > .sheet-intro')) destination.append(element);
  }
  const oldHeading = destination.querySelector('#sheet-title');
  if(oldHeading) {
    const heading = document.createElement('h1');
    heading.id = 'sheet-title'; heading.tabIndex = -1; heading.textContent = oldHeading.textContent;
    oldHeading.replaceWith(heading);
  }
}
function renderPage(name, focus = true) {
  const renderers = {heroes:renderHeroes,builds:renderBuilds,history:renderHistory,guides:renderGuides,companion:renderCompanion};
  activePanel = renderers[name] ? name : '';
  sheet.hidden = !activePanel;
  document.querySelector('.world').hidden = !!activePanel;
  document.body.classList.toggle('in-archive',!!activePanel);
  sheet.dataset.panel = activePanel;
  document.querySelector('#toast').hidden = true;
  for(const link of document.querySelectorAll('.city-nav a')) {
    const current = (link.dataset.open || '') === activePanel;
    link.classList.toggle('nav-current',current);
    if(current) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current');
  }
  document.title = `${pageNames[activePanel] || 'The city'} · Deadlock · QueuePop`;
  if(activePanel) {
    document.querySelector('#page-location').textContent = pageNames[activePanel];
    renderers[activePanel]();
    if(activePanel === 'guides' || activePanel === 'companion') liftPageHeading();
  }
  document.querySelector('.skip').href = activePanel ? '#sheet-title' : '#city';
  window.scrollTo({top:0,behavior:'instant'});
  if(focus) {
    const target = document.querySelector(activePanel ? '#sheet-title' : '#arrival-title');
    target.tabIndex = -1; target.focus({preventScroll:true});
  }
}
function openPage(name) {
  const route = name && pageNames[name] ? name : '';
  const hash = '#/' + route;
  if(location.hash !== hash) history.pushState({},'',hash);
  renderPage(route);
}
function routeFromAddress(focus = true) {
  const route = location.hash.replace(/^#\/?/,'');
  if(route === 'city' || route === 'sheet-title') return;
  renderPage(pageNames[route] ? route : '',focus);
}
window.addEventListener('popstate',() => routeFromAddress());
window.addEventListener('hashchange',() => routeFromAddress());
document.addEventListener('click', event => {
  if(event.target.closest('.skip')) {
    event.preventDefault();
    const target = document.querySelector(activePanel ? '#sheet-title' : '#arrival-title');
    target.tabIndex = -1; target.focus({preventScroll:true}); target.scrollIntoView({block:'start'}); return;
  }
  const button = event.target.closest('button, a[data-open], a[data-home]'); if(!button) return;
  if(button.dataset.open) { event.preventDefault(); openPage(button.dataset.open); }

  if(button.hasAttribute('data-home')) { event.preventDefault(); openPage(''); }
  if(button.dataset.hero) renderHero(button.dataset.hero);
  if(button.dataset.select) {
    const hero = heroes.find(item => item.id === button.dataset.select);
    selectedHero = hero.id; persist(); syncHero();
    button.textContent = `${hero.name} selected ✓`; button.setAttribute('aria-pressed','true');
    toast(`${hero.name} selected${storageAvailable ? ' and remembered on this device' : ' for this visit'}.`);
  }
  if(button.hasAttribute('data-save-build')) { saved[currentBuild] = !saved[currentBuild]; persist(); syncBuildSaved(); button.textContent = saved[currentBuild] ? 'Saved to your ledger ✓' : 'Save this build'; button.setAttribute('aria-pressed',String(saved[currentBuild])); toast(saved[currentBuild] ? storageAvailable ? 'Saved on this device.' : 'Saved for this visit. Browser storage is unavailable.' : 'Removed from your saved ledger.'); }
  if(button.dataset.build) { currentBuild = button.dataset.build; buildStage = 0; selectedItem = ''; renderBuilds(); document.querySelector(`[data-build="${currentBuild}"]`).focus({preventScroll:true}); }
  if(button.dataset.stage) { buildStage = Number(button.dataset.stage); selectedItem = ''; renderBuildStage(); }
  if(button.dataset.item) { selectedItem = button.dataset.item; renderItemNote(); }
  if(button.dataset.report) { currentMatch = button.dataset.report; renderMatchReport(); }
  if(button.hasAttribute('data-clear-records')) { recordFilter = 'All'; recordHero = 'All'; renderHistory(); document.querySelector('[data-filter="All"]').focus({preventScroll:true}); }
  if(button.dataset.matchBuild) { currentBuild = button.dataset.matchBuild; buildStage = 2; selectedItem = ''; openPage('builds'); }
  if(button.dataset.heroBuild) { const matching = Object.keys(buildPlans).find(key => buildPlans[key].hero === button.dataset.heroBuild); currentBuild = matching || 'balanced'; buildStage = 0; selectedItem = ''; openPage('builds'); if(!matching) toast('This study includes Warden and Ivy builds. Showing the Warden sample.'); }
  if(button.dataset.filter) { recordFilter = button.dataset.filter; renderHistory(); document.querySelector(`[data-filter="${recordFilter}"]`).focus({preventScroll:true}); }
  if(button.dataset.queue) { if(button.dataset.queue === 'start') { queueState = 'searching'; queueStarted = Date.now(); } else if(button.dataset.queue === 'pop') { queueState = 'ready'; toast('Your queue popped — simulated alert.'); } else queueState = 'idle'; syncQueue(); renderCompanion(); document.querySelector('.queue-controls button').focus({preventScroll:true}); }
});
document.addEventListener('input', event => { if(event.target.id === 'hero-search') renderRoster(event.target.value); });
document.addEventListener('change', event => {
  if(event.target.id === 'record-hero') { recordHero = event.target.value; renderHistory(); document.querySelector('#record-hero').focus({preventScroll:true}); }
  if(event.target.dataset.pref) { saved[event.target.dataset.pref] = event.target.checked; persist(); }
});
setInterval(() => { const clock = document.querySelector('#queue-clock'); if(!sheet.hidden && activePanel === 'companion' && queueState === 'searching' && clock) clock.textContent = elapsed(); },1000);

syncHero();

// Shared line symbols keep navigation independent of platform emoji rendering.
const navPaths = [
  '<path d="M3 12l9-8 9 8-9 8zM8 12l4-4 4 4-4 4z"/>',
  '<path d="M4 21V9a8 8 0 0 1 16 0v12M8 21v-4a4 4 0 0 1 8 0v4"/><circle cx="12" cy="9" r="3"/>',
  '<path d="M4 3h14v17H4zM7 6h8M7 10h8M7 14h6M18 6h3v17H7v-3"/>',
  '<circle cx="12" cy="12" r="8"/><path d="M12 6v6l4 3M12 1v3M12 20v3"/>',
  '<path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM12 7v10M7 12h10"/>'
];
document.querySelectorAll('.city-nav a span').forEach((el,i) => {el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${navPaths[i]}</svg>`;});

routeFromAddress(false);
