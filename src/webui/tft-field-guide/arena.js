import {champions, equipment} from './arena-data.js?v=comp-flow-3';
import {ArenaModel} from './arena-model.mjs?v=comp-flow-3';
import {setupBoardControls} from './board-controls.js?v=comp-flow-3';

const model = new ArenaModel(champions);
const sessionKey = 'tft-arena-session-v1';
try { model.restore(JSON.parse(sessionStorage.getItem(sessionKey))); } catch {}
const root = document.querySelector('#arenaSandbox');
const tip = document.querySelector('#arenaTooltip');
let selected = null, selectedItem = null, drag = null, suppressClick = false, theme = 'freljord';
const byItem = id => equipment.find(i => i.id === id);
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = '<span aria-hidden="true">●</span>';
const itemImages = items => items.map(id => `<img src="${byItem(id).image}" alt="${escape(byItem(id).name)}">`).join('');

root.innerHTML = `
  <div class="sandbox-heading"><span class="sandbox-live"><i></i> PLAY THE BOARD</span><div class="arena-theme"><button data-theme="freljord" aria-pressed="true">Freljord</button><button data-theme="classic" aria-pressed="false">Classic</button></div></div>
  <div class="round-hud"><span>Planning sandbox</span><b>4–2</b><button id="arenaReset" title="Reset gold, board, bench and shop">↺ Reset</button></div>
  <div class="battlefield-wrap"><div class="battlefield"><div id="arenaBoard" class="arena-board" role="group" aria-label="Champion board"></div></div><div class="board-capacity" id="boardCapacity"></div><span class="health-hud" title="Decorative health indicator">♥ 76</span></div>
  <div class="bench-heading"><span>BENCH <b id="benchCount"></b></span><span>Drag to move · click to inspect</span></div>
  <div id="arenaBench" class="arena-bench" role="group" aria-label="Champion bench"></div>
  <div class="shop-console"><div class="economy"><div class="gold-purse">${money}<strong id="arenaGold"></strong><small>GOLD</small></div><button id="arenaReroll" class="shop-action">↻ Reroll <span>2 ${money}</span><kbd>D</kbd></button><button id="arenaXP" class="shop-action">↑ Buy XP <span>4 ${money}</span><kbd>F</kbd></button><div class="xp-progress"><span id="xpText"></span><i><b id="xpBar"></b></i></div></div><div class="shop-main"><div class="shop-heading"><span>CHAMPION SHOP</span><button id="arenaLock" aria-pressed="false">◇ Lock shop</button></div><div id="arenaShop" class="arena-shop"></div></div></div>
  <div class="armory-row"><span>ITEMS</span><div id="arenaItems" class="arena-items"></div><button id="arenaUnequip" title="Return the selected champion’s items">Unequip</button><button id="arenaSell" class="sell-zone">Sell selected <kbd>E</kbd></button></div>
  <p id="arenaStatus" class="arena-status" role="status" aria-live="polite">Hover a champion. Buy from the shop. Make this board yours.</p>
  <div class="sandbox-foot"><span>Set 13 sample roster · no combat</span><button id="arenaHelp">How to play <span>?</span></button></div>`;

