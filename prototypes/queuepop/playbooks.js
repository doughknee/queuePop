// Frontend-only playbooks and match journals. Every match and decision is a fixture.
let selectedItem = 0;
let reviewMoment = location.hash.includes('/tft/history/') ? 2 : 0;
let plannerLesson = 0;

const itemReasoning = {
  1056: ['Give your lane a foundation.', 'A starting purchase is a commitment to how you want the first few waves to feel. Pair it with patient spacing, rather than forcing an early trade.', 'Your first few waves'],
  1055: ['Set up the first exchange.', 'Make the opening trade on your terms. A starting item supports your lane plan; it cannot replace a safe route back through the wave.', 'Your first few waves'],
  2003: ['Leave room to recover.', 'A difficult trade does not have to decide the lane. Use the breathing room to collect the next wave and choose a better reset.', 'After a difficult trade'],
  3340: ['Know where the danger begins.', 'A little information changes how far you can play forward. Think about the approach you cannot already see before placing your ward.', 'Before you push forward'],
  3020: ['Arrive with a little more freedom.', 'Movement is part of your damage plan. Use your next purchase to think about the angle of the fight, not only the size of the number.', 'When the map opens up'],
  3108: ['A step toward the bigger idea.', 'A component purchase should leave you with a clear next step. Revisit the route when you recall instead of buying on autopilot.', 'At your next recall'],
  1058: ['Choose your moment to invest.', 'A larger purchase asks for a little patience. Consider what you give up while saving, and whether the next fight needs an answer sooner.', 'When you can afford to wait'],
  3089: ['Make a strong position matter.', 'This illustrates a damage-focused finish. Take it as a prompt to assess whether you can already survive long enough to contribute.', 'When damage is the missing piece'],
  3157: ['Give yourself a second moment.', 'A defensive choice asks a different question: what is stopping you from playing the fight? Prepare for the threat before it reaches you.', 'When you are the first target'],
  3135: ['Respond to the other side.', 'The opposing team is part of your build. Revisit your damage approach when their defenses begin to change the fight.', 'When opponents build defenses'],
  3006: ['Find a rhythm you can keep.', 'Use this purchase as a checkpoint for your lane tempo. A quicker rhythm still needs a clear opening and somewhere safe to return.', 'When you are ready to trade'],
  1043: ['Build toward your next window.', 'A smaller component keeps the plan moving. Leave your next recall with a purpose and a picture of the fight you want.', 'Between larger purchases'],
  1038: ['Put your gold behind the plan.', 'A damage investment rewards a good opening. Keep your team close enough to turn that opening into a fight you can finish.', 'Before the next grouped fight'],
  3031: ['Follow through on your opening.', 'An illustrative damage finish for a close-combat plan. Choose it after considering whether you can reach and stay on your target.', 'When you can commit safely'],
  3072: ['Think beyond the first exchange.', 'A sustain option explores a longer fight. Ask whether staying power would help more than another immediate burst of damage.', 'When fights last longer'],
  3026: ['Plan for the return.', 'A defensive alternative only matters if your team can use the second opportunity. Think about where the fight will leave you.', 'When your team can follow up']
};

const matchChapters = {
  l1: [['06:20','Make room.','An early reset','You gave up a risky trade and returned with room to play the next wave.'],['17:45','Wait for it.','The second opening','The first engage drew attention. Your follow-up found an isolated target.'],['25:10','Stay together.','Turn the advantage','Moving with your team made the next objective easier to approach.']],
  l2: [['08:15','Hold your ground.','A patient lane','You kept your distance and found useful pressure without committing forward.'],['21:30','Mind the angle.','A difficult approach','Crossing ahead of the frontline left fewer ways to retreat.'],['30:40','Keep a clear line.','A better next step','Try arriving earlier so you can contribute from a safer angle.']],
  l3: [['07:10','Find your rhythm.','A measured start','Short trades left space to choose when to commit.'],['18:05','Follow the signal.','The team arrives','Your strongest opening came with a teammate ready to follow.'],['27:20','Keep the connection.','Finish together','Staying near your team turned movement into useful pressure.']]
};

