// Authored design fixtures, not live match telemetry or current-patch recommendations.
const leaguePlans = {
  ahri: {name:'The second opening', descriptor:'An elusive mage’s field notes', stages:[
    ['Keep the lane yours.', 'Collect the wave. Keep enough space to turn an awkward trade into a clean reset.', 'Q', 'Let the orb do the reaching.'],
    ['Find a different angle.', 'Prepare to move with the fight. Your next purchase should support a clear approach and a way back.', 'E', 'A patient Charm gives the plan a target.'],
    ['Leave with the advantage.', 'Choose damage, protection, or an answer to resistance according to what is stopping your next play.', 'R', 'Save a dash for the way out.']
  ]},
  lux: {name:'A line of light', descriptor:'A long-range mage’s field notes', stages:[
    ['Make space before damage.', 'Build a steady lane around safe pressure. Keep the path behind you as clear as the one ahead.', 'E', 'Use the field to shape their approach.'],
    ['Make your reach matter.', 'Arrive with your team and hold a clear casting angle. A purchase is useful when it lets you contribute safely.', 'Q', 'Find the binding before the follow-up.'],
    ['Stay in the fight.', 'Consider which threat cuts your contribution short. More damage is one answer; staying alive is another.', 'W', 'Keep your allies in the shield’s path.']
  ]},
  yasuo: {name:'A measured storm', descriptor:'A swordsman’s field notes', stages:[
    ['Read the wave.', 'Choose short exchanges with a return path. The first few purchases should support a rhythm you can sustain.', 'Q', 'Build toward a deliberate opening.'],
    ['Follow the opening.', 'Prepare for the fight your team can join. Movement creates opportunities only if you can use the next position.', 'E', 'Picture where the next dash leaves you.'],
    ['Commit with a reason.', 'Weigh damage against staying power. A second chance is most useful with someone nearby to follow it.', 'R', 'Wait for a moment your team can share.']
  ]}
};

function buildChampionLinks(id) {
  return `<nav class="armory-champions" aria-label="Choose a build champion">${Object.entries(champions).map(([key,c])=>`<a href="#/league/builds/${key}" ${key===id?'aria-current="page"':''}>${icon(key)}<span>${c.name}</span><i aria-hidden="true">${key===id?'◆':'◇'}</i></a>`).join('')}</nav>`;
}