function slot(unit,zone,index) {
  const c = unit && model.champion(unit.champion);
  const label = c ? `${c.name}, ${unit.stars} star, ${zone} slot ${index+1}` : `Empty ${zone} slot ${index+1}`;
  return `<button class="arena-slot ${unit?'occupied':''} ${selected===unit?.uid?'is-selected':''}" data-zone="${zone}" data-index="${index}" ${unit?`data-unit="${unit.uid}" data-champion="${c.id}" style="--unit-color:var(--cost-${c.cost})"`:''} aria-label="${label}" ${unit?`aria-pressed="${selected===unit.uid}"`:''}>${unit?`<span class="unit-health"></span><span class="unit-portrait"><img draggable="false" src="${c.image}" alt=""></span><span class="unit-stars">${'★'.repeat(unit.stars)}</span><span class="unit-items">${itemImages(unit.items)}</span>`:'<span class="empty-hex"></span>'}</button>`;
}
function render() {
  try { sessionStorage.setItem(sessionKey,JSON.stringify(model.snapshot())); } catch {}
  const active = document.activeElement;
  const focusKey = active?.closest('#arenaSandbox') ? {id:active.id,zone:active.dataset.zone,index:active.dataset.index,shop:active.dataset.shop,stash:active.dataset.stash} : null;
  document.querySelector('#arenaBoard').innerHTML = Array.from({length:4},(_,row)=>`<div class="arena-hex-row">${model.board.slice(row*7,row*7+7).map((u,i)=>slot(u,'board',row*7+i)).join('')}</div>`).join('');
  document.querySelector('#arenaBench').innerHTML = model.bench.map((u,i)=>slot(u,'bench',i)).join('');
  document.querySelector('#arenaShop').innerHTML = model.shop.map((id,index)=>{
    const c=model.champion(id);
    return c?`<button class="shop-card ${model.gold<c.cost?'unaffordable':''}" data-shop="${index}" data-champion="${id}" style="--unit-color:var(--cost-${c.cost})" aria-label="Buy ${c.name} for ${c.cost} gold"><img src="${c.image}" draggable="false" alt=""><span class="shop-traits">${c.traits.map(escape).join('<br>')}</span><span class="shop-card-footer"><b>${c.name}</b><span>${money} ${c.cost}</span></span></button>`:`<button class="shop-card sold" data-shop="${index}" aria-label="Shop slot ${index+1}, purchased" disabled><span>✓<small>Purchased</small></span></button>`;
  }).join('');
  document.querySelector('#arenaItems').innerHTML = model.stash.map((id,i)=>`<button class="armory-item ${selectedItem===i?'is-selected':''}" data-stash="${i}" data-item="${id}" aria-label="Equip ${escape(byItem(id).name)}" aria-pressed="${selectedItem===i}"><img draggable="false" src="${byItem(id).image}" alt=""></button>`).join('') || '<small>All items equipped</small>';
  document.querySelector('#arenaGold').textContent=model.gold;
  document.querySelector('#boardCapacity').textContent=`${model.occupied()} / ${model.level}`;
  document.querySelector('#benchCount').textContent=`${model.bench.filter(Boolean).length}/9`;
  document.querySelector('#xpText').textContent=`Lv. ${model.level} · ${model.level===9?'MAX':model.xp+' / '+(model.level===7?36:48)+' XP'}`;
  document.querySelector('#xpBar').style.width=(model.level===9?100:model.xp/(model.level===7?36:48)*100)+'%';
  document.querySelector('#arenaLock').textContent=model.locked?'◆ Shop locked':'◇ Lock shop';
  document.querySelector('#arenaLock').setAttribute('aria-pressed',model.locked);
  document.querySelector('#arenaReroll').disabled=model.gold<2||model.locked;
  document.querySelector('#arenaXP').disabled=model.gold<4||model.level>=9;
  document.querySelector('#arenaSell').setAttribute('aria-disabled',!model.find(selected));
  document.querySelector('#arenaUnequip').disabled=!model.find(selected)?.unit.items.length;
  if(focusKey){let el=focusKey.id?document.getElementById(focusKey.id):focusKey.zone?root.querySelector(`[data-zone="${focusKey.zone}"][data-index="${focusKey.index}"]`):focusKey.shop!==undefined?root.querySelector(`[data-shop="${focusKey.shop}"]`):focusKey.stash!==undefined?root.querySelector(`[data-stash="${focusKey.stash}"]`):null;if(el&&!el.disabled)el.focus({preventScroll:true});}
}
function status(message,error=false){const el=document.querySelector('#arenaStatus');el.textContent=message;el.classList.toggle('error',error);}
function apply(result){hideTip();if(selected&&!model.find(selected))selected=null;render();status(result.message,!result.ok);}
function championDetails(c,unit=null){
  const items=unit?.items||[];
  return `<div class="tooltip-title"><img src="${c.image}" alt=""><div><strong>${c.name}</strong><small>${c.traits.map(escape).join(' · ')}</small></div><b>${c.cost} ${money}</b></div><div class="tooltip-stats"><span>♥ ${c.stats.hp} HP</span><span>⚔ ${c.stats.damage} AD</span><span>◈ ${c.stats.initialMana}/${c.stats.mana} Mana</span></div><h4>${escape(c.ability.name)}</h4><p>${escape(c.ability.description)}</p><div class="tooltip-equipment"><small>${unit?'EQUIPPED ITEMS':'ITEM SLOTS'}</small>${items.length?items.map(id=>`<div><img src="${byItem(id).image}" alt=""><span><b>${escape(byItem(id).name)}</b><small>${escape(byItem(id).description)}</small></span></div>`).join(''):'<p>No items equipped. Pick an item, then a champion.</p>'}</div><footer>Set 13 sample · base stats${unit?' · '+unit.stars+'★':''}</footer>`;
}
function showTip(el){
  if(drag?.started)return;
  let content='';
  if(el.dataset.champion){const c=model.champion(el.dataset.champion);if(!c)return;content=championDetails(c,model.find(Number(el.dataset.unit))?.unit);}
  else if(el.dataset.item){const item=byItem(el.dataset.item);content=`<div class="tooltip-title"><img src="${item.image}" alt=""><strong>${escape(item.name)}</strong></div><p>${escape(item.description)}</p><footer>Click or drag onto a champion · three items maximum</footer>`;}
  if(!content)return;
  tip.innerHTML=content;tip.hidden=false;
  const r=el.getBoundingClientRect(),arena=root.getBoundingClientRect(),shop=root.querySelector('.shop-console').getBoundingClientRect();
  const ceiling=Math.max(10,document.querySelector('.main-header').getBoundingClientRect().bottom+10);
  tip.style.maxHeight=Math.max(80,innerHeight-ceiling-10)+'px';
  const width=tip.getBoundingClientRect().width;
  let left=arena.left-width-16,top=r.top-30;
  if(left<10&&arena.right+width+16<=innerWidth-10)left=arena.right+16;
  else if(left<10){
    left=Math.max(10,Math.min(innerWidth-width-10,r.left+(r.width-width)/2));
    const above=shop.top-ceiling-12,below=innerHeight-shop.bottom-22;
    const useAbove=above>=below;
    tip.style.maxHeight=Math.max(40,useAbove?above:below)+'px';
    top=useAbove?shop.top-tip.getBoundingClientRect().height-12:shop.bottom+12;
  }
  tip.style.left=left+'px';tip.style.top=Math.max(ceiling,Math.min(innerHeight-tip.getBoundingClientRect().height-10,top))+'px';
  el.setAttribute('aria-describedby','arenaTooltip');
}
function hideTip(){tip.hidden=true;root.querySelectorAll('[aria-describedby="arenaTooltip"]').forEach(el=>el.removeAttribute('aria-describedby'));}
root.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const el=e.target.closest('[data-champion],[data-item]');if(el&&!el.contains(e.relatedTarget))showTip(el);});
root.addEventListener('pointerout',e=>{const el=e.target.closest('[data-champion],[data-item]');if(el&&!el.contains(e.relatedTarget)&&!tip.contains(e.relatedTarget))hideTip();});
tip.addEventListener('pointerleave',hideTip);
root.addEventListener('focusin',e=>{if(e.target.matches('[data-champion],[data-item]'))showTip(e.target);});
root.addEventListener('focusout',hideTip);
window.addEventListener('scroll',hideTip,{passive:true});window.addEventListener('resize',hideTip);