function leagueBuilds() { return leagueArmory(); }
function leagueHistory(id) { return leagueChronicle(id); }

const formationNotes = [
  [['A front row buys time.','Give Garen and Leona the first contact, with your damage dealers well behind them.'],['Leave a second way to win.','Lux and Ashe provide another angle while Ahri holds the main damage pocket.'],['The safest corner can change.','Scout the next opponent before choosing where your carry will stand.']],
  [['Start with a steady center.','Put your durable units where they can meet the first wave of pressure.'],['Let the backline breathe.','The front row creates time. Make sure your damage dealers can use it.'],['Avoid one crowded corner.','Separate your threats so a single approach cannot reach all of them.']],
  [['Give the fireworks room.','Start with Jinx’s pocket, then arrange the rest of the board around it.'],['Protect the first few seconds.','Use your frontline to delay contact while the backline finds its rhythm.'],['Move with a reason.','Keep the damage pocket protected when adapting to the next opponent.']]
];

function tftComps() {
  return `${subnav('tft','comps')}${pageHead('A little inspiration for your next board','Great teams start with an idea.','Three formation studies. A hundred ways to make them yours.')}<section class="formation-studies">${formations.map((f,i)=>`<article class="formation-study study-${i}"><div class="study-art" style="--champ-art:url('assets/${f.carry}.webp')"><span class="study-index">0${i+1} <small>FORMATION STUDY</small></span><div class="carry-stamp">${icon(f.carry)}<span>Build around<strong>${units[f.carry]}</strong></span></div></div><div class="study-copy"><p class="eyebrow">${f.tag}</p><h2>${f.name}</h2><p>${f.line}</p><div class="study-roster">${Object.values(f.board).map(u=>`<span title="${units[u]}">${icon(u)}<small>${units[u]}</small></span>`).join('')}</div><div class="study-footer"><button class="action" data-plan="${i}">Make it your own <span>↗</span></button><small>${state.savedComps.includes(i)?'✓ In your collection':'7 units · Example formation'}</small></div></div></article>`).join('')}</section><section class="quiet-note"><span>✧</span><div><h3>The best plan still leaves room for a surprise.</h3><p>Explore positioning and team-building ideas. These rosters are illustrative, independent of any live TFT set.</p></div></section>`;
}

function tftPlanner() {
  const f=formations[state.plan], notes=formationNotes[state.plan], selected=notes[plannerLesson];
  const ribbon=`<section class="strategy-ribbon"><div class="carry-token">${icon(f.carry)}<span>Build around<b>${units[f.carry]}</b></span></div><div><p class="eyebrow">Formation study / 0${state.plan+1}</p><h2>${f.tag}</h2><p>${f.line}</p></div><span class="ribbon-stars" aria-hidden="true">✦ <i>✧</i></span></section>`;
  const notesMarkup=`<aside class="planner-notes strategy-lessons"><p class="eyebrow">A plan in three decisions</p><h2>Think beyond<br>the hex.</h2><div class="lesson-tabs" aria-label="Formation decisions">${f.stages.map((s,i)=>`<button data-lesson="${i}" aria-pressed="${plannerLesson===i}" aria-controls="formation-lesson"><span>0${i+1}</span>${s}<b>↗</b></button>`).join('')}</div><div class="paper-tip" id="formation-lesson" aria-live="polite"><span>✧</span><h3>${selected[0]}</h3><p>${selected[1]}</p></div><p class="sample-note">Your changes stay with this formation. These units illustrate positioning, not a live-set composition.</p></aside>`;
  return renderTftPlannerTable(ribbon, notesMarkup);
}

// Historical formations are immutable fixtures, never drawn from the editable saved board.
function reviewBoard(plan,phase) {
  const board=formations[plan].board;
  const opening=[...new Set(['garen','leona',formations[plan].carry,'lulu','ashe'])].slice(0,4);
  if(phase===0)return Object.fromEntries(Object.entries(board).filter(([,u])=>opening.includes(u)));
  if(phase===1)return Object.fromEntries(Object.entries(board).filter(([,u])=>u!=='yasuo'));
  return {...board};
}