function leagueArmory() {
  const id=state.champion,c=champions[id],w=championWorlds[id],plan=leaguePlans[id];
  const items=(id==='yasuo'?swordSets:itemSets)[buildStage], chosen=items[selectedItem]||items[0], reasoning=itemReasoning[chosen[0]], stage=plan.stages[buildStage];
  const match=leagueMatches.find(m=>m.hero===id);
  return `${leagueNavigation('builds')}<div class="league-armory" style="--champ-art:url('assets/${id}.webp');--portrait-position:${id==='yasuo'?'90%':'66%'} center;--champ-glow:${w.hue}">
    <header class="armory-heading"><div><span class="interior-kicker">The champion armory</span><h1>Every choice has a purpose.</h1></div><p>Build for the fight you want to play.</p></header>
    <div class="armory-layout"><aside class="armory-identity"><div class="armory-portrait"><span class="armory-region">${w.region}</span><div class="armory-signature"><small>${c.title}</small><h2>${c.name}</h2><span>${c.style}</span></div></div>${buildChampionLinks(id)}<a class="armory-memory" href="#/league/history/${match.id}"><span>From ${c.name}’s last match</span><strong>${matchChapters[match.id][1][2]}</strong><p>${match.note}</p><b>Revisit the turning point <i>↗</i></b></a></aside>
    <section class="armory-workbench" aria-label="${c.name} build playbook"><header class="armory-plan"><div><span class="interior-kicker">${plan.descriptor}</span><h2>${plan.name}</h2></div>${saveButton(state.savedLeague,'save-league','Save plan')}</header>
      <div class="armory-stages" aria-label="Purchase stage">${['Opening','Core direction','Adapt & finish'].map((name,i)=>`<button data-stage="${i}" aria-pressed="${buildStage===i}" aria-controls="armory-stage"><span>${['I','II','III'][i]}</span><b>${name}</b><small>${['Establish','Develop','Respond'][i]}</small></button>`).join('')}</div>
      <div id="armory-stage"><div class="stage-intention"><span aria-hidden="true">${['I','II','III'][buildStage]}</span><div><h3>${stage[0]}</h3><p>${stage[1]}</p></div></div>
      <div class="armory-relics" aria-label="Inspect a purchase">${items.map(([item,name],i)=>`<button data-item="${i}" class="armory-relic" aria-pressed="${selectedItem===i}" aria-controls="item-insight"><span class="relic-crown" aria-hidden="true">◆</span><span class="armory-socket"><img src="assets/item-${item}.png" alt=""></span><strong>${name}</strong><small>${buildStage===2?(id==='yasuo'?['Damage','Sustain','Second chance']:['Damage','Protection','Adaptation'])[i]:buildStage===1?['Movement','Component','Investment'][i]:['Lane start','Recovery','Vision'][i]}</small><span class="relic-selection">${selectedItem===i?'Inspecting':'Inspect item'} <i aria-hidden="true">↗</i></span></button>`).join('')}</div>
      <article class="armory-insight" id="item-insight" aria-live="polite"><div class="insight-art" aria-hidden="true"><img src="assets/item-${chosen[0]}.png" alt=""></div><div><span class="interior-kicker">${chosen[1]}</span><h3>${reasoning[0]}</h3><p>${reasoning[1]}</p><div class="armory-cue"><span>Consider it</span><b>${reasoning[2]}</b></div></div></article>
      <a class="ability-thread" href="#/league/champions/${id}" data-open-spell="${stage[2]}"><img src="assets/${id}-${stage[2].toLowerCase()}.png" alt=""><div><span>The kit behind the choice</span><p>${stage[3]}</p></div><b>${stage[2]} <i>↗</i></b></a></div>
      <p class="sample-note">Illustrative build study. Explore the decisions; these are not current-patch recommendations.</p>
    </section></div></div>${focusChoices(id)}`;
}

function chronicleSeal(result) {return `<span class="chronicle-seal ${result==='Defeat'?'fallen':''}" aria-hidden="true">${riftCrest()}</span>`;}

function leagueChronicle(id) {
  const r=leagueMatches.find(m=>m.id===id);
  if(r)return leagueBattleReport(r);
  const matches=leagueMatches.filter(m=>historyFilter==='All'||m.result===historyFilter);
  return `${leagueNavigation('history')}<section class="league-chronicle"><header class="chronicle-heading"><div><span class="interior-kicker">The match chronicle</span><h1>Leave a mark.<br>Bring back a lesson.</h1><p>A good game is worth remembering.<br>A difficult one is worth understanding.</p></div><div class="chronicle-summary">${chronicleSeal('Victory')}<span>Your recent chapter</span><strong>2 wins <i>/</i> 1 loss</strong><small>Three illustrative matches</small></div></header>
    <div class="chronicle-toolbar"><div class="filter-row" aria-label="Match result">${['All','Victory','Defeat'].map(f=>`<button data-filter="${f}" aria-pressed="${historyFilter===f}">${f==='All'?'All matches':f}</button>`).join('')}</div><span>${matches.length} ${matches.length===1?'memory':'memories'} of the Rift</span></div>
    <div class="chronicle-covers ${matches.length===1?'single-cover':matches.length===2?'twin-covers':''}">${matches.map((r,i)=>`<a class="chronicle-cover ${r.result==='Defeat'?'fallen':''} ${i===0?'featured-cover':''}" href="#/league/history/${r.id}" style="--champ-art:url('assets/${r.hero}.webp');--portrait-position:${championWorlds[r.hero].position}"><div class="chronicle-art" aria-hidden="true"></div><div class="cover-top"><span>${r.date}</span><b>${r.time}</b></div><div class="cover-caption"><div class="cover-outcome">${chronicleSeal(r.result)}<span>${r.result}<small>${champions[r.hero].name} / Mid lane</small></span></div><h2>${r.line}</h2><p>${matchChapters[r.id][1][2]}</p><div class="cover-footer"><span><strong>${r.kda}</strong><small>K / D / A</small></span><b>Read the match <i>↗</i></b></div></div></a>`).join('')}</div><p class="chronicle-closing">Keep the instinct. Reconsider the decision. Queue again.</p></section>`;
}