root.addEventListener('click',e=>{
  if(suppressClick){suppressClick=false;return;}
  const shop=e.target.closest('[data-shop]');if(shop){apply(model.buy(Number(shop.dataset.shop)));return;}
  const stash=e.target.closest('[data-stash]');if(stash){selectedItem=selectedItem===Number(stash.dataset.stash)?null:Number(stash.dataset.stash);selected=null;render();status(selectedItem===null?'Item deselected.':'Choose a champion to equip this item.');return;}
  const target=e.target.closest('[data-zone]');
  if(target){
    const uid=Number(target.dataset.unit);
    if(selectedItem!==null){if(!uid){status('Choose an occupied champion slot.',true);return;}const result=model.equip(selectedItem,uid);if(result.ok)selectedItem=null;apply(result);return;}
    if(selected&&uid!==selected){const result=model.move(selected,target.dataset.zone,Number(target.dataset.index));if(result.ok)selected=null;apply(result);return;}
    selected=selected===uid?null:(uid||null);render();status(selected?`${model.champion(model.find(selected).unit.champion).name} selected. Click a destination, drag, or sell.`:'Choose a champion to reposition.');if(selected)showTip(root.querySelector(`[data-unit="${selected}"]`));return;
  }
  const id=e.target.closest('button')?.id;
  if(id==='arenaReroll')apply(model.reroll());
  if(id==='arenaXP')apply(model.buyXP());
  if(id==='arenaLock'){model.locked=!model.locked;render();status(model.locked?'Shop locked. Unlock to reroll.':'Shop unlocked.');}
  if(id==='arenaSell'){const result=model.sell(selected);if(result.ok)selected=null;apply(result);}
  if(id==='arenaUnequip')apply(model.unequip(selected));
  if(id==='arenaReset'){model.reset();selected=null;selectedItem=null;apply(model.ok('Fresh start. 50 gold and a new board.'));}
  if(id==='arenaHelp')openCatalog('help');
  const themeButton=e.target.closest('[data-theme]');if(themeButton){theme=themeButton.dataset.theme;document.querySelector('.hero').dataset.arenaTheme=theme;root.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===theme));}
});

