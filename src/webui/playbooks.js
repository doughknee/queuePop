// Frontend-only playbooks and match journals. Every match and decision is a fixture.
let selectedItem = 0;
let reviewMoment = location.hash.includes('/tft/history/') ? 2 : 0;
let plannerLesson = 0;

const formationNotes = [
  [['A front row buys time.','Give Garen and Leona the first contact, with your damage dealers well behind them.'],['Leave a second way to win.','Lux and Ashe provide another angle while Ahri holds the main damage pocket.'],['The safest corner can change.','Scout the next opponent before choosing where your carry will stand.']],
  [['Start with a steady center.','Put your durable units where they can meet the first wave of pressure.'],['Let the backline breathe.','The front row creates time. Make sure your damage dealers can use it.'],['Avoid one crowded corner.','Separate your threats so a single approach cannot reach all of them.']],
  [['Give the fireworks room.','Start with Jinx’s pocket, then arrange the rest of the board around it.'],['Protect the first few seconds.','Use your frontline to delay contact while the backline finds its rhythm.'],['Move with a reason.','Keep the damage pocket protected when adapting to the next opponent.']]
];

function tftComps(){return tftCollection();}

function tftPlanner(){return tftArenaPlanner();}

// Historical formations are immutable fixtures, never drawn from the editable saved board.
function reviewBoard(plan,phase) {
  const board=formations[plan].board;
  const opening=[...new Set(['garen','leona',formations[plan].carry,'lulu','ashe'])].slice(0,4);
  if(phase===0)return Object.fromEntries(Object.entries(board).filter(([,u])=>opening.includes(u)));
  if(phase===1)return Object.fromEntries(Object.entries(board).filter(([,u])=>u!=='yasuo'));
  return {...board};
}

function tftHistory(id){return tftArenaHistory(id);}

document.addEventListener('click',e=>{
  const b=e.target.closest('button');
  if(!b || !b.closest('#main'))return;
  if(b.dataset.item!==undefined){selectedItem=+b.dataset.item;rerenderKeepingFocus(`[data-item="${selectedItem}"]`);}
  if(b.dataset.moment!==undefined){reviewMoment=+b.dataset.moment;rerenderKeepingFocus(`[data-moment="${reviewMoment}"]`);}
  if(b.dataset.lesson!==undefined){plannerLesson=+b.dataset.lesson;rerenderKeepingFocus(`[data-lesson="${plannerLesson}"]`);}
});