// Each sketch is a deliberately simplified illustration of its authored chapter.
const battleSketches = {
  l1:[{at:[38,65],to:[24,78],enemy:[57,46],ally:[30,83],label:'Reset toward safety',where:'Mid lane',cue:'Space to return',path:'M190 273 Q130 270 120 328'}, {at:[52,60],to:[65,40],enemy:[69,35],ally:[38,49],label:'Approach after the first engage',where:'River approach',cue:'The second angle',path:'M260 252 Q330 260 325 168'}, {at:[55,53],to:[69,67],enemy:[80,51],ally:[48,62],label:'Move with your team',where:'Objective approach',cue:'A shared approach',path:'M275 223 Q295 280 345 281'}],
  l2:[{at:[38,63],to:[43,57],enemy:[61,42],ally:[50,50],label:'Hold a safe casting angle',where:'Mid lane',cue:'Room to cast',path:'M190 265 L215 239'}, {at:[66,49],to:[52,64],enemy:[74,37],ally:[40,66],label:'Retreat behind your frontline',where:'River approach',cue:'An exposed angle',path:'M330 206 Q285 220 260 269'}, {at:[44,68],to:[49,61],enemy:[69,42],ally:[58,55],label:'Set up behind your team',where:'Objective approach',cue:'Arrive before the fight',path:'M220 286 L245 256'}],
  l3:[{at:[42,63],to:[49,53],enemy:[61,43],ally:[30,72],label:'Trade with a return path',where:'Mid lane',cue:'A measured exchange',path:'M210 265 Q270 268 245 223'}, {at:[48,62],to:[60,45],enemy:[63,40],ally:[54,46],label:'Follow your teammate’s opening',where:'Mid lane',cue:'A connected engage',path:'M240 260 Q305 255 300 189'}, {at:[55,55],to:[64,65],enemy:[78,50],ally:[52,65],label:'Keep the team connected',where:'Objective approach',cue:'Finish together',path:'M275 231 L320 273'}]
};

function battleSketch(r,index) {
  const s=battleSketches[r.id][index];
  const point=(p)=>`${p[0]*5},${p[1]*4.2}`;
  return `<figure class="battle-sketch"><div class="sketch-label"><span>${s.where}</span><b>${matchChapters[r.id][index][0]}</b></div><svg viewBox="0 0 500 420" role="img" aria-label="Illustrative tactical sketch: ${s.label}. Not recorded player positions."><defs><pattern id="map-grid" width="35" height="35" patternUnits="userSpaceOnUse"><path d="M35 0H0V35" fill="none" stroke="#b8c5b3" stroke-opacity=".07"/></pattern><marker id="map-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 10 5 0 10" fill="#ead099"/></marker></defs><path d="M45 345 45 75 400 75 445 118 445 345Z" fill="#122b2b" stroke="#b4bb8650"/><path d="M45 345 445 345 445 75M45 345 45 75 445 75M45 345 445 75" stroke="#b8b38b" stroke-opacity=".3" stroke-width="15" fill="none"/><path d="M60 112Q190 144 222 227T435 323" fill="none" stroke="#438b9855" stroke-width="27"/><path d="M87 279 89 143 161 147 202 206ZM260 151 331 112 386 126 360 190ZM126 306 216 260 268 298 194 319ZM304 248 384 209 411 293 350 312Z" fill="#253c31" stroke="#87927635"/><path d="M45 75H445V345H45Z" fill="url(#map-grid)"/><g fill="#597e86" stroke="#a7cad0"><path d="m117 295 7-7 7 7-7 7ZM191 244l7-7 7 7-7 7Z"/></g><g fill="#8c5554" stroke="#cb9380"><path d="m319 165 7-7 7 7-7 7ZM380 116l7-7 7 7-7 7Z"/></g><circle cx="${s.enemy[0]*5}" cy="${s.enemy[1]*4.2}" r="12" fill="#6c3636" stroke="#d79686"/><circle cx="${s.ally[0]*5}" cy="${s.ally[1]*4.2}" r="10" fill="#386574" stroke="#a7cad0"/><circle cx="${s.to[0]*5}" cy="${s.to[1]*4.2}" r="26" fill="#dbc48a10" stroke="#dbc48a66" stroke-dasharray="3 5"/><path d="${s.path}" stroke="#ead099" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#map-arrow)" fill="none"/><g transform="translate(${point(s.at)})"><circle r="23" fill="#08141d" stroke="#e2c483"/><image href="assets/${r.hero}-icon.png" x="-16" y="-16" width="32" height="32"/></g><path d="M20 39V20h19m422 0h19v19M20 381v19h19m422 0h19v-19" fill="none" stroke="#c8aa6e66"/></svg><figcaption><strong>${s.cue}</strong><span><i class="map-key player"></i>${champions[r.hero].name}<i class="map-key ally"></i>Ally<i class="map-key enemy"></i>Opponent</span><small>Illustrative positioning · Not a replay</small></figcaption></figure>`;
}