// Pointer drag supports mouse, pen and touch; click-to-place provides the keyboard equivalent.
root.addEventListener('pointerdown',e=>{
  if(e.button!==0)return;
  const el=e.target.closest('[data-unit],[data-stash],[data-shop][data-champion]');if(!el)return;
  drag={pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,el,uid:Number(el.dataset.unit)||null,item:el.dataset.stash===undefined?null:Number(el.dataset.stash),shop:el.dataset.shop===undefined?null:Number(el.dataset.shop),started:false};
});
window.addEventListener('pointermove',e=>{
  if(!drag||drag.pointerId!==e.pointerId)return;
  if(!drag.started&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<6)return;
  if(!drag.started){drag.started=true;hideTip();root.classList.add('is-dragging');if(drag.uid){root.classList.add('is-selling');const unit=model.find(drag.uid).unit;document.querySelector('#arenaSellDrop').innerHTML=`<strong>Release to sell ${model.champion(unit.champion).name}</strong><span>+${model.champion(unit.champion).cost*3**(unit.stars-1)} gold · items returned</span>`;}drag.el.classList.add('drag-source');const ghost=document.createElement('div');ghost.className='arena-drag-ghost';ghost.innerHTML=drag.el.querySelector('img').outerHTML;document.body.append(ghost);drag.ghost=ghost;}
  e.preventDefault();drag.ghost.style.transform=`translate(${e.clientX-27}px,${e.clientY-27}px)`;
  root.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));
  const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-zone],#arenaSell,[data-sell-target]');
  if(target&&root.contains(target))target.classList.add('drop-hover');
},{passive:false});
function endDrag(e,cancelled=false){
  if(!drag||drag.pointerId!==e.pointerId)return;
  const current=drag;drag=null;
  const target=!cancelled&&document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-zone],#arenaSell,[data-sell-target]');
  current.ghost?.remove();current.el.classList.remove('drag-source');root.classList.remove('is-dragging','is-selling');root.querySelectorAll('.drop-hover').forEach(el=>el.classList.remove('drop-hover'));
  if(!current.started)return;
  suppressClick=true;setTimeout(()=>suppressClick=false,0);
  if(cancelled)return;
  if(!target||!root.contains(target)){status('Move cancelled. Drop on a board or bench slot.');return;}
  let result;
  if(current.shop!==null){if(!target.dataset.zone){status('Purchase cancelled. Drop on an empty board or bench slot.');return;}result=model.buy(current.shop,{zone:target.dataset.zone,index:Number(target.dataset.index)});}
  else if(current.item!==null)result=model.equip(current.item,Number(target.dataset.unit));
  else if(target.id==='arenaSell'||target.hasAttribute('data-sell-target'))result=model.sell(current.uid);
  else result=model.move(current.uid,target.dataset.zone,Number(target.dataset.index));
  selected=null;selectedItem=null;apply(result);
  if(result.ok&&target.dataset.zone){const landed=root.querySelector(`[data-zone="${target.dataset.zone}"][data-index="${target.dataset.index}"]`);landed?.classList.add('just-landed');setTimeout(()=>landed?.classList.remove('just-landed'),450);}
}
window.addEventListener('blur',()=>{if(drag)endDrag({pointerId:drag.pointerId},true)});
window.addEventListener('pointerup',e=>endDrag(e));window.addEventListener('pointercancel',e=>endDrag(e,true));
root.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(drag)endDrag({pointerId:drag.pointerId},true);selected=null;selectedItem=null;hideTip();render();status('Selection cleared.');return;}
  if(e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  const key=e.key.toLowerCase();if(['d','f','e'].includes(key)){e.preventDefault();if(key==='d')apply(model.reroll());if(key==='f')apply(model.buyXP());if(key==='e'){const result=model.sell(selected);if(result.ok)selected=null;apply(result);}}
});

