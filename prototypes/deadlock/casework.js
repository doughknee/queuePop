let buildStage = 0;
let selectedItem = '';
let currentMatch = '028';
let recordHero = 'All';

function renderBuilds() {
  const plan = buildPlans[currentBuild];
  body.innerHTML = `<div class="archive-intro"><div><div class="sheet-kicker">The build ledger</div><h2 id="sheet-title">Go in with a plan.</h2></div><span class="archive-count">3 loadouts<br><small>Illustrative, not live recommendations</small></span></div>
    <div class="casework-layout"><aside class="loadout-directory" aria-label="Choose a build">
      <div class="loadout-portrait"><img src="assets/heroes/${plan.hero}.webp" alt="" width="180" height="244"><span>${heroes.find(hero => hero.id === plan.hero).name}<small>Your loadout subject</small></span></div>
      <div class="loadout-options">${Object.entries(buildPlans).map(([key,item]) => `<button data-build="${key}" aria-pressed="${key === currentBuild}"><span class="file-notch" aria-hidden="true">${key === currentBuild ? '◆' : '◇'}</span><span><strong>${item.name}</strong><small>${heroes.find(hero => hero.id === item.hero).name} / ${item.style}</small></span><span class="saved-mark" aria-label="${saved[key] ? 'Saved' : 'Not saved'}">${saved[key] ? '✓' : ''}</span></button>`).join('')}</div>
      <p class="directory-footnote">A good build tells you why.<br>Not just what.</p></aside>
    <section class="loadout-workbench" aria-label="Selected build">
      <div class="loadout-heading"><div><div class="sheet-kicker">${plan.style}</div><h3>${plan.name}</h3><p class="case-line">${plan.line}</p></div><span class="loadout-stamp" aria-hidden="true">FIELD<br>TEST NOTES</span></div>
      <p class="loadout-intro">${plan.intro}</p>
      <nav class="purchase-stages" aria-label="Purchase stage">${plan.stages.map((stage,index) => `<button data-stage="${index}" aria-pressed="${index === buildStage}"><span class="stage-number"><span>0${index+1}</span></span><span>${stage.name}</span></button>`).join('')}</nav>
      <div id="stage-content"></div>
      <div class="casework-footer"><span>Sample loadout · Check current in-game items</span><button class="action" data-save-build aria-pressed="${saved[currentBuild]}">${saved[currentBuild] ? 'Saved to your ledger ✓' : 'Save this build'}</button></div>
    </section></div>`;
  renderBuildStage();
  liftPageHeading();
}

function renderBuildStage() {
  const stage = buildPlans[currentBuild].stages[buildStage];
  if(!stage.items.includes(selectedItem)) selectedItem = stage.items[0];
  document.querySelector('#stage-content').innerHTML = `<div class="stage-caption"><h4>${stage.cue}</h4><p>${stage.note}</p></div>
    <div class="purchase-tray" aria-label="Inspect a sample item">${stage.items.map(id => {const item = ledgerItems[id];return `<button class="item-choice ${item.type}" data-item="${id}" aria-pressed="${id === selectedItem}"><span class="item-medallion"><img src="assets/items/${id}.webp" alt="" width="52" height="52"></span><strong>${item.name}</strong><small>${item.type}</small></button>`;}).join('')}</div>
    <section class="item-explanation" id="item-explanation" aria-label="Item purpose" aria-live="polite"></section>`;
  for(const button of document.querySelectorAll('[data-stage]')) button.setAttribute('aria-pressed',String(Number(button.dataset.stage) === buildStage));
  renderItemNote();
}

function renderItemNote() {
  const item = ledgerItems[selectedItem];
  document.querySelector('#item-explanation').innerHTML = `<span class="note-rule" aria-hidden="true">✦</span><div><span class="sheet-kicker">Why ${item.name}?</span><h4>${item.purpose}</h4><p>${item.why}</p></div>`;
  for(const button of document.querySelectorAll('[data-item]')) button.setAttribute('aria-pressed',String(button.dataset.item === selectedItem));
}

function syncBuildSaved() {
  const button = document.querySelector(`[data-build="${currentBuild}"] .saved-mark`);
  if(button) {button.textContent = saved[currentBuild] ? '✓' : '';button.setAttribute('aria-label',saved[currentBuild] ? 'Saved' : 'Not saved');}
}