function leagueBattleReport(r) {
  const moments=matchChapters[r.id],moment=moments[reviewMoment];
  return `${leagueNavigation('history')}<div class="league-battle-report" style="--champ-art:url('assets/${r.hero}.webp');--portrait-position:${championWorlds[r.hero].position}"><a class="report-back" href="#/league/history">← Match chronicle</a><header class="battle-heading"><div class="battle-heading-art" aria-hidden="true"></div><div class="battle-title">${chronicleSeal(r.result)}<span class="battle-result ${r.result==='Defeat'?'result-loss':'result-win'}">${r.result}</span><h1>${r.line}</h1><p>${champions[r.hero].name} · Mid lane <i>◆</i> ${r.time}</p><small>${r.date} / Sample match</small></div><dl class="battle-stats"><div><dt>K / D / A</dt><dd>${r.kda}</dd></div><div><dt>Minions</dt><dd>${r.cs}</dd></div><div><dt>Vision</dt><dd>${r.vision}</dd></div></dl></header>
    <section class="battle-review"><header><span class="interior-kicker">The moments that mattered</span><h2>A match is made of decisions.</h2><p>Select a chapter to revisit the moment.</p></header><div class="battle-chapters" aria-label="Match chapters">${moments.map((m,i)=>`<button data-moment="${i}" aria-pressed="${reviewMoment===i}" aria-controls="battle-moment"><span>${['I','II','III'][i]}</span><div><small>${m[0]}</small><b>${m[2]}</b></div><i aria-hidden="true">◆</i></button>`).join('')}</div>
    <div class="battle-moment" id="battle-moment" aria-live="polite">${battleSketch(r,reviewMoment)}<article class="battle-narrative"><span class="interior-kicker">${['The opening','The turning point','The closing chapter'][reviewMoment]} / ${moment[0]}</span><h3>${moment[1]}</h3><p>${moment[3]}</p><div class="battle-takeaway"><span>Carry this forward</span><p>${r.note}</p></div><a href="#/league/builds/${r.hero}" class="text-link">Revisit ${champions[r.hero].name}’s plan <span>↗</span></a></article></div></section>${leagueReportLoadout(r)}<nav class="other-battles" aria-label="Other matches">${leagueMatches.filter(m=>m.id!==r.id).map(m=>`<a href="#/league/history/${m.id}">${icon(m.hero)}<div><small>${m.result} / ${champions[m.hero].name}</small><span>${m.line}</span></div><b>↗</b></a>`).join('')}</nav></div>`;
}

document.addEventListener('click',e=>{
  const itemLink=e.target.closest('[data-build-item]');
  if(itemLink){buildStage=2;selectedItem=Number(itemLink.dataset.buildItem);}
});