const dialog=document.querySelector('#fieldLibrary');let libraryMode='champions';
function openCatalog(mode){libraryMode=mode;document.querySelector('#libraryTitle').textContent=mode==='items'?'Item armory':mode==='help'?'Make the board yours':'Champion field guide';document.querySelector('#librarySearch').value='';document.querySelector('#librarySearch').hidden=mode==='help';renderCatalog();dialog.hidden=false;dialog.scrollIntoView({block:'start'});document.querySelector(mode==='help'?'#libraryClose':'#librarySearch').focus({preventScroll:true});}
function renderCatalog(){
 const q=document.querySelector('#librarySearch').value.toLowerCase(),body=document.querySelector('#libraryBody');
 if(libraryMode==='help'){body.innerHTML='<div class="arena-help"><h3>A little planning playground.</h3><p>Hover or focus a champion for their ability, traits, base stats and equipped items.</p><p><b>Move:</b> drag a champion between board and bench. Or select one, then click a destination. Occupied slots swap. Your level limits deployed units.</p><p><b>Shop:</b> click to buy, or drag a shop champion into an empty board or bench slot. Reroll costs 2 gold; Buy XP costs 4 gold. Three matching copies combine into the next star level. Lock keeps the shop from rerolling.</p><p><b>Items:</b> drag an armory item onto a champion, or click the item then its holder. Three items maximum. Select a champion and choose Unequip to return their items.</p><p><b>Sell:</b> select a champion and choose Sell, or drag onto the shop to sell. This sandbox refunds the full copy cost. Items return to the armory.</p><p><b>Keyboard:</b> Tab to a slot; Enter or Space selects it. Tab to a destination and press Enter or Space to move. D rerolls, F buys XP, E sells while focus is inside the sandbox. Escape clears a selection.</p><p class="help-note">A curated Set 13 roster with a simplified, equally weighted shop and a level 9 cap. No shared pool, combat, economy rounds or live match connection. Your setup is saved for this tab. Reset restores the starting board.</p></div>';return;}
 const matches=(libraryMode==='items'?equipment:champions).filter(c=>(c.name+' '+(c.traits||[]).join(' ')).toLowerCase().includes(q));
 body.innerHTML=matches.length?matches.map(c=>libraryMode==='items'?`<article class="library-card"><img src="${c.image}" alt=""><div><h3>${escape(c.name)}</h3><p>${escape(c.description)}</p></div></article>`:`<article class="library-card"><img src="${c.image}" alt=""><div><h3>${c.name} <small>${c.cost} gold</small></h3><span>${c.traits.map(escape).join(' · ')}</span><h4>${escape(c.ability.name)}</h4><p>${escape(c.ability.description)}</p></div></article>`).join(''):'<p class="library-empty">No matches. Try a champion, trait or item name.</p>';
}
document.querySelectorAll('[data-library]').forEach(b=>b.addEventListener('click',()=>openCatalog(b.dataset.library)));
document.querySelector('#librarySearch').addEventListener('input',renderCatalog);
document.querySelector('#libraryClose').addEventListener('click',()=>{dialog.hidden=true;});
document.querySelector('.hero').dataset.arenaTheme=theme;
const sellDrop=document.createElement('div');sellDrop.id='arenaSellDrop';sellDrop.className='shop-sell-target';sellDrop.setAttribute('data-sell-target','');root.querySelector('.shop-console').append(sellDrop);
render();
setupBoardControls({model,root,render,hideTip,status,clearSelection:()=>{selected=null;selectedItem=null;}});
const hero=document.querySelector('.hero'),field=root.querySelector('.battlefield');
function alignArena(){
  const h=hero.getBoundingClientRect(),b=field.getBoundingClientRect();if(!b.width)return;
  const width=b.width/.64,height=width*535/951;
  hero.style.setProperty('--arena-image-size',`${width}px ${height}px`);
  hero.style.setProperty('--arena-image-position',`${b.left-h.left-width*.20}px ${b.top-h.top-height*.18}px`);
}
new ResizeObserver(alignArena).observe(hero);
new ResizeObserver(alignArena).observe(field);
alignArena();