function tftHistory(id) {
  const r=tftMatches.find(m=>m.id===id);
  if(r) {
    const f=formations[r.plan], phase=reviewMoment, note=formationNotes[r.plan][phase];
    return `${subnav('tft','history')}<section class="convergence-review">${link('#/tft/history','All matches','back-link')}<header class="convergence-heading"><div><p class="eyebrow">${r.date} / Sample match</p><h1>${r.line}</h1><p>${f.name} · Final stage ${r.stage}</p></div><div class="finish-rosette"><span>FINISH</span><strong>${r.place}</strong><small>of 8 players</small></div></header><div class="board-review-layout"><section class="memory-board"><div class="memory-board-title"><p class="eyebrow">${['Finding the shape','Building the team','The final board'][phase]}</p><span>Sample snapshot · ${Object.keys(reviewBoard(r.plan,phase)).length} units</span></div><div class="board-caption">THE OPPONENT’S SIDE</div>${boardMarkup(false,reviewBoard(r.plan,phase))}<div class="board-caption bottom">YOUR BACKLINE / READ-ONLY REVIEW</div><div class="board-chapters" aria-label="Board snapshots">${['Opening','Developing','Final board'].map((n,i)=>`<button data-moment="${i}" aria-pressed="${phase===i}"><span>0${i+1}</span>${n}</button>`).join('')}</div><div class="snapshot-roster">${Object.values(reviewBoard(r.plan,phase)).map(u=>`<span>${icon(u)}${units[u]}</span>`).join('')}</div></section><aside class="review-scrapbook"><div class="review-carry">${icon(f.carry)}<div><span>At the heart of the plan</span><h2>${units[f.carry]}</h2></div></div><div class="snapshot-note" aria-live="polite"><p class="eyebrow">${['Establish','Develop','Reconsider'][phase]}</p><h2>${note[0]}</h2><p>${note[1]}</p></div><div class="paper-tip"><span>✧</span><h3>For the next carousel.</h3><p>${r.note}</p></div><button class="action" data-plan="${r.plan}">Revisit this formation <span>↗</span></button><p class="sample-note">Illustrated snapshots, not a recorded replay. Opening the planner restores your own version of this formation.</p></aside></div></section>`;
  }
  return `${subnav('tft','history')}${pageHead('The Convergence journal','There’s more to a game than a finish.','A clever pivot. A stubborn streak. A board worth trying again.')}<section class="convergence-journal">${tftMatches.map((r,i)=>{const f=formations[r.plan];return `<a class="tactics-memory memory-${i}" href="#/tft/history/${r.id}"><div class="memory-illustration" style="--champ-art:url('assets/${f.carry}.webp')"><div class="finish-rosette"><span>FINISH</span><strong>${r.place}</strong></div><span class="memory-date">${r.date}</span></div><div class="memory-story"><p class="eyebrow">${f.tag} / Stage ${r.stage}</p><h2>${r.line}</h2><p>${f.name}</p><div class="study-roster">${Object.values(f.board).map(u=>`<span title="${units[u]}">${icon(u)}<small>${units[u]}</small></span>`).join('')}</div><div class="memory-footer"><span>${['A position worth repeating','A decision worth revisiting','A moment worth learning from'][i]}</span><b>Open match ↗</b></div></div></a>`;}).join('')}<p class="sample-note">Three sample matches · Open a match to explore how its board took shape.</p></section>`;
}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b || !b.closest('#main'))return;
  if(b.dataset.item!==undefined){selectedItem=+b.dataset.item;rerenderKeepingFocus(`[data-item="${selectedItem}"]`);}
  if(b.dataset.moment!==undefined){reviewMoment=+b.dataset.moment;rerenderKeepingFocus(`[data-moment="${reviewMoment}"]`);}
  if(b.dataset.lesson!==undefined){plannerLesson=+b.dataset.lesson;rerenderKeepingFocus(`[data-lesson="${plannerLesson}"]`);}
});