function renderHistory() {
  const visible = records.filter(record => (recordFilter === 'All' || record.result === recordFilter) && (recordHero === 'All' || record.hero === recordHero));
  if(!visible.some(record => record.id === currentMatch)) currentMatch = visible[0]?.id || '';
  body.innerHTML = `<div class="archive-intro"><div><div class="sheet-kicker">After-action reports</div><h2 id="sheet-title">The night, on record.</h2></div><span class="archive-count">2 wins / 1 loss<br><small>Three fictional encounters</small></span></div>
    <div class="record-toolbar"><div class="record-tabs" aria-label="Filter match results">${['All','Victory','Defeat'].map(filter => `<button data-filter="${filter}" aria-pressed="${recordFilter === filter}">${filter === 'All' ? 'All matches' : filter === 'Victory' ? 'Victories' : 'Defeats'}</button>`).join('')}</div><label class="record-hero-filter">Hero<select id="record-hero"><option>All</option><option>Warden</option><option>Ivy</option></select></label></div>
    ${visible.length ? `<div class="casework-layout match-layout"><aside class="encounter-directory" aria-label="Choose a match">${visible.map(record => `<button class="encounter ${record.result === 'Defeat' ? 'is-defeat' : ''}" data-report="${record.id}" aria-pressed="${record.id === currentMatch}" aria-label="Report ${record.id}: ${record.result}, ${record.hero}"><span class="encounter-top"><span>${record.result}</span><small>No. ${record.id}</small></span><span class="encounter-person"><img src="assets/heroes/${record.heroId}.webp" alt="" width="54" height="73"><span><strong>${record.hero}</strong><small>${record.score}</small></span></span><span class="encounter-meta">${record.when}<span>${record.time}</span></span></button>`).join('')}<p class="directory-footnote">Every encounter leaves<br>something worth learning.</p></aside><article class="match-report" id="match-report" aria-label="Selected match report" aria-live="polite"></article></div>` : '<section class="empty-reports"><span aria-hidden="true">◇</span><h3>No reports in this drawer.</h3><p>Try another hero or show all three sample encounters.</p><button class="action" data-clear-records>Show all matches</button></section>'}`;
  document.querySelector('#record-hero').value = recordHero;
  if(currentMatch) renderMatchReport();
  liftPageHeading();
}

function renderMatchReport() {
  const record = records.find(item => item.id === currentMatch);
  const points = record.lead.map((value,index) => `${20+index*80},${65-value*2.5}`).join(' ');
  document.querySelector('#match-report').innerHTML = `<header class="report-heading"><div><div class="sheet-kicker">Case ${record.id} / ${record.hero} / Sample report</div><h3>${record.title}</h3><p class="case-line">${record.line}</p></div><div class="outcome-stamp ${record.result === 'Defeat' ? 'is-defeat' : ''}"><span>${record.result === 'Victory' ? 'V' : 'D'}</span><small>${record.result}</small></div></header>
    <dl class="report-facts"><div><dt>Kills / Deaths / Assists</dt><dd>${record.score}</dd></div><div><dt>Souls collected</dt><dd>${record.souls}</dd></div><div><dt>Match duration</dt><dd>${record.time}</dd></div></dl>
    <section class="lead-chart"><div class="chart-label"><h4>How the night turned</h4><span>Team soul lead · Illustrative · ${record.lead[6] > 0 ? '+' : ''}${record.lead[6]}k final</span></div><div class="chart-plot"><svg preserveAspectRatio="none" viewBox="0 0 520 120" role="img" aria-label="Illustrative team soul lead in thousands at seven evenly spaced points: ${record.lead.join(', ')}"><path d="M20 20H500M20 65H500M20 108H500" stroke="currentColor" opacity=".12"/><path d="M20 65H500" stroke="currentColor" opacity=".4" stroke-dasharray="3 5"/><polyline points="${points}" fill="none" stroke="${record.result === 'Victory' ? '#456449' : '#976349'}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="500" cy="${65-record.lead[6]*2.5}" r="4" fill="${record.result === 'Victory' ? '#456449' : '#976349'}"/></svg><span class="chart-zero">Even</span></div><div class="chart-axis"><span>First wave</span><span>Mid-match</span><span>${record.time} / Final</span></div></section>
    <ol class="encounter-timeline">${record.timeline.map(([time,title,copy]) => `<li><time>${time}</time><div><h4>${title}</h4><p>${copy}</p></div></li>`).join('')}</ol>
    <section class="report-takeaway"><div><span class="sheet-kicker">The thing to remember</span><p>${record.takeaway}</p></div><details><summary>For the next match</summary><p>${record.next}</p></details></section>
    <div class="casework-footer"><span>Fictional match, stats & analysis</span><button class="back-link" data-match-build="${record.build}">Review ${buildPlans[record.build].name} ↗</button></div>`;
  for(const button of document.querySelectorAll('[data-report]')) button.setAttribute('aria-pressed',String(button.dataset.report === currentMatch));
}
